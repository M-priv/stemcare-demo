/**
 * Serverless function entrypoint for POST /api/survey
 *
 * Source file: `src/server/survey.ts`
 * Compiled to standalone bundle: `api/survey.js`
 *
 * Automatically relays demo survey responses to the Google Apps Script Web App
 * hosted under maadesiyan1@gmail.com, avoiding browser CORS restrictions.
 */

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

export interface SurveyConfig {
  webhookUrl?: string;
  fetchFn?: typeof fetch;
}

export interface SurveyApiResponse {
  status: number;
  body: {
    status: 'ok' | 'error';
    forwarded?: boolean;
    mode?: 'streamed' | 'local_only';
    message?: string;
  };
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

/**
 * Pure handler for /api/survey requests.
 * Isolated from Node/Edge execution context for straightforward unit testing.
 */
export async function handleSurveyApiRequest(
  body: unknown,
  config?: SurveyConfig
): Promise<SurveyApiResponse> {
  if (!body || typeof body !== 'object') {
    return {
      status: 400,
      body: { status: 'error', message: 'Missing or malformed JSON payload' },
    };
  }

  const payload = body as Record<string, unknown>;
  const overallRating = payload.overallRating;

  if (typeof overallRating !== 'number' || overallRating < 1 || overallRating > 10) {
    return {
      status: 400,
      body: { status: 'error', message: 'overallRating must be a number between 1 and 10' },
    };
  }

  const webhookUrl = config?.webhookUrl || process.env.SURVEY_WEBHOOK_URL;
  const fetchFn = config?.fetchFn || (typeof fetch !== 'undefined' ? fetch : undefined);

  if (!webhookUrl) {
    return {
      status: 200,
      body: {
        status: 'ok',
        forwarded: false,
        mode: 'local_only',
        message: 'Survey stored locally. Configure SURVEY_WEBHOOK_URL to stream to Google Sheets.',
      },
    };
  }

  if (!fetchFn) {
    return {
      status: 500,
      body: { status: 'error', message: 'Fetch client unavailable in server environment' },
    };
  }

  try {
    const upstreamRes = await fetchFn(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    if (!upstreamRes.ok) {
      console.warn(`[Survey Webhook] Upstream responded with HTTP ${upstreamRes.status}`);
      return {
        status: 502,
        body: {
          status: 'error',
          forwarded: false,
          message: `Upstream webhook responded with status ${upstreamRes.status}`,
        },
      };
    }

    return {
      status: 200,
      body: {
        status: 'ok',
        forwarded: true,
        mode: 'streamed',
        message: 'Successfully streamed survey response to Google Sheet',
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[Survey Webhook] Failed to forward survey payload:', errorMsg);
    return {
      status: 502,
      body: {
        status: 'error',
        forwarded: false,
        message: `Failed to connect to Google Sheets webhook: ${errorMsg}`,
      },
    };
  }
}

export default async function handler(req: DemoReq, res?: DemoRes): Promise<Response | void> {
  const isWebStandard = !res || typeof res.status !== 'function';
  const method = req?.method ?? 'GET';

  if (method !== 'POST') {
    const errorBody = { status: 'error' as const, message: 'Method Not Allowed. Use POST.' };
    if (isWebStandard) {
      return new Response(JSON.stringify(errorBody), {
        status: 405,
        headers: { 'Content-Type': 'application/json', Allow: 'POST' },
      });
    }
    res.status(405).json(errorBody);
    return;
  }

  const body = await parseBody(req);
  const result = await handleSurveyApiRequest(body);

  if (isWebStandard) {
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  res.status(result.status).json(result.body);
}
