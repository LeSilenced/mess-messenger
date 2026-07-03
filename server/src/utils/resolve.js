import db from '../db.js';
import { validateUsername } from './userPayload.js';

export function resolveUsername(raw) {
  const check = validateUsername(raw);
  if (!check.ok) return { ok: false, error: check.error };

  const u = check.value;

  const user = db.prepare('SELECT id, username FROM users WHERE username = ?').get(u);
  if (user) {
    return {
      ok: true,
      type: 'user',
      id: user.id,
      username: user.username,
      label: user.username,
    };
  }

  const alias = db
    .prepare(
      `SELECT u.id, u.username, a.username AS alias
       FROM user_aliases a JOIN users u ON u.id = a.user_id
       WHERE a.username = ?`
    )
    .get(u);
  if (alias) {
    return {
      ok: true,
      type: 'user',
      id: alias.id,
      username: alias.username,
      matchedAlias: alias.alias,
      label: alias.alias,
    };
  }

  const chat = db
    .prepare(
      `SELECT id, type, name, slug FROM chats WHERE slug = ? AND type IN ('channel', 'group')`
    )
    .get(u);
  if (chat) {
    return {
      ok: true,
      type: chat.type,
      id: chat.id,
      username: chat.slug,
      label: chat.name || chat.slug,
    };
  }

  return { ok: false, error: 'Не найдено' };
}
