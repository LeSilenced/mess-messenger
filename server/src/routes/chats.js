import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import db, { FILES_DIR, CHAT_AVATARS_DIR } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { contactsMiddleware } from '../middleware/contacts.js';
import { userPayload, publicProfile } from '../utils/userPayload.js';
import { validateUsername } from '../utils/userPayload.js';
import {
  formatMessage,
  markChatRead,
  MESSAGE_SELECT,
  insertMessage,
} from '../utils/messages.js';
import { sanitizeString, validateId } from '../middleware/security.js';

const router = Router();
router.use(authMiddleware);
router.use(contactsMiddleware);

const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function getMemberRole(chatId, userId) {
  return db
    .prepare(
      'SELECT role, permissions FROM chat_members WHERE chat_id = ? AND user_id = ? AND hidden_at IS NULL'
    )
    .get(chatId, userId);
}

function canManageChat(chatId, userId) {
  const m = getMemberRole(chatId, userId);
  return m && ['owner', 'admin'].includes(m.role);
}

function parsePerms(json) {
  try {
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
}

function memberClearedAt(chatId, userId) {
  const row = db
    .prepare('SELECT cleared_at FROM chat_members WHERE chat_id = ? AND user_id = ?')
    .get(chatId, userId);
  return row?.cleared_at || null;
}

function dedupePrivateChats(chats) {
  const byOther = new Map();
  const rest = [];
  for (const c of chats) {
    if (c.type !== 'private' || !c.otherUserId) {
      rest.push(c);
      continue;
    }
    const prev = byOther.get(c.otherUserId);
    if (!prev || c.id > prev.id) byOther.set(c.otherUserId, c);
  }
  return [...rest, ...byOther.values()];
}

function findPrivateChatId(userId, targetId) {
  return db
    .prepare(
      `SELECT c.id FROM chats c
       JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = ?
       JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = ?
       WHERE c.type = 'private'
       ORDER BY c.id DESC
       LIMIT 1`
    )
    .get(userId, targetId);
}

function formatChat(row, currentUserId, contactIds) {
  const members = db
    .prepare(
      `SELECT u.*, cm.role AS member_role
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id = ?`
    )
    .all(row.id);

  const memberPayloads = members.map((m) => {
    const base =
      m.id === currentUserId
        ? userPayload(m)
        : publicProfile(m, currentUserId, contactIds);
    return { ...base, role: m.member_role || 'member' };
  });
  const other = memberPayloads.find((m) => m.id !== currentUserId);
  const title =
    row.type === 'private' && other ? other.displayName : row.name || 'Чат';

  const clearedAt = memberClearedAt(row.id, currentUserId);
  const lastMsg = clearedAt
    ? db
        .prepare(
          `SELECT m.content, m.created_at, m.deleted_at, u.display_name
           FROM messages m
           JOIN users u ON u.id = m.user_id
           WHERE m.chat_id = ? AND m.created_at > ?
           ORDER BY m.id DESC
           LIMIT 1`
        )
        .get(row.id, clearedAt)
    : db
        .prepare(
          `SELECT m.content, m.created_at, m.deleted_at, u.display_name
           FROM messages m
           JOIN users u ON u.id = m.user_id
           WHERE m.chat_id = ?
           ORDER BY m.id DESC
           LIMIT 1`
        )
        .get(row.id);

  const myMembership = db
    .prepare(
      'SELECT role, permissions FROM chat_members WHERE chat_id = ? AND user_id = ? AND hidden_at IS NULL'
    )
    .get(row.id, currentUserId);

  return {
    id: row.id,
    type: row.type,
    name: title,
    slug: row.slug || null,
    description: row.description || '',
    accentColor: row.accent_color || null,
    avatarUrl: row.avatar_url || null,
    avatarVersion: row.avatar_updated_at || null,
    createdBy: row.created_by || null,
    isPublic: row.is_public == null ? true : !!row.is_public,
    otherUserId: other?.id || null,
    members: memberPayloads,
    memberCount: members.length,
    myRole: myMembership?.role || 'member',
    myPermissions: parsePerms(myMembership?.permissions),
    lastMessage: lastMsg
      ? {
          content: lastMsg.deleted_at ? 'Сообщение удалено' : lastMsg.content,
          createdAt: lastMsg.created_at,
          senderName: lastMsg.display_name,
        }
      : null,
    createdAt: row.created_at,
  };
}
function assertMember(chatId, userId) {
  return db
    .prepare(
      'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND hidden_at IS NULL'
    )
    .get(chatId, userId);
}

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*
       FROM chats c
       JOIN chat_members cm ON cm.chat_id = c.id
       WHERE cm.user_id = ? AND cm.hidden_at IS NULL
       ORDER BY (
         SELECT MAX(id) FROM messages WHERE chat_id = c.id
       ) DESC, c.created_at DESC`
    )
    .all(req.user.id);
  const chats = dedupePrivateChats(rows.map((r) => formatChat(r, req.user.id, req.contactIds)));
  res.json(chats);
});

router.post('/private', (req, res) => {
  const { userId } = req.body;
  const targetId = Number(userId);
  if (!targetId || targetId === req.user.id) {
    return res.status(400).json({ error: 'Некорректный пользователь' });
  }
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  const existing = findPrivateChatId(req.user.id, targetId);

  if (existing) {
    const myMem = db
      .prepare(
        'SELECT hidden_at, cleared_at FROM chat_members WHERE chat_id = ? AND user_id = ?'
      )
      .get(existing.id, req.user.id);

    if (myMem?.cleared_at) {
      db.prepare(
        `UPDATE chat_members SET hidden_at = NULL, cleared_at = datetime('now')
         WHERE chat_id = ? AND user_id = ?`
      ).run(existing.id, req.user.id);
    } else if (myMem?.hidden_at) {
      db.prepare(
        'UPDATE chat_members SET hidden_at = NULL WHERE chat_id = ? AND user_id = ?'
      ).run(existing.id, req.user.id);
    }
    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(existing.id);
    return res.json(formatChat(chat, req.user.id, req.contactIds));
  }

  const insertChat = db.prepare("INSERT INTO chats (type) VALUES ('private')");
  const insertMember = db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)');

  const tx = db.transaction(() => {
    const { lastInsertRowid } = insertChat.run();
    const chatId = lastInsertRowid;
    insertMember.run(chatId, req.user.id);
    insertMember.run(chatId, targetId);
    return chatId;
  });

  const chatId = tx();
  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId);
  res.status(201).json(formatChat(chat, req.user.id, req.contactIds));
});

router.post('/group', (req, res) => {
  const name = sanitizeString(req.body.name, 64);
  const memberIds = Array.isArray(req.body.memberIds)
    ? req.body.memberIds.map(Number).filter((id) => id > 0 && id !== req.user.id)
    : [];
  if (!name) return res.status(400).json({ error: 'Укажите название группы' });

  let slug = null;
  if (req.body.slug) {
    const check = validateUsername(req.body.slug);
    if (!check.ok) return res.status(400).json({ error: check.error });
    slug = check.value;
    const taken =
      db.prepare('SELECT id FROM chats WHERE slug = ?').get(slug) ||
      db.prepare('SELECT id FROM users WHERE username = ?').get(slug) ||
      db.prepare('SELECT id FROM user_aliases WHERE username = ?').get(slug);
    if (taken) return res.status(409).json({ error: 'Этот username уже занят' });
  }

  const insertChat = db.prepare(
    `INSERT INTO chats (type, name, created_by, slug) VALUES ('group', ?, ?, ?)`
  );
  const insertMember = db.prepare(
    `INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)`
  );

  const tx = db.transaction(() => {
    const { lastInsertRowid } = insertChat.run(name, req.user.id, slug);
    const chatId = lastInsertRowid;
    insertMember.run(chatId, req.user.id, 'owner');
    for (const uid of [...new Set(memberIds)]) {
      if (db.prepare('SELECT id FROM users WHERE id = ?').get(uid)) {
        insertMember.run(chatId, uid, 'member');
      }
    }
    return chatId;
  });

  const chatId = tx();
  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId);
  res.status(201).json(formatChat(chat, req.user.id, req.contactIds));
});

router.post('/channel', (req, res) => {
  const name = sanitizeString(req.body.name, 64);
  if (!name) return res.status(400).json({ error: 'Укажите название канала' });

  let slug = null;
  if (req.body.slug) {
    const check = validateUsername(req.body.slug);
    if (!check.ok) return res.status(400).json({ error: check.error });
    slug = check.value;
    const taken =
      db.prepare('SELECT id FROM chats WHERE slug = ?').get(slug) ||
      db.prepare('SELECT id FROM users WHERE username = ?').get(slug) ||
      db.prepare('SELECT id FROM user_aliases WHERE username = ?').get(slug);
    if (taken) return res.status(409).json({ error: 'Этот username уже занят' });
  }

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO chats (type, name, created_by, description, accent_color, slug) VALUES ('channel', ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      req.user.id,
      sanitizeString(req.body.description, 500),
      req.body.accentColor || null,
      slug
    );

  db.prepare(
    `INSERT INTO chat_members (chat_id, user_id, role, permissions) VALUES (?, ?, 'owner', ?)`
  ).run(
    lastInsertRowid,
    req.user.id,
    JSON.stringify({ post: true, deleteMessages: true, manageMembers: true })
  );

  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(lastInsertRowid);
  res.status(201).json(formatChat(chat, req.user.id, req.contactIds));
});

router.patch('/:chatId', (req, res) => {
  const chatId = validateId(req.params.chatId);
  if (!chatId || !canManageChat(chatId, req.user.id)) {
    return res.status(403).json({ error: 'Нет прав' });
  }
  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId);
  const { name, description, slug, isPublic } = req.body;

  let newSlug = chat.slug;
  if (slug !== undefined) {
    if (slug === '' || slug === null) {
      newSlug = null;
    } else {
      const check = validateUsername(slug);
      if (!check.ok) return res.status(400).json({ error: check.error });
      const taken =
        db.prepare('SELECT id FROM chats WHERE slug = ? AND id != ?').get(check.value, chatId) ||
        db.prepare('SELECT id FROM users WHERE username = ?').get(check.value) ||
        db.prepare('SELECT id FROM user_aliases WHERE username = ?').get(check.value);
      if (taken) return res.status(409).json({ error: 'Username занят' });
      newSlug = check.value;
    }
  }

  const publicVal =
    isPublic !== undefined ? (isPublic ? 1 : 0) : chat.is_public == null ? 1 : chat.is_public;

  db.prepare(
    `UPDATE chats SET name = ?, description = ?, slug = ?, is_public = ? WHERE id = ?`
  ).run(
    name !== undefined ? sanitizeString(name, 64) || chat.name : chat.name,
    description !== undefined ? sanitizeString(description, 500) : chat.description,
    newSlug,
    publicVal,
    chatId
  );
  res.json(formatChat(db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId), req.user.id, req.contactIds));
});

router.patch('/:chatId/members/:userId', (req, res) => {
  const chatId = validateId(req.params.chatId);
  const targetId = validateId(req.params.userId);
  if (!chatId || !targetId || !canManageChat(chatId, req.user.id)) {
    return res.status(403).json({ error: 'Нет прав' });
  }
  const { role, permissions } = req.body;
  const allowedRoles = ['member', 'moderator', 'admin'];
  if (role && !allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Некорректная роль' });
  }
  const perms = permissions ? JSON.stringify(permissions) : undefined;
  if (role) {
    db.prepare('UPDATE chat_members SET role = ? WHERE chat_id = ? AND user_id = ?').run(
      role,
      chatId,
      targetId
    );
  }
  if (perms) {
    db.prepare('UPDATE chat_members SET permissions = ? WHERE chat_id = ? AND user_id = ?').run(
      perms,
      chatId,
      targetId
    );
  }
  res.json({ ok: true });
});

router.get('/:chatId/members', (req, res) => {
  const chatId = validateId(req.params.chatId);
  if (!chatId || !assertMember(chatId, req.user.id)) {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  if (!canManageChat(chatId, req.user.id)) {
    return res.status(403).json({ error: 'Нет прав управления' });
  }

  const chat = db.prepare('SELECT type FROM chats WHERE id = ?').get(chatId);
  if (!chat || chat.type === 'private') {
    return res.status(400).json({ error: 'Недоступно для личного чата' });
  }

  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.first_name, u.last_name,
              u.avatar_color, u.avatar_url, cm.role, cm.permissions
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id = ? AND cm.hidden_at IS NULL
       ORDER BY CASE cm.role
         WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END`
    )
    .all(chatId);

  res.json(
    rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.display_name,
      avatarColor: r.avatar_color,
      role: r.role || 'member',
      permissions: parsePerms(r.permissions),
    }))
  );
});

router.post('/:chatId/members', (req, res) => {
  const chatId = validateId(req.params.chatId);
  if (!chatId || !canManageChat(chatId, req.user.id)) {
    return res.status(403).json({ error: 'Нет прав' });
  }

  const chat = db.prepare('SELECT type FROM chats WHERE id = ?').get(chatId);
  if (!chat || chat.type === 'private') {
    return res.status(400).json({ error: 'Недоступно для личного чата' });
  }

  const username = sanitizeString(req.body.username, 32).toLowerCase();
  const role = ['member', 'moderator', 'admin'].includes(req.body.role)
    ? req.body.role
    : 'member';
  if (!username) return res.status(400).json({ error: 'Укажите username' });

  let target = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!target) {
    target = db
      .prepare(
        `SELECT u.id FROM users u
         JOIN user_aliases a ON a.user_id = u.id
         WHERE a.username = ?`
      )
      .get(username);
  }
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

  const perms =
    role === 'admin'
      ? JSON.stringify({ post: true, deleteMessages: true, manageMembers: true })
      : role === 'moderator'
        ? JSON.stringify({ post: true, deleteMessages: true, manageMembers: false })
        : JSON.stringify({ post: true, deleteMessages: false, manageMembers: false });

  db.prepare(
    `INSERT INTO chat_members (chat_id, user_id, role, permissions, hidden_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(chat_id, user_id) DO UPDATE SET
       role = excluded.role,
       permissions = excluded.permissions,
       hidden_at = NULL`
  ).run(chatId, target.id, role, perms);

  res.status(201).json({ ok: true, userId: target.id });
});

router.post('/:chatId/avatar', (req, res) => {
  const chatId = validateId(req.params.chatId);
  if (!chatId || !canManageChat(chatId, req.user.id)) {
    return res.status(403).json({ error: 'Нет прав' });
  }
  const chat = db.prepare('SELECT type FROM chats WHERE id = ?').get(chatId);
  if (!chat || chat.type === 'private') {
    return res.status(400).json({ error: 'Фото доступно только для каналов и групп' });
  }

  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Ошибка загрузки' });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
    const filename = `${chatId}.${ext}`;
    const filepath = path.join(CHAT_AVATARS_DIR, filename);

    for (const f of fs.readdirSync(CHAT_AVATARS_DIR)) {
      if (f.startsWith(`${chatId}.`)) {
        fs.unlinkSync(path.join(CHAT_AVATARS_DIR, f));
      }
    }

    fs.writeFileSync(filepath, req.file.buffer);
    const avatarUrl = `/uploads/chat_avatars/${filename}`;
    db.prepare(
      `UPDATE chats SET avatar_url = ?, avatar_updated_at = datetime('now') WHERE id = ?`
    ).run(avatarUrl, chatId);

    res.json(
      formatChat(db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId), req.user.id, req.contactIds)
    );
  });
});

router.delete('/:chatId/avatar', (req, res) => {
  const chatId = validateId(req.params.chatId);
  if (!chatId || !canManageChat(chatId, req.user.id)) {
    return res.status(403).json({ error: 'Нет прав' });
  }
  const chat = db.prepare('SELECT avatar_url FROM chats WHERE id = ?').get(chatId);
  if (chat?.avatar_url) {
    const name = path.basename(chat.avatar_url);
    const filepath = path.join(CHAT_AVATARS_DIR, name);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
  db.prepare(
    `UPDATE chats SET avatar_url = NULL, avatar_updated_at = datetime('now') WHERE id = ?`
  ).run(chatId);
  res.json(
    formatChat(db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId), req.user.id, req.contactIds)
  );
});

router.post('/:chatId/upload', (req, res) => {
  const chatId = validateId(req.params.chatId);
  if (!chatId || !assertMember(chatId, req.user.id)) {
    return res.status(403).json({ error: 'Нет доступа к чату' });
  }

  fileUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Ошибка загрузки' });
    }
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const safeName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${chatId}_${req.user.id}_${Date.now()}_${safeName}`;
    fs.writeFileSync(path.join(FILES_DIR, filename), req.file.buffer);

    const url = `/uploads/files/${filename}`;
    const isImage = req.file.mimetype.startsWith('image/');
    const label = isImage ? 'картинка' : safeName;
    const msgId = insertMessage(chatId, req.user.id, label, {
      type: isImage ? 'image' : 'file',
      url,
      name: isImage ? 'картинка' : req.file.originalname,
      size: req.file.size,
      mime: req.file.mimetype,
    });

    const row = db
      .prepare(
        `SELECT ${MESSAGE_SELECT}
         FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`
      )
      .get(msgId);
    const message = formatMessage(row, req.user.id, chatId);
    req.app.get('io')?.to(`chat:${chatId}`).emit('new_message', message);
    res.status(201).json(message);
  });
});

router.get('/with/:userId', (req, res) => {
  const targetId = validateId(req.params.userId);
  if (!targetId) return res.status(400).json({ error: 'Некорректный id' });
  const existing = findPrivateChatId(req.user.id, targetId);
  if (!existing) return res.json({ chatId: null });
  const myMem = db
    .prepare(
      'SELECT hidden_at, cleared_at FROM chat_members WHERE chat_id = ? AND user_id = ?'
    )
    .get(existing.id, req.user.id);
  if (myMem?.hidden_at || myMem?.cleared_at) {
    return res.json({ chatId: null });
  }
  res.json({ chatId: existing.id });
});

router.post('/slug/:slug/open', (req, res) => {
  const check = validateUsername(req.params.slug);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const chat = db
    .prepare(`SELECT * FROM chats WHERE slug = ? AND type IN ('channel', 'group')`)
    .get(check.value);
  if (!chat) return res.status(404).json({ error: 'Канал или группа не найдены' });

  if (chat.type === 'channel') {
    const member = db
      .prepare('SELECT hidden_at FROM chat_members WHERE chat_id = ? AND user_id = ?')
      .get(chat.id, req.user.id);
    if (member) {
      db.prepare(
        `UPDATE chat_members SET hidden_at = NULL WHERE chat_id = ? AND user_id = ?`
      ).run(chat.id, req.user.id);
    } else {
      db.prepare(
        `INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, 'member')`
      ).run(chat.id, req.user.id);
    }
  } else {
    const member = db
      .prepare(
        'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND hidden_at IS NULL'
      )
      .get(chat.id, req.user.id);
    if (!member) {
      return res.status(403).json({ error: 'Вы не участник этой группы' });
    }
  }

  res.json(formatChat(chat, req.user.id, req.contactIds));
});

router.post('/:chatId/read', (req, res) => {
  const chatId = Number(req.params.chatId);
  if (!assertMember(chatId, req.user.id)) {
    return res.status(403).json({ error: 'Нет доступа к чату' });
  }
  const lastId = markChatRead(chatId, req.user.id);
  res.json({ lastReadMessageId: lastId });
});

router.delete('/:chatId', (req, res) => {
  const chatId = Number(req.params.chatId);
  const member = db
    .prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?')
    .get(chatId, req.user.id);
  if (!member) {
    return res.status(403).json({ error: 'Нет доступа к чату' });
  }

  const chat = db.prepare('SELECT type FROM chats WHERE id = ?').get(chatId);
  if (chat?.type === 'private') {
    db.prepare(
      `UPDATE chat_members SET hidden_at = datetime('now'), cleared_at = datetime('now')
       WHERE chat_id = ? AND user_id = ?`
    ).run(chatId, req.user.id);
  } else {
    db.prepare(
      `UPDATE chat_members SET hidden_at = datetime('now') WHERE chat_id = ? AND user_id = ?`
    ).run(chatId, req.user.id);
  }
  res.json({ ok: true });
});

router.get('/:chatId/messages', (req, res) => {
  const chatId = Number(req.params.chatId);
  if (!assertMember(chatId, req.user.id)) {
    return res.status(403).json({ error: 'Нет доступа к чату' });
  }

  markChatRead(chatId, req.user.id);

  const clearedAt = memberClearedAt(chatId, req.user.id);
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = req.query.before;
  const clearedSql = clearedAt ? ' AND m.created_at > ?' : '';
  const clearedParams = clearedAt ? [clearedAt] : [];

  let messages;
  if (before) {
    messages = db
      .prepare(
        `SELECT ${MESSAGE_SELECT}
         FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.chat_id = ? AND m.created_at < ?${clearedSql}
         ORDER BY m.id DESC
         LIMIT ?`
      )
      .all(chatId, before, ...clearedParams, limit);
  } else {
    messages = db
      .prepare(
        `SELECT ${MESSAGE_SELECT}
         FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.chat_id = ?${clearedSql}
         ORDER BY m.id DESC
         LIMIT ?`
      )
      .all(chatId, ...clearedParams, limit);
  }

  res.json(
    messages.reverse().map((m) => formatMessage(m, req.user.id, chatId))
  );
});

export default router;
