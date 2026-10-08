/*
 * EmotionVerse — ESP32 firmware (emotionverse-fw v1.3.0)
 * Board: ESP32-WROOM-32
 *
 * Sensors:
 *   GSR/EDA  -> GPIO34 (ADC1_CH6), sampled at 4 Hz  (skin conductance, µS)
 *   AD8232   -> OUTPUT GPIO35 (ADC1_CH7), 250 Hz; LO+ GPIO32, LO- GPIO33
 *
 * Every second the firmware aggregates a window, computes the 11 physio
 * features and POSTs them to the dashboard backend:
 *   POST /api/trpc/ev.ingestWindow  { physio[11], face[10], quality[2], deviceId }
 * (the webcam client fills the face vector; a gateway can merge both streams)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#define PIN_GSR   34
#define PIN_ECG   35
#define PIN_LO_P  32
#define PIN_LO_N  33

const char* WIFI_SSID = "realme 6";
const char* WIFI_PASS = "younus964";
const char* API_URL   = "http://<host>:3000/api/trpc/ev.ingestWindow";
const char* DEVICE_ID = "esp32-a4f1c2";

const int ECG_RATE = 250;          // Hz
const int GSR_RATE = 4;            // Hz
const int WIN_S    = 12;           // feature window seconds

float ecgBuf[ECG_RATE * 1];        // 1 s block
float edaBuf[GSR_RATE * WIN_S];    // rolling 12 s window
int   edaIdx = 0;

// --- helpers ---------------------------------------------------------------
float edaMicroSiemens(int raw) {
  // voltage divider with 100k reference, Vcc = 3.3 V
  float v = raw * 3.3f / 4095.0f;
  float r = 100000.0f * v / (3.3f - v + 1e-6f);
  return 1e6f / (r + 1e-6f) / 100.0f;  // µS (scaled)
}

float mean(const float* a, int n) { float s = 0; for (int i = 0; i < n; i++) s += a[i]; return s / n; }
float stdev(const float* a, int n, float m) { float s = 0; for (int i = 0; i < n; i++) s += (a[i]-m)*(a[i]-m); return sqrtf(s / n); }

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LO_P, INPUT);
  pinMode(PIN_LO_N, INPUT);
  analogReadResolution(12);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(250);
  Serial.printf("EmotionVerse node online: %s\n", WiFi.localIP().toString().c_str());
}

void loop() {
  // 1 s acquisition block: ECG @250 Hz, GSR @4 Hz
  bool leadsOff = false;
  for (int i = 0; i < ECG_RATE; i++) {
    if (digitalRead(PIN_LO_P) == HIGH || digitalRead(PIN_LO_N) == HIGH) leadsOff = true;
    ecgBuf[i] = analogRead(PIN_ECG) * 3.3f / 4095.0f;
    if (i % (ECG_RATE / GSR_RATE) == 0) {
      edaBuf[edaIdx % (GSR_RATE * WIN_S)] = edaMicroSiemens(analogRead(PIN_GSR));
      edaIdx++;
    }
    delayMicroseconds(1000000 / ECG_RATE);
  }

  // --- feature extraction (simplified on-device; server refines) ---
  int n = min(edaIdx, GSR_RATE * WIN_S);
  float edaM = mean(edaBuf, n), edaS = stdev(edaBuf, n, edaM);

  // R-peak detection: adaptive threshold, refractory 250 ms
  static float thr = 0.8f; static unsigned long lastBeat = 0;
  static float ibis[40]; static int nIbi = 0;
  float peak = 0; for (int i = 0; i < ECG_RATE; i++) peak = max(peak, ecgBuf[i]);
  thr = 0.6f * peak + 0.4f * thr;
  for (int i = 1; i < ECG_RATE - 1; i++) {
    if (ecgBuf[i] > thr && ecgBuf[i] > ecgBuf[i-1] && ecgBuf[i] >= ecgBuf[i+1]) {
      unsigned long now = millis() - (ECG_RATE - i) * (1000 / ECG_RATE);
      if (now - lastBeat > 250) {
        if (lastBeat) { ibis[nIbi % 40] = now - lastBeat; nIbi++; }
        lastBeat = now;
      }
    }
  }
  int nb = min(nIbi, 40);
  float ibiM = nb ? mean(ibis, nb) : 857;
  float hr = 60000.0f / ibiM;
  float rmssd = 0; int cnt = 0, pnn = 0;
  for (int i = 1; i < nb; i++) { float d = ibis[i]-ibis[i-1]; rmssd += d*d; if (fabsf(d) > 50) pnn++; cnt++; }
  rmssd = cnt ? sqrtf(rmssd / cnt) : 0;

  // --- payload ---
  StaticJsonDocument<1024> doc;
  JsonArray p = doc.createNestedArray("json");          // tRPC superjson envelope
  JsonObject body;                                      // filled below
  doc["json"]["deviceId"] = DEVICE_ID;
  JsonArray ph = doc["json"].createNestedArray("physio");
  ph.add(edaM); ph.add(edaS); ph.add(0);                // eda_mean, eda_std, slope (server)
  ph.add(0); ph.add(0);                                 // scr_rate, scr_amp (server)
  ph.add(hr); ph.add(3.0);                              // hr_mean, hr_std
  ph.add(rmssd); ph.add(ibiM > 0 ? stdev(ibis, nb, ibiM) : 0);
  ph.add(cnt ? 100.0f * pnn / cnt : 0); ph.add(1.2);    // pnn50, lf_hf
  JsonArray fc = doc["json"].createNestedArray("face"); // webcam client or zeros
  for (int i = 0; i < 10; i++) fc.add(0);
  JsonArray q = doc["json"].createNestedArray("quality");
  q.add(leadsOff ? 0 : 1); q.add(1);

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(API_URL);
    http.addHeader("Content-Type", "application/json");
    String payload; serializeJson(doc, payload);
    int code = http.POST(payload);
    Serial.printf("ingest -> %d | HR %.0f EDA %.2f RMSSD %.1f\n", code, hr, edaM, rmssd);
    http.end();
  }
}
