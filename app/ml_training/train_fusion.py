"""EmotionVerse — multimodal fusion network training.

Trains the dual-encoder attention-gated fusion model that the web app runs
inference with (weights exported to ../api/ml/model_weights.json).

Modalities:
  * physio  : 11 windowed features from GSR/EDA + AD8232 ECG (ESP32 node)
  * face    : 7-class FER CNN logits + 3 facial geometry features (webcam)

Class-conditional synthesis matches the distributions reported for
WESAD-style EDA/ECG responses and FER2013-style facial logits, so the script
runs end-to-end offline. Replace `gen_sample` with real recorded windows to
fine-tune on your own subjects.

Run:  python3 train_fusion.py
"""

import json
import numpy as np
import torch
import torch.nn as nn

rng = np.random.default_rng(42)
torch.manual_seed(42)

EMOTIONS = ["neutral", "happy", "sad", "angry", "fear", "surprise", "disgust"]
PHYSIO_FEATURES = ["eda_mean", "eda_std", "eda_slope", "scr_rate", "scr_amp",
                   "hr_mean", "hr_std", "rmssd", "sdnn", "pnn50", "lf_hf"]
FACE_FEATURES = [f"face_logit_{e}" for e in EMOTIONS] + ["eye_aspect", "brow_furrow", "mouth_open"]

physio_params = {
    "neutral":  dict(eda_mean=(2.0,0.5), eda_std=(0.08,0.03), eda_slope=(0.0,0.02),  scr_rate=(1.0,0.6), scr_amp=(0.05,0.03), hr_mean=(70,4), hr_std=(3.0,0.8), rmssd=(42,8), sdnn=(55,10), pnn50=(22,6), lf_hf=(1.2,0.3)),
    "happy":    dict(eda_mean=(2.8,0.6), eda_std=(0.15,0.05), eda_slope=(0.02,0.02), scr_rate=(3.0,1.0), scr_amp=(0.12,0.05), hr_mean=(78,5), hr_std=(4.5,1.0), rmssd=(48,9), sdnn=(62,10), pnn50=(26,6), lf_hf=(1.4,0.3)),
    "sad":      dict(eda_mean=(1.5,0.4), eda_std=(0.05,0.02), eda_slope=(-0.02,0.015), scr_rate=(0.6,0.4), scr_amp=(0.03,0.02), hr_mean=(63,4), hr_std=(2.5,0.7), rmssd=(50,10), sdnn=(60,11), pnn50=(28,7), lf_hf=(0.9,0.25)),
    "angry":    dict(eda_mean=(4.2,0.7), eda_std=(0.28,0.07), eda_slope=(0.06,0.025), scr_rate=(6.5,1.4), scr_amp=(0.25,0.08), hr_mean=(92,6), hr_std=(5.5,1.2), rmssd=(28,6), sdnn=(40,8), pnn50=(10,4), lf_hf=(2.4,0.5)),
    "fear":     dict(eda_mean=(4.8,0.8), eda_std=(0.32,0.08), eda_slope=(0.08,0.03), scr_rate=(7.5,1.5), scr_amp=(0.30,0.09), hr_mean=(96,7), hr_std=(6.0,1.3), rmssd=(24,6), sdnn=(36,8), pnn50=(8,3), lf_hf=(2.8,0.6)),
    "surprise": dict(eda_mean=(3.4,0.6), eda_std=(0.22,0.06), eda_slope=(0.10,0.04), scr_rate=(4.5,1.2), scr_amp=(0.20,0.07), hr_mean=(84,6), hr_std=(6.5,1.5), rmssd=(36,8), sdnn=(48,10), pnn50=(16,5), lf_hf=(1.8,0.4)),
    "disgust":  dict(eda_mean=(2.6,0.5), eda_std=(0.14,0.04), eda_slope=(0.01,0.02), scr_rate=(2.5,0.9), scr_amp=(0.10,0.04), hr_mean=(74,5), hr_std=(3.8,0.9), rmssd=(38,8), sdnn=(52,10), pnn50=(20,5), lf_hf=(1.5,0.35)),
}
face_sharp = {"neutral":2.0, "happy":2.4, "sad":1.8, "angry":2.2, "fear":2.1, "surprise":2.3, "disgust":1.9}


def gen_sample(emotion):
    p = physio_params[emotion]
    phys = np.array([rng.normal(*p[f]) for f in PHYSIO_FEATURES])
    phys[4] = np.clip(phys[4], 0.005, None); phys[3] = np.clip(phys[3], 0, None)
    phys[5] = np.clip(phys[5], 45, 140);   phys[7] = np.clip(phys[7], 8, 80)
    phys[1] = abs(phys[1]); phys[6] = abs(phys[6]); phys[8] = abs(phys[8])
    phys[9] = np.clip(phys[9], 0, 60);     phys[10] = np.clip(phys[10], 0.2, 5)
    idx = EMOTIONS.index(emotion)
    logits = rng.normal(0.0, 0.55, 7)
    logits[idx] = rng.normal(face_sharp[emotion], 0.5)
    geom = np.array([
        np.clip(rng.normal(0.30, 0.04), 0.1, 0.5),
        np.clip(rng.normal(0.15, 0.08) + (0.35 if emotion in ("angry", "fear", "disgust", "sad") else 0), 0, 1),
        np.clip(rng.normal(0.10, 0.06) + (0.45 if emotion in ("surprise", "fear", "happy") else 0), 0, 1),
    ])
    return phys, np.concatenate([logits, geom])


class FusionNet(nn.Module):
    def __init__(self, dp=11, df=10, h=32, ncls=7):
        super().__init__()
        self.physio = nn.Sequential(nn.Linear(dp, h), nn.ReLU(), nn.Linear(h, h), nn.ReLU())
        self.face = nn.Sequential(nn.Linear(df, h), nn.ReLU(), nn.Linear(h, h), nn.ReLU())
        self.gate = nn.Sequential(nn.Linear(2 * h + 2, 24), nn.ReLU(), nn.Linear(24, 2))
        self.head = nn.Sequential(nn.Linear(2 * h, 48), nn.ReLU(), nn.Dropout(0.2), nn.Linear(48, ncls))

    def forward(self, xp, xf, quality):
        ep, ef = self.physio(xp), self.face(xf)
        g = torch.softmax(self.gate(torch.cat([ep, ef, quality], 1)), dim=1)
        fused = torch.cat([ep * g[:, 0:1], ef * g[:, 1:2]], 1)
        return self.head(fused), g


def main():
    X_phys, X_face, Y = [], [], []
    for i, e in enumerate(EMOTIONS):
        for _ in range(1400):
            ph, fa = gen_sample(e)
            if rng.random() < 0.12:
                fa[:7] += rng.normal(0, 1.2, 7)      # webcam motion blur / dropout
            if rng.random() < 0.08:
                ph += rng.normal(0, np.abs(ph) * 0.25 + 0.05)  # electrode noise burst
            X_phys.append(ph); X_face.append(fa); Y.append(i)
    X_phys = np.array(X_phys, np.float32); X_face = np.array(X_face, np.float32); Y = np.array(Y)

    perm = rng.permutation(len(Y))
    n_tr = int(0.8 * len(Y)); tr, te = perm[:n_tr], perm[n_tr:]
    pmean, pstd = X_phys[tr].mean(0), X_phys[tr].std(0) + 1e-6
    fmean, fstd = X_face[tr].mean(0), X_face[tr].std(0) + 1e-6
    tn = lambda a, m, s: torch.tensor((a - m) / s, dtype=torch.float32)
    Xp_tr, Xf_tr = tn(X_phys[tr], pmean, pstd), tn(X_face[tr], fmean, fstd)
    Xp_te, Xf_te = tn(X_phys[te], pmean, pstd), tn(X_face[te], fmean, fstd)
    Ytr, Yte = torch.tensor(Y[tr]), torch.tensor(Y[te])
    Qtr = torch.tensor((rng.random((len(tr), 2)) > 0.1).astype(np.float32))
    Qte = torch.tensor((rng.random((len(te), 2)) > 0.1).astype(np.float32))

    model = FusionNet()
    opt = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
    lossf = nn.CrossEntropyLoss()
    for epoch in range(60):
        model.train()
        idx = torch.randperm(len(Ytr))
        for i in range(0, len(Ytr), 128):
            b = idx[i:i + 128]
            logits, _ = model(Xp_tr[b], Xf_tr[b], Qtr[b])
            loss = lossf(logits, Ytr[b])
            opt.zero_grad(); loss.backward(); opt.step()

    model.eval()
    with torch.no_grad():
        logits_te, _ = model(Xp_te, Xf_te, Qte)
        pred = logits_te.argmax(1).numpy()
    acc = float((pred == Y[te]).mean())
    print(f"test accuracy: {acc:.4f}")

    def lin(layer):
        return {"w": layer.weight.detach().numpy().tolist(), "b": layer.bias.detach().numpy().tolist()}
    export = {
        "meta": {"emotions": EMOTIONS, "physio_features": PHYSIO_FEATURES, "face_features": FACE_FEATURES,
                 "physio_mean": pmean.tolist(), "physio_std": pstd.tolist(),
                 "face_mean": fmean.tolist(), "face_std": fstd.tolist()},
        "physio": [lin(model.physio[0]), lin(model.physio[2])],
        "face": [lin(model.face[0]), lin(model.face[2])],
        "gate": [lin(model.gate[0]), lin(model.gate[2])],
        "head": [lin(model.head[0]), lin(model.head[3])],
    }
    with open("../api/ml/model_weights.json", "w") as f:
        json.dump(export, f)
    print("weights exported to ../api/ml/model_weights.json")


if __name__ == "__main__":
    main()
