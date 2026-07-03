import { useState } from 'react';
import { chatsApi } from '../api';
import { Icon } from './icons';
import './CreateChatModal.css';

export default function CreateChatModal({ token, onClose, onChatCreated }) {
  const [type, setType] = useState('group');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function create(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const body = { name, description };
      if (slug.trim()) body.slug = slug.trim().toLowerCase();
      const chat =
        type === 'channel'
          ? await chatsApi.createChannel(token, body)
          : await chatsApi.createGroup(token, { name, slug: body.slug });
      onChatCreated(chat);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="create-chat-overlay" onClick={onClose}>
      <form className="create-chat-modal" onClick={(e) => e.stopPropagation()} onSubmit={create}>
        <header>
          <h3>Новый {type === 'channel' ? 'канал' : 'чат'}</h3>
          <button type="button" className="icon-btn" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="create-type-tabs">
          <button type="button" className={type === 'group' ? 'active' : ''} onClick={() => setType('group')}>
            Группа
          </button>
          <button type="button" className={type === 'channel' ? 'active' : ''} onClick={() => setType('channel')}>
            Mes-канал
          </button>
        </div>
        <label className="field">
          <span>Название</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={64} />
        </label>
        {type === 'channel' && (
          <label className="field">
            <span>Описание</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </label>
        )}
        <label className="field">
          <span>Ссылка (@username)</span>
          <div className="input-prefix">
            <span>@</span>
            <input
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())
              }
              placeholder={type === 'channel' ? 'my_channel' : 'my_group'}
              maxLength={32}
            />
          </div>
          <p className="field-hint">Необязательно. Откроется по адресу /c/username</p>
        </label>
        {error && <p className="create-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Создание…' : 'Создать'}
        </button>
      </form>
    </div>
  );
}
