import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { userPayload } from '../utils/userPayload.js';
import { validateId } from '../middleware/security.js';

const router = Router();
router.use(authMiddleware);

function formatContactRow(row) {
  const p = userPayload(row);
  const custom = [row.custom_first_name, row.custom_last_name].filter(Boolean).join(' ').trim();
  return {
    id: p.id,
    username: p.username,
    displayName: p.displayName,
    customFirstName: row.custom_first_name || '',
    customLastName: row.custom_last_name || '',
    contactDisplayName: custom || p.displayName,
    firstName: p.firstName,
    lastName: p.lastName,
    avatarColor: p.avatarColor,
    avatarUrl: p.avatarUrl,
    avatarVersion: p.avatarVersion,
    isOnline: !!row.is_online,
    lastSeenAt: row.last_seen_at,
    addedAt: row.added_at,
  };
}

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.*, c.custom_first_name, c.custom_last_name, c.added_at
       FROM user_contacts c
       JOIN users u ON u.id = c.contact_user_id
       WHERE c.owner_id = ?
       ORDER BY COALESCE(NULLIF(TRIM(c.custom_first_name), ''), u.first_name) COLLATE NOCASE,
                COALESCE(NULLIF(TRIM(c.custom_last_name), ''), u.last_name) COLLATE NOCASE`
    )
    .all(req.user.id);
  res.json(rows.map(formatContactRow));
});

router.post('/', (req, res) => {
  const contactUserId = validateId(req.body.userId);
  if (!contactUserId || contactUserId === req.user.id) {
    return res.status(400).json({ error: 'Некорректный пользователь' });
  }
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(contactUserId);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

  db.prepare(
    `INSERT INTO user_contacts (owner_id, contact_user_id, custom_first_name, custom_last_name)
     VALUES (?, ?, '', '')
     ON CONFLICT(owner_id, contact_user_id) DO NOTHING`
  ).run(req.user.id, contactUserId);

  const row = db
    .prepare(
      `SELECT u.*, c.custom_first_name, c.custom_last_name, c.added_at
       FROM user_contacts c JOIN users u ON u.id = c.contact_user_id
       WHERE c.owner_id = ? AND c.contact_user_id = ?`
    )
    .get(req.user.id, contactUserId);

  res.status(201).json(formatContactRow(row));
});

router.patch('/:userId', (req, res) => {
  const contactUserId = validateId(req.params.userId);
  if (!contactUserId) return res.status(400).json({ error: 'Некорректный id' });

  const exists = db
    .prepare('SELECT 1 FROM user_contacts WHERE owner_id = ? AND contact_user_id = ?')
    .get(req.user.id, contactUserId);
  if (!exists) return res.status(404).json({ error: 'Контакт не найден' });

  const first = req.body.customFirstName !== undefined ? String(req.body.customFirstName).trim() : undefined;
  const last = req.body.customLastName !== undefined ? String(req.body.customLastName).trim() : undefined;

  const cur = db
    .prepare('SELECT custom_first_name, custom_last_name FROM user_contacts WHERE owner_id = ? AND contact_user_id = ?')
    .get(req.user.id, contactUserId);

  db.prepare(
    `UPDATE user_contacts SET custom_first_name = ?, custom_last_name = ? WHERE owner_id = ? AND contact_user_id = ?`
  ).run(
    first !== undefined ? first : cur.custom_first_name,
    last !== undefined ? last : cur.custom_last_name,
    req.user.id,
    contactUserId
  );

  const row = db
    .prepare(
      `SELECT u.*, c.custom_first_name, c.custom_last_name, c.added_at
       FROM user_contacts c JOIN users u ON u.id = c.contact_user_id
       WHERE c.owner_id = ? AND c.contact_user_id = ?`
    )
    .get(req.user.id, contactUserId);

  res.json(formatContactRow(row));
});

router.delete('/:userId', (req, res) => {
  const contactUserId = validateId(req.params.userId);
  if (!contactUserId) return res.status(400).json({ error: 'Некорректный id' });
  db.prepare('DELETE FROM user_contacts WHERE owner_id = ? AND contact_user_id = ?').run(
    req.user.id,
    contactUserId
  );
  res.json({ ok: true });
});

router.post('/sync', (req, res) => {
  const list = Array.isArray(req.body.contacts) ? req.body.contacts : [];
  for (const c of list) {
    const id = validateId(c.id || c.userId);
    if (!id || id === req.user.id) continue;
    if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id)) continue;
    db.prepare(
      `INSERT INTO user_contacts (owner_id, contact_user_id, custom_first_name, custom_last_name)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(owner_id, contact_user_id) DO UPDATE SET
         custom_first_name = excluded.custom_first_name,
         custom_last_name = excluded.custom_last_name`
    ).run(
      req.user.id,
      id,
      String(c.customFirstName || '').trim(),
      String(c.customLastName || '').trim()
    );
  }
  const rows = db
    .prepare(
      `SELECT u.*, c.custom_first_name, c.custom_last_name, c.added_at
       FROM user_contacts c JOIN users u ON u.id = c.contact_user_id WHERE c.owner_id = ?`
    )
    .all(req.user.id);
  res.json(rows.map(formatContactRow));
});

export default router;
