import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { userPayload } from '../utils/userPayload.js';
import {
  formatMessage,
  canModifyMessage,
  MESSAGE_SELECT,
} from '../utils/messages.js';

const router = Router();
router.use(authMiddleware);

function getMessageRow(id) {
  return db
    .prepare(
      `SELECT ${MESSAGE_SELECT}
       FROM messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.id = ?`
    )
    .get(id);
}

router.post('/', (req, res) => {
  const { chatId, content } = req.body;
  const cid = Number(chatId);
  const text = (content || '').trim();
  if (!cid || !text) {
    return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  }

  const member = db
    .prepare(
      'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND hidden_at IS NULL'
    )
    .get(cid, req.user.id);
  if (!member) {
    return res.status(403).json({ error: 'Нет доступа к чату' });
  }

  const result = db
    .prepare('INSERT INTO messages (chat_id, user_id, content) VALUES (?, ?, ?)')
    .run(cid, req.user.id, text);

  const row = getMessageRow(result.lastInsertRowid);
  res.status(201).json(formatMessage(row, req.user.id, cid));
});

router.patch('/:messageId', (req, res) => {
  const messageId = Number(req.params.messageId);
  const text = (req.body.content || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  }

  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!msg || msg.deleted_at) {
    return res.status(404).json({ error: 'Сообщение не найдено' });
  }
  if (msg.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Нельзя редактировать чужое сообщение' });
  }
  if (!canModifyMessage(messageId, req.user.id, msg.chat_id)) {
    return res.status(403).json({
      error: 'Нельзя редактировать: собеседник уже ответил',
    });
  }

  db.prepare(
    `UPDATE messages SET content = ?, edited_at = datetime('now') WHERE id = ?`
  ).run(text, messageId);

  const row = getMessageRow(messageId);
  const formatted = formatMessage(row, req.user.id, msg.chat_id);
  req.app.get('io')?.to(`chat:${msg.chat_id}`).emit('message_updated', formatted);
  res.json(formatted);
});

router.delete('/:messageId', (req, res) => {
  const messageId = Number(req.params.messageId);
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!msg || msg.deleted_at) {
    return res.status(404).json({ error: 'Сообщение не найдено' });
  }
  if (msg.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Нельзя удалить чужое сообщение' });
  }
  if (!canModifyMessage(messageId, req.user.id, msg.chat_id)) {
    return res.status(403).json({
      error: 'Нельзя удалить: собеседник уже ответил',
    });
  }

  db.prepare(`UPDATE messages SET deleted_at = datetime('now') WHERE id = ?`).run(messageId);

  const row = getMessageRow(messageId);
  const formatted = formatMessage(row, req.user.id, msg.chat_id);
  req.app.get('io')?.to(`chat:${msg.chat_id}`).emit('message_updated', formatted);
  res.json(formatted);
});

export default router;
