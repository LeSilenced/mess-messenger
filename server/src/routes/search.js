import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { userPayload } from '../utils/userPayload.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json({ users: [], chats: [] });

  const like = `%${q}%`;

  const users = db
    .prepare(
      `SELECT DISTINCT u.* FROM users u
       LEFT JOIN user_aliases a ON a.user_id = u.id
       WHERE u.id != ?
         AND (u.username LIKE ? OR u.display_name LIKE ? OR u.first_name LIKE ?
              OR u.last_name LIKE ? OR a.username LIKE ?)
       LIMIT 15`
    )
    .all(req.user.id, like, like, like, like, like)
    .map((u) => {
      const p = userPayload(u);
      const aliasRow = db
        .prepare(
          `SELECT username FROM user_aliases WHERE user_id = ? AND username LIKE ? LIMIT 1`
        )
        .get(u.id, like);
      const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.displayName || '');
      const displayName = looksLikeEmail
        ? [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.username
        : p.displayName;
      return {
        id: p.id,
        username: p.username,
        searchUsername: aliasRow?.username || p.username,
        displayName,
        avatarColor: p.avatarColor,
        avatarUrl: p.avatarUrl,
        avatarVersion: p.avatarVersion,
      };
    });

  const chats = db
    .prepare(
      `SELECT c.id, c.type, c.name, c.slug, c.description, c.avatar_url, c.created_by,
              u.avatar_color AS owner_color, u.avatar_url AS owner_avatar_url,
              u.avatar_updated_at AS owner_avatar_updated
       FROM chats c
       LEFT JOIN users u ON u.id = c.created_by
       WHERE c.type IN ('channel', 'group')
         AND c.slug IS NOT NULL
         AND (c.name LIKE ? OR c.slug LIKE ? OR c.description LIKE ?)
       LIMIT 15`
    )
    .all(like, like, like)
    .map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      slug: row.slug,
      description: row.description || '',
      avatarUrl: row.avatar_url || row.owner_avatar_url || null,
      avatarColor: row.owner_color || '#5b8def',
      avatarVersion: row.owner_avatar_updated || null,
    }));

  res.json({ users, chats });
});

export default router;
