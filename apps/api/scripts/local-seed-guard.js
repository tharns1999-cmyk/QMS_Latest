// The local seed SQL creates accounts with the password 1234. It starts with GUARD_SQL, which fails unless the database holds the
// marker row. Only `pnpm run db:seed:local` writes that marker (MARKER_SQL, into the local D1 only), so running the seed file
// by hand against Cloudflare (`--remote`) stops at the first statement instead of creating weak accounts.
export const MARKER_SQL = "INSERT OR REPLACE INTO settings (key, value) VALUES ('local_seed_allowed', '1');";
export const GUARD_SQL = [
  'DROP TABLE IF EXISTS _seed_guard;',
  'CREATE TABLE _seed_guard (ok INTEGER CHECK (ok = 1));',
  "INSERT INTO _seed_guard SELECT COUNT(*) FROM settings WHERE key = 'local_seed_allowed';",
  'DROP TABLE _seed_guard;'
].join('\n');
