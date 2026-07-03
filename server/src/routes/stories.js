import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import db, { STORIES_DIR } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { contactsMiddleware } from '../middleware/contacts.js';
import { userPayload } from '../utils/userPayload.js';
import { isSilenc } from '../utils/silenc.js';
import { validateId } from '../middleware/security.js';

const router = Router();
router.use(authMiddleware);
router.use(contactsMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
      return cb(new Error('Только фото или видео'));
    }
    if (file.mimetype.startsWith('video/') && file.size > 12 * 1024 * 1024) {
      return cb(new Error('Видео до 12 МБ'));
    }
    if (file.mimetype.startsWith('image/') && file.size > 8 * 1024 * 1024) {
      return cb(new Error('Фото до 8 МБ'));
    }
    cb(null, true);
  },
});

function cleanupExpired() {
  const expired = db
    .prepare(`SELECT id, media_url FROM stories WHERE expires_at < datetime('now')`)
    .all();
  for (const s of expired) {
    const name = path.basename(s.media_url);
    const fp = path.join(STORIES_DIR, name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    db.prepare('DELETE FROM stories WHERE id = ?').run(s.id);
  }
}

router.get('/feed', (req, res) => {
  cleanupExpired();
  const contactIds = req.contactIds || [];
  const ids = [req.user.id, ...contactIds];
  if (!ids.length) return res.json([]);

  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT s.*, u.username, u.display_name, u.first_name, u.last_name,
              u.avatar_color, u.avatar_url, u.avatar_updated_at
       FROM stories s
       JOIN users u ON u.id = s.user_id
       WHERE s.user_id IN (${placeholders})
         AND s.expires_at > datetime('now')
       ORDER BY s.created_at DESC`
    )
    .all(...ids);

  const byUser = new Map();
  for (const row of rows) {
    if (!byUser.has(row.user_id)) {
      const p = userPayload(row);
      byUser.set(row.user_id, {
        userId: row.user_id,
        displayName: p.displayName,
        avatarColor: p.avatarColor,
        avatarUrl: p.avatarUrl,
        avatarVersion: p.avatarVersion,
        stories: [],
        hasUnviewed: false,
      });
    }
    const entry = byUser.get(row.user_id);
    const viewed = db
      .prepare('SELECT 1 FROM story_views WHERE story_id = ? AND viewer_id = ?')
      .get(row.id, req.user.id);
    entry.stories.push({
      id: row.id,
      mediaUrl: row.media_url,
      mediaType: row.media_type,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      viewed: !!viewed,
    });
    if (!viewed) entry.hasUnviewed = true;
  }

  res.json([...byUser.values()]);
});

router.get('/user/:userId', (req, res) => {
  cleanupExpired();
  const userId = validateId(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Некорректный id' });

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

  if (userId !== req.user.id) {
    const isContact = req.contactIds.includes(userId);
    const isPublic = isSilenc(target);
    const shared = db
      .prepare(
        `SELECT 1 FROM chat_members cm1
         JOIN chat_members cm2 ON cm2.chat_id = cm1.chat_id
         WHERE cm1.user_id = ? AND cm2.user_id = ? LIMIT 1`
      )
      .get(req.user.id, userId);
    if (!isContact && !isPublic && !shared) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
  }

  const rows = db
    .prepare(
      `SELECT id, media_url, media_type, created_at, expires_at
       FROM stories WHERE user_id = ? AND expires_at > datetime('now')
       ORDER BY created_at DESC`
    )
    .all(userId);

  res.json(
    rows.map((r) => ({
      id: r.id,
      mediaUrl: r.media_url,
      mediaType: r.media_type,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }))
  );
});

router.post('/', (req, res) => {
  upload.single('media')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Ошибка загрузки' });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    if (req.file.mimetype.startsWith('video/') && req.file.size > 12 * 1024 * 1024) {
      return res.status(400).json({ error: 'Видео до 12 МБ' });
    }
    if (req.file.mimetype.startsWith('image/') && req.file.size > 8 * 1024 * 1024) {
      return res.status(400).json({ error: 'Фото до 8 МБ' });
    }

    const ext = req.file.mimetype.startsWith('video/') ? 'mp4' : 'jpg';
    const filename = `${req.user.id}_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(STORIES_DIR, filename), req.file.buffer);

    const mediaUrl = `/uploads/stories/${filename}`;
    const mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

    const result = db
      .prepare(
        `INSERT INTO stories (user_id, media_url, media_type, expires_at)
         VALUES (?, ?, ?, datetime('now', '+24 hours'))`
      )
      .run(req.user.id, mediaUrl, mediaType);

    res.status(201).json({
      id: result.lastInsertRowid,
      mediaUrl,
      mediaType,
    });
  });
});

router.post('/:storyId/view', (req, res) => {
  const storyId = Number(req.params.storyId);
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(storyId);
  if (!story) return res.status(404).json({ error: 'История не найдена' });

  db.prepare(
    `INSERT OR IGNORE INTO story_views (story_id, viewer_id) VALUES (?, ?)`
  ).run(storyId, req.user.id);

  res.json({ ok: true });
});

router.delete('/:storyId', (req, res) => {
  const storyId = Number(req.params.storyId);
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(storyId);
  if (!story || story.user_id !== req.user.id) {
    return res.status(404).json({ error: 'История не найдена' });
  }
  const name = path.basename(story.media_url);
  const fp = path.join(STORIES_DIR, name);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  db.prepare('DELETE FROM stories WHERE id = ?').run(storyId);
  res.json({ ok: true });
});

export default router;
