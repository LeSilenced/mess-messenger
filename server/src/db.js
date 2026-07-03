import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOLUME_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..');
const dataDir = path.join(VOLUME_DIR, 'data');
const uploadsDir = path.join(VOLUME_DIR, 'uploads', 'avatars');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const dbPath = path.join(dataDir, 'mess.db');
const raw = new DatabaseSync(dbPath);

raw.exec('PRAGMA journal_mode = WAL');
raw.exec('PRAGMA foreign_keys = ON');

raw.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    first_name TEXT DEFAULT '',
    last_name TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    avatar_color TEXT DEFAULT '#5b8def',
    avatar_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'private',
    name TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_members (
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
`);

function columnExists(table, name) {
  const cols = raw.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === name);
}

function addColumn(table, name, def) {
  if (!columnExists(table, name)) {
    raw.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  }
}

addColumn('users', 'first_name', "TEXT DEFAULT ''");
addColumn('users', 'last_name', "TEXT DEFAULT ''");
addColumn('users', 'bio', "TEXT DEFAULT ''");
addColumn('users', 'avatar_url', 'TEXT');
addColumn('messages', 'edited_at', 'TEXT');
addColumn('messages', 'deleted_at', 'TEXT');
addColumn('chat_members', 'hidden_at', 'TEXT');
addColumn('users', 'last_seen_at', 'TEXT');
addColumn('users', 'is_online', 'INTEGER DEFAULT 0');
addColumn('users', 'privacy_avatar', "TEXT DEFAULT 'all'");
addColumn('users', 'privacy_last_seen', "TEXT DEFAULT 'all'");
addColumn('users', 'privacy_bio', "TEXT DEFAULT 'all'");
addColumn('users', 'avatar_updated_at', 'TEXT');
addColumn('users', 'mesi_balance', 'INTEGER DEFAULT 0');
addColumn('users', 'profile_color', 'TEXT');
addColumn('users', 'profile_banner', 'TEXT');
addColumn('messages', 'message_type', "TEXT DEFAULT 'text'");
addColumn('messages', 'attachment_url', 'TEXT');
addColumn('messages', 'attachment_name', 'TEXT');
addColumn('messages', 'attachment_size', 'INTEGER');
addColumn('messages', 'attachment_mime', 'TEXT');
addColumn('chat_members', 'role', "TEXT DEFAULT 'member'");
addColumn('chat_members', 'permissions', 'TEXT');
addColumn('chats', 'description', 'TEXT');
addColumn('chats', 'accent_color', 'TEXT');
addColumn('chats', 'avatar_url', 'TEXT');
addColumn('chats', 'created_by', 'INTEGER');
addColumn('chats', 'slug', 'TEXT');
addColumn('chat_members', 'cleared_at', 'TEXT');
addColumn('users', 'profile_channel_id', 'INTEGER');
addColumn('users', 'profile_theme_color', 'TEXT');
addColumn('users', 'profile_media_url', 'TEXT');
addColumn('users', 'profile_media_type', "TEXT DEFAULT 'none'");
addColumn('users', 'phone', 'TEXT');
addColumn('users', 'privacy_email', "TEXT DEFAULT 'contacts'");
addColumn('users', 'privacy_phone', "TEXT DEFAULT 'contacts'");
addColumn('chats', 'is_public', 'INTEGER DEFAULT 1');
addColumn('chats', 'avatar_updated_at', 'TEXT');
addColumn('gifts', 'gift_message', 'TEXT');

raw.exec(`
  CREATE TABLE IF NOT EXISTS chat_reads (
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    last_read_message_id INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

try {
  raw.exec(
    `UPDATE users SET first_name = display_name
     WHERE (first_name IS NULL OR first_name = '') AND display_name IS NOT NULL AND display_name != ''`
  );
} catch {
  /* ignore */
}

const filesDir = path.join(VOLUME_DIR, 'uploads', 'files');
const storiesDir = path.join(VOLUME_DIR, 'uploads', 'stories');
if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });
if (!fs.existsSync(storiesDir)) fs.mkdirSync(storiesDir, { recursive: true });

export const AVATARS_DIR = uploadsDir;
export const FILES_DIR = filesDir;
export const STORIES_DIR = storiesDir;

raw.exec(`
  CREATE TABLE IF NOT EXISTS user_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'image',
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS story_views (
    story_id INTEGER NOT NULL,
    viewer_id INTEGER NOT NULL,
    viewed_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (story_id, viewer_id),
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
    FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS gifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    gift_type TEXT NOT NULL,
    mesi_spent INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id, expires_at);
  CREATE INDEX IF NOT EXISTS idx_gifts_to ON gifts(to_user_id);
  CREATE INDEX IF NOT EXISTS idx_user_aliases_user ON user_aliases(user_id);

  CREATE TABLE IF NOT EXISTS gift_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mesi_price INTEGER NOT NULL DEFAULT 10,
    stock INTEGER DEFAULT -1,
    image_url TEXT,
    color TEXT DEFAULT '#888888',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mesi_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    kind TEXT NOT NULL,
    ref_type TEXT,
    ref_id TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_slug ON chats(slug) WHERE slug IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_mesi_tx_user ON mesi_transactions(user_id, created_at);

  CREATE TABLE IF NOT EXISTS user_contacts (
    owner_id INTEGER NOT NULL,
    contact_user_id INTEGER NOT NULL,
    custom_first_name TEXT DEFAULT '',
    custom_last_name TEXT DEFAULT '',
    added_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (owner_id, contact_user_id),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_id TEXT UNIQUE NOT NULL,
    ip_address TEXT,
    city TEXT,
    country TEXT,
    country_code TEXT,
    device_name TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_active_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_user_contacts_owner ON user_contacts(owner_id);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, last_active_at);
`);

const giftsDir = path.join(VOLUME_DIR, 'uploads', 'gifts');
const profileMediaDir = path.join(VOLUME_DIR, 'uploads', 'profile_media');
const chatAvatarsDir = path.join(VOLUME_DIR, 'uploads', 'chat_avatars');
if (!fs.existsSync(giftsDir)) fs.mkdirSync(giftsDir, { recursive: true });
if (!fs.existsSync(profileMediaDir)) fs.mkdirSync(profileMediaDir, { recursive: true });
if (!fs.existsSync(chatAvatarsDir)) fs.mkdirSync(chatAvatarsDir, { recursive: true });
export const GIFTS_DIR = giftsDir;
export const PROFILE_MEDIA_DIR = profileMediaDir;
export const CHAT_AVATARS_DIR = chatAvatarsDir;

const db = {
  prepare(sql) {
    const stmt = raw.prepare(sql);
    return {
      get(...params) {
        return stmt.get(...params);
      },
      all(...params) {
        return [...stmt.all(...params)];
      },
      run(...params) {
        const result = stmt.run(...params);
        return { lastInsertRowid: Number(result.lastInsertRowid) };
      },
    };
  },
  exec(sql) {
    raw.exec(sql);
  },
  transaction(fn) {
    return () => {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        raw.exec('COMMIT');
        return result;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    };
  },
};

export default db;
