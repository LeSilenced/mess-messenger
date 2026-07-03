import { useState, useEffect } from 'react';
import { usersApi, chatsApi } from '../api';
import Avatar from './Avatar';
import { Icon } from './icons';
import './NewChatModal.css';

export default function NewChatModal({ token, onClose, onChatCreated }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (query.trim().length < 2) {
      setUsers([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const list = await usersApi.search(token, query);
        setUsers(list);
      } catch {
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, token]);

  async function startChat(userId) {
    setCreating(userId);
    setError('');
    try {
      const chat = await chatsApi.createPrivate(token, userId);
      onChatCreated(chat);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Новый чат</h2>
          <button type="button" className="icon-btn modal-close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={22} />
          </button>
        </header>
        <div className="modal-search-wrap">
          <Icon name="search" size={18} className="modal-search-icon" />
          <input
          className="modal-search"
          type="search"
          placeholder="Поиск по имени пользователя"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        </div>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-list">
          {loading && <p className="modal-hint">Поиск…</p>}
          {!loading && query.length >= 2 && users.length === 0 && (
            <p className="modal-hint">Пользователи не найдены</p>
          )}
          {query.length < 2 && (
            <p className="modal-hint">Введите минимум 2 символа</p>
          )}
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              className="modal-user"
              disabled={creating === u.id}
              onClick={() => startChat(u.id)}
            >
              <Avatar name={u.displayName} color={u.avatarColor} avatarUrl={u.avatarUrl} />
              <div>
                <span className="modal-user-name">{u.displayName}</span>
                <span className="modal-user-handle">@{u.username}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
