// Checks made once at start-up, so a database that would quietly sort or compare differently is refused at once
// instead of showing lists in another order than the one people were used to.

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
