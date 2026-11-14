// Runs the same API as the Cloudflare Worker on an ordinary Node host. index.js is not changed: the host only has to
// pass the bindings the Worker would have received (DB, FILES and the plain settings) to worker.fetch().
import { serve } from '@hono/node-server';
import worker, { runScheduledJobs } from '../index.js';
import { createPgDatabase } from '../db/pgAdapter.js';
import { createPgDriver } from '../db/pgDriver.js';
import { createBlobStore } from './blobStore.js';
import { createDiskStore } from './diskStore.js';
import { createStaticHandler } from './staticFiles.js';

// What the Worker gets from wrangler.jsonc and its bindings, built from the host's settings.
export const buildEnv = (config) => {
  const driver = createPgDriver({ connectionString: config.databaseUrl, max: config.poolMax });
  return {
    env: {
      DB: createPgDatabase(driver),
      FILES: config.blob ? createBlobStore(config.blob) : createDiskStore(config.filesDir),
      JWT_SECRET: config.jwtSecret,
      ALLOWED_ORIGIN: config.allowedOrigin,
      CLIENT_IP_HEADER: config.clientIpHeader
    },
    close: () => driver.close()
  };
};

// The daily jobs (wrangler.jsonc runs them at 17:05 UTC, 00:05 Thailand). A host with its own timer can switch this off
// and call runScheduledJobs() itself. If two copies of the API ran at once, both would run the jobs; the jobs only
// act on rows still waiting, so the second pass finds nothing to do.
export const startScheduler = ({ run, now = () => new Date(), tickMs = 30_000, hourUtc = 17, minuteUtc = 5, log = () => {} }) => {
  let lastDay = null;
  let running = false;
  const tick = async () => {
    const t = now();
    const day = t.toISOString().slice(0, 10);
    const due = t.getUTCHours() * 60 + t.getUTCMinutes() >= hourUtc * 60 + minuteUtc;
    if (!due || lastDay === day || running) return;
    running = true;
    lastDay = day;
    try {
      await run();
    } catch (err) {
      lastDay = null; // try again on the next tick
      log(err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, tickMs);
  timer.unref();
  return { tick, stop: () => clearInterval(timer) };
};

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const createRequestHandler = ({ env, web }) => async (request) => {
  const { pathname } = new URL(request.url);
  if (pathname === '/healthz') {
    try {
      await env.DB.prepare('SELECT 1 AS ok').first();
      return json(200, { status: 'ok' });
    } catch {
      return json(503, { status: 'database unavailable' });
    }
  }
  if (pathname.startsWith('/api/')) return worker.fetch(request, env);
  if (web) return web(request);
  return json(404, { error: 'Not found' });
};

export const createNodeServer = async ({ env, port, webDistDir, scheduler = true, onError = console.error, hostname }) => {
  const web = webDistDir ? await createStaticHandler(webDistDir) : null;
  const handler = createRequestHandler({ env, web });
  const server = serve({ fetch: handler, port, hostname });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const jobs = scheduler ? startScheduler({ run: () => runScheduledJobs(env), log: onError }) : null;
  return {
    port: server.address().port,
    scheduler: jobs,
    stop: () =>
      new Promise((resolve) => {
        jobs?.stop();
        server.close(() => resolve());
        server.closeAllConnections?.();
      })
  };
};
