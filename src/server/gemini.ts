/**
 * Serverless function entrypoint for POST /api/gemini
 *
 * Source file: `src/server/gemini.ts`
 * Compiled to standalone bundle: `api/gemini.js`
 *
 * Handles both Node.js (req, res) serverless environments and
 * Web Standard Request/Response environments.
 */

import { handleDemoApiRequest } from '../demo/lib/liveEngine';

export interface DemoReq {
  method?: string;
  headers?: Record<string, string | string[] | undefined> | Headers;
  body?: unknown;
  json?: () => Promise<unknown>;
}

export interface DemoRes {
  status(code: number): DemoRes;
  json(body: unknown): void;
}

function getHeader(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  const rec = headers as Record<string, string | string[] | undefined>;
  const val = rec[name] ?? rec[name.toLowerCase()];
  if (Array.isArray(val)) return val[0];
  return typeof val === 'string' ? val : undefined;
}

async function parseBody(req: unknown): Promise<unknown> {
  const reqObj = req as { body?: unknown; json?: () => Promise<unknown> };
  if (typeof reqObj.json === 'function' && reqObj.body === undefined) {
    try {
      return await reqObj.json();
    } catch {
      return null;
    }
  }
  let body = reqObj.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  return body ?? null;
}

export default async function handler(req: DemoReq, res?: DemoRes): Promise<Response | void> {
  const isWebStandard = !res || typeof res.status !== 'function';
  const method = req?.method ?? 'GET';

  if (method !== 'POST') {
    const errorBody = { fallback: true, reason: 'method_not_allowed' };
    if (isWebStandard) {
      return new Response(JSON.stringify(errorBody), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    res.status(405).json(errorBody);
    return;
  }

  const forwarded = getHeader(req?.headers, 'x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  const body = await parseBody(req);

  const result = await handleDemoApiRequest(body, {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.DEMO_GEMINI_MODEL,
    killSwitch: process.env.DEMO_LIVE_KILL_SWITCH === 'true',
    ip,
  });

  if (isWebStandard) {
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  res.status(result.status).json(result.body);
}
