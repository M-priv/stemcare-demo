/**
 * Vercel serverless function: POST /api/gemini
 *
 * Thin wrapper around the server-side live engine. All policy lives in
 * `src/demo/lib/liveEngine.ts` (typed + tested there); this file only does
 * HTTP concerns: method check, client-IP extraction, env wiring.
 *
 * Environment (all optional — absent key/kill switch forces the client to
 * its deterministic engines):
 * - GEMINI_API_KEY        server-side key; NEVER prefixed VITE_
 * - DEMO_GEMINI_MODEL     model override (default: gemini-3.1-flash-lite)
 * - DEMO_LIVE_KILL_SWITCH set "true" to force deterministic fallback
 */

import { handleDemoApiRequest } from '../src/demo/lib/liveEngine';

interface DemoReq {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

interface DemoRes {
  status(code: number): DemoRes;
  json(body: unknown): void;
}

export default async function handler(req: DemoReq, res: DemoRes): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ fallback: true, reason: 'method_not_allowed' });
    return;
  }

  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0] : undefined)?.trim() || 'unknown';

  const result = await handleDemoApiRequest(req.body, {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.DEMO_GEMINI_MODEL,
    killSwitch: process.env.DEMO_LIVE_KILL_SWITCH === 'true',
    ip,
  });

  res.status(result.status).json(result.body);
}
