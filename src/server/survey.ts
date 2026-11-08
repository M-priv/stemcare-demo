/**
 * Serverless function entrypoint for POST /api/survey
 *
 * Source file: `src/server/survey.ts`
 * Compiled to standalone bundle: `api/survey.js`
 *
 * Primary storage: Native Vercel Postgres (via @neondatabase/serverless).
 * Fallback storage: Google Apps Script Webhook (SURVEY_WEBHOOK_URL).
 * Local resilience: Returns local_only status if no cloud backend is configured.
 */

import { neon } from '@neondatabase/serverless';

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

export type SqlQueryFunction = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;

export interface SurveyConfig {
  webhookUrl?: string;
  postgresUrl?: string;
  fetchFn?: typeof fetch;
  sqlClient?: SqlQueryFunction;
}

export interface SurveyApiResponse {
  status: number;
  body: {
    status: 'ok' | 'error';
    forwarded?: boolean;
    mode?: 'postgres' | 'streamed' | 'local_only';
    message?: string;
  };
}

let tableBootstrapped = false;

export function resetTableBootstrap(): void {
  tableBootstrapped = false;
}

export async function insertSurveyResponseToPostgres(
  payload: Record<string, unknown>,
  postgresUrl: string,
  customSqlClient?: SqlQueryFunction
): Promise<void> {
  const sql = customSqlClient || (neon(postgresUrl) as unknown as SqlQueryFunction);

  if (!tableBootstrapped) {
    await sql`
      CREATE TABLE IF NOT EXISTS demo_survey_responses (
        id SERIAL PRIMARY KEY,
        overall_rating INTEGER NOT NULL,
        rating_label VARCHAR(64),
        evaluator_role VARCHAR(64) NOT NULL,
        evaluator_role_other TEXT,
        feelings JSONB DEFAULT '[]'::jsonb,
        pillar_patient_interview VARCHAR(32),
        pillar_clinical_briefing VARCHAR(32),
        pillar_clinician_gate VARCHAR(32),
        positive_feedback TEXT,
        constructive_feedback TEXT,
        contact_name VARCHAR(255),
        contact_email VARCHAR(255),
        scenario_id VARCHAR(64),
        submitted_at VARCHAR(32),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    tableBootstrapped = true;
  }

  const overallRating = payload.overallRating as number;
  const ratingLabel = (payload.ratingLabel as string) || null;
  const evaluatorRole = (payload.evaluatorRole as string) || 'other';
  const evaluatorRoleOther = (payload.evaluatorRoleOther as string) || null;
  const feelings = JSON.stringify(Array.isArray(payload.feelings) ? payload.feelings : []);
  const pillarRatings = (payload.pillarRatings as Record<string, string> | undefined) || {};
  const pillarInterview = pillarRatings.patientInterview || null;
  const pillarBriefing = pillarRatings.clinicalBriefing || null;
  const pillarGate = pillarRatings.clinicianGate || null;
  const positiveFeedback = (payload.positiveFeedback as string) || null;
  const constructiveFeedback = (payload.constructiveFeedback as string) || null;
  const contactName = (payload.contactName as string) || null;
  const contactEmail = (payload.contactEmail as string) || null;
  const scenarioId = (payload.scenarioId as string) || null;
  const submittedAt = (payload.submittedAt as string) || null;

  await sql`
    INSERT INTO demo_survey_responses (
      overall_rating,
      rating_label,
      evaluator_role,
      evaluator_role_other,
      feelings,
      pillar_patient_interview,
      pillar_clinical_briefing,
      pillar_clinician_gate,
      positive_feedback,
      constructive_feedback,
      contact_name,
      contact_email,
      scenario_id,
      submitted_at
    ) VALUES (
      ${overallRating},
      ${ratingLabel},
      ${evaluatorRole},
      ${evaluatorRoleOther},
      ${feelings}::jsonb,
      ${pillarInterview},
      ${pillarBriefing},
      ${pillarGate},
      ${positiveFeedback},
      ${constructiveFeedback},
      ${contactName},
      ${contactEmail},
      ${scenarioId},
      ${submittedAt}
    );
  `;
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

  const postgresUrl = config?.postgresUrl || process.env.POSTGRES_URL || process.env.DATABASE_URL;
  const webhookUrl = config?.webhookUrl || process.env.SURVEY_WEBHOOK_URL;
  const fetchFn = config?.fetchFn || (typeof fetch !== 'undefined' ? fetch : undefined);

  // 1. Primary: Save directly to Vercel Postgres if configured
  if (postgresUrl || config?.sqlClient) {
    try {
      await insertSurveyResponseToPostgres(payload, postgresUrl || '', config?.sqlClient);
      return {
        status: 200,
        body: {
          status: 'ok',
          forwarded: true,
          mode: 'postgres',
          message: 'Successfully saved survey response to Vercel Postgres',
        },
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[Survey Postgres] Failed to save survey response:', errorMsg);
      return {
        status: 500,
        body: {
          status: 'error',
          forwarded: false,
          message: `Failed to save survey to Vercel Postgres: ${errorMsg}`,
        },
      };
    }
  }

  // 2. Secondary / Legacy: Forward to Google Sheets Webhook if configured
  if (webhookUrl) {
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

  // 3. Fallback: Neither Postgres nor Webhook configured
  return {
    status: 200,
    body: {
      status: 'ok',
      forwarded: false,
      mode: 'local_only',
      message: 'Survey stored locally. Configure POSTGRES_URL to save to Vercel Postgres.',
    },
  };
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
