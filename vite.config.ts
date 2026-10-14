import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { handleDemoApiRequest } from "./src/demo/lib/liveEngine";

/**
 * Dev-only middleware so live model mode works under plain `npm run dev`.
 * In production Vercel serves `api/gemini.ts` as a serverless function; Vite
 * has no serverless runtime, so this mirrors it for local development.
 *
 * Reads GEMINI_API_KEY / DEMO_GEMINI_MODEL / DEMO_LIVE_KILL_SWITCH from .env
 * (git-ignored) or the shell environment. Without a key every call returns
 * { fallback: true, reason: "not_configured" } and the demo stays
 * deterministic. Never active during build or preview.
 */
function demoLiveApi(): Plugin {
  return {
    name: "demo-live-api",
    apply: "serve",
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      server.middlewares.use("/api/gemini", (req, res) => {
        void (async () => {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          let body: unknown = null;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          } catch {
            body = null;
          }
          const result = await handleDemoApiRequest(body, {
            apiKey: env.GEMINI_API_KEY || undefined,
            model: env.DEMO_GEMINI_MODEL || undefined,
            killSwitch: env.DEMO_LIVE_KILL_SWITCH === "true",
            ip: req.socket.remoteAddress ?? "dev-local",
          });
          res.statusCode = result.status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result.body));
        })();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), demoLiveApi()],
});
