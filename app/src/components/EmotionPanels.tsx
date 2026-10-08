import { useState, useRef, useEffect } from "react";
import { Camera, CameraOff } from "lucide-react";
import { toast } from "sonner";
import { EMOTIONS, EMOTION_COLORS, EMOTION_VA, type LiveSample } from "@contracts/emotions";

/** Dominant emotion readout + ranked probability bars. */
export function EmotionPanel({ sample }: { sample?: LiveSample }) {
  const probs = sample?.probs;
  const ranked = probs
    ? [...EMOTIONS].sort((a, b) => probs[b] - probs[a])
    : [...EMOTIONS];
  const top = ranked[0];
  const color = EMOTION_COLORS[top];

  return (
    <div className="ev-panel flex h-full flex-col">
      <div className="ev-panel-head">
        <span className="ev-label">Fusion output · 7-class affect</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {sample ? `conf ${(sample.confidence * 100).toFixed(1)}%` : "—"}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3 px-4 pt-4">
        <div>
          <div
            className="font-mono text-3xl font-bold uppercase tracking-[0.12em] sm:text-4xl"
            style={{ color, textShadow: `0 0 24px ${color}55` }}
          >
            {sample ? top : "——"}
          </div>
          <div className="ev-label mt-1">dominant emotion</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl tabular-nums text-foreground">
            {sample ? (sample.confidence * 100).toFixed(1) : "--"}
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          <div className="ev-label mt-1">confidence</div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 p-4 pt-3">
        {ranked.map((e) => {
          const p = probs ? probs[e] : 0;
          return (
            <div key={e} className="flex items-center gap-2">
              <span className="w-16 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {e}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-sm bg-secondary">
                <div
                  className="ev-bar h-full rounded-sm"
                  style={{ width: `${(p * 100).toFixed(1)}%`, background: EMOTION_COLORS[e] }}
                />
              </div>
              <span className="w-12 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                {(p * 100).toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Attention-gate weights — which modality the network trusts right now. */
export function FusionGate({ sample }: { sample?: LiveSample }) {
  const gp = sample ? sample.gate.physio : 0.5;
  const gf = sample ? sample.gate.face : 0.5;
  return (
    <div className="ev-panel">
      <div className="ev-panel-head">
        <span className="ev-label">Attention gate · modality trust</span>
        <span className="font-mono text-[10px] text-muted-foreground">softmax(w·[eₚ‖e_f‖q])</span>
      </div>
      <div className="p-4">
        <div className="flex h-4 overflow-hidden rounded-sm border border-border">
          <div className="ev-bar h-full bg-[#34d399]" style={{ width: `${gp * 100}%` }} />
          <div className="ev-bar h-full bg-[#a78bfa]" style={{ width: `${gf * 100}%` }} />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px]">
          <span className="text-[#34d399]">PHYSIO {(gp * 100).toFixed(1)}%</span>
          <span className="text-[#a78bfa]">FACE {(gf * 100).toFixed(1)}%</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <QualityPill label="GSR/ECG link" ok={sample ? sample.signalQuality.physio > 0.5 : null} />
          <QualityPill label="Face lock" ok={sample ? sample.faceDetected : null} />
        </div>
      </div>
    </div>
  );
}

function QualityPill({ label, ok }: { label: string; ok: boolean | null }) {
  const color = ok == null ? "#64748b" : ok ? "#34d399" : "#f87171";
  return (
    <div className="flex items-center gap-2 rounded border border-border bg-secondary/50 px-2.5 py-2">
      <span className="ev-led" style={{ background: color, color }} />
      <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground">
        {label.toUpperCase()}
      </span>
    </div>
  );
}

/** Valence–arousal circumplex with the live operating point. */
export function VaPlane({ samples }: { samples: LiveSample[] }) {
  const size = 100; // viewbox units
  const pt = (v: number, a: number) => ({
    x: ((v + 1) / 2) * size,
    y: ((1 - a) / 2) * size,
  });
  const trail = samples.slice(-40);
  const last = trail[trail.length - 1];
  return (
    <div className="ev-panel flex h-full flex-col">
      <div className="ev-panel-head">
        <span className="ev-label">Circumplex · valence × arousal</span>
        {last && (
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            v {last.valence.toFixed(2)} · a {last.arousal.toFixed(2)}
          </span>
        )}
      </div>
      <div className="flex-1 p-3">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full max-h-64 w-full">
          <rect x="0" y="0" width={size} height={size} fill="none" stroke="hsl(221 44% 16%)" strokeWidth="0.4" />
          <line x1={size / 2} y1="0" x2={size / 2} y2={size} stroke="hsl(221 44% 16%)" strokeWidth="0.4" />
          <line x1="0" y1={size / 2} x2={size} y2={size / 2} stroke="hsl(221 44% 16%)" strokeWidth="0.4" />
          {EMOTIONS.map((e) => {
            const p = pt(EMOTION_VA[e].v, EMOTION_VA[e].a);
            // per-emotion label offsets so anchors near corners don't collide
            const off: Record<string, [number, number]> = {
              fear: [-3.5, -3.2], angry: [3.5, -2.2], surprise: [0, -2.8], happy: [0, 4.6],
              sad: [0, -2.8], disgust: [0, 4.6], neutral: [0, 4.6],
            };
            const [dx, dy] = off[e] ?? [0, -2.5];
            return (
              <g key={e}>
                <circle cx={p.x} cy={p.y} r="5" fill={EMOTION_COLORS[e]} opacity="0.12" />
                <circle cx={p.x} cy={p.y} r="1.2" fill={EMOTION_COLORS[e]} opacity="0.8" />
                <text x={p.x + dx} y={p.y + dy} textAnchor="middle" fontSize="3.4" fill={EMOTION_COLORS[e]} fontFamily="JetBrains Mono" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {e}
                </text>
              </g>
            );
          })}
          {trail.map((s, i) => {
            const p = pt(s.valence, s.arousal);
            return (
              <circle key={i} cx={p.x} cy={p.y} r={0.6 + (i / trail.length) * 1.4} fill={EMOTION_COLORS[s.emotion]} opacity={0.15 + (i / trail.length) * 0.6} />
            );
          })}
          {last && (
            <circle cx={pt(last.valence, last.arousal).x} cy={pt(last.valence, last.arousal).y} r="2.4" fill="none" stroke="#fff" strokeWidth="0.5" />
          )}
        </svg>
      </div>
    </div>
  );
}

/** Stylized webcam branch visualization — face mesh driven by FER logits with optional live camera feed. */
export function FacePanel({ sample }: { sample?: LiveSample }) {
  const g = sample?.faceGeom;
  const color = sample ? EMOTION_COLORS[sample.emotion] : "#64748b";
  const eye = g ? g.eyeAspect : 0.3;
  const brow = g ? g.browFurrow : 0;
  const mouth = g ? g.mouthOpen : 0;
  const detected = sample?.faceDetected ?? false;

  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const toggleCamera = async () => {
    if (cameraActive) {
      stopCamera();
      toast.info("Webcam feed stopped");
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error("Webcam API not supported in this browser");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
      toast.success("Webcam stream activated");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Webcam access failed: ${msg}. Check browser permissions.`);
      setCameraActive(false);
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div className="ev-panel flex h-full flex-col">
      <div className="ev-panel-head flex items-center justify-between">
        <span className="ev-label">Webcam branch · FER-CNN</span>
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-[10px]"
            style={{ color: cameraActive ? "#34d399" : detected ? "#34d399" : "#f87171" }}
          >
            {cameraActive ? "CAM LIVE" : sample ? (detected ? "FACE LOCK" : "NO FACE") : "—"}
          </span>
          <button
            type="button"
            onClick={toggleCamera}
            className="flex items-center gap-1 rounded border border-border bg-secondary/80 px-2 py-0.5 font-mono text-[10px] text-foreground transition-colors hover:bg-secondary"
            title={cameraActive ? "Turn off camera" : "Enable live webcam"}
          >
            {cameraActive ? (
              <>
                <CameraOff className="h-3 w-3 text-red-400" />
                <span>Stop Cam</span>
              </>
            ) : (
              <>
                <Camera className="h-3 w-3 text-emerald-400" />
                <span>Turn On Cam</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-3 min-h-[180px]">
        {/* Real Live Camera Stream View */}
        <div className={`relative h-44 w-full max-w-[220px] overflow-hidden rounded border border-border bg-black ${cameraActive ? "block" : "hidden"}`}>
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover -scale-x-100"
          />
          {/* Futuristic Overlay over real webcam */}
          <div className="pointer-events-none absolute inset-0">
            {/* Scanline animation */}
            <div className="absolute inset-x-0 h-0.5 bg-primary/60 shadow-[0_0_8px_var(--primary)] animate-pulse top-1/2" />
            {/* Corner brackets */}
            <div className="absolute top-2 left-2 h-3 w-3 border-t-2 border-l-2 border-primary" />
            <div className="absolute top-2 right-2 h-3 w-3 border-t-2 border-r-2 border-primary" />
            <div className="absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2 border-primary" />
            <div className="absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2 border-primary" />
            {/* Center Face Target Box */}
            <div
              className="absolute inset-x-8 inset-y-6 rounded border border-dashed transition-colors"
              style={{ borderColor: `${color}88` }}
            />
            {/* Live Indicator */}
            <div className="absolute top-2 left-7 flex items-center gap-1 font-mono text-[9px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>REC 30FPS</span>
            </div>
          </div>
        </div>

        {/* Synthesized SVG Face Mesh (Shown when Camera is inactive) */}
        {!cameraActive && (
          <div className="flex flex-col items-center">
            <svg viewBox="0 0 120 140" className="h-44 w-auto" style={{ opacity: detected || !sample ? 1 : 0.35 }}>
              {/* head outline */}
              <ellipse cx="60" cy="70" rx="42" ry="54" fill="none" stroke={color} strokeWidth="1.2" opacity="0.7" />
              {/* brows — furrow pulls inner ends down */}
              <path d={`M 34 ${48 + brow * 6} Q 42 ${44 - brow * 4} 50 ${47 + brow * 2}`} fill="none" stroke={color} strokeWidth="1.6" />
              <path d={`M 70 ${47 + brow * 2} Q 78 ${44 - brow * 4} 86 ${48 + brow * 6}`} fill="none" stroke={color} strokeWidth="1.6" />
              {/* eyes — aspect ratio opens/closes lids */}
              <ellipse cx="42" cy={60} rx="8" ry={2.5 + eye * 8} fill="none" stroke={color} strokeWidth="1.4" />
              <ellipse cx="78" cy={60} rx="8" ry={2.5 + eye * 8} fill="none" stroke={color} strokeWidth="1.4" />
              <circle cx="42" cy={60} r={1.8} fill={color} />
              <circle cx="78" cy={60} r={1.8} fill={color} />
              {/* nose */}
              <path d="M 60 62 L 58 82 Q 60 84 62 82" fill="none" stroke={color} strokeWidth="1.1" opacity="0.7" />
              {/* mouth — open amount + corner pull by valence */}
              <path
                d={`M 40 ${100 - mouth * 4} Q 60 ${100 + mouth * 18 + (sample ? sample.valence * -6 : 0)} 80 ${100 - mouth * 4}`}
                fill={mouth > 0.25 ? `${color}22` : "none"}
                stroke={color}
                strokeWidth="1.6"
              />
              {/* scan line */}
              {detected && (
                <line x1="18" y1="20" x2="102" y2="20" stroke={color} strokeWidth="0.6" opacity="0.5">
                  <animate attributeName="y1" values="20;120;20" dur="3.2s" repeatCount="indefinite" />
                  <animate attributeName="y2" values="20;120;20" dur="3.2s" repeatCount="indefinite" />
                </line>
              )}
              {/* corner brackets */}
              {[[14, 16], [106, 16], [14, 124], [106, 124]].map(([x, y], i) => (
                <path key={i} d={`M ${x} ${y} ${i % 2 === 0 ? "h 8" : "h -8"} M ${x} ${y} ${i < 2 ? "v 8" : "v -8"}`} stroke={color} strokeWidth="1.4" fill="none" />
              ))}
            </svg>
            <button
              type="button"
              onClick={toggleCamera}
              className="mt-1 flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-primary transition-colors"
            >
              <Camera className="h-3 w-3" />
              <span>Click to switch to live webcam</span>
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
        {[
          ["EYE AR", g?.eyeAspect],
          ["BROW", g?.browFurrow],
          ["MOUTH", g?.mouthOpen],
        ].map(([label, v]) => (
          <div key={label as string} className="p-2 text-center">
            <div className="font-mono text-xs tabular-nums text-foreground">
              {typeof v === "number" ? v.toFixed(2) : "--"}
            </div>
            <div className="ev-label mt-0.5">{label as string}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
