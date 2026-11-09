// A failed state guard must abort the batch before any history or dependent records are written.
export const assertRowUpdated = (db) => db.prepare("SELECT json(CASE WHEN changes() = 0 THEN 'stale' ELSE '1' END)");

export const STATE_CHANGED = { error: 'สถานะของรายการนี้ถูกเปลี่ยนไปแล้ว (อาจกดซ้ำหรือมีผู้อื่นดำเนินการก่อน) กรุณารีเฟรชหน้าจอ' };

export const runTransition = async (c, db, statements) => {
  try {
    await db.batch(statements);
    return null;
  } catch (err) {
    if (/malformed JSON/.test(String(err?.message))) return c.json(STATE_CHANGED, 409);
    throw err;
  }
};
