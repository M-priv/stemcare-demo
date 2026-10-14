// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLiveMode, callDemoApi, requestInterviewerTurn } from '../lib/demoApi';
import { initializeChatSession, processPatientMessage } from '../lib/medgemmaChatService';
import { FALLBACK_QUESTIONS } from '../lib/interviewPrioritization';

describe('isLiveMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false by default (deterministic demo)', () => {
    vi.stubEnv('VITE_DEMO_LIVE_MODE', '');
    expect(isLiveMode()).toBe(false);
  });

  it('is true only when explicitly opted in', () => {
    vi.stubEnv('VITE_DEMO_LIVE_MODE', 'true');
    expect(isLiveMode()).toBe(true);
    vi.stubEnv('VITE_DEMO_LIVE_MODE', 'false');
    expect(isLiveMode()).toBe(false);
  });
});

describe('callDemoApi — failure contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns payload on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'How severe is the pain?' }),
    })) as unknown as typeof fetch);
    const result = await callDemoApi<{ text?: string }>('interviewer', {});
    expect(result?.text).toBe('How severe is the pain?');
  });

  it('returns null on the server fallback flag', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ fallback: true, reason: 'guardrail_abstain' }),
    })) as unknown as typeof fetch);
    expect(await callDemoApi('interviewer', {})).toBeNull();
  });

  it('returns null on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 })) as unknown as typeof fetch);
    expect(await callDemoApi('interviewer', {})).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network down');
    }) as unknown as typeof fetch);
    expect(await callDemoApi('interviewer', {})).toBeNull();
  });
});

describe('chatService in live mode — gates and fallback', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEMO_LIVE_MODE', 'true');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('uses a server-provided question that passes both gates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'On a scale of 1 to 10, how bad is the pain?' }),
    })) as unknown as typeof fetch);

    let state = initializeChatSession('', 'Guest Patient');
    const result = await processPatientMessage(state, 'Sharp knee pain after football');
    expect(result.assistantReply.content).toBe('On a scale of 1 to 10, how bad is the pain?');
  });

  it('falls back to the deterministic question when the model answer violates policy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'You definitely have gout, how long have you had it?' }),
    })) as unknown as typeof fetch);

    let state = initializeChatSession('', 'Guest Patient');
    const result = await processPatientMessage(state, 'Sharp knee pain after football');
    // The diagnosis assertion is rejected client-side; deterministic engine answers.
    expect(result.assistantReply.content).not.toContain('gout');
    expect(result.assistantReply.content.endsWith('?')).toBe(true);
  });

  it('falls back to the deterministic question when the proxy is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network down');
    }) as unknown as typeof fetch);

    const state = initializeChatSession('', 'Guest Patient');
    const result = await processPatientMessage(state, 'Sharp knee pain after football');
    // The reply must be one of the policy engine's fixed fallback questions
    // (the deterministic engine, not model output).
    expect(Object.values(FALLBACK_QUESTIONS)).toContain(result.assistantReply.content);
  });

  it('never routes the red-flag path through the live proxy', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'anything' }),
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const state = initializeChatSession('', 'Guest Patient');
    const result = await processPatientMessage(state, 'I want to kill myself');
    expect(result.redFlagDetected).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled(); // emergency gate is local-only
  });
});

describe('requestInterviewerTurn — payload shape', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends role + transcript to the proxy, not to any model host', async () => {
    vi.stubEnv('VITE_DEMO_LIVE_MODE', 'true');
    let capturedUrl = '';
    let capturedBody = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = String(init?.body ?? '');
      return { ok: true, json: async () => ({ text: 'ok?' }) };
    }) as unknown as typeof fetch);

    const result = await requestInterviewerTurn({
      history: [{ role: 'user', content: 'knee pain', timestamp: '10:00' }],
      complaint: 'knee pain',
    });
    expect(result).toBe('ok?');
    expect(capturedUrl).toContain('/api/gemini');
    expect(capturedUrl).not.toContain('googleapis');
    const body = JSON.parse(capturedBody);
    expect(body.role).toBe('interviewer');
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).not.toHaveProperty('timestamp');
  });
});
