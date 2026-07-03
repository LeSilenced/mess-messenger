import db from '../db.js';
import { hasAdminTools } from '../utils/adminAccess.js';

export function silencOnly(req, res, next) {
  const row = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  if (!row || !hasAdminTools(row)) {
    return res.status(404).json({ error: 'Не найдено' });
  }
  req.user.username = row.username;
  next();
}
