import db from '../db.js';

export const PRIVACY_LEVELS = ['all', 'contacts', 'nobody'];

export function parseContactIds(header) {
  if (!header) return [];
  return String(header)
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((id) => id > 0);
}

export function hasSharedChat(userId, otherId) {
  if (userId === otherId) return true;
  const row = db
    .prepare(
      `SELECT 1 FROM chat_members cm1
       JOIN chat_members cm2 ON cm2.chat_id = cm1.chat_id
       WHERE cm1.user_id = ? AND cm2.user_id = ? LIMIT 1`
    )
    .get(userId, otherId);
  return !!row;
}

export function canViewPrivacy(owner, viewerId, field, contactIds) {
  if (!owner || viewerId === owner.id) return true;

  const col =
    field === 'last_seen' ? 'privacy_last_seen' : `privacy_${field}`;
  const level = owner[col] || 'all';
  if (level === 'all') return true;
  if (level === 'nobody') return false;
  if (level === 'contacts') {
    if (contactIds.includes(owner.id)) return true;
    return hasSharedChat(viewerId, owner.id);
  }
  return false;
}

export function formatLastSeen(iso, isOnline) {
  if (isOnline) return 'в сети';
  if (!iso) return 'был недавно';
  const s = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(s);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'был(а) только что';
  if (diff < 3600) return `был(а) ${Math.floor(diff / 60)} мин. назад`;
  if (diff < 86400) return `был(а) ${Math.floor(diff / 3600)} ч. назад`;
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return `был(а) в ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return `был(а) ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
}
