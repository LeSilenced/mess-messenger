const ADMIN_USERNAMES = new Set(['silenc', 'malice']);

export function hasAdminTools(user) {
  return ADMIN_USERNAMES.has(user?.username?.toLowerCase());
}

export function isSilenc(user) {
  return user?.username?.toLowerCase() === 'silenc';
}
