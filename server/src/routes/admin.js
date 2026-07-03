import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import db, { GIFTS_DIR, PROFILE_MEDIA_DIR } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { silencOnly } from '../middleware/silencAdmin.js';
import { userPayload, validateUsername } from '../utils/userPayload.js';
import { sanitizeString, validateId } from '../middleware/security.js';
import { recordMesiTx } from '../utils/mesi.js';
import { giftItemRow } from '../utils/giftCatalog.js';

const router = Router();
router.use(authMiddleware);
router.use(silencOnly);

const giftImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok =
      file.mimetype === 'image/png' ||
      file.mimetype === 'image/jpeg' ||
      file.mimetype === 'image/webp';
    if (!ok) {
      return cb(new Error('Только PNG, JPG или WebP'));
    }
    cb(null, true);
  },
});

const profileMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
      return cb(new Error('Только фото или видео'));
    }
    cb(null, true);
  },
});

router.get('/panel', (req, res) => {
  const aliases = db
    .prepare('SELECT id, username FROM user_aliases WHERE user_id = ? ORDER BY id')
    .all(req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({
    mesiBalance: user.mesi_balance || 0,
    profileColor: user.profile_color,
    profileBanner: user.profile_banner,
    profileThemeColor: user.profile_theme_color || user.profile_color,
    profileMediaUrl: user.profile_media_url,
    profileMediaType: user.profile_media_type,
    aliases,
    username: user.username,
  });
});

router.post('/aliases', (req, res) => {
  const check = validateUsername(req.body.username);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(check.value);
  if (exists) return res.status(409).json({ error: 'Имя уже занято' });

  const aliasExists = db
    .prepare('SELECT id FROM user_aliases WHERE username = ?')
    .get(check.value);
  if (aliasExists) return res.status(409).json({ error: 'Имя уже занято' });

  const result = db
    .prepare('INSERT INTO user_aliases (user_id, username) VALUES (?, ?)')
    .run(req.user.id, check.value);

  res.status(201).json({
    id: result.lastInsertRowid,
    username: check.value,
  });
});

router.delete('/aliases/:id', (req, res) => {
  const id = validateId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Некорректный id' });
  db.prepare('DELETE FROM user_aliases WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ ok: true });
});

router.post('/mesi/grant', (req, res) => {
  const username = sanitizeString(req.body.username, 32).toLowerCase();
  const amount = Math.floor(Number(req.body.amount));
  if (!username || amount <= 0 || amount > 1000000) {
    return res.status(400).json({ error: 'Укажите username и сумму от 1 до 1000000' });
  }

  let target = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!target) {
    target = db
      .prepare(
        `SELECT u.* FROM users u
         JOIN user_aliases a ON a.user_id = u.id
         WHERE a.username = ?`
      )
      .get(username);
  }
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

  const newBal = (target.mesi_balance || 0) + amount;
  db.prepare('UPDATE users SET mesi_balance = ? WHERE id = ?').run(newBal, target.id);
  recordMesiTx(target.id, amount, newBal, 'admin_grant', null, null, `Выдано @${username}`);

  res.json({
    ok: true,
    userId: target.id,
    username: target.username,
    mesiBalance: newBal,
  });
});

router.patch('/profile', (req, res) => {
  const { profileColor, profileBanner, profileThemeColor } = req.body;
  const color = profileColor !== undefined ? sanitizeString(profileColor, 32) : undefined;
  const banner = profileBanner !== undefined ? sanitizeString(profileBanner, 500) : undefined;
  const theme =
    profileThemeColor !== undefined ? sanitizeString(profileThemeColor, 32) : undefined;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  db.prepare(
    `UPDATE users SET
       profile_color = ?,
       profile_banner = ?,
       profile_theme_color = ?
     WHERE id = ?`
  ).run(
    color !== undefined ? color || null : user.profile_color,
    banner !== undefined ? banner || null : user.profile_banner,
    theme !== undefined ? theme || null : user.profile_theme_color,
    req.user.id
  );

  res.json(userPayload(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)));
});

router.post('/profile/media', (req, res) => {
  profileMediaUpload.single('media')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Ошибка загрузки' });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (user?.profile_media_url) {
      const old = path.basename(user.profile_media_url);
      const oldPath = path.join(PROFILE_MEDIA_DIR, old);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const isVideo = req.file.mimetype.startsWith('video/');
    const ext = isVideo ? 'mp4' : req.file.mimetype === 'image/png' ? 'png' : 'jpg';
    const filename = `${req.user.id}_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(PROFILE_MEDIA_DIR, filename), req.file.buffer);

    const mediaUrl = `/uploads/profile_media/${filename}`;
    const mediaType = isVideo ? 'video' : 'image';
    db.prepare(
      `UPDATE users SET profile_media_url = ?, profile_media_type = ? WHERE id = ?`
    ).run(mediaUrl, mediaType, req.user.id);

    res.json(userPayload(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)));
  });
});

router.delete('/profile/media', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user?.profile_media_url) {
    const name = path.basename(user.profile_media_url);
    const fp = path.join(PROFILE_MEDIA_DIR, name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  db.prepare(
    `UPDATE users SET profile_media_url = NULL, profile_media_type = 'none' WHERE id = ?`
  ).run(req.user.id);
  res.json(userPayload(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)));
});

router.get('/gifts', (_, res) => {
  const rows = db
    .prepare('SELECT * FROM gift_items ORDER BY mesi_price ASC, name ASC')
    .all();
  res.json(rows.map(giftItemRow));
});

router.post('/gifts', (req, res) => {
  const id = sanitizeString(req.body.id, 48).toLowerCase().replace(/[^a-z0-9_]/g, '');
  const name = sanitizeString(req.body.name, 64);
  const mesiPrice = Math.floor(Number(req.body.mesiPrice ?? req.body.mesi_price ?? 10));
  const stock = req.body.stock === undefined ? -1 : Math.floor(Number(req.body.stock));
  const color = sanitizeString(req.body.color || '#888888', 32);

  if (!id || !name) return res.status(400).json({ error: 'Укажите id и название' });
  if (mesiPrice < 1 || mesiPrice > 100000) {
    return res.status(400).json({ error: 'Цена от 1 до 100000 mesi' });
  }

  try {
    db.prepare(
      `INSERT INTO gift_items (id, name, mesi_price, stock, color, active) VALUES (?, ?, ?, ?, ?, 1)`
    ).run(id, name, mesiPrice, Number.isFinite(stock) ? stock : -1, color);
    res.status(201).json(giftItemRow(db.prepare('SELECT * FROM gift_items WHERE id = ?').get(id)));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Подарок с таким id уже есть' });
    }
    throw e;
  }
});

router.patch('/gifts/:id', (req, res) => {
  const id = sanitizeString(req.params.id, 48);
  const row = db.prepare('SELECT * FROM gift_items WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Подарок не найден' });

  const name = req.body.name !== undefined ? sanitizeString(req.body.name, 64) : row.name;
  const mesiPrice =
    req.body.mesiPrice !== undefined
      ? Math.floor(Number(req.body.mesiPrice))
      : row.mesi_price;
  const stock =
    req.body.stock !== undefined ? Math.floor(Number(req.body.stock)) : row.stock;
  const color = req.body.color !== undefined ? sanitizeString(req.body.color, 32) : row.color;
  const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : row.active;

  db.prepare(
    `UPDATE gift_items SET name = ?, mesi_price = ?, stock = ?, color = ?, active = ? WHERE id = ?`
  ).run(name, mesiPrice, stock, color, active, id);

  res.json(giftItemRow(db.prepare('SELECT * FROM gift_items WHERE id = ?').get(id)));
});

router.post('/gifts/:id/image', (req, res) => {
  const id = sanitizeString(req.params.id, 48);
  const row = db.prepare('SELECT * FROM gift_items WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Подарок не найден' });

  giftImageUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Ошибка загрузки' });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    if (row.image_url) {
      const old = path.basename(row.image_url);
      const oldPath = path.join(GIFTS_DIR, old);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
    const filename = `${id}.${ext}`;
    fs.writeFileSync(path.join(GIFTS_DIR, filename), req.file.buffer);
    const imageUrl = `/uploads/gifts/${filename}`;
    db.prepare('UPDATE gift_items SET image_url = ? WHERE id = ?').run(imageUrl, id);

    res.json(giftItemRow(db.prepare('SELECT * FROM gift_items WHERE id = ?').get(id)));
  });
});

export default router;
