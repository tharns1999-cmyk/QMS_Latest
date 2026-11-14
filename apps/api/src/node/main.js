// Entry point for running the API as a service: `node src/node/main.js` with the settings in the environment.
import { readConfig } from './config.js';
import { buildEnv, createNodeServer } from './server.js';
import { checkCollation, checkMigrations } from './dbChecks.js';
import { loadMigrations } from '../db/pg/migrator.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const log = (level, msg, extra = {}) => console[level === 'error' ? 'error' : 'log'](JSON.stringify({ level, msg, at: new Date().toISOString(), ...extra }));

let config;
try {
  config = readConfig();
} catch (err) {
  log('error', 'config_invalid', { error: err.message });
  process.exit(1);
}

const { env, close } = buildEnv(config);
// Lists must come out in the order people knew from SQLite (byte order), which a database created with a language
// collation would change. ALLOW_ANY_COLLATION=1 is for a developer machine only.
try {
  const db = await checkCollation(env.DB);
  if (!db.ok && process.env.ALLOW_ANY_COLLATION !== '1') {
    log('error', 'database_set_up_wrong', { problems: db.problems, fix: 'create the database with LC_COLLATE C and ENCODING UTF8 (docs/ops/azure-database-setup.md)' });
    await close();
    process.exit(1);
  }
  if (!db.ok) log('warn', 'database_collation_ignored', { problems: db.problems });
  // The schema must match this version of the code; the deployment step is `pnpm run db:migrate:pg` (migrations-pg/README.md).
  const schema = await checkMigrations(
    env.DB,
    loadMigrations(fileURLToPath(new URL('../../migrations-pg/', import.meta.url))),
    readFileSync(new URL('../db/pg/compat.sql', import.meta.url), 'utf8')
  );
  if (!schema.ok) {
    log('error', 'database_schema_not_current', { problems: schema.problems, fix: 'run: pnpm --dir apps/api run db:migrate:pg' });
    await close();
    process.exit(1);
  }
} catch (err) {
  log('error', 'database_unreachable', { error: String(err?.message ?? err) });
  await close();
  process.exit(1);
}
// A missing container or no access to it should stop the start, not show up on the first upload.
try {
  await env.FILES.ready?.();
} catch (err) {
  log('error', 'file_store_unavailable', { error: String(err?.message ?? err) });
  await close();
  process.exit(1);
}
if (!config.blob) log('warn', 'file_store_is_a_folder', { dir: config.filesDir, effect: 'files are kept on this host, not in Azure Blob Storage' });
const server = await createNodeServer({
  env,
  port: config.port,
  webDistDir: config.webDistDir,
  scheduler: config.runScheduler,
  onError: (err) => log('error', 'scheduler_failed', { error: String(err?.message ?? err) })
});
log('info', 'api_started', { port: server.port, scheduler: config.runScheduler, web: Boolean(config.webDistDir), auth: config.authMode, files: config.blob ? `blob:${config.blob.container}` : 'folder', clientIpHeader: config.clientIpHeader || null });
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
