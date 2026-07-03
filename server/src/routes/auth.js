import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { userPayload, validateUsername, validateName } from '../utils/userPayload.js';
import { createSession } from '../utils/sessions.js';

const router = Router();

const AVATAR_COLORS = ['#5b8def', '#e85d75', '#50c878', '#f5a623', '#9b59b6', '#1abc9c'];

async function signToken(user, req) {
  const { tokenId } = await createSession(user.id, req);
  return jwt.sign(
    { id: user.id, username: user.username, sid: tokenId },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

router.post('/register', async (req, res) => {
  const { username, email, password, displayName, firstName, lastName, phone } = req.body;
  if (!username?.trim() || !email?.trim() || !password || password.length < 6) {
    return res.status(400).json({ error: 'Заполните все поля. Пароль — минимум 6 символов.' });
  }

  const check = validateUsername(username);
  if (!check.ok) return res.status(400).json({ error: check.error });

  let first = firstName?.trim() || '';
  let last = lastName?.trim() || '';
  if (!first && !last && displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/);
    first = parts[0] || '';
    last = parts.slice(1).join(' ') || '';
  }

  const firstCheck = validateName(first, 'Имя');
  if (!firstCheck.ok) return res.status(400).json({ error: firstCheck.error });
  const lastCheck = validateName(last, 'Фамилия');
  if (!lastCheck.ok) return res.status(400).json({ error: lastCheck.error });
  first = firstCheck.value;
  last = lastCheck.value;

  const display = [first, last].filter(Boolean).join(' ').trim();
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  const hash = bcrypt.hashSync(password, 10);

  try {
    const result = db
      .prepare(
        `INSERT INTO users (username, email, password_hash, display_name, first_name, last_name, avatar_color, phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        check.value,
        email.trim().toLowerCase(),
        hash,
        display,
        first,
        last,
        color,
        phone?.trim() ? String(phone).trim() : null
      );
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = await signToken(user, req);
    res.status(201).json({ token, user: userPayload(user) });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes('UNIQUE') || msg.includes('constraint')) {
      return res.status(409).json({ error: 'Пользователь с таким именем или email уже существует' });
    }
    throw e;
  }
});

router.post('/login', async (req, res) => {
  const { login, password } = req.body;
  if (!login?.trim() || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }
  const key = login.trim().toLowerCase();
  let user = db
    .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .get(key, key);
  if (!user) {
    user = db
      .prepare(
        `SELECT u.* FROM users u
         JOIN user_aliases a ON a.user_id = u.id
         WHERE a.username = ?`
      )
      .get(key);
  }
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  const token = await signToken(user, req);
  res.json({ token, user: userPayload(user) });
});

export default router;
