import { Link, useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { EMOTION_COLORS, EMOTIONS, type Emotion } from "@contracts/emotions";
import { RollingLines } from "@/components/CanvasCharts";
import { DistBar } from "./Sessions";
import { ArrowLeft } from "lucide-react";

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const q = trpc.ev.sessionDetail.useQuery({ id: Number(id) }, { enabled: !!id });

  if (q.isLoading)
    return <div className="ev-panel p-8 text-center font-mono text-xs text-muted-foreground">LOADING…</div>;
  if (!q.data?.session)
    return (
      <div className="ev-panel p-8 text-center font-mono text-xs text-muted-foreground">
        SESSION NOT FOUND — <Link to="/sessions" className="text-primary">back</Link>
      </div>
    );

  const { session, readings } = q.data;
  const dist = (session.distribution ?? {}) as Record<string, number>;

  return (
    <div className="flex flex-col gap-3">
      <Link to="/sessions" className="flex w-fit items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] text-muted-foreground hover:text-primary">
        <ArrowLeft size={13} /> ALL SESSIONS
      </Link>

      <div className="ev-panel p-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-mono text-lg font-semibold text-foreground">{session.name}</h1>
          <span className="ev-label">#{session.id} · {session.scenario}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Started", new Date(session.startedAt).toLocaleString()],
            ["Ended", session.endedAt ? new Date(session.endedAt).toLocaleString() : "recording…"],
            ["Samples", String(session.sampleCount)],
            ["Avg confidence", session.avgConfidence ? `${(session.avgConfidence * 100).toFixed(1)}%` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded border border-border bg-secondary/40 p-2.5">
              <div className="font-mono text-xs text-foreground">{v}</div>
              <div className="ev-label mt-0.5">{k}</div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <div className="ev-label mb-1.5">Emotion distribution</div>
          <DistBar dist={dist} />
          <div className="mt-2 flex flex-wrap gap-3">
            {EMOTIONS.filter((e) => dist[e]).map((e) => {
              const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
              return (
                <span key={e} className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: EMOTION_COLORS[e] }} />
                  {e.toUpperCase()} {((dist[e] / total) * 100).toFixed(1)}%
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="ev-panel">
        <div className="ev-panel-head">
          <span className="ev-label">Timeline · heart rate vs EDA</span>
          <span className="font-mono text-[10px] text-muted-foreground">{readings.length} pts</span>
        </div>
        <div className="h-40 p-1">
          <RollingLines
            min={0}
            max={130}
            series={[
              { label: "HR", color: "#f87171", values: readings.map((r) => r.hr) },
              { label: "EDA×15", color: "#22d3ee", values: readings.map((r) => r.eda * 15) },
            ]}
          />
        </div>
      </div>

      <div className="ev-panel overflow-x-auto">
        <div className="ev-panel-head">
          <span className="ev-label">Inference log</span>
        </div>
        <table className="w-full min-w-[640px] font-mono text-[11px]">
          <thead>
            <tr className="border-b border-border text-left">
              {["T", "EMOTION", "CONF", "HR", "EDA", "RMSSD", "VAL", "ARO", "GATE P/F"].map((h) => (
                <th key={h} className="ev-label px-3 py-2 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...readings].reverse().slice(0, 60).map((r) => (
              <tr key={r.id} className="border-b border-border/50 tabular-nums hover:bg-secondary/40">
                <td className="px-3 py-1.5 text-muted-foreground">{new Date(r.ts).toLocaleTimeString("en-GB", { hour12: false })}</td>
                <td className="px-3 py-1.5" style={{ color: EMOTION_COLORS[r.emotion as Emotion] }}>{r.emotion.toUpperCase()}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{(r.confidence * 100).toFixed(1)}%</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.hr.toFixed(0)}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.eda.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.rmssd.toFixed(1)}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.valence.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.arousal.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.gatePhysio.toFixed(2)} / {r.gateFace.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
