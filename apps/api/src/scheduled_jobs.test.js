import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import worker, { runScheduledJobs } from './index.js';

// The daily jobs must run the same whether Cloudflare's cron or another host's timer starts them.
describe('scheduled jobs', () => {
  let proxy;
  let env;

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = proxy.env;
  });

  afterAll(async () => {
    await proxy?.dispose();
  });

  it('is exported for any host to call, and Workers reaches it through scheduled()', async () => {
    expect(typeof runScheduledJobs).toBe('function');
    let waited;
    worker.scheduled({}, env, { waitUntil: (p) => (waited = p) });
    await waited;
  });

  it('runs both jobs and reports each one', async () => {
    const lines = [];
    const original = console.log;
    const originalError = console.error;
    console.log = (line) => lines.push(String(line));
    console.error = (line) => lines.push(String(line));
    try {
      await runScheduledJobs(env);
    } finally {
      console.log = original;
      console.error = originalError;
    }
    const done = lines.filter((l) => l.includes('cron_job_done')).map((l) => JSON.parse(l).job);
    expect(done).toEqual(['activateDue', 'runVccNotificationSweep']);
  });

  it('keeps going when the first job fails, so one broken job cannot stop the other', async () => {
    const lines = [];
    const original = console.log;
    const originalError = console.error;
    console.log = (line) => lines.push(String(line));
    console.error = (line) => lines.push(String(line));
    const unavailable = () => { throw new Error('database unavailable'); };
    const broken = { ...env, DB: { prepare: unavailable, batch: unavailable } };
    try {
      await expect(runScheduledJobs(broken)).resolves.toBeUndefined();
    } finally {
      console.log = original;
      console.error = originalError;
    }
    const failed = lines.filter((l) => l.includes('cron_job_failed')).map((l) => JSON.parse(l).job);
    expect(failed).toEqual(['activateDue', 'runVccNotificationSweep']);
  });
});
