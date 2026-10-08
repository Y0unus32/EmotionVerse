import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { EMOTION_COLORS, EMOTIONS, type Emotion } from "@contracts/emotions";
import { ChevronRight } from "lucide-react";

export function DistBar({ dist }: { dist: Record<string, number> }) {
  const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-sm border border-border">
      {[...EMOTIONS].map((e) => {
        const v = dist[e] ?? 0;
        if (!v) return null;
        return (
          <div
            key={e}
            title={`${e}: ${((v / total) * 100).toFixed(1)}%`}
            style={{ width: `${(v / total) * 100}%`, background: EMOTION_COLORS[e] }}
          />
        );
      })}
    </div>
  );
}

export default function Sessions() {
  const q = trpc.ev.sessions.useQuery(undefined, { refetchInterval: 5000 });

  return (
    <div className="flex flex-col gap-3">
      <div className="ev-panel-head ev-panel">
        <span className="ev-label">Recorded sessions · persisted in database</span>
        <span className="font-mono text-[10px] text-muted-foreground">{q.data?.length ?? 0} total</span>
      </div>

      {q.isLoading && (
        <div className="ev-panel p-8 text-center font-mono text-xs text-muted-foreground">LOADING…</div>
      )}
      {q.data?.length === 0 && (
        <div className="ev-panel border-dashed p-10 text-center">
          <p className="font-mono text-xs text-muted-foreground">
            NO SESSIONS YET — press RECORD on the Live Monitor to capture a session.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {q.data?.map((s) => (
          <Link
            key={s.id}
            to={`/sessions/${s.id}`}
            className="ev-panel group flex flex-col gap-2.5 p-3.5 transition-colors hover:border-primary/40 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: EMOTION_COLORS[(s.dominantEmotion ?? "neutral") as Emotion] }}
                />
                <span className="truncate font-mono text-sm text-foreground">{s.name}</span>
                {!s.endedAt && (
                  <span className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.14em] text-destructive">
                    REC
                  </span>
                )}
              </div>
              <div className="ev-label mt-1">
                #{s.id} · {new Date(s.startedAt).toLocaleString()} · {s.sampleCount} samples
                {s.dominantEmotion ? ` · dominant: ${s.dominantEmotion}` : ""}
                {s.avgConfidence ? ` · conf ${(s.avgConfidence * 100).toFixed(1)}%` : ""}
              </div>
            </div>
            {s.distribution && (
              <div className="w-full sm:w-56">
                <DistBar dist={s.distribution as Record<string, number>} />
              </div>
            )}
            <ChevronRight size={15} className="hidden text-muted-foreground group-hover:text-primary sm:block" />
          </Link>
        ))}
      </div>
    </div>
  );
}
