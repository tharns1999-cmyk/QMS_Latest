import { describe, it, expect } from 'vitest';
import { toPostgres } from './pgAdapter.js';

const sql = (text) => toPostgres(text).replace(/\s+/g, ' ');

// SQLite puts NULL first when ascending and last when descending; PostgreSQL does the opposite unless told.
describe('ORDER BY keeps SQLite NULL placement', () => {
  it('states it for every key, ascending by default', () => {
    expect(sql('SELECT id FROM users ORDER BY emp_id')).toBe('SELECT id FROM users ORDER BY emp_id NULLS FIRST');
    expect(sql('SELECT id FROM users WHERE a = ? ORDER BY emp_id DESC, id ASC LIMIT 5')).toBe(
      'SELECT id FROM users WHERE a = $1 ORDER BY emp_id DESC NULLS LAST, id ASC NULLS FIRST LIMIT 5'
    );
  });

  it('handles subqueries, expressions and limits, each ORDER BY on its own', () => {
    expect(sql('SELECT id FROM (SELECT id FROM users ORDER BY emp_id LIMIT 2) ORDER BY id')).toBe(
      'SELECT id FROM (SELECT id FROM users ORDER BY emp_id NULLS FIRST LIMIT 2) ORDER BY id NULLS FIRST'
    );
    expect(sql('SELECT * FROM a WHERE x IN (SELECT y FROM b ORDER BY z DESC) ORDER BY q')).toBe(
      'SELECT * FROM a WHERE x IN (SELECT y FROM b ORDER BY z DESC NULLS LAST) ORDER BY q NULLS FIRST'
    );
    expect(sql('SELECT * FROM t ORDER BY (CASE WHEN a = 1 THEN 0 ELSE 1 END), b DESC LIMIT ? OFFSET ?')).toBe(
      'SELECT * FROM t ORDER BY (CASE WHEN a = 1 THEN 0 ELSE 1 END) NULLS FIRST, b DESC NULLS LAST LIMIT $1 OFFSET $2'
    );
    expect(sql('SELECT a FROM t UNION ALL SELECT b FROM u ORDER BY 1')).toBe('SELECT a FROM t UNION ALL SELECT b FROM u ORDER BY 1 NULLS FIRST');
    expect(sql('SELECT x, ROW_NUMBER() OVER (PARTITION BY a ORDER BY b DESC) AS n FROM t ORDER BY x')).toBe(
      'SELECT x, ROW_NUMBER() OVER (PARTITION BY a ORDER BY b DESC NULLS LAST) AS n FROM t ORDER BY x NULLS FIRST'
    );
  });

  it('leaves an explicit choice, and text inside a string, alone', () => {
    expect(sql('SELECT * FROM a ORDER BY name NULLS LAST')).toBe('SELECT * FROM a ORDER BY name NULLS LAST');
    expect(sql("SELECT * FROM t WHERE n = 'ORDER BY x' ORDER BY y")).toBe("SELECT * FROM t WHERE n = 'ORDER BY x' ORDER BY y NULLS FIRST");
  });

  it('does not touch a statement without ORDER BY', () => {
    expect(sql('SELECT id FROM users WHERE a = ?')).toBe('SELECT id FROM users WHERE a = $1');
  });
});
