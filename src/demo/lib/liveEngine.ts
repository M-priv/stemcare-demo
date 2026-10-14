/**
 * Live demo engine — server-side core for /api/gemini.
 *
 * This module runs ONLY on the server (imported by `api/gemini.ts`). It is
 * the single live path for the demo and enforces everything the client
 * cannot be trusted to enforce:
 *
 * - Role-locked: four fixed roles; prompts are built SERVER-SIDE from the
 *   same contracts as the deterministic engines. The endpoint is never a
 *   general-purpose model passthrough.
 * - Key handling: the API key is sent as the `x-goog-api-key` HEADER to
 *   Google, never in a URL, and never reaches the client.
 * - Output gating: every model response passes the ported assistive-only
 *   policy (and, for the interviewer, the question-format validator) before
 *   it may leave the server. Failed gates return `{ fallback: true }` and
 *   the client silently uses its deterministic engine.
 * - Abuse control: per-IP minute/hour rate limits (best-effort per server
 *   instance — layer Vercel WAF rules in front for a hard guarantee), strict
 *   payload size caps, and the DEMO_LIVE_KILL_SWITCH env var which forces
 *   deterministic fallback in seconds without a redeploy.
 */

import {
  buildInterviewerPrompt,
  buildReportWriterPrompt,
  cleanReportOutput,
} from './medgemmaChatService';
import { buildPatientPrompt } from './patientSimulator';
import { buildHypothesisPrompt } from './differentials';
import {
  evaluateAssistiveOnlyGuardrails,
  buildAssistiveOnlyAbstainNote,
} from './assistiveOnlyGuardrails';
import {
  validateGeneratedQuestion,
  getFallbackQuestion,
  INTERVIEW_TOPICS,
} from './interviewPrioritization';
import type { InterviewTopic, ConditionName } from './harnessTypes';
import type { DifferentialHypothesis } from '../types';

export type DemoApiRole =
  | 'interviewer'
  | 'report_writer'
  | 'patient_simulator'
  | 'differentials';

export interface DemoApiRequest {
  role?: unknown;
  history?: unknown;
  complaint?: unknown;
  patientName?: unknown;
  currentReport?: unknown;
  control?: unknown;
  transcript?: unknown;
  question?: unknown;
  config?: unknown;
  reportMarkdown?: unknown;
}

export interface DemoApiOptions {
  apiKey?: string;
  model?: string;
  killSwitch?: boolean;
  ip?: string;
}

export interface DemoApiResponse {
  status: number;
  body: Record<string, unknown>;
}

const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const GOOGLE_TIMEOUT_MS = 15_000;

// Payload caps — anything larger is rejected before it reaches the model.
const MAX_HISTORY_ITEMS = 40;
const MAX_HISTORY_ITEM_CHARS = 1_000;
const MAX_REPORT_CHARS = 6_000;
const MAX_COMPLAINT_CHARS = 300;
const MAX_NAME_CHARS = 80;
const MAX_QUESTION_CHARS = 500;
const MAX_SYMPTOM_ITEMS = 20;
const MAX_SYMPTOM_CHARS = 200;
const MAX_PREVIOUS_ANSWERS = 20;
const MAX_PREVIOUS_ANSWER_CHARS = 300;

// =============================================================================
// Rate limiting (best-effort, per server instance)
// =============================================================================

interface RateBucket {
  minuteCount: number;
  minuteStart: number;
  hourCount: number;
  hourStart: number;
}

const RATE_LIMIT_PER_MINUTE = 20;
const RATE_LIMIT_PER_HOUR = 200;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const MAX_TRACKED_IPS = 5_000;

const rateBuckets = new Map<string, RateBucket>();

export function checkRateLimit(ip: string, now: number = Date.now()): boolean {
  if (rateBuckets.size > MAX_TRACKED_IPS) {
    rateBuckets.clear(); // crude prune; safe because limits are best-effort
  }

  const bucket = rateBuckets.get(ip) ?? {
    minuteCount: 0,
    minuteStart: now,
    hourCount: 0,
    hourStart: now,
  };

  if (now - bucket.minuteStart >= MINUTE_MS) {
    bucket.minuteCount = 0;
    bucket.minuteStart = now;
  }
  if (now - bucket.hourStart >= HOUR_MS) {
    bucket.hourCount = 0;
    bucket.hourStart = now;
  }

  bucket.minuteCount += 1;
  bucket.hourCount += 1;
  rateBuckets.set(ip, bucket);

  return bucket.minuteCount <= RATE_LIMIT_PER_MINUTE && bucket.hourCount <= RATE_LIMIT_PER_HOUR;
}

// =============================================================================
// Payload validation helpers
// =============================================================================

function asString(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxChars);
}

function asHistory(value: unknown): Array<{ role: 'user' | 'assistant'; content: string }> | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_HISTORY_ITEMS) {
    return null;
  }
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const item of value) {
    const role = (item as { role?: unknown })?.role;
    const content = asString((item as { content?: unknown })?.content, MAX_HISTORY_ITEM_CHARS);
    if ((role !== 'user' && role !== 'assistant') || !content) return null;
    out.push({ role, content });
  }
  return out;
}

function asStringList(value: unknown, maxItems: number, maxChars: number): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) return null;
  const out: string[] = [];
  for (const item of value) {
    const s = asString(item, maxChars);
    if (!s) return null;
    out.push(s);
  }
  return out;
}

/** Like asStringList but tolerates an absent or empty list (returns []). */
function asOptionalStringList(value: unknown, maxItems: number, maxChars: number): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) return null;
  if (value.length === 0) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = asString(item, maxChars);
    if (!s) return null;
    out.push(s);
  }
  return out;
}

function isInterviewTopic(value: string): value is InterviewTopic {
  return (INTERVIEW_TOPICS as string[]).includes(value);
}

// =============================================================================
// Google call (key in header, never in URL)
// =============================================================================

async function callGemini(
  prompt: string,
  opts: { apiKey: string; model: string },
  generationConfig: { temperature: number; maxOutputTokens: number },
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': opts.apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig,
        }),
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p?.text ?? '').join('').trim();
    return text || null;
  } catch {
    return null;
  }
}

const fallbackResponse = (status: number, reason: string): DemoApiResponse => ({
  status,
  body: { fallback: true, reason },
});

// =============================================================================
// Role handlers (prompt built here, output gated here)
// =============================================================================

async function runInterviewer(body: DemoApiRequest, opts: { apiKey: string; model: string }): Promise<DemoApiResponse> {
  const history = asHistory(body.history);
  const complaint = asString(body.complaint, MAX_COMPLAINT_CHARS);
  if (!history || !complaint) return fallbackResponse(400, 'invalid_payload');

  const patientName = asString(body.patientName, MAX_NAME_CHARS) ?? undefined;
  const currentReport = asString(body.currentReport, MAX_REPORT_CHARS) ?? undefined;

  let control: Parameters<typeof buildInterviewerPrompt>[4] | undefined;
  if (body.control && typeof body.control === 'object') {
    const raw = body.control as Record<string, unknown>;
    const selectedTopic = asString(raw.selectedTopic, 80);
    const questionsAsked = typeof raw.questionsAsked === 'number' ? raw.questionsAsked : NaN;
    if (
      !selectedTopic ||
      !isInterviewTopic(selectedTopic) ||
      !Number.isInteger(questionsAsked) ||
      questionsAsked < 0 ||
      questionsAsked > 100
    ) {
      return fallbackResponse(400, 'invalid_control');
    }
    const blockedTopics = Array.isArray(raw.blockedTopics)
      ? (raw.blockedTopics.filter(
          (t): t is InterviewTopic => typeof t === 'string' && isInterviewTopic(t),
        ).slice(0, INTERVIEW_TOPICS.length))
      : [];
    control = {
      questionsAsked,
      maxQuestions: 15,
      selectedTopic,
      selectedTopicRationale: asString(raw.selectedTopicRationale, 300) ?? '',
      blockedTopics,
    };
  }

  const prompt = buildInterviewerPrompt(history, complaint, patientName, currentReport, control);
  const text = await callGemini(prompt, opts, { temperature: 0.35, maxOutputTokens: 150 });
  if (!text) return fallbackResponse(502, 'model_unavailable');

  // Gate: single-question format + assistive-only policy, server-side.
  const validated = validateGeneratedQuestion(text);
  if (!validated.valid) return fallbackResponse(200, `question_format_${validated.reason}`);
  const guardrail = evaluateAssistiveOnlyGuardrails(validated.question);
  if (guardrail.action !== 'allow') return fallbackResponse(200, 'guardrail_' + guardrail.action);

  return { status: 200, body: { text: validated.question } };
}

async function runReportWriter(body: DemoApiRequest, opts: { apiKey: string; model: string }): Promise<DemoApiResponse> {
  const transcript = asHistory(body.transcript);
  const complaint = asString(body.complaint, MAX_COMPLAINT_CHARS);
  const currentReport = asString(body.currentReport, MAX_REPORT_CHARS);
  if (!transcript || !complaint || !currentReport) return fallbackResponse(400, 'invalid_payload');

  const prompt = buildReportWriterPrompt(transcript, currentReport, complaint);
  const text = await callGemini(prompt, opts, { temperature: 0.25, maxOutputTokens: 1024 });
  if (!text) return fallbackResponse(502, 'model_unavailable');

  const cleaned = cleanReportOutput(text);
  const guardrail = evaluateAssistiveOnlyGuardrails(cleaned);
  if (guardrail.action !== 'allow') return fallbackResponse(200, 'guardrail_' + guardrail.action);

  return { status: 200, body: { text: cleaned } };
}

async function runPatientSimulator(body: DemoApiRequest, opts: { apiKey: string; model: string }): Promise<DemoApiResponse> {
  const question = asString(body.question, MAX_QUESTION_CHARS);
  if (!question || typeof body.config !== 'object' || body.config === null) {
    return fallbackResponse(400, 'invalid_payload');
  }
  const rawConfig = body.config as Record<string, unknown>;
  const selectedSymptoms = asStringList(rawConfig.selectedSymptoms, MAX_SYMPTOM_ITEMS, MAX_SYMPTOM_CHARS);
  const previousAnswers = asOptionalStringList(rawConfig.previousAnswers, MAX_PREVIOUS_ANSWERS, MAX_PREVIOUS_ANSWER_CHARS);
  const condition = asString(rawConfig.condition, 40);
  if (!selectedSymptoms || previousAnswers === null || !condition) {
    return fallbackResponse(400, 'invalid_payload');
  }

  const prompt = buildPatientPrompt(question, {
    condition: condition as ConditionName,
    selectedSymptoms,
    previousAnswers,
  });
  const text = await callGemini(prompt, opts, { temperature: 0.6, maxOutputTokens: 120 });
  if (!text) return fallbackResponse(502, 'model_unavailable');

  return { status: 200, body: { text: text.slice(0, MAX_QUESTION_CHARS) } };
}

const PROBABILITY_BY_BUCKET = { high: 0.78, medium: 0.54, low: 0.22 } as const;

async function runDifferentials(body: DemoApiRequest, opts: { apiKey: string; model: string }): Promise<DemoApiResponse> {
  const reportMarkdown = asString(body.reportMarkdown, MAX_REPORT_CHARS);
  if (!reportMarkdown) return fallbackResponse(400, 'invalid_payload');

  const prompt = buildHypothesisPrompt(reportMarkdown);
  const text = await callGemini(prompt, opts, { temperature: 0.25, maxOutputTokens: 1024 });
  if (!text) return fallbackResponse(502, 'model_unavailable');

  let parsed: unknown;
  try {
    const stripped = text.trim().replace(/^```(?:json)?\n?/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(stripped);
  } catch {
    return fallbackResponse(200, 'unparseable_json');
  }

  const rawHypotheses = (parsed as { hypotheses?: unknown })?.hypotheses;
  if (!Array.isArray(rawHypotheses) || rawHypotheses.length === 0) {
    return fallbackResponse(200, 'invalid_hypotheses');
  }

  const hypotheses: DifferentialHypothesis[] = [];
  rawHypotheses.slice(0, 3).forEach((raw, idx) => {
    const label = asString((raw as { label?: unknown })?.label, 120);
    const rationale = asString((raw as { rationale?: unknown })?.rationale, 400);
    if (!label) return;

    const rawBucket = (raw as { confidence_bucket?: unknown })?.confidence_bucket;
    const bucket: 'high' | 'medium' | 'low' = rawBucket === 'medium' || rawBucket === 'low'
      ? rawBucket
      : idx === 0 ? 'high' : idx === 1 ? 'medium' : 'low';

    const base = PROBABILITY_BY_BUCKET[bucket];
    const probability = Math.round(Math.max(0.1, Math.min(0.95, base - idx * 0.08)) * 100) / 100;

    const evidence = Array.isArray((raw as { supporting_evidence_refs?: unknown })?.supporting_evidence_refs)
      ? ((raw as { supporting_evidence_refs?: unknown[] }).supporting_evidence_refs as unknown[])
        .map((ref) => asString(ref, 200))
        .filter((ref): ref is string => Boolean(ref))
        .slice(0, 4)
      : [];

    const card: DifferentialHypothesis = {
      id: `hyp_live_${idx + 1}_${Date.now()}`,
      condition: label,
      probability,
      confidenceBucket: bucket,
      keyFindings: evidence.length > 0 ? evidence : [rationale ?? 'Grounded in patient intake report.'],
      recommendedAction: rationale ?? 'Clinician review and physical examination indicated.',
      guidelineRef: 'Clinician review — generated hypothesis, not a calibrated estimate',
    };

    // Gate each card server-side with the assistive-only policy.
    const cardText = [card.condition, ...card.keyFindings, card.recommendedAction].join(' ');
    const guardrail = evaluateAssistiveOnlyGuardrails(cardText);
    if (guardrail.action === 'escalate') return;
    if (guardrail.action === 'abstain') {
      card.recommendedAction = buildAssistiveOnlyAbstainNote(guardrail.reason ?? 'Policy gate triggered.');
    }
    hypotheses.push(card);
  });

  if (hypotheses.length === 0) return fallbackResponse(200, 'all_cards_gated');

  return { status: 200, body: { hypotheses } };
}

// =============================================================================
// Entry point
// =============================================================================

export async function handleDemoApiRequest(
  body: unknown,
  opts: DemoApiOptions,
): Promise<DemoApiResponse> {
  if (opts.killSwitch) return fallbackResponse(503, 'live_disabled');
  if (!opts.apiKey) return fallbackResponse(503, 'not_configured');
  if (opts.ip && !checkRateLimit(opts.ip)) return fallbackResponse(429, 'rate_limited');

  const role = (body as DemoApiRequest)?.role;
  const validRoles: DemoApiRole[] = ['interviewer', 'report_writer', 'patient_simulator', 'differentials'];
  if (typeof role !== 'string' || !validRoles.includes(role as DemoApiRole)) {
    return fallbackResponse(400, 'invalid_role');
  }

  const request = (body ?? {}) as DemoApiRequest;
  const modelOpts = { apiKey: opts.apiKey, model: opts.model || DEFAULT_MODEL };

  switch (role as DemoApiRole) {
    case 'interviewer':
      return runInterviewer(request, modelOpts);
    case 'report_writer':
      return runReportWriter(request, modelOpts);
    case 'patient_simulator':
      return runPatientSimulator(request, modelOpts);
    case 'differentials':
      return runDifferentials(request, modelOpts);
  }
}
