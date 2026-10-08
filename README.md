# EmotionVerse 🧠⚡

> **Multimodal Deep Learning System for Real-Time Emotion Recognition**  
> Fusing IoT physiological biosignals (GSR/EDA + ECG) with facial micro-expression analysis via attention-gated dual-encoder neural networks.

---

## 🌟 Overview

**EmotionVerse** is an end-to-end multimodal affective computing platform designed to bridge physical human biosignals with facial expression dynamics. Traditional emotion recognition often relies strictly on computer vision—which can be spoofed, masked, or occluded—or solely on wearable biosensors, which lack contextual nuance.

EmotionVerse unifies both modalities:
1. **IoT Biosensors (ESP32)**: Continuously captures Electrocardiogram (ECG) and Galvanic Skin Response (GSR / Electrodermal Activity - EDA).
2. **Computer Vision (FER)**: Real-time webcam inference delivering 7 discrete emotion logits and 3 facial geometry markers.
3. **Attention-Gated Fusion Network**: A dual-encoder PyTorch deep learning model that dynamically weights biosignals and facial cues to predict discrete emotion classes and Valence-Arousal coordinates.
4. **Clinical & Research Dashboard**: High-frequency streaming interface built with React 19, TypeScript, Vite, Tailwind CSS, and tRPC.

---

## 🏗️ System Architecture

```text
  +-----------------------+           +------------------------+
  |  ESP32 Biosensor Node |           |     Webcam Stream      |
  |  - Grove / Analog GSR |           |  - Face Mesh & FER     |
  |  - AD8232 Single-Lead |           |  - 7 Emotion Logits    |
  |    ECG @ 250 Hz       |           |  - 3 Geometry Features |
  +-----------+-----------+           +-----------+------------+
              |                                   |
    WiFi HTTP / JSON Ingest             Client Web Worker Stream
              |                                   |
              +-----------------+-----------------+
                                |
                                v
               +----------------------------------+
               |        EmotionVerse Core         |
               |     (Hono + tRPC Engine)         |
               +----------------+-----------------+
                                |
                                v
               +----------------------------------+
               | Dual-Encoder Attention Fusion    |
               |  - Physio Encoder (11 features)  |
               |  - Facial Encoder (10 features)  |
               |  - Gating Mechanism (Softmax)    |
               |  - Output: 7 Classes + (V, A)    |
               +----------------+-----------------+
                                |
                                v
               +----------------------------------+
               |   Real-Time Dashboard & Analytics|
               |  - Live Canvas ECG Trace (250Hz) |
               |  - EDA / SCL / SCR Dynamics      |
               |  - Valence-Arousal 2D Plane      |
               |  - Session Recording & Replay    |
               +----------------+-----------------+
```

---

## ✨ Features

- **Multimodal Fusion Pipeline**:
  - **11 Physiological Features**: Mean EDA, EDA std dev, slope, Skin Conductance Response (SCR) rate & amplitude, Heart Rate (HR) mean/std, RMSSD, SDNN, pNN50, and LF/HF spectral ratio.
  - **10 Facial Features**: Softmax probabilities across 7 classes (`neutral`, `happy`, `sad`, `angry`, `fear`, `surprise`, `disgust`) plus Eye Aspect Ratio (EAR), Brow Furrow, and Mouth Opening index.
- **Dynamic Cross-Attention Gating**: Evaluates modality confidence dynamically—if facial visibility drops (e.g. subject looks away), the network relies on physiological autonomic nervous system responses.
- **Hardware Integration**: Turnkey ESP32-WROOM-32 firmware featuring 250 Hz timer interrupts for clean R-peak detection, digital IIR filtering, and rolling 12-second feature windowing.
- **Low-Latency Streaming**: Sub-50ms glass-to-glass latency via lightweight tRPC endpoints and WebSockets.
- **Interactive Model Lab**: Adjust biosensor baselines, trigger scenario simulations, and view confidence gate allocations in real-time.
- **Session Telemetry & Export**: Save recording sessions with biometric time-series data to SQLite / MySQL via Drizzle ORM.

---

## 📁 Repository Structure

```text
Emotionverse/
├── app/
│   ├── api/                     # Hono backend server & tRPC routes
│   │   ├── ml/                  # Exported neural network weights & inference
│   │   ├── queries/             # Database queries & repositories
│   │   ├── boot.ts              # Server entry point
│   │   └── emotionRouter.ts     # Ingestion & live streaming router
│   ├── firmware/
│   │   └── esp32_emotionverse.ino # ESP32 Arduino firmware for GSR & AD8232
│   ├── ml_training/
│   │   └── train_fusion.py      # PyTorch training pipeline for fusion model
│   ├── src/
│   │   ├── components/          # UI components, Canvas charts, emotion panels
│   │   ├── hooks/               # useLive, telemetry, and camera hooks
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx    # Live monitoring dashboard
│   │   │   ├── Hardware.tsx     # Sensor calibration & ESP32 connection
│   │   │   ├── ModelLab.tsx     # Latent space & attention gate debugger
│   │   │   ├── Sessions.tsx     # Session history & logs
│   │   │   └── SessionDetail.tsx# In-depth session replay
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v20.x or higher
- **npm** / **pnpm**
- **Python**: 3.10+ (for model re-training)
- **Arduino IDE / ESP-IDF** (for microcontroller deployment)

---

### 2. Install & Run the Web Application

```bash
# Navigate to the app directory
cd app

# Install dependencies
npm install

# Start development server
npm run dev
```

The dashboard will be available at `http://localhost:5173`.

---

### 3. Training the Fusion Network (Optional)

The pre-trained weights are bundled in `app/api/ml/model_weights.json`. To re-train or fine-tune with custom datasets (e.g., WESAD, DEAP, or custom recordings):

```bash
cd app/ml_training

# Install Python requirements
pip install torch numpy

# Train the dual-encoder fusion network
python train_fusion.py
```

This will evaluate cross-entropy classification loss, train the attention gates, and export updated weights for the runtime server.

---

### 4. Microcontroller Hardware Setup

#### Pin Configuration (ESP32-WROOM-32)
| Sensor | Sensor Pin | ESP32 GPIO | Description |
| :--- | :--- | :--- | :--- |
| **GSR / EDA** | Analog Out (SIG) | **GPIO 34** (ADC1_CH6) | Skin Conductance Voltage Divider |
| **AD8232 ECG** | OUTPUT | **GPIO 35** (ADC1_CH7) | Analog Cardiac Waveform |
| **AD8232 ECG** | LO+ (Leads Off +) | **GPIO 32** | Lead Off Detection Positive |
| **AD8232 ECG** | LO- (Leads Off -) | **GPIO 33** | Lead Off Detection Negative |
| **Power** | 3.3V & GND | **3V3 & GND** | Clean regulated power rail |

#### Uploading Firmware
1. Open `app/firmware/esp32_emotionverse.ino` in **Arduino IDE**.
2. Install **ArduinoJson** library via Library Manager.
3. Update your WiFi credentials and host IP:
   ```cpp
   const char* WIFI_SSID = "YOUR_WIFI_SSID";
   const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
   const char* API_URL   = "http://<YOUR_COMPUTER_IP>:3000/api/trpc/ev.ingestWindow";
   ```
4. Select **ESP32 Dev Module** and flash via USB.

---

## 📊 Sensor Signal & Feature Extraction

### Physiological Autonomic Features
- **Electrodermal Activity (EDA)**:
  - Tonic SCL (Skin Conductance Level): Slow baseline trends reflecting baseline sympathetic arousal.
  - Phasic SCR (Skin Conductance Response): Fast transient peaks triggered by sudden emotional stimuli.
- **Heart Rate Variability (HRV)**:
  - **Time-Domain**: RMSSD (Root Mean Square of Successive Differences), SDNN (Standard Deviation of NN intervals), pNN50.
  - **Frequency-Domain**: Ratio of Low-Frequency (0.04–0.15 Hz) to High-Frequency (0.15–0.4 Hz) power (`LF/HF`), reflecting sympathovagal balance.

### Facial Feature Space
- **7 Discrete Expressions**: Neutral, Happiness, Sadness, Anger, Fear, Surprise, Disgust.
- **Geometry Coordinates**: Eye Aspect Ratio (blinking/drowsiness), Brow Furrowing (stress/confusion), Mouth Curvature (smile/grimace).

---

## 🛠️ Scripts & Tooling

Within the `app` folder, the following scripts are available:

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts Vite frontend & backend API dev server |
| `npm run build` | Compiles React app and bundles Hono API with esbuild |
| `npm run lint` | Runs ESLint analysis across TypeScript & React files |
| `npm run check` | Runs TypeScript compiler type checks (`tsc -b`) |
| `npm run test` | Executes unit and integration tests with Vitest |
| `npm run db:push` | Pushes database schema migrations via Drizzle Kit |

---

## 📜 Research & Citation

If you use EmotionVerse in academic research, educational demonstrations, or affective computing publications, please reference the project:

```bibtex
@software{emotionverse2026,
  author = {Patan Younus Khan},
  title = {EmotionVerse: Multimodal Deep Learning for Real-Time Emotion Recognition with IoT Biosensors},
  year = {2026},
  url = {https://github.com/YOUR-USERNAME/Emotionverse}
}
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).