// Checks made once at start-up, so a database that would quietly sort or compare differently is refused at once
// instead of showing lists in another order than the one people were used to.

import { migrationStatus } from '../db/pg/migrator.js';

// SQLite compares text byte by byte. In a UTF-8 database that is the "C" collation (or C.UTF-8, same code point order).
const BYTE_ORDER = /^(C|POSIX|C\.UTF-?8)$/i;

export const checkCollation = async (db) => {
  const row = await db.prepare('SELECT datcollate AS collation, pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = current_database()').first();
  const collation = row?.collation ?? 'unknown';
  const encoding = row?.encoding ?? 'unknown';
  const problems = [];
  if (!BYTE_ORDER.test(collation)) problems.push(`the database collation is "${collation}", not "C"`);
  if (!/^UTF-?8$/i.test(encoding)) problems.push(`the database encoding is "${encoding}", not UTF8`);
  return { ok: problems.length === 0, collation, encoding, problems };
};

// The schema must be exactly what this version of the code expects: nothing pending, nothing edited, nothing unknown.
// Starting new code on an old schema (or the reverse) fails later, in the middle of someone's work.
export const checkMigrations = async (db, migrations, compatSql) => {
  const status = await migrationStatus(async (sql) => (await db.prepare(sql).all()).results, migrations, compatSql);
  const problems = [];
  if (status.tableMissing) problems.push('the database has no schema_migrations table: it was not created by the data move');
  if (status.pending.length && !status.tableMissing) problems.push(`migrations not applied yet: ${status.pending.join(', ')}`);
  if (status.compatStale && !status.tableMissing) problems.push('compat.sql changed and has not been applied');
  if (status.edited.length) problems.push(`migrations edited after being applied: ${status.edited.join(', ')}`);
  if (status.unknown.length) problems.push(`the database has migrations this version does not have: ${status.unknown.join(', ')}`);
  if (status.outOfOrder.length) problems.push(`migrations numbered below an applied one: ${status.outOfOrder.join(', ')}`);
  return { ok: problems.length === 0, problems };
};
