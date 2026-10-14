import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../../api/gemini';

function makeRes() {
  const res = {
    statusCode: 0,
    payload: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.payload = body;
    },
  };
  return res;
}

describe('api/gemini handler', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('rejects non-POST requests with 405', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, body: null }, res);
    expect(res.statusCode).toBe(405);
    expect(res.payload).toEqual({ fallback: true, reason: 'method_not_allowed' });
  });

  it('reports not_configured (fallback) when no server key is present', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('DEMO_LIVE_KILL_SWITCH', '');
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.5, 70.41.3.1' },
        body: { role: 'interviewer', history: [{ role: 'user', content: 'hi' }], complaint: 'hi' },
      },
      res,
    );
    expect(res.statusCode).toBe(503);
    expect(res.payload).toEqual({ fallback: true, reason: 'not_configured' });
  });

  it('forces fallback when the kill switch is set, without calling the model', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'k');
    vi.stubEnv('DEMO_LIVE_KILL_SWITCH', 'true');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { role: 'interviewer' } }, res);
    expect(res.statusCode).toBe(503);
    expect(res.payload).toEqual({ fallback: true, reason: 'live_disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
