// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  saveSurveyResponse,
  loadSurveyResponse,
  clearSurveyResponse,
  formatSurveySummary,
  SURVEY_STORAGE_KEY,
  RATING_DESCRIPTORS,
  EVALUATOR_ROLES,
  FEELING_OPTIONS,
} from '../lib/surveyStorage';
import type { DemoSurveyResponse } from '../types';

describe('surveyStorage and survey constants', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const mockResponse: DemoSurveyResponse = {
    overallRating: 9,
    evaluatorRole: 'clinician_gp',
    feelings: ['safe_grounded', 'transparent_citations', 'apple_design'],
    pillarRatings: {
      patientInterview: 'excellent',
      clinicalBriefing: 'excellent',
      clinicianGate: 'excellent',
    },
    positiveFeedback: 'The live clinical briefing with exact chat line citations is brilliant.',
    constructiveFeedback: 'Would like to see support for custom local clinical referral pathways.',
    contactName: 'Dr. John Watson',
    contactEmail: 'john.watson@nhs.net',
    submittedAt: '14:30',
    scenarioId: 'migraine_aura',
  };

  it('correctly defines descriptors for all ratings from 1 to 10', () => {
    for (let i = 1; i <= 10; i++) {
      expect(RATING_DESCRIPTORS[i]).toBeDefined();
      expect(typeof RATING_DESCRIPTORS[i]).toBe('string');
      expect(RATING_DESCRIPTORS[i].length).toBeGreaterThan(0);
    }
  });

  it('has comprehensive evaluator roles', () => {
    const roleIds = EVALUATOR_ROLES.map((r) => r.id);
    expect(roleIds).toContain('clinician_gp');
    expect(roleIds).toContain('nhs_leader');
    expect(roleIds).toContain('healthtech_product');
    expect(roleIds).toContain('patient_public');
    expect(roleIds).toContain('investor_partner');
    expect(roleIds).toContain('other');
  });

  it('has rich sentiment feeling chips', () => {
    expect(FEELING_OPTIONS.length).toBeGreaterThanOrEqual(8);
    const feelingIds = FEELING_OPTIONS.map((f) => f.id);
    expect(feelingIds).toContain('safe_grounded');
    expect(feelingIds).toContain('transparent_citations');
    expect(feelingIds).toContain('apple_design');
  });

  it('saves and loads survey response to/from localStorage', () => {
    expect(loadSurveyResponse()).toBeNull();
    saveSurveyResponse(mockResponse);

    const loaded = loadSurveyResponse();
    expect(loaded).not.toBeNull();
    expect(loaded?.overallRating).toBe(9);
    expect(loaded?.evaluatorRole).toBe('clinician_gp');
    expect(loaded?.feelings).toEqual(['safe_grounded', 'transparent_citations', 'apple_design']);
    expect(loaded?.positiveFeedback).toContain('live clinical briefing');
    expect(loaded?.contactEmail).toBe('john.watson@nhs.net');
  });

  it('handles clearing survey response', () => {
    saveSurveyResponse(mockResponse);
    expect(loadSurveyResponse()).not.toBeNull();

    clearSurveyResponse();
    expect(loadSurveyResponse()).toBeNull();
  });

  it('handles corrupted localStorage data gracefully', () => {
    window.localStorage.setItem(SURVEY_STORAGE_KEY, '{invalid json');
    expect(loadSurveyResponse()).toBeNull();

    window.localStorage.setItem(SURVEY_STORAGE_KEY, JSON.stringify({ notASurvey: true }));
    expect(loadSurveyResponse()).toBeNull();
  });

  it('formats survey summary text cleanly for copying', () => {
    const summary = formatSurveySummary(mockResponse);

    expect(summary).toContain('=== STEMCARE DEMO EVALUATION ===');
    expect(summary).toContain('Overall Rating: 9/10');
    expect(summary).toContain('Evaluator Perspective: Clinician / GP');
    expect(summary).toContain('🛡️ Clinically safe & grounded');
    expect(summary).toContain('🔍 Transparent (loved citations)');
    expect(summary).toContain('• Interview: excellent');
    expect(summary).toContain('The live clinical briefing with exact chat line citations is brilliant.');
    expect(summary).toContain('Dr. John Watson');
    expect(summary).toContain('john.watson@nhs.net');
  });

  it('formats summary without contact info when not provided', () => {
    const anonResponse: DemoSurveyResponse = {
      overallRating: 7,
      evaluatorRole: 'patient_public',
      feelings: [],
      pillarRatings: {},
      positiveFeedback: '',
      constructiveFeedback: '',
      submittedAt: '15:00',
    };

    const summary = formatSurveySummary(anonResponse);
    expect(summary).toContain('Overall Rating: 7/10');
    expect(summary).toContain('Evaluator Perspective: Patient / Public');
    expect(summary).toContain('None selected');
    expect(summary).not.toContain('--- Contact Details ---');
  });
});

describe('surveyService (automated Google Sheets transmission)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const testResponse: DemoSurveyResponse = {
    overallRating: 10,
    evaluatorRole: 'clinician_gp',
    feelings: ['safe_grounded', 'apple_design'],
    pillarRatings: {
      patientInterview: 'excellent',
      clinicalBriefing: 'excellent',
      clinicianGate: 'excellent',
    },
    positiveFeedback: 'Outstanding Apple HIG styling.',
    constructiveFeedback: 'None, ready for pilot.',
    contactName: 'Dr. Sarah',
    contactEmail: 'sarah@nhs.net',
    submittedAt: '16:00',
    scenarioId: 'migraine_aura',
  };

  it('enriches the survey payload with human-readable labels', async () => {
    const { prepareSurveyPayload } = await import('../lib/surveyService');
    const enriched = prepareSurveyPayload(testResponse);

    expect(enriched.ratingLabel).toBe('Exceptional / Transformative');
    expect(enriched.roleLabel).toBe('Clinician / GP');
    expect(enriched.overallRating).toBe(10);
    expect(enriched.timestampIso).toBeDefined();
    expect(new Date(enriched.timestampIso).getTime()).not.toBeNaN();
  });

  it('formats custom other role in enriched payload', async () => {
    const { prepareSurveyPayload } = await import('../lib/surveyService');
    const customResponse: DemoSurveyResponse = {
      ...testResponse,
      evaluatorRole: 'other',
      evaluatorRoleOther: 'Clinical Safety Officer',
    };
    const enriched = prepareSurveyPayload(customResponse);
    expect(enriched.roleLabel).toBe('Other (Clinical Safety Officer)');
  });

  it('always backs up survey response to localStorage even when network succeeds', async () => {
    const { submitSurveyResponse } = await import('../lib/surveyService');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', forwarded: true, mode: 'streamed' }),
    });

    const result = await submitSurveyResponse(testResponse, {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.savedLocally).toBe(true);
    expect(result.streamedToSheet).toBe(true);

    const saved = loadSurveyResponse();
    expect(saved).not.toBeNull();
    expect(saved?.overallRating).toBe(10);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('gracefully survives network error without failing submission', async () => {
    const { submitSurveyResponse } = await import('../lib/surveyService');
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    const result = await submitSurveyResponse(testResponse, {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.savedLocally).toBe(true);
    expect(result.streamedToSheet).toBe(false);
    expect(result.error).toBe('Network offline');

    // Local storage still preserved
    const saved = loadSurveyResponse();
    expect(saved).not.toBeNull();
  });

  it('gracefully handles upstream HTTP errors without blocking user', async () => {
    const { submitSurveyResponse } = await import('../lib/surveyService');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ status: 'error' }),
    });

    const result = await submitSurveyResponse(testResponse, {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.savedLocally).toBe(true);
    expect(result.streamedToSheet).toBe(false);
    expect(result.error).toContain('502');
  });
});

describe('handleSurveyApiRequest (Serverless route logic)', () => {
  it('rejects missing or non-object payloads with 400', async () => {
    const { handleSurveyApiRequest } = await import('../../server/survey');
    const res1 = await handleSurveyApiRequest(null);
    expect(res1.status).toBe(400);

    const res2 = await handleSurveyApiRequest('invalid');
    expect(res2.status).toBe(400);
  });

  it('validates overallRating range between 1 and 10', async () => {
    const { handleSurveyApiRequest } = await import('../../server/survey');
    const resUnder = await handleSurveyApiRequest({ overallRating: 0, evaluatorRole: 'clinician_gp' });
    expect(resUnder.status).toBe(400);

    const resOver = await handleSurveyApiRequest({ overallRating: 11, evaluatorRole: 'clinician_gp' });
    expect(resOver.status).toBe(400);

    const resNonNum = await handleSurveyApiRequest({ overallRating: 'ten', evaluatorRole: 'clinician_gp' });
    expect(resNonNum.status).toBe(400);
  });

  it('returns local_only mode when SURVEY_WEBHOOK_URL is not configured', async () => {
    const { handleSurveyApiRequest } = await import('../../server/survey');
    const result = await handleSurveyApiRequest(
      { overallRating: 9, evaluatorRole: 'clinician_gp' },
      { webhookUrl: '' }
    );

    expect(result.status).toBe(200);
    expect(result.body.forwarded).toBe(false);
    expect(result.body.mode).toBe('local_only');
  });

  it('forwards payload to Google Sheets webhook when SURVEY_WEBHOOK_URL is set', async () => {
    const { handleSurveyApiRequest } = await import('../../server/survey');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success' }),
    });

    const payload = {
      overallRating: 9,
      evaluatorRole: 'clinician_gp',
      positiveFeedback: 'Great!',
    };

    const result = await handleSurveyApiRequest(payload, {
      webhookUrl: 'https://script.google.com/macros/s/TEST/exec',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result.status).toBe(200);
    expect(result.body.forwarded).toBe(true);
    expect(result.body.mode).toBe('streamed');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://script.google.com/macros/s/TEST/exec',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow',
      })
    );
  });

  it('returns 502 when upstream webhook fails', async () => {
    const { handleSurveyApiRequest } = await import('../../server/survey');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await handleSurveyApiRequest(
      { overallRating: 8, evaluatorRole: 'patient_public' },
      {
        webhookUrl: 'https://script.google.com/macros/s/TEST/exec',
        fetchFn: mockFetch as unknown as typeof fetch,
      }
    );

    expect(result.status).toBe(502);
    expect(result.body.status).toBe('error');
    expect(result.body.forwarded).toBe(false);
  });
});

