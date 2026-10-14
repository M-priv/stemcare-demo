/**
 * Client-side access to the live demo path.
 *
 * `isLiveMode()` is true only when the build explicitly opts in
 * (VITE_DEMO_LIVE_MODE === "true"). The flag is safe to inline — it carries
 * no secret; the key itself lives only in the server function env.
 *
 * `callDemoApi` returns null on ANY failure (network, non-200, fallback
 * flag, timeout). Every caller treats null as "use the deterministic
 * engine", so the demo degrades to fully-offline behavior instead of
 * breaking. It never fails open past the server: the server gates model
 * output; this module only refuses to render failures.
 */

import type { DifferentialHypothesis } from '../types';
import type {
  MedGemmaChatMessage,
  InterviewControlContext,
  ConditionName,
  SimulationConfig,
} from './harnessTypes';

export function isLiveMode(): boolean {
  return import.meta.env.VITE_DEMO_LIVE_MODE === 'true';
}

export async function callDemoApi<T>(
  role: string,
  payload: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<T | null> {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, ...payload }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as (T & { fallback?: boolean }) | null;
    if (!data || data.fallback) return null;
    return data;
  } catch {
    return null;
  }
}

export interface InterviewerTurnRequest {
  history: MedGemmaChatMessage[];
  complaint: string;
  patientName?: string;
  currentReport?: string;
  control?: InterviewControlContext;
}

export async function requestInterviewerTurn(request: InterviewerTurnRequest): Promise<string | null> {
  const data = await callDemoApi<{ text?: string }>('interviewer', {
    history: request.history.map((m) => ({ role: m.role, content: m.content })),
    complaint: request.complaint,
    patientName: request.patientName,
    currentReport: request.currentReport,
    control: request.control,
  });
  return data?.text ?? null;
}

export async function requestReportUpdate(request: {
  transcript: MedGemmaChatMessage[];
  currentReport: string;
  complaint: string;
}): Promise<string | null> {
  const data = await callDemoApi<{ text?: string }>('report_writer', {
    transcript: request.transcript.map((m) => ({ role: m.role, content: m.content })),
    currentReport: request.currentReport,
    complaint: request.complaint,
  });
  return data?.text ?? null;
}

export async function requestPatientLine(request: {
  question: string;
  config: SimulationConfig;
}): Promise<string | null> {
  const data = await callDemoApi<{ text?: string }>('patient_simulator', {
    question: request.question,
    config: {
      condition: request.config.condition as ConditionName,
      selectedSymptoms: request.config.selectedSymptoms,
      previousAnswers: request.config.previousAnswers,
    },
  });
  return data?.text ?? null;
}

export async function requestDifferentials(reportMarkdown: string): Promise<DifferentialHypothesis[] | null> {
  const data = await callDemoApi<{ hypotheses?: DifferentialHypothesis[] }>('differentials', {
    reportMarkdown,
  });
  const hypotheses = data?.hypotheses;
  if (!Array.isArray(hypotheses) || hypotheses.length === 0) return null;

  // Shape check: a malformed or hostile payload must never reach the UI.
  return hypotheses.filter(
    (h) =>
      h &&
      typeof h.condition === 'string' &&
      typeof h.probability === 'number' &&
      (h.confidenceBucket === 'high' || h.confidenceBucket === 'medium' || h.confidenceBucket === 'low') &&
      Array.isArray(h.keyFindings) &&
      typeof h.recommendedAction === 'string',
  );
}
