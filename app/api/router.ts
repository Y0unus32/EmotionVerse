import { createRouter, publicQuery } from "./middleware";
import { emotionRouter } from "./emotionRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  ev: emotionRouter,
});

export type AppRouter = typeof appRouter;
