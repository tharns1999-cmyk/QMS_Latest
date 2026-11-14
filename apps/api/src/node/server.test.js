import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { hashPassword } from '../password.js';
import { createNodeServer, startScheduler } from './server.js';
import { createDiskStore } from './diskStore.js';

// The API behind a real HTTP port, started the way a Node host starts it, with the bindings handed over as plain values.
describe('API on a Node host', () => {
  let proxy;
  let server;
  let base;
  let tmp;
  const email = 'node-host@test.local';
  const password = 'node-host-pass-123';
  const ask = (path, init) => fetch(`${base}${path}`, init);

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    tmp = mkdtempSync(join(tmpdir(), 'qms-node-'));
    mkdirSync(join(tmp, 'web'));
    writeFileSync(join(tmp, 'web', 'index.html'), '<!doctype html><title>QMS</title>');
    writeFileSync(join(tmp, 'web', '_headers'), '/*\n  X-Frame-Options: DENY\n');

    const hash = await hashPassword(password);
    await proxy.env.DB.prepare(`INSERT OR IGNORE INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
      VALUES ('NODE-HOST', '[ข้อมูลทดสอบ] Node host', ?, ?, 'USER', 2, 'DC', '["DC"]', 0)`).bind(email, hash).run();

    const env = {
      DB: proxy.env.DB,
      FILES: createDiskStore(join(tmp, 'files')),
      JWT_SECRET: 'node-host-secret-node-host-secret-00',
      ALLOWED_ORIGIN: 'https://qms.example.com',
      CLIENT_IP_HEADER: 'x-azure-clientip'
    };
    server = await createNodeServer({ env, port: 0, hostname: '127.0.0.1', webDistDir: join(tmp, 'web'), scheduler: false });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await server?.stop();
    await proxy?.dispose();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('reports itself healthy when the database answers', async () => {
    const res = await ask('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('signs a user in over HTTP and recognises the token on the next request', async () => {
    const login = await ask('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    expect(login.status).toBe(200);
    const { token } = await login.json();
    const me = await ask('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    expect(me.status).toBe(200);
    expect((await me.json()).user.id).toBe('NODE-HOST');
    expect((await ask('/api/auth/me')).status).toBe(401);
  });

  it('keeps the API security headers and the allowed origin from the settings', async () => {
    const res = await ask('/api/auth/me', { headers: { Origin: 'https://qms.example.com' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://qms.example.com');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    const other = await ask('/api/auth/me', { headers: { Origin: 'https://evil.example' } });
    expect(other.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
  });

  it('limits failed logins per caller address using only the configured header', async () => {
    const attempt = (ip, header) =>
      ask('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [header]: ip },
        body: JSON.stringify({ email: 'nobody@test.local', password: 'wrong-wrong' })
      });
    for (let i = 0; i < 10; i++) expect((await attempt('203.0.113.77', 'x-azure-clientip')).status).toBe(401);
    expect((await attempt('203.0.113.77', 'x-azure-clientip')).status).toBe(429);
    // A caller who invents a header the host does not set is counted under no address, not under the one it chose.
    expect((await attempt('203.0.113.88', 'cf-connecting-ip')).status).toBe(401);
  });

  it('serves the web app for pages and answers unknown API paths with JSON 404', async () => {
    const page = await ask('/vcc/assets');
    expect(page.status).toBe(200);
    expect(page.headers.get('x-frame-options')).toBe('DENY');
    expect(await page.text()).toContain('<title>QMS</title>');
    const missing = await ask('/api/nothing-here');
    expect(missing.status).toBe(404);
  });

  it('answers 503 on /healthz when the database is down, and 404 elsewhere with no web app configured', async () => {
    const broken = await createNodeServer({
      env: { DB: { prepare: () => ({ first: () => Promise.reject(new Error('down')) }) } },
      port: 0,
      hostname: '127.0.0.1',
      scheduler: false
    });
    try {
      const res = await fetch(`http://127.0.0.1:${broken.port}/healthz`);
      expect(res.status).toBe(503);
      expect((await fetch(`http://127.0.0.1:${broken.port}/anything`)).status).toBe(404);
    } finally {
      await broken.stop();
    }
  });
});

describe('daily timer', () => {
  it('runs once a day, at or after 17:05 UTC (00:05 Thailand), and not before', async () => {
    let runs = 0;
    let clock = '2026-11-14T17:04:59Z';
    const timer = startScheduler({ run: async () => { runs += 1; }, now: () => new Date(clock), tickMs: 3_600_000 });
    try {
      await timer.tick();
      expect(runs).toBe(0);
      clock = '2026-11-14T17:05:00Z';
      await timer.tick();
      await timer.tick();
      expect(runs).toBe(1);
      clock = '2026-11-14T23:00:00Z';
      await timer.tick();
      expect(runs).toBe(1);
      clock = '2026-11-15T17:05:00Z';
      await timer.tick();
      expect(runs).toBe(2);
    } finally {
      timer.stop();
    }
  });

  it('tries again on the next tick when a run fails, without overlapping runs', async () => {
    let attempts = 0;
    let concurrent = 0;
    let peak = 0;
    const errors = [];
    const timer = startScheduler({
      run: async () => {
        attempts += 1;
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent -= 1;
        if (attempts === 1) throw new Error('database unavailable');
      },
      now: () => new Date('2026-11-14T18:00:00Z'),
      tickMs: 3_600_000,
      log: (err) => errors.push(err.message)
    });
    try {
      await Promise.all([timer.tick(), timer.tick()]);
      expect(attempts).toBe(1);
      expect(errors).toEqual(['database unavailable']);
      await timer.tick();
      expect(attempts).toBe(2);
      await timer.tick();
      expect(attempts).toBe(2);
      expect(peak).toBe(1);
    } finally {
      timer.stop();
    }
  });
});
