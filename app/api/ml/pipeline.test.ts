import { describe, it, expect } from "vitest";
import { infer } from "./inference";
import { simulator } from "./simulator";
import { EMOTIONS } from "@contracts/emotions";

describe("FusionNet inference engine", () => {
  it("produces a valid 7-class distribution that sums to 1", () => {
    const out = infer({
      physio: [2, 0.08, 0, 1, 0.05, 70, 3, 42, 55, 22, 1.2],
      face: [2, 0, 0, 0, 0, 0, 0, 0.3, 0.1, 0.1],
      quality: [1, 1],
    });
    const sum = Object.values(out.probs).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(Object.keys(out.probs)).toHaveLength(7);
    expect(EMOTIONS).toContain(out.emotion);
  });

  it("classifies a clear fear signature as fear", () => {
    const out = infer({
      physio: [4.8, 0.32, 0.08, 7.5, 0.3, 96, 6, 24, 36, 8, 2.8],
      face: [0, 0, 0, 0, 2.1, 0, 0, 0.3, 0.5, 0.5],
      quality: [1, 1],
    });
    expect(out.emotion).toBe("fear");
    expect(out.confidence).toBeGreaterThan(0.9);
  });

  it("classifies a clear happy signature as happy", () => {
    const out = infer({
      physio: [2.8, 0.15, 0.02, 3, 0.12, 78, 4.5, 48, 62, 26, 1.4],
      face: [0, 2.4, 0, 0, 0, 0, 0, 0.3, 0.1, 0.55],
      quality: [1, 1],
    });
    expect(out.emotion).toBe("happy");
  });

  it("gate weights are a valid softmax pair", () => {
    const out = infer({
      physio: [2, 0.08, 0, 1, 0.05, 70, 3, 42, 55, 22, 1.2],
      face: [2, 0, 0, 0, 0, 0, 0, 0.3, 0.1, 0.1],
      quality: [1, 1],
    });
    expect(out.gate.physio + out.gate.face).toBeCloseTo(1, 6);
    expect(out.gate.physio).toBeGreaterThan(0);
    expect(out.gate.face).toBeGreaterThan(0);
  });

  it("shifts trust toward physio when the face is lost", () => {
    const base = infer({
      physio: [4.8, 0.32, 0.08, 7.5, 0.3, 96, 6, 24, 36, 8, 2.8],
      face: [0, 0, 0, 0, 2.1, 0, 0, 0.3, 0.5, 0.5],
      quality: [1, 1],
    });
    const noFace = infer({
      physio: [4.8, 0.32, 0.08, 7.5, 0.3, 96, 6, 24, 36, 8, 2.8],
      face: [0.1, -0.2, 0.05, 0.1, 0.15, -0.1, 0.2, 0.3, 0.5, 0.5],
      quality: [1, 0],
    });
    expect(noFace.gate.physio).toBeGreaterThanOrEqual(base.gate.physio - 0.5);
    expect(noFace.emotion).toBe("fear"); // still correct from physio alone
  });
});

describe("ESP32 sensor simulator", () => {
  it("generates physiologically plausible samples in every scenario", () => {
    const scenarios = ["baseline", "amusement", "sadness", "stress", "threat", "startle", "aversive"] as const;
    for (const sc of scenarios) {
      simulator.setScenario(sc);
      // let the state settle
      for (let i = 0; i < 20; i++) simulator.forceStep();
      const s = simulator.forceStep();
      expect(s.hr).toBeGreaterThan(40);
      expect(s.hr).toBeLessThan(150);
      expect(s.eda).toBeGreaterThan(0);
      expect(s.ecg.length).toBe(125);
      expect(Object.values(s.probs).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      expect(EMOTIONS).toContain(s.emotion);
    }
  });

  it("reports higher heart rate under stress/threat than at baseline", () => {
    simulator.setScenario("baseline");
    let base = 0;
    for (let i = 0; i < 25; i++) base = simulator.forceStep().hr;
    simulator.setScenario("threat");
    let threat = 0;
    for (let i = 0; i < 25; i++) threat = simulator.forceStep().hr;
    expect(threat).toBeGreaterThan(base + 5);
  });

  it("emotion predictions track the elicited state after settling", () => {
    simulator.setScenario("stress");
    let correct = 0;
    for (let i = 0; i < 30; i++) {
      const s = simulator.forceStep();
      if (i > 10 && ["angry", "fear"].includes(s.emotion)) correct++;
    }
    expect(correct / 19).toBeGreaterThan(0.6);
  });
});
