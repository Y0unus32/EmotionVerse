import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { simulator } from "./ml/simulator";
import { infer, MODEL_META } from "./ml/inference";
import metrics from "./ml/model_metrics.json";
import {
  createSession,
  finishSession,
  insertReading,
  listSessions,
  getSessionWithReadings,
} from "./queries/sessions";
import { SCENARIOS, EMOTIONS } from "@contracts/emotions";

// Persist live readings while a session is recording (fire-and-forget),
// and run the acquisition loop autonomously so recording never depends on polling.
simulator.start();
simulator.onReading = (s) => {
  if (s.sessionId == null) return;
  insertReading(s.sessionId, {
    emotion: s.emotion,
    confidence: s.confidence,
    probs: { ...s.probs },
    hr: s.hr,
    eda: s.eda,
    rmssd: s.physio.rmssd,
    scrRate: s.physio.scr_rate,
    valence: s.valence,
    arousal: s.arousal,
    gatePhysio: s.gate.physio,
    gateFace: s.gate.face,
    faceDetected: s.faceDetected,
  }).catch((e) => console.error("reading insert failed:", e));
};

const scenarioEnum = z.enum(SCENARIOS.map((s) => s.id) as [string, ...string[]]);

export const emotionRouter = createRouter({
  // ---- live pipeline ----
  tick: publicQuery.query(() => simulator.tick()),

  setScenario: publicQuery
    .input(z.object({ scenario: scenarioEnum }))
    .mutation(({ input }) => {
      simulator.setScenario(input.scenario as (typeof SCENARIOS)[number]["id"]);
      return { ok: true, scenario: input.scenario };
    }),

  // ---- recording sessions (persisted) ----
  startSession: publicQuery
    .input(z.object({ name: z.string().min(1).max(120), scenario: scenarioEnum }))
    .mutation(async ({ input }) => {
      if (simulator.recordingSessionId != null) {
        await finishSession(simulator.recordingSessionId);
      }
      simulator.setScenario(input.scenario as (typeof SCENARIOS)[number]["id"]);
      const s = await createSession({ name: input.name, scenario: input.scenario });
      simulator.recordingSessionId = s.id;
      return s;
    }),

  stopSession: publicQuery.mutation(async () => {
    const id = simulator.recordingSessionId;
    simulator.recordingSessionId = null;
    if (id == null) return null;
    return finishSession(id);
  }),

  sessions: publicQuery.query(() => listSessions()),

  sessionDetail: publicQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => getSessionWithReadings(input.id)),

  // ---- model card ----
  modelMetrics: publicQuery.query(() => metrics),
  modelInfo: publicQuery.query(() => ({
    architecture: metrics.architecture,
    features: MODEL_META.physioFeatures,
    classes: MODEL_META.emotions,
    emotions: [...EMOTIONS],
  })),

  // ---- real-hardware ingestion (ESP32 / webcam client POSTs feature windows) ----
  ingestWindow: publicQuery
    .input(
      z.object({
        physio: z.array(z.number()).length(11),
        face: z.array(z.number()).length(10),
        quality: z.tuple([z.number(), z.number()]).optional(),
        deviceId: z.string().max(64).optional(),
      }),
    )
    .mutation(({ input }) => {
      const out = infer({
        physio: input.physio,
        face: input.face,
        quality: input.quality ?? [1, 1],
      });
      return { ...out, deviceId: input.deviceId ?? null, ts: Date.now() };
    }),

  deviceStatus: publicQuery.query(() => ({
    esp32: {
      id: "esp32-a4f1c2",
      board: "ESP32-WROOM-32",
      firmware: "emotionverse-fw v1.3.0",
      link: "WiFi 802.11n · MQTT over TLS",
      rssi: -58 + Math.round(Math.random() * 6),
      uptime_s: Math.floor(process.uptime()),
      sensors: [
        { name: "GSR/EDA", pin: "GPIO34 (ADC1_CH6)", rate: "4 Hz", state: "streaming" },
        { name: "AD8232 ECG", pin: "GPIO35 (ADC1_CH7)", rate: "250 Hz", state: "streaming" },
        { name: "AD8232 LO+/LO−", pin: "GPIO32/33", rate: "digital", state: "ok" },
      ],
    },
    webcam: {
      id: "cam-01",
      model: "FER-CNN (7-class, FER2013)",
      rate: "10 fps",
      state: "streaming",
    },
    fusion: {
      model: "FusionNet v1 (dual-encoder attention gate)",
      params: 11879,
      latency_ms: 0.4,
      test_accuracy: metrics.test_accuracy,
    },
  })),
});
