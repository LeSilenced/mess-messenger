import jwt from 'jsonwebtoken';
import db from '../db.js';
import { touchSession } from '../utils/sessions.js';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.sid) {
      const session = db
        .prepare('SELECT id FROM user_sessions WHERE token_id = ? AND user_id = ?')
        .get(payload.sid, payload.id);
      if (!session) {
        return res.status(401).json({ error: 'Сессия завершена' });
      }
      touchSession(payload.sid);
    }
    req.user = payload;
    req.tokenId = payload.sid || null;
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

export function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Требуется авторизация'));
  }
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Недействительный токен'));
  }
}
