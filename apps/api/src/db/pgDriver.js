// The connection to a real PostgreSQL server (Azure Database for PostgreSQL), in the shape createPgDatabase() expects:
// query(sql, params) -> { rows, affectedRows } and transaction(fn(tx)) with the same query() on one pooled connection.
import pg from 'pg';

const INT8 = 20; // BIGINT and COUNT(*): arrive as text unless parsed; SQLite hands back numbers.
const NUMERIC = 1700; // SUM() of integers

// Every write takes this lock first, so writes run one at a time as they do on SQLite/D1. The application numbers
// documents with "highest number + 1" and checks before it inserts; with many connections writing at once those
// patterns can hand out one number twice. 20-30 users do not need parallel writes.
const WRITE_LOCK_KEY = 8217001;

const numberParsers = (oid, format) => (oid === INT8 || oid === NUMERIC ? Number : pg.types.getTypeParser(oid, format));

// Reads (SELECT) never wait for the lock; anything else, including WITH, is treated as a write.
const READ_ONLY = /^\s*SELECT\b/i;

export const createPgDriver = ({ connectionString, max = 10, serializeWrites = true } = {}) => {
  const pool = new pg.Pool({ connectionString, max, types: { getTypeParser: numberParsers } });

  const runOn = (client) => async (sql, params = []) => {
    const res = await client.query(sql, params);
    return { rows: res.rows, affectedRows: res.rowCount ?? 0 };
  };

  const transaction = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (serializeWrites) await client.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK_KEY]);
      const result = await fn({ query: runOn(client) });
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };

  return {
    query: (sql, params) => (serializeWrites && !READ_ONLY.test(sql) ? transaction((tx) => tx.query(sql, params)) : runOn(pool)(sql, params)),
    transaction,
    close: () => pool.end()
  };
};
