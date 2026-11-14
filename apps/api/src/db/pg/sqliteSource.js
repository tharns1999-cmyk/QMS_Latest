// Reads a SQLite database for the data move without touching it: either a database file (read-only) or the SQL text
// that `wrangler d1 export` writes, which is loaded into memory.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export const openSqliteSource = (path) => {
  let db;
  if (/\.sql$/i.test(path)) {
    db = new DatabaseSync(':memory:');
    db.exec(readFileSync(path, 'utf8'));
  } else {
    db = new DatabaseSync(path, { readOnly: true });
  }
  return {
    // Integers come back exact (bigint), so a value above 2^53 cannot be rounded on the way.
    all: async (sql) => {
      const statement = db.prepare(sql);
      statement.setReadBigInts(true);
      return statement.all();
    },
    close: () => db.close()
  };
};
