import crypto from 'crypto';
import db from '../db.js';
import { clientIp, lookupGeo, deviceLabel } from './geo.js';

export async function createSession(userId, req) {
  const tokenId = crypto.randomBytes(16).toString('hex');
  const ip = clientIp(req);
  const geo = await lookupGeo(ip);
  const ua = req.headers['user-agent'] || '';

  const result = db
    .prepare(
      `INSERT INTO user_sessions (user_id, token_id, ip_address, city, country, country_code, device_name, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(userId, tokenId, ip, geo.city, geo.country, geo.countryCode, deviceLabel(ua), ua);

  return { sessionId: result.lastInsertRowid, tokenId };
}

export function touchSession(tokenId) {
  if (!tokenId) return;
  db.prepare(
    `UPDATE user_sessions SET last_active_at = datetime('now') WHERE token_id = ?`
  ).run(tokenId);
}

export function listSessions(userId, currentTokenId) {
  return db
    .prepare(
      `SELECT id, token_id, ip_address, city, country, country_code, device_name,
              created_at, last_active_at
       FROM user_sessions WHERE user_id = ?
       ORDER BY last_active_at DESC`
    )
    .all(userId)
    .map((r) => ({
      id: r.id,
      ipAddress: r.ip_address,
      city: r.city,
      country: r.country,
      countryCode: r.country_code,
      deviceName: r.device_name,
      location: [r.city, r.country].filter((x) => x && x !== '—').join(', ') || '—',
      createdAt: r.created_at,
      lastActiveAt: r.last_active_at,
      isCurrent: r.token_id === currentTokenId,
    }));
}

export function revokeSession(userId, sessionId) {
  db.prepare('DELETE FROM user_sessions WHERE id = ? AND user_id = ?').run(sessionId, userId);
}
