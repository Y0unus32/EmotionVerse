import {
  mysqlTable,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  float,
  json,
  boolean,
} from "drizzle-orm/mysql-core";

export const sessions = mysqlTable("sessions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  scenario: varchar("scenario", { length: 32 }).notNull().default("auto"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  sampleCount: int("sample_count").notNull().default(0),
  dominantEmotion: varchar("dominant_emotion", { length: 32 }),
  avgConfidence: float("avg_confidence"),
  distribution: json("distribution").$type<Record<string, number>>(),
  notes: text("notes"),
});
export type Session = typeof sessions.$inferSelect;

export const readings = mysqlTable("readings", {
  id: serial("id").primaryKey(),
  sessionId: bigint("session_id", { mode: "number", unsigned: true })
    .notNull()
    .references(() => sessions.id),
  ts: timestamp("ts").notNull().defaultNow(),
  emotion: varchar("emotion", { length: 32 }).notNull(),
  confidence: float("confidence").notNull(),
  probs: json("probs").$type<Record<string, number>>().notNull(),
  hr: float("hr").notNull(),
  eda: float("eda").notNull(),
  rmssd: float("rmssd").notNull(),
  scrRate: float("scr_rate").notNull(),
  valence: float("valence").notNull(),
  arousal: float("arousal").notNull(),
  gatePhysio: float("gate_physio").notNull(),
  gateFace: float("gate_face").notNull(),
  faceDetected: boolean("face_detected").notNull().default(true),
});
export type Reading = typeof readings.$inferSelect;
