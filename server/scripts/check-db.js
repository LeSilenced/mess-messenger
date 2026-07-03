import db from '../src/db.js';

const tables = ['users', 'messages', 'chat_members', 'chat_reads'];
for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all();
  console.log(t + ':', cols.map((c) => c.name).join(', '));
}

try {
  db.prepare(`SELECT c.* FROM chats c JOIN chat_members cm ON cm.chat_id = c.id WHERE cm.user_id = 1 AND cm.hidden_at IS NULL LIMIT 1`).get();
  console.log('chat list query: OK');
} catch (e) {
  console.log('chat list query FAIL:', e.message);
}

try {
  db.prepare(`SELECT m.edited_at, m.deleted_at FROM messages m LIMIT 1`).get();
  console.log('messages cols query: OK');
} catch (e) {
  console.log('messages cols query FAIL:', e.message);
}
