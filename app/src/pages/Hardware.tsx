import { trpc } from "@/providers/trpc";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";

const WIRING = [
  { sig: "GSR/EDA out", pin: "GPIO34", note: "ADC1_CH6 · 4 Hz · 100 kΩ divider · µS via lookup" },
  { sig: "AD8232 OUTPUT", pin: "GPIO35", note: "ADC1_CH7 · 250 Hz · 12-bit · 0.5–1.5 V swing" },
  { sig: "AD8232 LO+", pin: "GPIO32", note: "leads-off detect (digital in, pull-down)" },
  { sig: "AD8232 LO−", pin: "GPIO33", note: "leads-off detect (digital in, pull-down)" },
  { sig: "AD8232 3.3V / GND", pin: "3V3 / GND", note: "do NOT power from 5 V — ADC is 3.3 V max" },
  { sig: "GSR vcc / GND", pin: "3V3 / GND", note: "two finger electrodes, Ag/AgCl preferred" },
];

const FIRMWARE_SNIPPET = `// excerpt — full sketch in firmware/esp32_emotionverse.ino
#define PIN_GSR 34   // GSR/EDA analog
#define PIN_ECG 35   // AD8232 OUTPUT
#define PIN_LO_P 32  // AD8232 LO+
#define PIN_LO_N 33  // AD8232 LO-

void loop() {
  acquire_1s_block();              // ECG @250 Hz, GSR @4 Hz
  Features f = extract_window();   // 11 physio features, 12 s window
  post_ingest(f);                  // POST /api/trpc/ev.ingestWindow
}`;

export default function Hardware() {
  const q = trpc.ev.deviceStatus.useQuery(undefined, { refetchInterval: 3000 });
  const d = q.data;
  const [uptime, setUptime] = useState(0);
  useEffect(() => {
    if (d) setUptime(d.esp32.uptime_s);
  }, [d]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* device cards */}
        <div className="ev-panel">
          <div className="ev-panel-head">
            <span className="ev-label">ESP32 node</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-[#34d399]">
              <span className="ev-led" style={{ background: "#34d399", color: "#34d399" }} /> ONLINE
            </span>
          </div>
          <div className="flex flex-col gap-2 p-4 font-mono text-[11px]">
            {d &&
              [
                ["Board", d.esp32.board],
                ["Firmware", d.esp32.firmware],
                ["Link", d.esp32.link],
                ["RSSI", `${d.esp32.rssi} dBm`],
                ["Uptime", `${Math.floor(uptime / 60)}m ${uptime % 60}s`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-right text-foreground">{v}</span>
                </div>
              ))}
          </div>
          <div className="border-t border-border p-4 pt-3">
            <div className="ev-label mb-2">Sensor channels</div>
            {d?.esp32.sensors.map((s) => (
              <div key={s.name} className="mb-1.5 flex items-center justify-between rounded border border-border bg-secondary/40 px-2.5 py-2 font-mono text-[10px]">
                <span className="text-foreground">{s.name}</span>
                <span className="text-muted-foreground">{s.pin}</span>
                <span className="text-primary">{s.rate}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ev-panel">
          <div className="ev-panel-head">
            <span className="ev-label">Webcam branch</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-[#34d399]">
              <span className="ev-led" style={{ background: "#34d399", color: "#34d399" }} /> ONLINE
            </span>
          </div>
          <div className="flex flex-col gap-2 p-4 font-mono text-[11px]">
            {d &&
              [
                ["Capture", d.webcam.id],
                ["Model", d.webcam.model],
                ["Rate", d.webcam.rate],
                ["State", d.webcam.state],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-right text-foreground">{v}</span>
                </div>
              ))}
          </div>
          <div className="border-t border-border p-4 pt-3">
            <div className="ev-label mb-2">Fusion core</div>
            <div className="flex flex-col gap-2 font-mono text-[11px]">
              {d &&
                [
                  ["Model", d.fusion.model],
                  ["Parameters", d.fusion.params.toLocaleString()],
                  ["Inference latency", `${d.fusion.latency_ms} ms`],
                  ["Test accuracy", `${(d.fusion.test_accuracy * 100).toFixed(2)}%`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="text-right text-foreground">{v}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* wiring */}
        <div className="ev-panel">
          <div className="ev-panel-head"><span className="ev-label">Wiring map · ESP32-WROOM-32</span></div>
          <div className="p-4">
            {WIRING.map((w) => (
              <div key={w.sig} className="mb-2 rounded border border-border bg-secondary/40 px-2.5 py-2">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-foreground">{w.sig}</span>
                  <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{w.pin}</span>
                </div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">{w.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* firmware */}
      <div className="ev-panel">
        <div className="ev-panel-head">
          <span className="ev-label">Firmware · Arduino/ESP-IDF sketch</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(FIRMWARE_SNIPPET).then(() => toast.success("Copied"));
            }}
            className="flex items-center gap-1.5 rounded border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            <Copy size={11} /> COPY
          </button>
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-foreground/85">{FIRMWARE_SNIPPET}</pre>
      </div>

      {/* data path */}
      <div className="ev-panel">
        <div className="ev-panel-head"><span className="ev-label">End-to-end data path</span></div>
        <div className="flex flex-wrap items-center gap-2 p-4 font-mono text-[10px]">
          {[
            "GSR + AD8232 electrodes",
            "ESP32 ADC + DSP",
            "WiFi · MQTT/TLS",
            "feature windows (12 s)",
            "webcam FER-CNN logits",
            "FusionNet attention gate",
            "7-class emotion",
            "dashboard + database",
          ].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-2">
              <span className="rounded border border-border bg-secondary/60 px-2.5 py-1.5 text-foreground/85">{s}</span>
              {i < arr.length - 1 && <span className="text-primary">→</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
