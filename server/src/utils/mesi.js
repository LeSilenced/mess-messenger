import db from '../db.js';

export function recordMesiTx(userId, amount, balanceAfter, kind, refType = null, refId = null, note = null) {
  db.prepare(
    `INSERT INTO mesi_transactions (user_id, amount, balance_after, kind, ref_type, ref_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, amount, balanceAfter, kind, refType, refId, note);
}

export function getMesiHistory(userId, limit = 50) {
  return db
    .prepare(
      `SELECT * FROM mesi_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?`
    )
    .all(userId, limit)
    .map((r) => ({
      id: r.id,
      amount: r.amount,
      balanceAfter: r.balance_after,
      kind: r.kind,
      refType: r.ref_type,
      refId: r.ref_id,
      note: r.note,
      createdAt: r.created_at,
    }));
}
