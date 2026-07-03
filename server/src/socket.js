import db from './db.js';
import { socketAuth } from './middleware/auth.js';
import { formatMessage, markChatRead, MESSAGE_SELECT } from './utils/messages.js';

function getMessageRow(id) {
  return db
    .prepare(
      `SELECT ${MESSAGE_SELECT}
       FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`
    )
    .get(id);
}

export function setupSocket(io) {
  io.use(socketAuth);

  function setOnline(uid, online) {
    db.prepare(
      `UPDATE users SET is_online = ?, last_seen_at = datetime('now') WHERE id = ?`
    ).run(online ? 1 : 0, uid);
    io.emit('presence_update', {
      userId: uid,
      isOnline: !!online,
      lastSeenAt: db.prepare('SELECT last_seen_at FROM users WHERE id = ?').get(uid)
        ?.last_seen_at,
    });
  }

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    setOnline(userId, true);
    socket.join(`user:${userId}`);

    const chats = db
      .prepare(
        `SELECT chat_id FROM chat_members WHERE user_id = ? AND hidden_at IS NULL`
      )
      .all(userId);
    for (const { chat_id } of chats) {
      socket.join(`chat:${chat_id}`);
    }

    socket.on('join_chat', (chatId) => {
      const cid = Number(chatId);
      const member = db
        .prepare(
          'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND hidden_at IS NULL'
        )
        .get(cid, userId);
      if (member) socket.join(`chat:${cid}`);
    });

    socket.on('mark_read', ({ chatId }) => {
      const cid = Number(chatId);
      const member = db
        .prepare(
          'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND hidden_at IS NULL'
        )
        .get(cid, userId);
      if (!member) return;
      const lastId = markChatRead(cid, userId);
      socket.to(`chat:${cid}`).emit('messages_read', {
        chatId: cid,
        userId,
        lastReadMessageId: lastId,
      });
    });

    socket.on('send_message', ({ chatId, content }) => {
      const cid = Number(chatId);
      const text = (content || '').trim();
      if (!cid || !text) return;

      const member = db
        .prepare(
          'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND hidden_at IS NULL'
        )
        .get(cid, userId);
      if (!member) return;

      const result = db
        .prepare('INSERT INTO messages (chat_id, user_id, content) VALUES (?, ?, ?)')
        .run(cid, userId, text);

      const row = getMessageRow(result.lastInsertRowid);
      const message = formatMessage(row, userId, cid);

      io.to(`chat:${cid}`).emit('new_message', message);
    });

    socket.on('typing', ({ chatId }) => {
      const cid = Number(chatId);
      socket.to(`chat:${cid}`).emit('user_typing', {
        chatId: cid,
        userId,
        username: socket.user.username,
      });
    });

    socket.on('heartbeat', () => {
      db.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`).run(
        userId
      );
    });

    socket.on('disconnect', () => {
      setOnline(userId, false);
    });
  });
}
