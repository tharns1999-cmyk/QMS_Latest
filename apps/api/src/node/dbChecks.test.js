import { describe, it, expect } from 'vitest';
import { checkCollation } from './dbChecks.js';

const database = (row) => ({ prepare: () => ({ first: async () => row }) });

describe('database set-up check', () => {
  it('accepts a UTF-8 database that sorts by bytes, as SQLite did', async () => {
    for (const collation of ['C', 'POSIX', 'C.UTF-8', 'c.utf8']) {
      expect(await checkCollation(database({ collation, encoding: 'UTF8' }))).toMatchObject({ ok: true, problems: [] });
    }
  });

  it('refuses a language collation, which would order lists differently, and a non-UTF-8 encoding', async () => {
    const lang = await checkCollation(database({ collation: 'en_US.utf8', encoding: 'UTF8' }));
    expect(lang.ok).toBe(false);
    expect(lang.problems.join(' ')).toMatch(/en_US\.utf8/);
    const latin = await checkCollation(database({ collation: 'C', encoding: 'WIN1252' }));
    expect(latin.ok).toBe(false);
    expect(latin.problems.join(' ')).toMatch(/WIN1252/);
  });

  it('refuses a database it cannot describe', async () => {
    expect((await checkCollation(database(null))).ok).toBe(false);
  });
});
