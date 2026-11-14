import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

// Numbers on documents are handed out by the server as "highest so far + 1". Many people submitting at the same moment
// must never receive the same number, whichever database is underneath.
describe('numbers stay unique when many requests arrive at once', () => {
  let proxy;
  let env;
  let token;
  const COUNT = 20;
  const post = async (path, body) => {
    const res = await app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }, env);
    return { status: res.status, body: await res.json() };
  };
  const dar = (over) => ({ type: 'NEW', doc_type: 'WI', department: 'CNQ', name: '[ข้อมูลทดสอบ] เลขซ้ำ', reason: 'ทดสอบ', reviewer_id: 'CN-REV', approver_id: 'CN-APP', ...over });

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword('concurrent-pass');
    await env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th) VALUES ('CNQ', '[ข้อมูลทดสอบ] ทดสอบเลข')").run();
    await env.DB.batch(
      [['CN-REQ', 2], ['CN-REV', 4], ['CN-APP', 5]].map(([id, level]) =>
        env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
          VALUES (?, ?, ?, ?, 'USER', ?, 'CNQ', '["CNQ"]', 0)`).bind(id, id, `${id}@test.local`, hash, level))
    );
    const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'CN-REQ@test.local', password: 'concurrent-pass' }) }, env);
    token = (await res.json()).token;
  });

  afterAll(() => proxy?.dispose());

  it('gives every request its own DAR number and its own document code', async () => {
    const results = await Promise.all(Array.from({ length: COUNT }, () => post('/api/dars', dar({ doc_type: 'SD', doc_code: 'SD-CNQ-01' }))));
    expect(results.map((r) => r.status)).toEqual(Array(COUNT).fill(201));

    const numbers = results.map((r) => r.body.dar.dar_no);
    expect(new Set(numbers).size).toBe(COUNT);
    const sequence = numbers.map((n) => Number(n.split('-')[2])).sort((a, b) => a - b);
    expect(sequence[COUNT - 1] - sequence[0]).toBe(COUNT - 1); // no gaps, no repeats

    const codes = results.map((r) => r.body.dar.doc_code);
    expect(new Set(codes).size).toBe(COUNT);
    expect([...codes].sort()).toEqual(Array.from({ length: COUNT }, (_, i) => `SD-CNQ-${String(i + 1).padStart(2, '0')}`));
  });
});
