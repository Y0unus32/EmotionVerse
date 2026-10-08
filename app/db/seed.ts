// Seed two realistic demo sessions by driving the simulator offline.
// Run: npx tsx db/seed.ts
import { getDb } from "../api/queries/connection";
import { sessions, readings } from "./schema";
import { simulator } from "../api/ml/simulator";
import type { LiveSample } from "@contracts/emotions";
import { eq, like } from "drizzle-orm";

async function seedSession(name: string, scenario: "auto" | "stress", seconds: number, startOffsetMin: number) {
  const [{ id }] = await getDb()
    .insert(sessions)
    .values({ name, scenario, startedAt: new Date(Date.now() - startOffsetMin * 60000) })
    .$returningId();

  simulator.setScenario(scenario);
  const rows = [];
  for (let i = 0; i < seconds; i++) {
    const s = simulator.forceStep();
    rows.push({
      sessionId: id,
      ts: new Date(Date.now() - startOffsetMin * 60000 + i * 1000),
      emotion: s.emotion,
      confidence: s.confidence,
      probs: { ...s.probs },
      hr: s.hr,
      eda: s.eda,
      rmssd: s.physio.rmssd,
      scrRate: s.physio.scr_rate,
      valence: s.valence,
      arousal: s.arousal,
      gatePhysio: s.gate.physio,
      gateFace: s.gate.face,
      faceDetected: s.faceDetected,
    });
  }
  await getDb().insert(readings).values(rows);

  const dist: Record<string, number> = {};
  let conf = 0;
  for (const r of rows) {
    dist[r.emotion] = (dist[r.emotion] ?? 0) + 1;
    conf += r.confidence;
  }
  const dominant = Object.entries(dist).sort((a, b) => b[1] - a[1])[0][0];
  await getDb()
    .update(sessions)
    .set({
      endedAt: new Date(Date.now() - startOffsetMin * 60000 + seconds * 1000),
      sampleCount: rows.length,
      dominantEmotion: dominant,
      avgConfidence: conf / rows.length,
      distribution: dist,
    })
    .where(eq(sessions.id, id));
  console.log(`seeded session #${id} "${name}" — ${rows.length} samples, dominant ${dominant}`);
}

async function main() {
  // remove QA smoke-test rows created during development
  const qa = await getDb().select().from(sessions).where(like(sessions.name, "QA smoke test%"));
  for (const s of qa) {
    await getDb().delete(readings).where(eq(readings.sessionId, s.id));
    await getDb().delete(sessions).where(eq(sessions.id, s.id));
  }
  if (qa.length) console.log(`removed ${qa.length} QA session(s)`);

  simulator.setScenario("auto");
  await seedSession("Subject 01 · full protocol", "auto", 120, 95);
  await seedSession("Subject 02 · TSST stressor", "stress", 75, 40);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
