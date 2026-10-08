// Shared constants between frontend and backend.

export const EMOTIONS = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "fear",
  "surprise",
  "disgust",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const EMOTION_COLORS: Record<Emotion, string> = {
  neutral: "#94a3b8",
  happy: "#fbbf24",
  sad: "#60a5fa",
  angry: "#f87171",
  fear: "#a78bfa",
  surprise: "#22d3ee",
  disgust: "#34d399",
};

// Circumplex-model anchor points (valence, arousal) in [-1, 1]
export const EMOTION_VA: Record<Emotion, { v: number; a: number }> = {
  neutral: { v: 0.05, a: 0.05 },
  happy: { v: 0.85, a: 0.55 },
  sad: { v: -0.75, a: -0.55 },
  angry: { v: -0.6, a: 0.8 },
  fear: { v: -0.55, a: 0.9 },
  surprise: { v: 0.35, a: 0.85 },
  disgust: { v: -0.65, a: 0.35 },
};

export const PHYSIO_FEATURES = [
  "eda_mean",
  "eda_std",
  "eda_slope",
  "scr_rate",
  "scr_amp",
  "hr_mean",
  "hr_std",
  "rmssd",
  "sdnn",
  "pnn50",
  "lf_hf",
] as const;
export type PhysioFeature = (typeof PHYSIO_FEATURES)[number];

export const FACE_FEATURES = [
  ...EMOTIONS.map((e) => `face_logit_${e}`),
  "eye_aspect",
  "brow_furrow",
  "mouth_open",
] as const;

// Stimulus scenarios the ESP32 test rig walks the subject through.
export const SCENARIOS = [
  { id: "auto", label: "Auto protocol", target: null, hint: "Cycles through the full elicitation protocol" },
  { id: "baseline", label: "Baseline rest", target: "neutral", hint: "Quiet resting baseline, eyes open" },
  { id: "amusement", label: "Amusing clip", target: "happy", hint: "Positive video stimulus" },
  { id: "sadness", label: "Sad film clip", target: "sad", hint: "Negative-valence, low-arousal stimulus" },
  { id: "stress", label: "TSST stressor", target: "angry", hint: "Timed arithmetic under pressure" },
  { id: "threat", label: "Threat imagery", target: "fear", hint: "High-arousal aversive stimulus" },
  { id: "startle", label: "Startle probe", target: "surprise", hint: "Unexpected auditory/visual probe" },
  { id: "aversive", label: "Aversive images", target: "disgust", hint: "Contamination-themed imagery" },
] as const;
export type ScenarioId = (typeof SCENARIOS)[number]["id"];

export interface EmotionProbs {
  neutral: number;
  happy: number;
  sad: number;
  angry: number;
  fear: number;
  surprise: number;
  disgust: number;
}

export interface LiveSample {
  ts: number;
  scenario: ScenarioId;
  // raw display waveforms (last chunk)
  ecg: number[]; // ECG chunk ~1s @ 125pts (AD8232 analog out)
  eda: number; // instantaneous EDA µS
  hr: number; // instantaneous BPM
  // windowed features fed to the model
  physio: Record<PhysioFeature, number>;
  faceLogits: number[]; // 7 webcam-branch logits
  faceGeom: { eyeAspect: number; browFurrow: number; mouthOpen: number };
  faceDetected: boolean;
  signalQuality: { physio: number; face: number };
  // inference output
  probs: EmotionProbs;
  emotion: Emotion;
  confidence: number;
  gate: { physio: number; face: number }; // attention gate weights
  valence: number;
  arousal: number;
  // session recording state
  sessionId: number | null;
}
