// Entry point for running the API as a service: `node src/node/main.js` with the settings in the environment.
import { readConfig } from './config.js';
import { buildEnv, createNodeServer } from './server.js';

const log = (level, msg, extra = {}) => console[level === 'error' ? 'error' : 'log'](JSON.stringify({ level, msg, at: new Date().toISOString(), ...extra }));

let config;
try {
  config = readConfig();
} catch (err) {
  log('error', 'config_invalid', { error: err.message });
  process.exit(1);
}

const { env, close } = buildEnv(config);
const server = await createNodeServer({
  env,
  port: config.port,
  webDistDir: config.webDistDir,
  scheduler: config.runScheduler,
  onError: (err) => log('error', 'scheduler_failed', { error: String(err?.message ?? err) })
});
log('info', 'api_started', { port: server.port, scheduler: config.runScheduler, web: Boolean(config.webDistDir), clientIpHeader: config.clientIpHeader || null });
if (!config.clientIpHeader) log('warn', 'client_ip_header_not_set', { effect: 'the per-address limit on failed logins is not applied' });

let stopping = false;
const shutdown = async (signal) => {
  if (stopping) return;
  stopping = true;
  log('info', 'api_stopping', { signal });
  // Let requests in flight finish, then release the database connections.
  await server.stop();
  await close();
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
