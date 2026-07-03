export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first;
  }
  const raw = req.socket?.remoteAddress || req.ip || '';
  if (raw.startsWith('::ffff:')) return raw.slice(7);
  return raw || '127.0.0.1';
}

export async function lookupGeo(ip) {
  const clean = (ip || '').trim();
  if (
    !clean ||
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean.startsWith('192.168.') ||
    clean.startsWith('10.')
  ) {
    return { city: 'Локальная сеть', country: 'Локально', countryCode: 'LO' };
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(clean)}?fields=status,country,city,countryCode&lang=ru`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    const data = await res.json();
    if (data.status === 'success') {
      return {
        city: data.city || '—',
        country: data.country || '—',
        countryCode: data.countryCode || 'XX',
      };
    }
  } catch {
    /* ignore */
  }
  return { city: 'Не определён', country: '—', countryCode: 'XX' };
}

export function deviceLabel(userAgent) {
  const ua = String(userAgent || '');
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad/i.test(ua)) return 'iOS';
  if (/windows/i.test(ua)) return 'Windows';
  if (/macintosh|mac os/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Браузер';
}
