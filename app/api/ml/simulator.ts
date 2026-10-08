// Real-time emulation of the EmotionVerse hardware rig:
//   - ESP32-WROOM-32 sampling GSR/EDA (GPIO34, 4 Hz) and AD8232 ECG (GPIO35, 250 Hz)
//   - Webcam branch running the FER CNN (7-class logits + facial geometry)
// The generative parameters match the class-conditional distributions used to
// train the fusion network, so the live pipeline exercises the real model.
// When real hardware is connected, the ESP32 POSTs the same feature payload to
// /api/trpc/ingest.window and this simulator is bypassed.

import {
  EMOTIONS,
  EMOTION_VA,
  type Emotion,
  type LiveSample,
  type PhysioFeature,
  type ScenarioId,
} from "@contracts/emotions";
import { infer } from "./inference";

// ---- class-conditional physiological parameters (match training) ----
interface PhysioParams {
  eda_mean: [number, number];
  eda_std: [number, number];
  eda_slope: [number, number];
  scr_rate: [number, number];
  scr_amp: [number, number];
  hr_mean: [number, number];
  hr_std: [number, number];
  rmssd: [number, number];
  sdnn: [number, number];
  pnn50: [number, number];
  lf_hf: [number, number];
}
const PARAMS: Record<Emotion, PhysioParams> = {
  neutral: { eda_mean: [2.0, 0.5], eda_std: [0.08, 0.03], eda_slope: [0.0, 0.02], scr_rate: [1.0, 0.6], scr_amp: [0.05, 0.03], hr_mean: [70, 4], hr_std: [3.0, 0.8], rmssd: [42, 8], sdnn: [55, 10], pnn50: [22, 6], lf_hf: [1.2, 0.3] },
  happy: { eda_mean: [2.8, 0.6], eda_std: [0.15, 0.05], eda_slope: [0.02, 0.02], scr_rate: [3.0, 1.0], scr_amp: [0.12, 0.05], hr_mean: [78, 5], hr_std: [4.5, 1.0], rmssd: [48, 9], sdnn: [62, 10], pnn50: [26, 6], lf_hf: [1.4, 0.3] },
  sad: { eda_mean: [1.5, 0.4], eda_std: [0.05, 0.02], eda_slope: [-0.02, 0.015], scr_rate: [0.6, 0.4], scr_amp: [0.03, 0.02], hr_mean: [63, 4], hr_std: [2.5, 0.7], rmssd: [50, 10], sdnn: [60, 11], pnn50: [28, 7], lf_hf: [0.9, 0.25] },
  angry: { eda_mean: [4.2, 0.7], eda_std: [0.28, 0.07], eda_slope: [0.06, 0.025], scr_rate: [6.5, 1.4], scr_amp: [0.25, 0.08], hr_mean: [92, 6], hr_std: [5.5, 1.2], rmssd: [28, 6], sdnn: [40, 8], pnn50: [10, 4], lf_hf: [2.4, 0.5] },
  fear: { eda_mean: [4.8, 0.8], eda_std: [0.32, 0.08], eda_slope: [0.08, 0.03], scr_rate: [7.5, 1.5], scr_amp: [0.3, 0.09], hr_mean: [96, 7], hr_std: [6.0, 1.3], rmssd: [24, 6], sdnn: [36, 8], pnn50: [8, 3], lf_hf: [2.8, 0.6] },
  surprise: { eda_mean: [3.4, 0.6], eda_std: [0.22, 0.06], eda_slope: [0.1, 0.04], scr_rate: [4.5, 1.2], scr_amp: [0.2, 0.07], hr_mean: [84, 6], hr_std: [6.5, 1.5], rmssd: [36, 8], sdnn: [48, 10], pnn50: [16, 5], lf_hf: [1.8, 0.4] },
  disgust: { eda_mean: [2.6, 0.5], eda_std: [0.14, 0.04], eda_slope: [0.01, 0.02], scr_rate: [2.5, 0.9], scr_amp: [0.1, 0.04], hr_mean: [74, 5], hr_std: [3.8, 0.9], rmssd: [38, 8], sdnn: [52, 10], pnn50: [20, 5], lf_hf: [1.5, 0.35] },
};
const FACE_SHARP: Record<Emotion, number> = {
  neutral: 2.0, happy: 2.4, sad: 1.8, angry: 2.2, fear: 2.1, surprise: 2.3, disgust: 1.9,
};

// deterministic-enough RNG helpers
const gauss = (m: number, s: number) =>
  m + s * (Math.random() + Math.random() + Math.random() - 1.5) * 2; // ~Irwin–Hall
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface ScrEvent { t: number; amp: number }

class Simulator {
  scenario: ScenarioId = "auto";
  truth: Emotion = "neutral";
  private dwell = 0; // seconds left in current truth state (auto mode)
  private t = 0; // simulated seconds since boot
  private edaLevel = 2.0; // tonic EDA random-walk state (µS)
  private edaHist: number[] = []; // EDA @4Hz, keep 64 samples (16 s)
  private ibis: number[] = []; // inter-beat intervals ms, keep 40
  private beatPhase = 0; // seconds into current beat
  private curIbi = 857; // ms
  private scrs: ScrEvent[] = [];

  recordingSessionId: number | null = null;
  onReading: ((s: LiveSample) => void) | null = null;
  latest: LiveSample | null = null;
  private lastStepAt = 0;

  /** autonomous 1 Hz acquisition loop — recording progresses even when nobody polls */
  start() {
    const g = globalThis as unknown as { __ev_sim_started?: boolean };
    if (g.__ev_sim_started) return;
    g.__ev_sim_started = true;
    setInterval(() => {
      try {
        this.forceStep();
      } catch (e) {
        console.error("simulator step failed:", e);
      }
    }, 1000);
  }

  /** advance exactly one second of acquisition (used by the loop, seeds, tests) */
  forceStep(): LiveSample {
    this.latest = this.step();
    this.lastStepAt = Date.now();
    return this.latest;
  }

  setScenario(id: ScenarioId) {
    this.scenario = id;
    if (id !== "auto") {
      const target = (id === "baseline" ? "neutral"
        : id === "amusement" ? "happy"
        : id === "sadness" ? "sad"
        : id === "stress" ? "angry"
        : id === "threat" ? "fear"
        : id === "startle" ? "surprise"
        : "disgust") as Emotion;
      this.truth = target;
      this.dwell = 1e9;
    } else {
      this.dwell = 0; // force immediate pick
    }
  }

  private maybeTransition() {
    if (this.dwell > 0) { this.dwell--; return; }
    if (this.scenario === "auto") {
      const order: Emotion[] = ["neutral", "happy", "surprise", "angry", "fear", "sad", "disgust"];
      const i = order.indexOf(this.truth);
      this.truth = order[(i + 1) % order.length];
      this.dwell = 28 + Math.floor(Math.random() * 14);
    }
  }

  /** return the freshest sample; step if none exists or the last one is stale */
  tick(): LiveSample {
    if (!this.latest || Date.now() - this.lastStepAt > 1500) return this.forceStep();
    return this.latest;
  }

  private step(): LiveSample {
    this.t += 1;
    this.maybeTransition();
    const P = PARAMS[this.truth];

    // ---- EDA (GSR) @ 4 Hz: tonic random walk + phasic SCR events ----
    const tonicTarget = gauss(P.eda_mean[0], P.eda_mean[1] * 0.4);
    this.edaLevel += (tonicTarget - this.edaLevel) * 0.08 + gauss(0, 0.01);
    this.edaLevel = clamp(this.edaLevel, 0.5, 8);
    // SCR event generation: poisson with class rate (events/min)
    if (Math.random() < (P.scr_rate[0] + P.scr_rate[1] * Math.random()) / 60) {
      this.scrs.push({ t: this.t, amp: clamp(gauss(P.scr_amp[0], P.scr_amp[1]), 0.01, 0.6) });
    }
    this.scrs = this.scrs.filter((e) => this.t - e.t < 60);
    const phasic = this.scrs.reduce((a, e) => {
      const dt = this.t - e.t;
      return a + (dt < 3 ? e.amp * (dt / 3) * 0.9 : e.amp * Math.exp(-(dt - 3) / 4)); // rise+decay
    }, 0);
    for (let k = 0; k < 4; k++) {
      this.edaHist.push(this.edaLevel + phasic + gauss(0, 0.02));
    }
    if (this.edaHist.length > 64) this.edaHist.splice(0, this.edaHist.length - 64);
    const eda = this.edaHist[this.edaHist.length - 1];

    // ---- cardiac: IBI series driven by class HR/HRV ----
    const hrTarget = clamp(gauss(P.hr_mean[0], P.hr_mean[1] * 0.5), 45, 140);
    const ibiTarget = 60000 / hrTarget;
    const hrv = clamp(gauss(P.rmssd[0], P.rmssd[1] * 0.5), 8, 80);
    this.curIbi += (ibiTarget - this.curIbi) * 0.1 + gauss(0, hrv * 0.35);
    this.curIbi = clamp(this.curIbi, 430, 1330);
    this.beatPhase += 1; // 1 s elapsed
    const beatsThisSec = this.beatPhase * 1000 >= this.curIbi ? Math.floor((this.beatPhase * 1000) / this.curIbi) : 0;
    if (beatsThisSec > 0) {
      for (let b = 0; b < beatsThisSec; b++) {
        this.ibis.push(this.curIbi);
        if (this.ibis.length > 40) this.ibis.shift();
      }
      this.beatPhase = (this.beatPhase * 1000) % this.curIbi / 1000;
    }
    const hr = 60000 / this.curIbi;

    // ---- synthetic ECG chunk (125 Hz, 1 s) with PQRST morphology ----
    const ecg = this.renderEcg(125);

    // ---- windowed features ----
    const physio = this.computeFeatures(P, hr);

    // ---- webcam FER branch ----
    const faceDetected = Math.random() > 0.08;
    const idx = EMOTIONS.indexOf(this.truth);
    const sharp = FACE_SHARP[this.truth];
    const faceLogits = EMOTIONS.map((_, i) =>
      i === idx ? gauss(sharp, 0.5) : gauss(0, 0.55),
    );
    if (!faceDetected) for (let i = 0; i < 7; i++) faceLogits[i] = gauss(0, 0.4);
    else if (Math.random() < 0.12) for (let i = 0; i < 7; i++) faceLogits[i] += gauss(0, 1.2); // motion blur
    const highArousal = ["angry", "fear", "surprise", "happy"].includes(this.truth);
    const faceGeom = {
      eyeAspect: clamp(gauss(0.3, 0.04), 0.1, 0.5),
      browFurrow: clamp(gauss(0.15, 0.08) + (["angry", "fear", "disgust", "sad"].includes(this.truth) ? 0.35 : 0), 0, 1),
      mouthOpen: clamp(gauss(0.1, 0.06) + (highArousal ? 0.45 : 0), 0, 1),
    };

    const physioOk = Math.random() > 0.03;
    const out = infer({
      physio: physio.arr,
      face: [...faceLogits, faceGeom.eyeAspect, faceGeom.browFurrow, faceGeom.mouthOpen],
      quality: [physioOk ? 1 : 0, faceDetected ? 1 : 0],
    });

    const valence = EMOTIONS.reduce((a, e) => a + out.probs[e] * EMOTION_VA[e].v, 0);
    const arousal = EMOTIONS.reduce((a, e) => a + out.probs[e] * EMOTION_VA[e].a, 0);

    const sample: LiveSample = {
      ts: Date.now(),
      scenario: this.scenario,
      ecg,
      eda,
      hr,
      physio: physio.named,
      faceLogits,
      faceGeom,
      faceDetected,
      signalQuality: { physio: physioOk ? 1 : 0.35, face: faceDetected ? 1 : 0.2 },
      probs: out.probs,
      emotion: out.emotion,
      confidence: out.confidence,
      gate: out.gate,
      valence,
      arousal,
      sessionId: this.recordingSessionId,
    };
    if (this.recordingSessionId != null && this.onReading) this.onReading(sample);
    return sample;
  }

  private computeFeatures(P: PhysioParams, hr: number) {
    const h = this.edaHist;
    const n = h.length;
    const edaMean = h.reduce((a, b) => a + b, 0) / n;
    const edaStd = Math.sqrt(h.reduce((a, b) => a + (b - edaMean) ** 2, 0) / n);
    // slope via least squares over the window (µS/s)
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) {
      const x = i / 4; sx += x; sy += h[i]; sxy += x * h[i]; sxx += x * x;
    }
    const edaSlope = (n * sxy - sx * sy) / Math.max(1e-6, n * sxx - sx * sx);
    const scrRate = this.scrs.filter((e) => this.t - e.t < 60).length;
    const recentScr = this.scrs.filter((e) => this.t - e.t < 30);
    const scrAmp = recentScr.length ? recentScr.reduce((a, e) => a + e.amp, 0) / recentScr.length : 0.02;

    const ibis = this.ibis;
    const hrMean = ibis.length ? 60000 / (ibis.reduce((a, b) => a + b, 0) / ibis.length) : hr;
    const hrVals = ibis.map((i) => 60000 / i);
    const hrStd = hrVals.length > 1 ? Math.sqrt(hrVals.reduce((a, b) => a + (b - hrMean) ** 2, 0) / hrVals.length) : 2;
    let rmssd = 0, sdnn = 0, pnn50 = 0;
    if (ibis.length > 2) {
      const diffs = ibis.slice(1).map((v, i) => v - ibis[i]);
      rmssd = Math.sqrt(diffs.reduce((a, d) => a + d * d, 0) / diffs.length);
      const m = ibis.reduce((a, b) => a + b, 0) / ibis.length;
      sdnn = Math.sqrt(ibis.reduce((a, b) => a + (b - m) ** 2, 0) / ibis.length);
      pnn50 = (diffs.filter((d) => Math.abs(d) > 50).length / diffs.length) * 100;
    } else {
      rmssd = P.rmssd[0]; sdnn = P.sdnn[0]; pnn50 = P.pnn50[0];
    }
    // LF/HF approximated from autonomic state (sympathetic ↔ inverse RMSSD)
    const lfhf = clamp(P.lf_hf[0] * (P.rmssd[0] / Math.max(10, rmssd)) ** 0.4 + gauss(0, 0.15), 0.2, 5);

    const named: Record<PhysioFeature, number> = {
      eda_mean: edaMean, eda_std: edaStd, eda_slope: edaSlope,
      scr_rate: scrRate, scr_amp: scrAmp,
      hr_mean: hrMean, hr_std: hrStd,
      rmssd, sdnn, pnn50, lf_hf: lfhf,
    };
    return { named, arr: Object.values(named) };
  }

  /** render 1 s of synthetic ECG at the given rate with PQRST morphology */
  private renderEcg(rate: number): number[] {
    const out: number[] = [];
    const ibiS = this.curIbi / 1000;
    for (let i = 0; i < rate; i++) {
      const tAbs = this.t - 1 + i / rate;
      const phase = ((tAbs % ibiS) + ibiS) % ibiS / ibiS; // 0..1 within beat
      // PQRST template (gaussian bumps)
      const g = (c: number, w: number, a: number) => a * Math.exp(-((phase - c) ** 2) / (2 * w * w));
      const v =
        g(0.12, 0.025, 0.12) + // P
        g(0.24, 0.008, -0.12) + // Q
        g(0.27, 0.01, 1.0) + // R
        g(0.3, 0.009, -0.22) + // S
        g(0.46, 0.045, 0.28) + // T
        0.05 * Math.sin(2 * Math.PI * 0.3 * tAbs) + // baseline wander (respiration)
        gauss(0, 0.015); // electrode noise
      out.push(Math.round(v * 1000) / 1000);
    }
    return out;
  }
}

export const simulator = new Simulator();
