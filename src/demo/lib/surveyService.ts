import type { DemoSurveyResponse } from '../types';
import { RATING_DESCRIPTORS, EVALUATOR_ROLES, saveSurveyResponse } from './surveyStorage';

export interface EnrichedSurveyPayload extends DemoSurveyResponse {
  ratingLabel: string;
  roleLabel: string;
  timestampIso: string;
}

/**
 * Enriches the raw survey response with human-readable labels for spreadsheet export.
 */
export function prepareSurveyPayload(response: DemoSurveyResponse): EnrichedSurveyPayload {
  const roleMatch = EVALUATOR_ROLES.find((r) => r.id === response.evaluatorRole);
  const roleLabel = roleMatch ? roleMatch.label : response.evaluatorRole;
  const ratingLabel = RATING_DESCRIPTORS[response.overallRating] || `${response.overallRating}/10`;

  return {
    ...response,
    ratingLabel,
    roleLabel: response.evaluatorRole === 'other' && response.evaluatorRoleOther
      ? `Other (${response.evaluatorRoleOther})`
      : roleLabel,
    timestampIso: new Date().toISOString(),
  };
}

export interface SubmitSurveyResult {
  success: boolean;
  savedLocally: boolean;
  streamedToSheet: boolean;
  error?: string;
}

/**
 * Submits the demo evaluation response.
 *
 * Resilience guarantee:
 * 1. Always saves to localStorage first so the response is NEVER lost.
 * 2. Transmits payload to /api/survey which proxies to the Google Apps Script Webhook.
 * 3. Times out after 8s if network is slow, never blocking user UI.
 */
export async function submitSurveyResponse(
  response: DemoSurveyResponse,
  options?: {
    endpoint?: string;
    timeoutMs?: number;
    fetchFn?: typeof fetch;
  }
): Promise<SubmitSurveyResult> {
  const endpoint = options?.endpoint ?? '/api/survey';
  const timeoutMs = options?.timeoutMs ?? 8000;
  const fetchFn = options?.fetchFn ?? (typeof fetch !== 'undefined' ? fetch : undefined);

  // 1. Guaranteed local persistence backup
  saveSurveyResponse(response);

  // If no fetch is available (e.g. non-browser environment without polyfill)
  if (!fetchFn) {
    return {
      success: true,
      savedLocally: true,
      streamedToSheet: false,
    };
  }

  const payload = prepareSurveyPayload(response);

  // 2. Dispatch to serverless /api/survey endpoint
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    const res = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[STEMCare Survey] /api/survey responded with HTTP ${res.status}`);
      return {
        success: true,
        savedLocally: true,
        streamedToSheet: false,
        error: `Server responded with ${res.status}`,
      };
    }

    const data = (await res.json().catch(() => ({}))) as { forwarded?: boolean; mode?: string };
    const streamedToSheet = data.forwarded === true || data.mode === 'streamed';

    return {
      success: true,
      savedLocally: true,
      streamedToSheet,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[STEMCare Survey] Automated transmission failed, response preserved locally:', msg);
    return {
      success: true,
      savedLocally: true,
      streamedToSheet: false,
      error: msg,
    };
  }
}
