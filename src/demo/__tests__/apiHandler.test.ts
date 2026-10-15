import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../server/gemini';

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

  it('supports Web Standard Request/Response objects', async () => {
    const getReq = new Request('https://demo.local/api/gemini', { method: 'GET' });
    const getRes = await handler(getReq);
    expect(getRes).toBeInstanceOf(Response);
    expect((getRes as Response).status).toBe(405);
    expect(await (getRes as Response).json()).toEqual({ fallback: true, reason: 'method_not_allowed' });

    vi.stubEnv('GEMINI_API_KEY', '');
    const postReq = new Request('https://demo.local/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'interviewer' }),
    });
    const postRes = await handler(postReq);
    expect(postRes).toBeInstanceOf(Response);
    expect((postRes as Response).status).toBe(503);
    expect(await (postRes as Response).json()).toEqual({ fallback: true, reason: 'not_configured' });
  });

  it('parses stringified JSON body correctly', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const res = makeRes();
    await handler(
      {
        method: 'POST',
        headers: {},
        body: JSON.stringify({ role: 'interviewer' }),
      },
      res,
    );
    expect(res.statusCode).toBe(503);
    expect(res.payload).toEqual({ fallback: true, reason: 'not_configured' });
  });
});
