/** @typedef {{ kind: 'chat', slug: string } | { kind: 'user', username: string } | null} ParsedRoute */

export function parsePath(pathname = window.location.pathname) {
  const p = (pathname || '/').replace(/\/+$/, '') || '/';
  const channel = p.match(/^\/c\/([a-zA-Z0-9_]{3,32})$/);
  if (channel) return { kind: 'chat', slug: channel[1].toLowerCase() };
  const user = p.match(/^\/u\/([a-zA-Z0-9_]{3,32})$/);
  if (user) return { kind: 'user', username: user[1].toLowerCase() };
  const short = p.match(/^\/([a-zA-Z0-9_]{3,32})$/);
  if (short) return { kind: 'chat', slug: short[1].toLowerCase() };
  return null;
}

export function chatPath(chat, currentUserId) {
  if (!chat) return '/';
  if ((chat.type === 'channel' || chat.type === 'group') && chat.slug) {
    return `/c/${chat.slug}`;
  }
  if (chat.type === 'private' && chat.members?.length) {
    const other = chat.members.find((m) => m.id !== currentUserId);
    if (other?.username) return `/u/${other.username}`;
  }
  return '/';
}

export function userPath(username) {
  const u = (username || '').replace(/^@/, '').toLowerCase();
  return u ? `/u/${u}` : '/';
}

export function setAppPath(path, replace = false) {
  const next = path || '/';
  if (window.location.pathname === next) return;
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', next);
}

export function readThemeFromUrl() {
  try {
    const raw = new URLSearchParams(window.location.search).get('theme');
    if (!raw) return null;
    const json = decodeURIComponent(
      escape(atob(raw.replace(/-/g, '+').replace(/_/g, '/')))
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function buildThemeShareUrl(settings) {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(settings))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?theme=${encoded}`;
}
