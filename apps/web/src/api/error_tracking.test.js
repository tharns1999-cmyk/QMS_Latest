import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiGet, setToken } from './client';
import { createErrorReporter, MAX_REPORTS_PER_PAGE } from './errorReporter';

const json = (body, status, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

describe('API errors carry the server reference id', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setToken(null);
  });

  it('adds the reference id to a 5xx message once, and exposes status and requestId', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ error: 'การอัปโหลดล้มเหลว' }, 500, { 'X-Request-Id': 'req-1' }))));
    const err = await apiGet('/api/x').catch((e) => e);
    expect(err.message).toBe('การอัปโหลดล้มเหลว (รหัสอ้างอิง: req-1)');
    expect(err.status).toBe(500);
    expect(err.requestId).toBe('req-1');
  });

  it('does not repeat an id the server already put in the message', async () => {
    const message = 'เกิดข้อผิดพลาดในระบบ กรุณาแจ้งผู้ดูแลระบบพร้อมรหัสอ้างอิง req-2';
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ error: message, code: 'INTERNAL_ERROR', requestId: 'req-2' }, 500))));
    const err = await apiGet('/api/x').catch((e) => e);
    expect(err.message).toBe(message);
    expect(err.code).toBe('INTERNAL_ERROR');
  });

  it('leaves 4xx messages exactly as the server wrote them', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ error: 'กรุณาระบุเหตุผล' }, 400, { 'X-Request-Id': 'req-3' }))));
    const err = await apiGet('/api/x').catch((e) => e);
    expect(err.message).toBe('กรุณาระบุเหตุผล');
    expect(err.status).toBe(400);
  });
});

describe('createErrorReporter', () => {
  it('sends each distinct error once, with clipped fields', () => {
    const send = vi.fn(() => true);
    const report = createErrorReporter({ send });
    const error = Object.assign(new Error('boom'), { requestId: 'req-9' });
    expect(report('error', error)).toBe(true);
    expect(report('error', error)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ kind: 'error', message: 'boom', requestId: 'req-9' });
    report('render', { message: 'x'.repeat(900), stack: 'y'.repeat(5000) });
    const long = send.mock.calls[1][0];
    expect(long.message.length).toBe(500);
    expect(long.stack.length).toBe(2000);
  });

  it(`stops after ${MAX_REPORTS_PER_PAGE} reports per page so a loop cannot flood the log`, () => {
    const send = vi.fn(() => true);
    const report = createErrorReporter({ send });
    for (let i = 0; i < MAX_REPORTS_PER_PAGE + 5; i += 1) report('error', new Error(`e${i}`));
    expect(send).toHaveBeenCalledTimes(MAX_REPORTS_PER_PAGE);
  });

  it('ignores empty errors and does not count reports that could not be sent', () => {
    const send = vi.fn(() => false);
    const report = createErrorReporter({ send, max: 1 });
    expect(report('error', '')).toBe(false);
    expect(report('error', new Error('a'))).toBe(false);
    expect(report('error', new Error('b'))).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('sendErrorReport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
    // The token lives in sessionStorage, which survives resetModules; start each case signed out.
    sessionStorage.clear();
  });

  it('does nothing in demo mode (no API URL), so demo data never leaves the browser', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const client = await import('./client');
    client.setToken('t');
    expect(client.sendErrorReport({ kind: 'error', message: 'x' })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts to /api/client-errors with the token in API mode, and never throws when the network fails', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.test');
    vi.resetModules();
    const fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetch);
    const client = await import('./client');
    expect(client.sendErrorReport({ kind: 'error', message: 'x' })).toBe(false);
    client.setToken('t');
    expect(client.sendErrorReport({ kind: 'error', message: 'x' })).toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.test/api/client-errors');
    expect(init).toMatchObject({ method: 'POST', keepalive: true });
    expect(init.headers.Authorization).toBe('Bearer t');
    client.setToken(null);
  });
});
