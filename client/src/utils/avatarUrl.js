export function resolveAvatarUrl(url, version) {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (version) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${version}`;
  }
  return url;
}
