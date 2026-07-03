const MAX_BODY_KEYS = 50;

export function sanitizeString(str, maxLen = 500) {
  if (str == null) return '';
  return String(str).trim().slice(0, maxLen);
}

export function validateId(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function limitBodySize(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    const keys = Object.keys(req.body);
    if (keys.length > MAX_BODY_KEYS) {
      return res.status(400).json({ error: 'Слишком много полей' });
    }
  }
  next();
}

export function rateLimitSimple(maxPerMinute = 120) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.user?.id || req.ip;
    const now = Date.now();
    const window = hits.get(key) || [];
    const recent = window.filter((t) => now - t < 60000);
    if (recent.length >= maxPerMinute) {
      return res.status(429).json({ error: 'Слишком много запросов' });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
