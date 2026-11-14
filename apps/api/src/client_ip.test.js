import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { clientIp } from './index.js';

// The caller's address decides the per-address login limit, so only the header the platform itself sets may be believed.
const ask = async (headerSetting, headers) => {
  const app = new Hono();
  app.get('/ip', (c) => c.json({ ip: clientIp(c) ?? null }));
  const res = await app.request('/ip', { headers }, { CLIENT_IP_HEADER: headerSetting });
  return (await res.json()).ip;
};

describe('client address for the login limit', () => {
  it('reads the one header named in CLIENT_IP_HEADER', async () => {
    expect(await ask('cf-connecting-ip', { 'cf-connecting-ip': '203.0.113.9' })).toBe('203.0.113.9');
    expect(await ask('x-azure-clientip', { 'x-azure-clientip': '203.0.113.9' })).toBe('203.0.113.9');
  });

  it('ignores a header the platform does not set, so a caller cannot choose its own address', async () => {
    expect(await ask('x-azure-clientip', { 'cf-connecting-ip': '198.51.100.1', 'x-forwarded-for': '198.51.100.2' })).toBeNull();
    expect(await ask('cf-connecting-ip', { 'x-azure-clientip': '198.51.100.1' })).toBeNull();
  });

  it('has no address at all when nothing is configured', async () => {
    expect(await ask('', { 'cf-connecting-ip': '198.51.100.1', 'x-forwarded-for': '198.51.100.2' })).toBeNull();
    expect(await ask(undefined, { 'x-forwarded-for': '198.51.100.2' })).toBeNull();
  });

  it('takes the last hop of a forwarding list, the one our own proxy added, and drops a port', async () => {
    expect(await ask('x-forwarded-for', { 'x-forwarded-for': '198.51.100.7, 203.0.113.9:51234' })).toBe('203.0.113.9');
    expect(await ask('x-forwarded-for', { 'x-forwarded-for': '203.0.113.9' })).toBe('203.0.113.9');
    expect(await ask('X-Forwarded-For', { 'x-forwarded-for': '2001:db8::1' })).toBe('2001:db8::1');
  });
});
