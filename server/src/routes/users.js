import { Router } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import db, { AVATARS_DIR } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { contactsMiddleware } from '../middleware/contacts.js';
import {
  userPayload,
  publicProfile,
  publicSilencProfile,
  validateUsername,
  validateName,
} from '../utils/userPayload.js';
import { isSilenc } from '../utils/silenc.js';
import { PRIVACY_LEVELS } from '../utils/privacy.js';
import { getMesiHistory } from '../utils/mesi.js';
import { listSessions, revokeSession } from '../utils/sessions.js';

const router = Router();
router.use(authMiddleware);
router.use(contactsMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Только изображения'));
    }
    cb(null, true);
  },
});

function syncDisplayName(first, last, fallback) {
  const full = [first, last].filter(Boolean).join(' ').trim();
  return full || fallback;
}

router.get('/me', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  user._aliases = db
    .prepare('SELECT username FROM user_aliases WHERE user_id = ?')
    .all(req.user.id);
  res.json(userPayload(user));
});

router.get('/me/sessions', (req, res) => {
  res.json(listSessions(req.user.id, req.tokenId));
});

router.delete('/me/sessions/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Некорректный id' });
  revokeSession(req.user.id, id);
  res.json({ ok: true });
});

router.get('/me/mesi', (req, res) => {
  const user = db.prepare('SELECT mesi_balance FROM users WHERE id = ?').get(req.user.id);
  res.json({
    balance: user?.mesi_balance || 0,
    transactions: getMesiHistory(req.user.id, 100),
  });
});

router.patch('/me/profile-channel', (req, res) => {
  const channelId =
    req.body.channelId === null || req.body.channelId === ''
      ? null
      : Number(req.body.channelId);
  if (channelId !== null && (!channelId || Number.isNaN(channelId))) {
    return res.status(400).json({ error: 'Некорректный канал' });
  }
  if (channelId) {
    const ch = db.prepare('SELECT id, type FROM chats WHERE id = ?').get(channelId);
    if (!ch || ch.type !== 'channel') {
      return res.status(400).json({ error: 'Укажите существующий канал' });
    }
    const member = db
      .prepare(
        `SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ? AND hidden_at IS NULL`
      )
      .get(channelId, req.user.id);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Вы должны быть админом этого канала' });
    }
  }
  db.prepare('UPDATE users SET profile_channel_id = ? WHERE id = ?').run(channelId, req.user.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (updated.profile_channel_id) {
    const ch = db
      .prepare('SELECT id, type, name, slug FROM chats WHERE id = ?')
      .get(updated.profile_channel_id);
    if (ch) {
      updated._linkedChannel = {
        id: ch.id,
        type: ch.type,
        name: ch.name,
        slug: ch.slug,
      };
    }
  }
  res.json(userPayload(updated));
});

router.patch('/me', (req, res) => {
  try {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const { firstName, lastName, bio, username, phone } = req.body;

  let first = (user.first_name ?? '').trim();
  let last = (user.last_name ?? '').trim();
  let bioText = user.bio ?? '';
  let uname = user.username;

  if (firstName !== undefined) first = String(firstName).trim();
  if (lastName !== undefined) last = String(lastName).trim();
  if (bio !== undefined) bioText = String(bio).trim().slice(0, 280);

  const firstCheck = validateName(first, 'Имя');
  if (!firstCheck.ok) return res.status(400).json({ error: firstCheck.error });
  const lastCheck = validateName(last, 'Фамилия');
  if (!lastCheck.ok) return res.status(400).json({ error: lastCheck.error });
  first = firstCheck.value;
  last = lastCheck.value;

  if (username !== undefined) {
    const check = validateUsername(username);
    if (!check.ok) return res.status(400).json({ error: check.error });
    uname = check.value;
  }

  const displayName = syncDisplayName(first, last, user.display_name);
  let phoneText = user.phone;
  if (phone !== undefined) {
    phoneText = String(phone || '').trim() || null;
  }

  try {
    db.prepare(
      `UPDATE users SET first_name = ?, last_name = ?, bio = ?, username = ?, display_name = ?, phone = ? WHERE id = ?`
    ).run(first, last, bioText, uname, displayName, phoneText, req.user.id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json(userPayload(updated));
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes('UNIQUE') && msg.toLowerCase().includes('username')) {
      return res.status(409).json({ error: 'Это имя пользователя уже занято' });
    }
    if (msg.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Конфликт данных' });
    }
    throw e;
  }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Ошибка сохранения профиля' });
  }
});

router.patch('/me/email', (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Укажите email и пароль для подтверждения' });
  }
  const newEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return res.status(400).json({ error: 'Некорректный email' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }

  try {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(newEmail, req.user.id);
    res.json(userPayload(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)));
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Этот email уже привязан к другому аккаунту' });
    }
    throw e;
  }
});

router.patch('/me/password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Новый пароль — минимум 6 символов' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный текущий пароль' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ ok: true });
});

router.post('/me/avatar', (req, res) => {
  upload.single('avatar')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Ошибка загрузки' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

  const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
  const filename = `${req.user.id}.${ext}`;
  const filepath = path.join(AVATARS_DIR, filename);

  for (const f of fs.readdirSync(AVATARS_DIR)) {
    if (f.startsWith(`${req.user.id}.`)) {
      fs.unlinkSync(path.join(AVATARS_DIR, f));
    }
  }

  fs.writeFileSync(filepath, req.file.buffer);
  const avatarUrl = `/uploads/avatars/${filename}`;
  db.prepare(
    `UPDATE users SET avatar_url = ?, avatar_updated_at = datetime('now') WHERE id = ?`
  ).run(avatarUrl, req.user.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json(userPayload(updated));
  });
});

router.delete('/me/avatar', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user?.avatar_url) {
    const name = path.basename(user.avatar_url);
    const filepath = path.join(AVATARS_DIR, name);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
  db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(req.user.id);
  res.json(userPayload(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)));
});

router.get('/profile/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Некорректный id' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  user._gifts = db
    .prepare(`SELECT id, gift_type, created_at FROM gifts WHERE to_user_id = ? ORDER BY id DESC LIMIT 200`)
    .all(userId);

  if (user.profile_channel_id) {
    const ch = db.prepare('SELECT id, type, name, slug FROM chats WHERE id = ?').get(
      user.profile_channel_id
    );
    if (ch) {
      user._linkedChannel = {
        id: ch.id,
        type: ch.type,
        name: ch.name,
        slug: ch.slug,
      };
    }
  }

  if (isSilenc(user)) {
    user._aliases = db
      .prepare('SELECT username FROM user_aliases WHERE user_id = ? ORDER BY id')
      .all(userId);
    return res.json(publicSilencProfile(user, req.user.id, req.contactIds));
  }

  const shared = db
    .prepare(
      `SELECT 1 FROM chat_members cm1
       JOIN chat_members cm2 ON cm2.chat_id = cm1.chat_id
       WHERE cm1.user_id = ? AND cm2.user_id = ? LIMIT 1`
    )
    .get(req.user.id, userId);

  if (!shared && userId !== req.user.id && !req.contactIds.includes(userId)) {
    return res.status(403).json({ error: 'Нет доступа к профилю' });
  }

  res.json(publicProfile(user, req.user.id, req.contactIds));
});

router.patch('/me/privacy', (req, res) => {
  const { avatar, lastSeen, bio, email, phone } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  let av = user.privacy_avatar || 'all';
  let ls = user.privacy_last_seen || 'all';
  let bi = user.privacy_bio || 'all';
  let em = user.privacy_email || 'contacts';
  let ph = user.privacy_phone || 'contacts';

  if (avatar !== undefined) {
    if (!PRIVACY_LEVELS.includes(avatar)) {
      return res.status(400).json({ error: 'Некорректное значение приватности' });
    }
    av = avatar;
  }
  if (lastSeen !== undefined) {
    if (!PRIVACY_LEVELS.includes(lastSeen)) {
      return res.status(400).json({ error: 'Некорректное значение приватности' });
    }
    ls = lastSeen;
  }
  if (bio !== undefined) {
    if (!PRIVACY_LEVELS.includes(bio)) {
      return res.status(400).json({ error: 'Некорректное значение приватности' });
    }
    bi = bio;
  }
  if (email !== undefined) {
    if (!PRIVACY_LEVELS.includes(email)) {
      return res.status(400).json({ error: 'Некорректное значение приватности' });
    }
    em = email;
  }
  if (phone !== undefined) {
    if (!PRIVACY_LEVELS.includes(phone)) {
      return res.status(400).json({ error: 'Некорректное значение приватности' });
    }
    ph = phone;
  }

  db.prepare(
    `UPDATE users SET privacy_avatar = ?, privacy_last_seen = ?, privacy_bio = ?,
     privacy_email = ?, privacy_phone = ? WHERE id = ?`
  ).run(av, ls, bi, em, ph, req.user.id);

  res.json(userPayload(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)));
});

router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json([]);

  const users = db
    .prepare(
      `SELECT DISTINCT u.* FROM users u
       LEFT JOIN user_aliases a ON a.user_id = u.id
       WHERE u.id != ?
         AND (u.username LIKE ? OR u.display_name LIKE ? OR u.first_name LIKE ?
              OR u.last_name LIKE ? OR a.username LIKE ?)
       LIMIT 20`
    )
    .all(req.user.id, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
    .map((u) => {
      const p = userPayload(u);
      const aliasRow = db
        .prepare(
          `SELECT username FROM user_aliases
           WHERE user_id = ? AND username LIKE ? LIMIT 1`
        )
        .get(u.id, `%${q}%`);
      const searchUsername =
        aliasRow && aliasRow.username.toLowerCase().includes(q)
          ? aliasRow.username
          : p.username;
      const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.displayName || '');
      const displayName = looksLikeEmail
        ? [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.username
        : p.displayName;
      return {
        id: p.id,
        username: p.username,
        searchUsername,
        displayName,
        firstName: p.firstName,
        lastName: p.lastName,
        avatarColor: p.avatarColor,
        avatarUrl: p.avatarUrl,
        avatarVersion: p.avatarVersion,
      };
    });

  res.json(users);
});

export default router;
