import { useEffect, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import type { LiveSample } from "@contracts/emotions";

const HISTORY = 150; // samples kept client-side (~2.5 min at 1 Hz)

export function useLive() {
  const [samples, setSamples] = useState<LiveSample[]>([]);
  const [connected, setConnected] = useState(false);
  const buf = useRef<LiveSample[]>([]);

  const tick = trpc.ev.tick.useQuery(undefined, {
    refetchInterval: 1000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  useEffect(() => {
    if (tick.data) {
      setConnected(true);
      buf.current = [...buf.current.slice(-(HISTORY - 1)), tick.data as LiveSample];
      setSamples([...buf.current]);
    }
    if (tick.isError) setConnected(false);
  }, [tick.data, tick.isError]);

  const latest = samples.length ? samples[samples.length - 1] : undefined;
  return { samples, latest, connected };
}
