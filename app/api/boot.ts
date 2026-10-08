import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

// In Vite dev mode, @hono/vite-dev-server imports app and handles requests.
// When executed directly via Node (e.g. node dist/boot.js), start the standalone HTTP server.
const isViteDev = Boolean(process.env.VITE || process.env.VITE_DEV_SERVER);

if (!isViteDev) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  try {
    serveStaticFiles(app);
  } catch (e) {
    console.warn("[boot] Note: static files not mounted:", e);
  }

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`EmotionVerse server running on http://localhost:${port}/`);
  });
}
