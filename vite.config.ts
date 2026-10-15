import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { handleDemoApiRequest } from "./src/demo/lib/liveEngine";
import { handleSurveyApiRequest } from "./src/server/survey";

/**
 * Dev-only middleware so live model mode and survey streaming work under plain `npm run dev`.
 * In production Vercel serves `api/gemini.js` and `api/survey.js` as serverless functions;
 * Vite has no serverless runtime, so this mirrors them for local development.
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

      server.middlewares.use("/api/survey", (req, res) => {
        void (async () => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ status: "error", message: "Method Not Allowed" }));
            return;
          }
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          let body: unknown = null;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          } catch {
            body = null;
          }
          const result = await handleSurveyApiRequest(body, {
            webhookUrl: env.SURVEY_WEBHOOK_URL || undefined,
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
