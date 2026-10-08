import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useLive } from "@/hooks/useLive";
import { EcgTrace, RollingLines } from "@/components/CanvasCharts";
import { EmotionPanel, FusionGate, VaPlane, FacePanel } from "@/components/EmotionPanels";
import { SCENARIOS, type ScenarioId } from "@contracts/emotions";
import { Circle, Disc, Square } from "lucide-react";
import { toast } from "sonner";

function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div className="ev-panel px-3.5 py-3">
      <div className="font-mono text-lg font-semibold tabular-nums" style={{ color: color ?? "hsl(210 20% 92%)" }}>
        {value}
        {unit && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span>}
      </div>
      <div className="ev-label mt-1">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const { samples, latest, connected } = useLive();
  const [name, setName] = useState("");
  const utils = trpc.useUtils();

  const setScenario = trpc.ev.setScenario.useMutation({
    onError: (e) => toast.error(`Scenario switch failed: ${e.message}`),
  });
  const startSession = trpc.ev.startSession.useMutation({
    onSuccess: () => { toast.success("Recording started"); utils.ev.sessions.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const stopSession = trpc.ev.stopSession.useMutation({
    onSuccess: () => { toast.success("Session saved to database"); utils.ev.sessions.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const recording = latest?.sessionId != null;
  const scenario = (latest?.scenario ?? "auto") as ScenarioId;

  const edaSeries = useMemo(() => samples.map((s) => s.eda), [samples]);
  const hrSeries = useMemo(() => samples.map((s) => s.hr), [samples]);
  const confSeries = useMemo(() => samples.map((s) => s.confidence * 100), [samples]);

  return (
    <div className="flex flex-col gap-3">
      {/* control strip */}
      <div className="ev-panel flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="ev-led" style={{ background: connected ? "#34d399" : "#f87171", color: connected ? "#34d399" : "#f87171" }} />
          <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground">
            {connected ? "STREAMING @ 1 HZ" : "LINK LOST — RETRYING"}
          </span>
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
          <select
            value={scenario}
            onChange={(e) => setScenario.mutate({ scenario: e.target.value as ScenarioId })}
            className="h-11 sm:h-9 min-w-[190px] rounded border border-border bg-secondary px-2 font-mono text-[11px] text-foreground outline-none focus:border-primary"
          >
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label.toUpperCase()}
              </option>
            ))}
          </select>
          {recording ? (
            <button
              onClick={() => stopSession.mutate()}
              disabled={stopSession.isPending}
              className="flex h-11 sm:h-9 items-center gap-2 rounded border border-destructive/50 bg-destructive/15 px-4 font-mono text-[11px] tracking-[0.14em] text-destructive hover:bg-destructive/25"
            >
              <Square size={12} /> STOP · SAVE
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="SUBJECT / SESSION NAME"
                className="h-11 sm:h-9 w-44 rounded border border-border bg-secondary px-2 font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary"
              />
              <button
                onClick={() => startSession.mutate({ name: name.trim() || `Session ${new Date().toLocaleString()}`, scenario })}
                disabled={startSession.isPending}
                className="flex h-11 sm:h-9 items-center gap-2 rounded border border-primary/50 bg-primary/15 px-4 font-mono text-[11px] tracking-[0.14em] text-primary hover:bg-primary/25"
              >
                <Disc size={12} /> RECORD
              </button>
            </div>
          )}
        </div>
      </div>

      {recording && (
        <div className="ev-panel flex items-center gap-2 border-destructive/40 px-3.5 py-2">
          <Circle size={9} className="fill-destructive text-destructive ev-blink" />
          <span className="font-mono text-[11px] tracking-[0.14em] text-destructive">
            REC · SESSION #{latest?.sessionId} — every inference is being persisted
          </span>
        </div>
      )}

      {/* vitals strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Heart rate" value={latest ? latest.hr.toFixed(0) : "--"} unit="BPM" color="#f87171" />
        <Stat label="EDA tonic" value={latest ? latest.eda.toFixed(2) : "--"} unit="µS" color="#22d3ee" />
        <Stat label="RMSSD" value={latest ? latest.physio.rmssd.toFixed(1) : "--"} unit="ms" color="#34d399" />
        <Stat label="SCR events" value={latest ? latest.physio.scr_rate.toFixed(0) : "--"} unit="/min" color="#fbbf24" />
        <Stat label="LF/HF" value={latest ? latest.physio.lf_hf.toFixed(2) : "--"} color="#a78bfa" />
        <Stat label="pNN50" value={latest ? latest.physio.pnn50.toFixed(1) : "--"} unit="%" color="#60a5fa" />
      </div>

      {/* main grid */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <EmotionPanel sample={latest} />
        </div>
        <div className="xl:col-span-4">
          <VaPlane samples={samples} />
        </div>
        <div className="xl:col-span-3">
          <FacePanel sample={latest} />
        </div>

        {/* ECG */}
        <div className="ev-panel xl:col-span-7">
          <div className="ev-panel-head">
            <span className="ev-label">AD8232 · lead I ECG · 250 Hz</span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {latest ? `${latest.hr.toFixed(0)} BPM · IBI ${(60000 / latest.hr).toFixed(0)} ms` : "—"}
            </span>
          </div>
          <div className="h-44 p-1 sm:h-52">
            <EcgTrace chunk={latest?.ecg ?? []} />
          </div>
        </div>

        {/* EDA + HR */}
        <div className="ev-panel xl:col-span-5">
          <div className="ev-panel-head">
            <span className="ev-label">GSR/EDA · µS · 4 Hz window</span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              slope {latest ? latest.physio.eda_slope.toFixed(3) : "—"} µS/s
            </span>
          </div>
          <div className="h-[104px] p-1">
            <RollingLines min={0} max={6} series={[{ label: "EDA", color: "#22d3ee", values: edaSeries }]} />
          </div>
          <div className="border-t border-border">
            <div className="ev-panel-head">
              <span className="ev-label">Heart rate · BPM</span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                σ {latest ? latest.physio.hr_std.toFixed(1) : "—"}
              </span>
            </div>
            <div className="h-[104px] p-1">
              <RollingLines min={50} max={120} series={[{ label: "HR", color: "#f87171", values: hrSeries }]} />
            </div>
          </div>
        </div>

        {/* fusion gate + confidence */}
        <div className="xl:col-span-5">
          <FusionGate sample={latest} />
        </div>
        <div className="ev-panel xl:col-span-7">
          <div className="ev-panel-head">
            <span className="ev-label">Inference confidence · %</span>
            <span className="font-mono text-[10px] text-muted-foreground">FusionNet v1 · 11,879 params</span>
          </div>
          <div className="h-[120px] p-1">
            <RollingLines min={0} max={100} series={[{ label: "conf", color: "#34d399", values: confSeries }]} />
          </div>
        </div>
      </div>
    </div>
  );
}
