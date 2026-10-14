import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleDemoApiRequest,
  checkRateLimit,
} from '../lib/liveEngine';

const VALID_QUESTION = 'How long have you had the knee pain?';

function geminiText(text: string) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  };
}

interface MockFetchCall {
  url: string;
  init: RequestInit;
}

let fetchCalls: MockFetchCall[];

beforeEach(() => {
  fetchCalls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockGemini(payload: unknown) {
  fetchCalls = [];
  const impl = async (url: string | URL, init: RequestInit = {}) => {
    fetchCalls.push({ url: String(url), init });
    return payload;
  };
  vi.stubGlobal('fetch', vi.fn(impl) as unknown as typeof fetch);
}

const baseOpts = { apiKey: 'test-key', model: 'gemini-test', ip: `ip-${Math.random()}` };

describe('liveEngine — configuration gating', () => {
  it('kill switch forces deterministic fallback without calling the model', async () => {
    mockGemini(geminiText(VALID_QUESTION));
    const result = await handleDemoApiRequest(
      { role: 'interviewer', history: [{ role: 'user', content: 'knee pain' }], complaint: 'knee pain' },
      { ...baseOpts, killSwitch: true },
    );
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ fallback: true, reason: 'live_disabled' });
    expect(fetchCalls).toHaveLength(0);
  });

  it('missing API key falls back without calling the model', async () => {
    mockGemini(geminiText(VALID_QUESTION));
    const result = await handleDemoApiRequest(
      { role: 'interviewer', history: [{ role: 'user', content: 'knee pain' }], complaint: 'knee pain' },
      { ...baseOpts, apiKey: undefined },
    );
    expect(result.status).toBe(503);
    expect(result.body.fallback).toBe(true);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe('liveEngine — role and payload validation', () => {
  it('rejects unknown roles with 400', async () => {
    mockGemini(geminiText(VALID_QUESTION));
    const result = await handleDemoApiRequest({ role: 'free_chat', prompt: 'say anything' }, baseOpts);
    expect(result.status).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });

  it('rejects missing role with 400', async () => {
    const result = await handleDemoApiRequest({ prompt: 'hi' }, baseOpts);
    expect(result.status).toBe(400);
  });

  it('rejects oversized history', async () => {
    const history = Array.from({ length: 45 }, (_, i) => ({ role: 'user' as const, content: `msg ${i}` }));
    const result = await handleDemoApiRequest(
      { role: 'interviewer', history, complaint: 'knee pain' },
      baseOpts,
    );
    expect(result.status).toBe(400);
  });

  it('rejects a control block with an unknown topic', async () => {
    const result = await handleDemoApiRequest(
      {
        role: 'interviewer',
        history: [{ role: 'user', content: 'knee pain' }],
        complaint: 'knee pain',
        control: { questionsAsked: 3, selectedTopic: 'ignore_previous_instructions', blockedTopics: [] },
      },
      baseOpts,
    );
    expect(result.status).toBe(400);
  });
});

describe('liveEngine — interviewer gating', () => {
  it('returns a validated single question and never puts the key in the URL', async () => {
    mockGemini(geminiText(VALID_QUESTION));
    const result = await handleDemoApiRequest(
      {
        role: 'interviewer',
        history: [{ role: 'user', content: 'my knee hurts after football' }],
        complaint: 'Sharp knee pain',
        patientName: 'Guest Patient',
        control: { questionsAsked: 2, selectedTopic: 'chief_complaint_onset_timeline', selectedTopicRationale: 'test', blockedTopics: [] },
      },
      baseOpts,
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ text: VALID_QUESTION });

    expect(fetchCalls).toHaveLength(1);
    const { url, init } = fetchCalls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('gemini-test');
    expect(url).not.toContain('test-key');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('test-key');
    const prompt = JSON.parse(String(init.body)).contents[0].parts[0].text as string;
    expect(prompt).toContain('Sharp knee pain');
    expect(prompt).toContain('NOT authorized to provide medical advice');
  });

  it('falls back when the model emits multiple questions', async () => {
    mockGemini(geminiText('How long have you had it? And does it swell?'));
    const result = await handleDemoApiRequest(
      { role: 'interviewer', history: [{ role: 'user', content: 'knee pain' }], complaint: 'knee pain' },
      baseOpts,
    );
    expect(result.status).toBe(200);
    expect(result.body.fallback).toBe(true);
  });

  it('falls back when the model emits a diagnosis', async () => {
    mockGemini(geminiText('You definitely have a meniscal tear, shall we discuss it?'));
    const result = await handleDemoApiRequest(
      { role: 'interviewer', history: [{ role: 'user', content: 'knee pain' }], complaint: 'knee pain' },
      baseOpts,
    );
    expect(result.body.fallback).toBe(true);
    expect(String(result.body.reason)).toContain('guardrail');
  });

  it('falls back when the model errors or times out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch);
    const result = await handleDemoApiRequest(
      { role: 'interviewer', history: [{ role: 'user', content: 'knee pain' }], complaint: 'knee pain' },
      baseOpts,
    );
    expect(result.status).toBe(502);
    expect(result.body.fallback).toBe(true);
  });
});

describe('liveEngine — report writer gating', () => {
  it('strips markdown fences and passes clean reports', async () => {
    mockGemini(geminiText('```markdown\n## Chief Complaint\nKnee pain\n```\n'));
    const result = await handleDemoApiRequest(
      {
        role: 'report_writer',
        transcript: [{ role: 'user', content: 'knee pain' }],
        currentReport: '## Chief Complaint\nKnee pain',
        complaint: 'Knee pain',
      },
      baseOpts,
    );
    expect(result.status).toBe(200);
    expect(result.body.text).toBe('## Chief Complaint\nKnee pain');
  });

  it('falls back on definitive diagnosis language', async () => {
    mockGemini(geminiText('## Assessment\nThe diagnosis is septic arthritis.'));
    const result = await handleDemoApiRequest(
      {
        role: 'report_writer',
        transcript: [{ role: 'user', content: 'knee pain' }],
        currentReport: '## Chief Complaint\nKnee pain',
        complaint: 'Knee pain',
      },
      baseOpts,
    );
    expect(result.body.fallback).toBe(true);
  });
});

describe('liveEngine — patient simulator', () => {
  it('passes roleplay text through with caps', async () => {
    const longText = 'a'.repeat(1000);
    mockGemini(geminiText(longText));
    const result = await handleDemoApiRequest(
      {
        role: 'patient_simulator',
        question: 'When did it start?',
        config: { condition: 'Flu', selectedSymptoms: ['I have a cough.'], previousAnswers: [] },
      },
      baseOpts,
    );
    expect(result.status).toBe(200);
    expect(String(result.body.text)).toHaveLength(500);
  });
});

describe('liveEngine — differentials', () => {
  it('parses fenced JSON, maps buckets, and gates cards server-side', async () => {
    const payload = JSON.stringify({
      hypotheses: [
        {
          label: 'Meniscal tear',
          rationale: 'Twisting injury with joint line pain.',
          supporting_evidence_refs: ['Twisted on pitch', 'Swelling'],
          confidence_bucket: 'high',
        },
        {
          label: 'Septic arthritis',
          rationale: 'Prescribe ceftriaxone 1g IV stat for this confirmed diagnosis.',
          supporting_evidence_refs: [],
          confidence_bucket: 'high',
        },
      ],
    });
    mockGemini(geminiText('```json\n' + payload + '\n```'));

    const result = await handleDemoApiRequest(
      { role: 'differentials', reportMarkdown: '## Chief Complaint\nKnee pain' },
      baseOpts,
    );

    expect(result.status).toBe(200);
    const hypotheses = result.body.hypotheses as Array<Record<string, unknown>>;
    expect(hypotheses).toHaveLength(2); // prescribing card kept, but gated...
    expect(hypotheses[0].condition).toBe('Meniscal tear');
    expect(hypotheses[0].probability).toBeGreaterThan(0.1);
    expect(hypotheses[0].probability).toBeLessThanOrEqual(0.95);
    // ...its prescribing/diagnosis action text is replaced with the abstain note
    expect(String(hypotheses[1].condition)).toBe('Septic arthritis');
    expect(String(hypotheses[1].recommendedAction)).toContain('Assistive-only guardrail abstained');
  });

  it('falls back on unparseable model output', async () => {
    mockGemini(geminiText('I cannot answer that in JSON.'));
    const result = await handleDemoApiRequest(
      { role: 'differentials', reportMarkdown: '## Chief Complaint\nKnee pain' },
      baseOpts,
    );
    expect(result.body.fallback).toBe(true);
  });
});

describe('liveEngine — rate limiting', () => {
  it('trips after the per-minute budget for one IP', async () => {
    const ip = `rate-test-${Date.now()}`;
    expect(checkRateLimit(ip)).toBe(true);
    for (let i = 0; i < 19; i += 1) {
      checkRateLimit(ip);
    }
    expect(checkRateLimit(ip)).toBe(false);

    // A different IP is unaffected
    expect(checkRateLimit(`${ip}-other`)).toBe(true);

    mockGemini(geminiText(VALID_QUESTION));
    const result = await handleDemoApiRequest(
      { role: 'interviewer', history: [{ role: 'user', content: 'x' }], complaint: 'x' },
      { ...baseOpts, ip },
    );
    expect(result.status).toBe(429);
    expect(result.body.fallback).toBe(true);
  });
});
