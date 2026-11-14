import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';

// The database rules the application relies on, stated without going through the API.
// Any database that replaces D1 has to meet the same expectations: the SQL and the client calls here may be
// reworded for it, the expected outcomes may not, so do not loosen one to make a port pass.
describe('database contract', () => {
  let proxy;
  let db;
  const ADMIN_A = 'DBC-ADMIN-A';
  const ADMIN_B = 'DBC-ADMIN-B';
  const DEPT = 'DBCT';

  const insertUser = (id, email) =>
    db
      .prepare("INSERT INTO users (id, name, email, password_hash, primary_department) VALUES (?, ?, ?, 'x', ?)")
      .bind(id, `[ข้อมูลทดสอบ] ${id}`, email, DEPT);

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    db = proxy.env.DB;
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO departments (code, name_th) VALUES (?, '[ข้อมูลทดสอบ] สัญญาฐานข้อมูล')").bind(DEPT),
      insertUser(ADMIN_A, 'dbc-admin-a@contract.local'),
      insertUser(ADMIN_B, 'dbc-admin-b@contract.local')
    ]);
  });

  afterAll(async () => {
    // Leave the shared test database as it was found; a row still referenced elsewhere simply stays.
    for (const sql of [`DELETE FROM users WHERE id IN ('${ADMIN_A}', '${ADMIN_B}')`, `DELETE FROM departments WHERE code = '${DEPT}'`]) {
      await db?.prepare(sql).run().catch(() => {});
    }
    await proxy?.dispose();
  });

  describe('inventory', () => {
    it('has exactly the protective triggers the port must reproduce', async () => {
      const { results } = await db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all();
      expect(results.map((r) => `${r.tbl_name}.${r.name}`)).toEqual([
        'audit_log.audit_log_no_delete',
        'audit_log.audit_log_no_update',
        'module_permission_grants.module_last_platform_admin',
        'vcc_annual_plans.trg_guard_vcc_plan_approval',
        'vcc_annual_plans.trg_prevent_delete_approved_annual_plan',
        'vcc_annual_plan_items.trg_prevent_delete_approved_plan_item',
        'vcc_plan_cycles.trg_prevent_delete_closed_plan_cycle',
        'vcc_work_orders.trg_prevent_delete_closed_work_order',
        'vcc_annual_plans.trg_prevent_tamper_approved_annual_plan',
        'vcc_annual_plan_items.trg_prevent_update_approved_plan_item'
      ]);
    });

    it('has exactly the tables the port must carry over', async () => {
      const { results } = await db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name")
        .all();
      expect(results.map((r) => r.name)).toEqual([
        'acknowledgements',
        'approval_matrix',
        'audit_log',
        'controlled_copies',
        'dars',
        'departments',
        'distribution_locations',
        'documents',
        'module_configuration',
        'module_departments',
        'module_permission_grants',
        'periodic_reviews',
        'recovery_codes',
        'settings',
        'user_signatures',
        'users',
        'vcc_annual_plan_items',
        'vcc_annual_plans',
        'vcc_assets',
        'vcc_notifications',
        'vcc_plan_cycles',
        'vcc_work_order_amendment_requests',
        'vcc_work_order_amendments',
        'vcc_work_order_certificates',
        'vcc_work_orders'
      ]);
    });
  });

  describe('constraints', () => {
    it('rejects a row that points at a missing parent', async () => {
      await expect(
        db.prepare("INSERT INTO vcc_annual_plans (id, plan_year, department, title) VALUES ('DBC-PLAN-FK', 2000, 'DBC-NO-SUCH-DEPT', 't')").run()
      ).rejects.toThrow(/FOREIGN KEY/i);
    });

    it('rejects a status outside the allowed list', async () => {
      await expect(
        db.prepare("INSERT INTO vcc_annual_plans (id, plan_year, department, title, status) VALUES ('DBC-PLAN-CHK', 2000, ?, 't', 'BOGUS')").bind(DEPT).run()
      ).rejects.toThrow(/CHECK/i);
    });

    it('treats e-mail addresses as the same account whatever their letter case', async () => {
      await expect(insertUser('DBC-ADMIN-A2', 'DBC-Admin-A@Contract.LOCAL').run()).rejects.toThrow(/UNIQUE/i);
      const row = await db.prepare('SELECT id FROM users WHERE email = ?').bind('DBC-ADMIN-A@CONTRACT.LOCAL').first();
      expect(row?.id).toBe(ADMIN_A);
    });
  });

  describe('batches', () => {
    it('applies none of a batch when one statement fails', async () => {
      await expect(
        db.batch([
          db.prepare("INSERT INTO departments (code, name_th) VALUES ('DBC-ROLLBACK', '[ข้อมูลทดสอบ] ต้องไม่ถูกบันทึก')"),
          db.prepare("INSERT INTO departments (code, name_th, status) VALUES ('DBC-ROLLBACK-2', 'x', 'BOGUS')")
        ])
      ).rejects.toThrow(/CHECK/i);
      expect(await db.prepare("SELECT code FROM departments WHERE code LIKE 'DBC-ROLLBACK%'").first()).toBeNull();
    });

    // The approval handlers pair a guarded UPDATE with an audit INSERT in one batch; the audit row must exist
    // exactly when the UPDATE changed a row, so a lost race leaves no false record.
    const guardedUpdateWithAudit = (fromName, marker) =>
      db.batch([
        db.prepare("UPDATE departments SET name_en = 'changed' WHERE code = ? AND name_en = ?").bind(DEPT, fromName),
        db.prepare("INSERT INTO audit_log (actor_id, action, details) SELECT NULL, 'DB_CONTRACT_TEST', ? WHERE changes() > 0").bind(marker)
      ]);
    const auditCount = async (marker) =>
      (await db.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'DB_CONTRACT_TEST' AND details = ?").bind(marker).first()).n;

    it('writes the audit row only when the guarded update took effect', async () => {
      // Details are JSON like every real audit row: other statements read them with json_extract and fail on plain text.
      const marker = JSON.stringify({ test: `[ข้อมูลทดสอบ] ${Date.now()}` });
      await db.prepare("UPDATE departments SET name_en = '' WHERE code = ?").bind(DEPT).run();

      await guardedUpdateWithAudit('not-the-current-value', marker);
      expect(await auditCount(marker)).toBe(0);

      await guardedUpdateWithAudit('', marker);
      expect(await auditCount(marker)).toBe(1);

      // Second caller of the same transition loses the race: no change, no second audit row.
      await guardedUpdateWithAudit('', marker);
      expect(await auditCount(marker)).toBe(1);
    });
  });

  describe('change counts', () => {
    const guard = (fromName) => db.prepare("UPDATE departments SET name_en = 'changed' WHERE code = ? AND name_en = ?").bind(DEPT, fromName);
    const reset = () => db.prepare("UPDATE departments SET name_en = '' WHERE code = ?").bind(DEPT).run();
    const extra = (code) => db.prepare("INSERT INTO departments (code, name_th) SELECT ?, '[ข้อมูลทดสอบ] ลูกโซ่' WHERE changes() > 0").bind(code);
    const exists = async (code) => Boolean(await db.prepare('SELECT 1 AS x FROM departments WHERE code = ?').bind(code).first());
    const drop = (...codes) => Promise.all(codes.map((code) => db.prepare('DELETE FROM departments WHERE code = ?').bind(code).run()));

    // Two-factor enrolment and document activation chain several follow-ups, each reading the statement before it.
    it('carries a guarded update through a chain of follow-up statements', async () => {
      await reset();
      await db.batch([guard('not-the-current-value'), extra('DBC-CHAIN-1'), extra('DBC-CHAIN-2')]);
      expect([await exists('DBC-CHAIN-1'), await exists('DBC-CHAIN-2')]).toEqual([false, false]);

      await db.batch([guard(''), extra('DBC-CHAIN-1'), extra('DBC-CHAIN-2')]);
      expect([await exists('DBC-CHAIN-1'), await exists('DBC-CHAIN-2')]).toEqual([true, true]);
      await drop('DBC-CHAIN-1', 'DBC-CHAIN-2');
    });

    // VCC and module governance put this statement after a guarded update: no change means the whole batch is undone.
    const failIfUnchanged = () => db.prepare("SELECT json(CASE WHEN changes() = 0 THEN 'stale' ELSE '1' END)");
    const before = (code) => db.prepare("INSERT INTO departments (code, name_th) VALUES (?, '[ข้อมูลทดสอบ] ก่อนตัวกัน')").bind(code);

    it('undoes the whole batch, earlier statements included, when a guarded update changed nothing', async () => {
      await reset();
      // runTransition() and governanceBatch() recognise the guard by this wording and answer 409.
      await expect(db.batch([before('DBC-STALE'), guard('not-the-current-value'), failIfUnchanged()])).rejects.toThrow(/malformed JSON/);
      expect(await exists('DBC-STALE')).toBe(false);

      await db.batch([before('DBC-STALE'), guard(''), failIfUnchanged()]);
      expect(await exists('DBC-STALE')).toBe(true);
      await drop('DBC-STALE');
    });

    it('reports how many rows a statement changed, alone and inside a batch', async () => {
      await reset();
      expect((await guard('not-the-current-value').run()).meta.changes).toBe(0);
      expect((await guard('').run()).meta.changes).toBe(1);

      await reset();
      const results = await db.batch([guard(''), guard('')]);
      expect(results.map((r) => r.meta.changes)).toEqual([1, 0]);
    });

    it('lets the next statement in a batch find the row just inserted', async () => {
      const marker = JSON.stringify({ test: `[ข้อมูลทดสอบ] rowid ${Date.now()}` });
      const [, found] = await db.batch([
        db.prepare("INSERT INTO audit_log (actor_id, action, details) VALUES (NULL, 'DB_CONTRACT_TEST', ?)").bind(marker),
        db.prepare('SELECT details FROM audit_log WHERE id = last_insert_rowid()')
      ]);
      expect(found.results[0].details).toBe(marker);
    });
  });

  describe('dates', () => {
    const shift = async (date, ...modifiers) => {
      const args = modifiers.map(() => ', ?').join('');
      return (await db.prepare(`SELECT date(?${args}) AS d`).bind(date, ...modifiers).first()).d;
    };

    // Next review dates are "effective date + N months": a day that does not exist in the target month
    // rolls into the next month instead of stopping at its last day.
    it('adds months by rolling an impossible day into the following month', async () => {
      expect(await shift('2026-01-31', '+1 months')).toBe('2026-03-03');
      expect(await shift('2024-02-29', '+12 months')).toBe('2025-03-01');
      expect(await shift('2024-02-29', '+24 months')).toBe('2026-03-01');
      expect(await shift('2026-08-31', '+6 months')).toBe('2027-03-03');
      expect(await shift('2026-05-15', '+24 months')).toBe('2028-05-15');
      expect(await shift('2026-03-31', '-1 months')).toBe('2026-03-03');
    });

    it('moves by hours and days, and by Thailand offset', async () => {
      expect(await shift('2026-12-31 20:00:00', '+7 hours')).toBe('2027-01-01');
      expect(await shift('2026-03-01', '-1 days')).toBe('2026-02-28');
    });

    it('reads stored timestamps in the T…Z form', async () => {
      expect(await shift('2026-11-13T18:30:00.000Z', '+7 hours')).toBe('2026-11-14');
    });
  });

  // SQLite treats NULL as the smallest value (first when ascending, last when descending) and compares text byte by byte
  // (capital letters before small ones). PostgreSQL's defaults are the opposite for NULL and, with most collations,
  // different for letters. Lists the application shows in a given order must not change when the database does.
  describe('sorting', () => {
    const S = ['DBC-S1', 'DBC-S2', 'DBC-S3', 'DBC-S4'];
    const EMP = { 'DBC-S1': 'E-b', 'DBC-S2': 'E-A', 'DBC-S3': null, 'DBC-S4': 'E-a' };
    const ids = `('${S.join("', '")}')`;

    beforeAll(async () => {
      await db.batch(
        S.map((id) =>
          db
            .prepare("INSERT INTO users (id, emp_id, name, email, password_hash, primary_department) VALUES (?, ?, ?, ?, 'x', ?)")
            .bind(id, EMP[id], `[ข้อมูลทดสอบ] ${id}`, `${id.toLowerCase()}@contract.local`, DEPT)
        )
      );
    });
    afterAll(async () => {
      await db.prepare(`DELETE FROM users WHERE id IN ${ids}`).run().catch(() => {});
    });

    const order = async (clause) => (await db.prepare(`SELECT id FROM users WHERE id IN ${ids} ORDER BY ${clause}`).all()).results.map((r) => r.id);

    it('puts NULL first when ascending and last when descending', async () => {
      expect(await order('emp_id')).toEqual(['DBC-S3', 'DBC-S2', 'DBC-S4', 'DBC-S1']);
      expect(await order('emp_id ASC, id')).toEqual(['DBC-S3', 'DBC-S2', 'DBC-S4', 'DBC-S1']);
      expect(await order('emp_id DESC')).toEqual(['DBC-S1', 'DBC-S4', 'DBC-S2', 'DBC-S3']);
    });

    it('sorts text by bytes: capital letters before small ones', async () => {
      expect(await order('emp_id, id')).toEqual(['DBC-S3', 'DBC-S2', 'DBC-S4', 'DBC-S1']); // E-A < E-a < E-b
    });

    it('keeps the same order inside a subquery with a limit, in several keys, and with an expression key', async () => {
      const top = await db.prepare(`SELECT id FROM (SELECT id, emp_id FROM users WHERE id IN ${ids} ORDER BY emp_id LIMIT 2) ORDER BY id`).all();
      expect(top.results.map((r) => r.id)).toEqual(['DBC-S2', 'DBC-S3']);
      expect(await order("emp_id IS NULL, emp_id DESC")).toEqual(['DBC-S1', 'DBC-S4', 'DBC-S2', 'DBC-S3']);
      const first = await db.prepare(`SELECT id FROM users WHERE id IN ${ids} ORDER BY emp_id DESC LIMIT 1`).first();
      expect(first.id).toBe('DBC-S1');
    });

    it('takes the largest and smallest value ignoring NULL, as aggregates do', async () => {
      const row = await db.prepare(`SELECT MIN(emp_id) AS lo, MAX(emp_id) AS hi FROM users WHERE id IN ${ids}`).first();
      expect(row).toMatchObject({ lo: 'E-A', hi: 'E-b' });
    });
  });

  describe('triggers without an API-level test', () => {
    it('refuses to approve an annual plan that is not waiting for approval', async () => {
      const id = 'DBC-PLAN-GUARD';
      await db.prepare("INSERT INTO vcc_annual_plans (id, plan_year, department, title, revision) VALUES (?, 2000, ?, '[ข้อมูลทดสอบ]', 'DBC')").bind(id, DEPT).run();
      try {
        for (const from of ['DRAFT', 'PENDING_REVIEW', 'REJECTED']) {
          await db.prepare('UPDATE vcc_annual_plans SET status = ? WHERE id = ?').bind(from, id).run();
          await expect(db.prepare("UPDATE vcc_annual_plans SET status = 'APPROVED' WHERE id = ?").bind(id).run()).rejects.toThrow(/PLAN_ALREADY_PROCESSED/);
        }
        expect((await db.prepare('SELECT status FROM vcc_annual_plans WHERE id = ?').bind(id).first()).status).toBe('REJECTED');
      } finally {
        await db.prepare('DELETE FROM vcc_annual_plans WHERE id = ?').bind(id).run();
      }
    });

    it('keeps at least one active platform administrator', async () => {
      const grant = (userId) =>
        db.prepare("INSERT INTO module_permission_grants (user_id, permission, module_id) VALUES (?, 'PLATFORM_ADMIN', '*')").bind(userId);
      const revoke = (userId) => db.prepare("DELETE FROM module_permission_grants WHERE user_id = ? AND permission = 'PLATFORM_ADMIN'").bind(userId);
      const setStatus = (userId, status) => db.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, userId).run();

      // Other test files leave their own administrators behind; set them aside so the count is ours, then put them back.
      const { results: others } = await db
        .prepare("SELECT user_id, permission, module_id, granted_by, granted_at FROM module_permission_grants WHERE permission = 'PLATFORM_ADMIN' AND user_id NOT IN (?, ?)")
        .bind(ADMIN_A, ADMIN_B)
        .all();
      await db.batch([grant(ADMIN_A), grant(ADMIN_B)]);
      try {
        for (const o of others) await revoke(o.user_id).run();

        await revoke(ADMIN_B).run();
        await expect(revoke(ADMIN_A).run()).rejects.toThrow(/LAST_PLATFORM_ADMIN/);

        // A deactivated administrator does not count as cover.
        await grant(ADMIN_B).run();
        await setStatus(ADMIN_B, 'INACTIVE');
        await expect(revoke(ADMIN_A).run()).rejects.toThrow(/LAST_PLATFORM_ADMIN/);
      } finally {
        await setStatus(ADMIN_B, 'ACTIVE');
        for (const o of others) {
          await db
            .prepare('INSERT OR IGNORE INTO module_permission_grants (user_id, permission, module_id, granted_by, granted_at) VALUES (?, ?, ?, ?, ?)')
            .bind(o.user_id, o.permission, o.module_id, o.granted_by, o.granted_at)
            .run();
        }
        await db.prepare("INSERT OR IGNORE INTO module_permission_grants (user_id, permission, module_id) VALUES (?, 'PLATFORM_ADMIN', '*')").bind(ADMIN_B).run();
        await revoke(ADMIN_B).run();
        // With no other active administrator the last grant cannot be removed, so the holder is deactivated instead.
        await revoke(ADMIN_A).run().catch(() => setStatus(ADMIN_A, 'INACTIVE'));
      }
      const restored = await db
        .prepare("SELECT count(*) AS n FROM module_permission_grants WHERE permission = 'PLATFORM_ADMIN' AND user_id NOT IN (?, ?)")
        .bind(ADMIN_A, ADMIN_B)
        .first();
      expect(restored.n).toBe(others.length);
    });
  });
});
