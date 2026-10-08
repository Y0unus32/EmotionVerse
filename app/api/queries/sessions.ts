import { getDb } from "./connection";
import { sessions, readings, type Reading, type Session } from "@db/schema";
import { desc, eq } from "drizzle-orm";
import { env } from "../lib/env";

// In-memory fallback store when MySQL / PlanetScale is not configured or unreachable
const memSessions: Session[] = [
  {
    id: 1,
    name: "Baseline Resting State",
    scenario: "baseline",
    startedAt: new Date(Date.now() - 3600000),
    endedAt: new Date(Date.now() - 3600000 + 120000),
    sampleCount: 120,
    dominantEmotion: "neutral",
    avgConfidence: 0.92,
    distribution: { neutral: 98, happy: 14, calm: 8 },
    notes: "Demonstration session recorded prior to stimulation protocol.",
  },
  {
    id: 2,
    name: "Stroop Stress Evaluation",
    scenario: "stress",
    startedAt: new Date(Date.now() - 1800000),
    endedAt: new Date(Date.now() - 1800000 + 150000),
    sampleCount: 150,
    dominantEmotion: "fear",
    avgConfidence: 0.88,
    distribution: { fear: 86, angry: 42, neutral: 22 },
    notes: "Elevated galvanic skin response (EDA) and reduced HRV observed.",
  },
];

const memReadings: Reading[] = [];
let nextSessionId = 3;
let nextReadingId = 1;

let dbUnavailable = !env.databaseUrl;

export async function createSession(data: { name: string; scenario: string }): Promise<Session> {
  if (!dbUnavailable && env.databaseUrl) {
    try {
      const [{ id }] = await getDb().insert(sessions).values(data).$returningId();
      const s = await getDb().query.sessions.findFirst({ where: eq(sessions.id, id) });
      if (s) return s;
    } catch (err) {
      console.warn("[DB] Database query failed, falling back to in-memory session store:", err);
      dbUnavailable = true;
    }
  }

  const newSession: Session = {
    id: nextSessionId++,
    name: data.name,
    scenario: data.scenario,
    startedAt: new Date(),
    endedAt: null,
    sampleCount: 0,
    dominantEmotion: null,
    avgConfidence: null,
    distribution: null,
    notes: null,
  };
  memSessions.unshift(newSession);
  return newSession;
}

export async function finishSession(id: number): Promise<Session | undefined> {
  if (!dbUnavailable && env.databaseUrl) {
    try {
      const rows = await getDb().select().from(readings).where(eq(readings.sessionId, id));
      const dist: Record<string, number> = {};
      let confSum = 0;
      for (const r of rows) {
        dist[r.emotion] = (dist[r.emotion] ?? 0) + 1;
        confSum += r.confidence;
      }
      const dominant = Object.entries(dist).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      await getDb()
        .update(sessions)
        .set({
          endedAt: new Date(),
          sampleCount: rows.length,
          dominantEmotion: dominant,
          avgConfidence: rows.length ? confSum / rows.length : null,
          distribution: dist,
        })
        .where(eq(sessions.id, id));
      return (await getDb().query.sessions.findFirst({ where: eq(sessions.id, id) })) ?? undefined;
    } catch (err) {
      console.warn("[DB] finishSession DB failed, falling back to in-memory store:", err);
      dbUnavailable = true;
    }
  }

  const s = memSessions.find((item) => item.id === id);
  if (!s) return undefined;

  const rows = memReadings.filter((r) => r.sessionId === id);
  const dist: Record<string, number> = {};
  let confSum = 0;
  for (const r of rows) {
    dist[r.emotion] = (dist[r.emotion] ?? 0) + 1;
    confSum += r.confidence;
  }
  const dominant = Object.entries(dist).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  s.endedAt = new Date();
  s.sampleCount = rows.length;
  s.dominantEmotion = dominant;
  s.avgConfidence = rows.length ? confSum / rows.length : null;
  s.distribution = dist;
  return s;
}

export async function insertReading(
  sessionId: number,
  r: {
    emotion: string;
    confidence: number;
    probs: Record<string, number>;
    hr: number;
    eda: number;
    rmssd: number;
    scrRate: number;
    valence: number;
    arousal: number;
    gatePhysio: number;
    gateFace: number;
    faceDetected: boolean;
  },
) {
  if (!dbUnavailable && env.databaseUrl) {
    try {
      await getDb().insert(readings).values({ sessionId, ...r });
      return;
    } catch {
      dbUnavailable = true;
    }
  }

  memReadings.push({
    id: nextReadingId++,
    sessionId,
    ts: new Date(),
    ...r,
  });
}

export async function listSessions(): Promise<Session[]> {
  if (!dbUnavailable && env.databaseUrl) {
    try {
      return await getDb().select().from(sessions).orderBy(desc(sessions.startedAt)).limit(50);
    } catch {
      dbUnavailable = true;
    }
  }

  return [...memSessions].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 50);
}

export async function getSessionWithReadings(id: number): Promise<{
  session: Session | undefined;
  readings: Reading[];
}> {
  if (!dbUnavailable && env.databaseUrl) {
    try {
      const session = await getDb().query.sessions.findFirst({ where: eq(sessions.id, id) });
      const rows = await getDb()
        .select()
        .from(readings)
        .where(eq(readings.sessionId, id))
        .orderBy(readings.ts)
        .limit(4000);
      return { session: session ?? undefined, readings: rows };
    } catch {
      dbUnavailable = true;
    }
  }

  const session = memSessions.find((s) => s.id === id);
  const rows = memReadings
    .filter((r) => r.sessionId === id)
    .sort((a, b) => a.ts.getTime() - b.ts.getTime())
    .slice(0, 4000);

  return { session, readings: rows };
}
