import { useEffect, useRef } from "react";

/* Canvas-based instrumentation charts: ECG trace + rolling line charts.
   They redraw from props every frame; devicePixelRatio-aware. */

function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, w, h);
      raf = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, []);
  return ref;
}

function grid(ctx: CanvasRenderingContext2D, w: number, h: number, step = 24) {
  ctx.strokeStyle = "rgba(26, 37, 64, 0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
  for (let y = 0; y <= h; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
  ctx.stroke();
}

/** Scrolling ECG trace — consumes the latest 1 s chunk, keeps a sweep buffer. */
export function EcgTrace({ chunk, color = "#f87171" }: { chunk: number[]; color?: string }) {
  const buf = useRef<number[]>([]);
  useEffect(() => {
    if (chunk?.length) {
      buf.current = [...buf.current, ...chunk].slice(-750); // 6 s @125 Hz
    }
  }, [chunk]);

  const ref = useCanvas((ctx, w, h) => {
    grid(ctx, w, h, 20);
    const data = buf.current;
    if (data.length < 2) return;
    const min = -0.6, max = 1.4;
    const y = (v: number) => h - ((v - min) / (max - min)) * h;
    // glow pass
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = color + "33";
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      i === 0 ? ctx.moveTo(x, y(v)) : ctx.lineTo(x, y(v));
    });
    ctx.stroke();
    // main trace
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = color;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      i === 0 ? ctx.moveTo(x, y(v)) : ctx.lineTo(x, y(v));
    });
    ctx.stroke();
    // sweep cursor
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(w - 2, y(data[data.length - 1]), 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
  return <canvas ref={ref} className="h-full w-full" />;
}

/** Rolling multi-line chart for scalar series (EDA, HR, confidence…). */
export function RollingLines({
  series,
  min,
  max,
}: {
  series: { label: string; color: string; values: number[] }[];
  min: number;
  max: number;
}) {
  const ref = useCanvas((ctx, w, h) => {
    grid(ctx, w, h, 22);
    const y = (v: number) => h - ((clamp(v, min, max) - min) / (max - min)) * (h - 8) - 4;
    for (const s of series) {
      const d = s.values;
      if (d.length < 2) continue;
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      d.forEach((v, i) => {
        // right-aligned within a fixed 150-sample window
        const x = w - ((d.length - 1 - i) * w) / 149;
        i === 0 ? ctx.moveTo(x, y(v)) : ctx.lineTo(x, y(v));
      });
      ctx.stroke();
      // last value dot
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(w - 2, y(d[d.length - 1]), 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return <canvas ref={ref} className="h-full w-full" />;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
