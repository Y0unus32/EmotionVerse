import { Link, useLocation } from "react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  BrainCircuit,
  CircuitBoard,
  History,
  Radio,
  ScanFace,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Live Monitor", icon: Activity },
  { to: "/sessions", label: "Sessions", icon: History },
  { to: "/model", label: "Model Lab", icon: BrainCircuit },
  { to: "/hardware", label: "Hardware", icon: CircuitBoard },
];

const TICKER_ITEMS = [
  "ESP32 NODE · GSR/EDA 4 Hz · AD8232 ECG 250 Hz",
  "FER-CNN FACIAL BRANCH · 10 FPS · 7 CLASSES",
  "FUSIONNET v1 · ATTENTION-GATED LATE FUSION",
  "TEST ACCURACY 99.6% · MACRO F1 0.996",
  "WESAD-STYLE PHYSIOLOGY × FER2013-STYLE VISION",
  "MQTT OVER TLS · END-TO-END LATENCY < 50 MS",
];

function Led({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5" title={label}>
      <span className="ev-led" style={{ background: color, color }} />
      <span className="ev-label hidden sm:inline">{label}</span>
    </span>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const f = () =>
      setClock(
        new Date().toLocaleTimeString("en-GB", { hour12: false }) +
          "." +
          String(new Date().getMilliseconds()).padStart(3, "0").slice(0, 2),
      );
    f();
    const id = setInterval(f, 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="ev-scanlines min-h-screen bg-background">
      {/* header */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-12 items-center gap-3 px-3 sm:px-4">
          <button
            className="flex h-11 w-11 items-center justify-center rounded border border-border text-muted-foreground lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Toggle navigation"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded border border-primary/50 bg-primary/10">
              <ScanFace size={15} className="text-primary" />
            </span>
            <span className="font-mono text-sm font-bold tracking-[0.22em] text-foreground">
              EMOTION<span className="text-primary">VERSE</span>
            </span>
          </Link>
          <span className="ml-2 hidden items-center gap-1.5 rounded border border-destructive/40 bg-destructive/10 px-2 py-0.5 md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive ev-blink" />
            <span className="font-mono text-[10px] font-semibold tracking-[0.2em] text-destructive">LIVE</span>
          </span>
          <div className="ml-auto flex items-center gap-4">
            <Led color="#34d399" label="ESP32" />
            <Led color="#22d3ee" label="GSR" />
            <Led color="#f87171" label="ECG" />
            <Led color="#a78bfa" label="CAM" />
            <span className="hidden font-mono text-[11px] tabular-nums text-muted-foreground xl:inline">
              {clock}
            </span>
          </div>
        </div>
        {/* ticker */}
        <div className="relative h-7 overflow-hidden border-t border-border bg-card/60">
          <div className="ev-ticker-track h-7 items-center">
            {[0, 1].map((rep) => (
              <span key={rep} className="flex items-center">
                {TICKER_ITEMS.map((t, i) => (
                  <span key={i} className="flex items-center font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
                    <span className="px-4">{t}</span>
                    <Radio size={9} className="text-primary/60" />
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="flex pt-[76px]">
        {/* sidebar */}
        <aside
          className={cn(
            "fixed bottom-0 left-0 top-[76px] z-30 w-56 border-r border-border bg-background/98 backdrop-blur transition-transform lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <nav className="flex flex-col gap-1 p-3">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex min-h-[44px] items-center gap-3 rounded border px-3 py-2 font-mono text-[11px] tracking-[0.14em] transition-colors",
                    active
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground",
                  )}
                >
                  <Icon size={15} />
                  {label.toUpperCase()}
                </Link>
              );
            })}
          </nav>
          <div className="absolute inset-x-3 bottom-3 rounded border border-border bg-card p-3">
            <p className="ev-label mb-1.5">Pipeline</p>
            <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
              ESP32 → WiFi/MQTT → feature windows → FusionNet → 7-class affect
            </p>
          </div>
        </aside>
        {open && (
          <div
            className="fixed inset-0 z-20 bg-black/60 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        <main className="relative z-10 min-h-[calc(100vh-76px)] w-full p-3 sm:p-4 lg:ml-56 lg:p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
