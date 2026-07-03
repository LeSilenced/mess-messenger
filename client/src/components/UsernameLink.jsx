import { useState } from 'react';
import { resolveApi } from '../api';
import './UsernameLink.css';

export default function UsernameLink({
  username,
  token,
  onResolve,
  onError,
  className = '',
  showAt = true,
}) {
  const [busy, setBusy] = useState(false);

  if (!username) return null;

  async function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!token || busy) return;
    setBusy(true);
    try {
      const result = await resolveApi.resolve(token, username);
      onResolve?.(result);
    } catch (e) {
      onError?.(e.message || 'Не удалось открыть');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`username-link ${className} ${busy ? 'busy' : ''}`}
      onClick={handleClick}
      disabled={busy}
    >
      {showAt ? '@' : ''}
      {username}
    </button>
  );
}
