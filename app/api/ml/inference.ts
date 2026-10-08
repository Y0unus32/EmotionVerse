// Pure-TypeScript forward pass of the trained multimodal fusion network.
// Weights were trained in PyTorch (see /ml_training/train_fusion.py in the repo)
// and exported verbatim to model_weights.json. This engine reproduces the exact
// computation graph: per-modality encoders -> learned attention gate -> gated
// concat -> classification head. Dropout is inactive at inference time.

import weights from "./model_weights.json";
import { EMOTIONS, PHYSIO_FEATURES, type Emotion, type EmotionProbs } from "@contracts/emotions";

interface Linear {
  w: number[][]; // [out][in]
  b: number[]; // [out]
}

interface ModelWeights {
  meta: {
    emotions: string[];
    physio_features: string[];
    face_features: string[];
    physio_mean: number[];
    physio_std: number[];
    face_mean: number[];
    face_std: number[];
  };
  physio: Linear[];
  face: Linear[];
  gate: Linear[];
  head: Linear[];
}

const W = weights as unknown as ModelWeights;

function linear(x: number[], l: Linear): number[] {
  const out = new Array<number>(l.b.length);
  for (let o = 0; o < l.b.length; o++) {
    let acc = l.b[o];
    const row = l.w[o];
    for (let i = 0; i < x.length; i++) acc += row[i] * x[i];
    out[o] = acc;
  }
  return out;
}

const relu = (x: number[]) => x.map((v) => (v > 0 ? v : 0));

function softmax(x: number[]): number[] {
  const m = Math.max(...x);
  const e = x.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

function mlp(x: number[], layers: Linear[]): number[] {
  let h = x;
  for (let i = 0; i < layers.length; i++) {
    h = linear(h, layers[i]);
    if (i < layers.length - 1) h = relu(h);
  }
  return h;
}

export interface InferenceInput {
  physio: number[]; // 11 raw physio features (unnormalized), PHYSIO_FEATURES order
  face: number[]; // 10 raw face features (7 logits + 3 geometry)
  quality: [number, number]; // [physio_ok, face_ok] in {0,1}
}

export interface InferenceOutput {
  probs: EmotionProbs;
  emotion: Emotion;
  confidence: number;
  gate: { physio: number; face: number };
}

export function infer(input: InferenceInput): InferenceOutput {
  const xp = input.physio.map(
    (v, i) => (v - W.meta.physio_mean[i]) / W.meta.physio_std[i],
  );
  const xf = input.face.map(
    (v, i) => (v - W.meta.face_mean[i]) / W.meta.face_std[i],
  );

  // modality encoders (ReLU after every layer — both layers have ReLU in training arch)
  const ep = relu(linear(relu(linear(xp, W.physio[0])), W.physio[1]));
  const ef = relu(linear(relu(linear(xf, W.face[0])), W.face[1]));

  // attention gate over the two modality embeddings + quality flags
  const gateLogits = mlp([...ep, ...ef, input.quality[0], input.quality[1]], W.gate);
  const g = softmax(gateLogits);

  const fused = [...ep.map((v) => v * g[0]), ...ef.map((v) => v * g[1])];
  const logits = mlp(fused, W.head);
  const p = softmax(logits);

  const probs = Object.fromEntries(EMOTIONS.map((e, i) => [e, p[i]])) as unknown as EmotionProbs;
  let best = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;

  return {
    probs,
    emotion: EMOTIONS[best],
    confidence: p[best],
    gate: { physio: g[0], face: g[1] },
  };
}

export const MODEL_META = {
  emotions: [...EMOTIONS],
  physioFeatures: [...PHYSIO_FEATURES],
  normStats: {
    physioMean: W.meta.physio_mean,
    physioStd: W.meta.physio_std,
    faceMean: W.meta.face_mean,
    faceStd: W.meta.face_std,
  },
};
