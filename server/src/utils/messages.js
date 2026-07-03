import db from '../db.js';
import { userPayload } from './userPayload.js';

export function formatMessage(row, currentUserId, chatId) {
  const user = userPayload({
    id: row.user_id,
    username: row.username,
    display_name: row.display_name,
    first_name: row.first_name,
    last_name: row.last_name,
    avatar_color: row.avatar_color,
    avatar_url: row.avatar_url,
    avatar_updated_at: row.avatar_updated_at,
    bio: row.bio,
    email: '',
  });

  const deleted = !!row.deleted_at;
  const mine = row.user_id === currentUserId;
  const msgType = row.message_type || 'text';

  let readByOther = false;
  if (mine && chatId) {
    const otherRead = db
      .prepare(
        `SELECT last_read_message_id FROM chat_reads
         WHERE chat_id = ? AND user_id != ?`
      )
      .get(chatId, currentUserId);
    readByOther = otherRead && Number(otherRead.last_read_message_id) >= row.id;
  }

  const canModify =
    mine &&
    !deleted &&
    msgType === 'text' &&
    canModifyMessage(row.id, row.user_id, chatId);

  return {
    id: row.id,
    chatId: row.chat_id,
    content: deleted ? '' : row.content,
    messageType: msgType,
    attachment: row.attachment_url
      ? {
          url: row.attachment_url,
          name: row.attachment_name,
          size: row.attachment_size,
          mime: row.attachment_mime,
        }
      : null,
    createdAt: row.created_at,
    editedAt: row.edited_at || null,
    deleted: deleted,
    deletedText: deleted ? 'Сообщение удалено' : null,
    readByOther,
    canEdit: canModify,
    canDelete: canModify,
    user,
  };
}

export function canModifyMessage(messageId, authorId, chatId) {
  const blocker = db
    .prepare(
      `SELECT id FROM messages
       WHERE chat_id = ? AND user_id != ? AND id > ? AND deleted_at IS NULL
       LIMIT 1`
    )
    .get(chatId, authorId, messageId);
  return !blocker;
}

export function markChatRead(chatId, userId) {
  const last = db
    .prepare(
      `SELECT id FROM messages WHERE chat_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`
    )
    .get(chatId);
  const lastId = last?.id || 0;
  db.prepare(
    `INSERT INTO chat_reads (chat_id, user_id, last_read_message_id, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(chat_id, user_id) DO UPDATE SET
       last_read_message_id = CASE
         WHEN excluded.last_read_message_id > chat_reads.last_read_message_id
         THEN excluded.last_read_message_id
         ELSE chat_reads.last_read_message_id
       END,
       updated_at = datetime('now')`
  ).run(chatId, userId, lastId);
  return lastId;
}

export const MESSAGE_SELECT = `m.id, m.chat_id, m.content, m.message_type, m.attachment_url,
  m.attachment_name, m.attachment_size, m.attachment_mime,
  m.created_at, m.edited_at, m.deleted_at,
  u.id as user_id, u.username, u.display_name, u.first_name, u.last_name,
  u.avatar_color, u.avatar_url, u.avatar_updated_at, u.bio`;

export function insertMessage(chatId, userId, content, attachment = null) {
  const msgType = attachment ? attachment.type : 'text';
  const text = content || (attachment ? attachment.name || 'Файл' : '');
  const result = db
    .prepare(
      `INSERT INTO messages (chat_id, user_id, content, message_type, attachment_url, attachment_name, attachment_size, attachment_mime)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      chatId,
      userId,
      text,
      msgType,
      attachment?.url || null,
      attachment?.name || null,
      attachment?.size || null,
      attachment?.mime || null
    );
  return result.lastInsertRowid;
}
