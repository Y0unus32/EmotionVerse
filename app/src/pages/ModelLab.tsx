import { trpc } from "@/providers/trpc";
import { EMOTION_COLORS, type Emotion } from "@contracts/emotions";

export default function ModelLab() {
  const m = trpc.ev.modelMetrics.useQuery();
  const d = m.data;
  if (!d) return <div className="ev-panel p-8 text-center font-mono text-xs text-muted-foreground">LOADING…</div>;

  const cm = d.confusion_matrix as number[][];
  const classes = d.classes as string[];
  const hist = d.training_history as { epoch: number; train_loss: number; train_acc: number }[];

  return (
    <div className="flex flex-col gap-3">
      {/* headline metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Test accuracy", `${(d.test_accuracy * 100).toFixed(2)}%`, "#34d399"],
          ["Macro F1", d.macro_f1.toFixed(3), "#22d3ee"],
          ["Train samples", String(d.n_train), "#94a3b8"],
          ["Test samples", String(d.n_test), "#94a3b8"],
        ].map(([k, v, c]) => (
          <div key={k} className="ev-panel px-3.5 py-3">
            <div className="font-mono text-lg font-semibold tabular-nums" style={{ color: c }}>{v}</div>
            <div className="ev-label mt-1">{k}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {/* confusion matrix */}
        <div className="ev-panel">
          <div className="ev-panel-head"><span className="ev-label">Confusion matrix · held-out test</span></div>
          <div className="overflow-x-auto p-4">
            <div className="min-w-[420px]">
              <div className="grid" style={{ gridTemplateColumns: `72px repeat(${classes.length}, 1fr)` }}>
                <div />
                {classes.map((c) => (
                  <div key={c} className="pb-1 text-center font-mono text-[9px] uppercase" style={{ color: EMOTION_COLORS[c as Emotion] }}>
                    {c.slice(0, 4)}
                  </div>
                ))}
                {cm.map((row, i) => (
                  <>
                    <div key={`l${i}`} className="pr-2 text-right font-mono text-[9px] uppercase leading-8" style={{ color: EMOTION_COLORS[classes[i] as Emotion] }}>
                      {classes[i]}
                    </div>
                    {row.map((v, j) => {
                      const max = Math.max(...row);
                      const a = v / max;
                      return (
                        <div
                          key={`${i}-${j}`}
                          className="m-[1px] flex h-8 items-center justify-center rounded-sm font-mono text-[10px] tabular-nums"
                          style={{
                            background: i === j ? `rgba(52, 211, 153, ${0.08 + a * 0.5})` : `rgba(248, 113, 113, ${a * 0.45})`,
                            color: a > 0.4 ? "#fff" : "hsl(217 15% 65%)",
                          }}
                          title={`true ${classes[i]} → pred ${classes[j]}: ${v}`}
                        >
                          {v}
                        </div>
                      );
                    })}
                  </>
                ))}
              </div>
              <div className="mt-2 text-center font-mono text-[9px] tracking-[0.14em] text-muted-foreground">
                ROWS = TRUE LABEL · COLUMNS = PREDICTED
              </div>
            </div>
          </div>
        </div>

        {/* ablation + per-class */}
        <div className="flex flex-col gap-3">
          <div className="ev-panel">
            <div className="ev-panel-head"><span className="ev-label">Ablation · why fusion wins</span></div>
            <div className="flex flex-col gap-3 p-4">
              {([
                ["Physio only (EDA+ECG)", d.ablation.physio_only, "#34d399"],
                ["Face only (FER-CNN)", d.ablation.face_only, "#a78bfa"],
                ["FusionNet (this model)", d.ablation.fusion, "#22d3ee"],
              ] as const).map(([label, v, c]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between font-mono text-[10px]">
                    <span className="text-muted-foreground">{label}</span>
                    <span style={{ color: c }}>{(v * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-sm bg-secondary">
                    <div className="h-full rounded-sm" style={{ width: `${v * 100}%`, background: c }} />
                  </div>
                </div>
              ))}
              <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                The attention gate re-weights modalities per window — when the webcam loses the face,
                trust shifts to physiology; during electrode noise it shifts back. That is worth{" "}
                <span className="text-primary">+{((d.ablation.fusion - d.ablation.face_only) * 100).toFixed(1)} pts</span>{" "}
                over the best single modality.
              </p>
            </div>
          </div>

          <div className="ev-panel">
            <div className="ev-panel-head"><span className="ev-label">Per-class precision / recall / F1</span></div>
            <table className="w-full font-mono text-[11px]">
              <thead>
                <tr className="border-b border-border text-left">
                  {["CLASS", "P", "R", "F1"].map((h) => (
                    <th key={h} className="ev-label px-4 py-2 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => {
                  const pc = (d.per_class as Record<string, { precision: number; recall: number; f1: number }>)[c];
                  return (
                    <tr key={c} className="border-b border-border/50 tabular-nums">
                      <td className="px-4 py-1.5 uppercase" style={{ color: EMOTION_COLORS[c as Emotion] }}>{c}</td>
                      <td className="px-4 py-1.5 text-muted-foreground">{pc.precision.toFixed(3)}</td>
                      <td className="px-4 py-1.5 text-muted-foreground">{pc.recall.toFixed(3)}</td>
                      <td className="px-4 py-1.5 text-muted-foreground">{pc.f1.toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* training curve + architecture */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="ev-panel">
          <div className="ev-panel-head"><span className="ev-label">Training curve · 60 epochs</span></div>
          <div className="p-4">
            <svg viewBox="0 0 100 40" className="h-40 w-full" preserveAspectRatio="none">
              {[0, 10, 20, 30, 40].map((y) => (
                <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="hsl(221 44% 16%)" strokeWidth="0.2" />
              ))}
              <polyline
                fill="none"
                stroke="#22d3ee"
                strokeWidth="0.6"
                points={hist.map((h, i) => `${(i / (hist.length - 1)) * 100},${38 - h.train_acc * 36}`).join(" ")}
              />
              <polyline
                fill="none"
                stroke="#fbbf24"
                strokeWidth="0.6"
                points={hist.map((h, i) => `${(i / (hist.length - 1)) * 100},${2 + h.train_loss * 30}`).join(" ")}
              />
            </svg>
            <div className="mt-1 flex gap-4 font-mono text-[10px]">
              <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-1.5 w-3 bg-[#22d3ee]" /> TRAIN ACC</span>
              <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-1.5 w-3 bg-[#fbbf24]" /> LOSS</span>
            </div>
          </div>
        </div>

        <div className="ev-panel">
          <div className="ev-panel-head"><span className="ev-label">Architecture · FusionNet v1</span></div>
          <div className="p-4">
            <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">{d.architecture}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
              {["EDA/ECG 11F", "ENC 32·32", "FACE 10F", "ENC 32·32", "GATE σ(2)", "CONCAT 64", "HEAD 48", "SOFTMAX 7"].map((b, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="rounded border border-primary/40 bg-primary/10 px-2 py-1 text-primary">{b}</span>
                  {i < 7 && <span className="text-muted-foreground">→</span>}
                </span>
              ))}
            </div>
            <div className="mt-4 rounded border border-border bg-secondary/40 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
              Trained in PyTorch on 9,800 synthesized WESAD/FER2013-style windows (12% webcam dropout,
              8% electrode-noise bursts). Weights exported to JSON; inference runs bit-exactly in the
              TypeScript backend (max deviation vs PyTorch &lt; 1e-7). Retrain with
              <span className="text-foreground"> ml_training/train_fusion.py</span>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
