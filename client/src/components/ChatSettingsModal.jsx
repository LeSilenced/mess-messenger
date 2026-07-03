import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { chatsApi } from '../api';
import { getChatDisplay } from '../utils/chatDisplay';
import Avatar from './Avatar';
import AvatarCropModal from './AvatarCropModal';
import { Icon } from './icons';
import './ChatSettingsModal.css';

const ROLES = [
  { id: 'member', label: 'Участник' },
  { id: 'moderator', label: 'Модератор' },
  { id: 'admin', label: 'Админ' },
];

export default function ChatSettingsModal({ chat, token, currentUserId, onClose, onUpdated }) {
  const [tab, setTab] = useState('info');
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [username, setUsername] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [cropSrc, setCropSrc] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    name: chat.name || '',
    description: chat.description || '',
    slug: chat.slug || '',
    isPublic: chat.isPublic !== false,
  });

  const canManage = ['owner', 'admin'].includes(chat.myRole);
  const isChannel = chat.type === 'channel';
  const display = getChatDisplay(chat, currentUserId);
  const inviteUrl =
    typeof window !== 'undefined' && form.slug
      ? `${window.location.origin}/c/${form.slug}`
      : '';

  function loadMembers() {
    setLoading(true);
    chatsApi
      .getMembers(token, chat.id)
      .then(setMembers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (canManage) loadMembers();
    else setLoading(false);
  }, [chat.id, canManage]);

  async function addMember(e) {
    e.preventDefault();
    setError('');
    try {
      await chatsApi.addMember(token, chat.id, username.trim().toLowerCase(), newRole);
      setUsername('');
      setMsg('Участник добавлен');
      loadMembers();
    } catch (e) {
      setError(e.message);
    }
  }

  async function changeRole(userId, role) {
    setError('');
    try {
      await chatsApi.updateMember(token, chat.id, userId, { role });
      loadMembers();
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveInfo(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const updated = await chatsApi.update(token, chat.id, {
        name: form.name,
        description: form.description,
        slug: form.slug || null,
        isPublic: form.isPublic,
      });
      onUpdated?.(updated);
      setMsg('Сохранено');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveCroppedAvatar(blob) {
    const updated = await chatsApi.uploadAvatar(token, chat.id, blob);
    onUpdated?.(updated);
    setCropSrc(null);
    setMsg('Фото обновлено');
  }

  async function removeAvatar() {
    setSaving(true);
    try {
      const updated = await chatsApi.deleteAvatar(token, chat.id);
      onUpdated?.(updated);
      setMsg('Фото удалено');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function copyInvite() {
    if (!inviteUrl) return;
    navigator.clipboard?.writeText(inviteUrl);
    setMsg('Ссылка скопирована');
  }

  const title = isChannel ? 'Канал' : 'Группа';

  return createPortal(
    <div className="chat-settings-overlay" onClick={onClose}>
      <div className="chat-settings-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </header>

        <nav className="chat-settings-tabs">
          <button type="button" className={tab === 'info' ? 'active' : ''} onClick={() => setTab('info')}>
            <Icon name="info" size={18} /> Информация
          </button>
          {canManage && (
            <>
              <button
                type="button"
                className={tab === 'type' ? 'active' : ''}
                onClick={() => setTab('type')}
              >
                <Icon name="link" size={18} /> Тип и ссылка
              </button>
              <button
                type="button"
                className={tab === 'members' ? 'active' : ''}
                onClick={() => setTab('members')}
              >
                <Icon name="users" size={18} /> Администраторы
              </button>
            </>
          )}
        </nav>

        {error && <p className="cs-error">{error}</p>}
        {msg && <p className="cs-success">{msg}</p>}

        {tab === 'info' && (
          <div className="cs-body">
            <div className="cs-avatar-block">
              <Avatar
                name={display.name}
                color={display.avatarColor}
                avatarUrl={display.avatarUrl}
                avatarVersion={display.avatarVersion}
                size={80}
              />
              {canManage && (
                <div className="cs-avatar-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => fileRef.current?.click()}
                    disabled={saving}
                  >
                    Изменить фото
                  </button>
                  {chat.avatarUrl && (
                    <button type="button" className="btn-ghost danger-text" onClick={removeAvatar}>
                      Удалить
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => setCropSrc(reader.result);
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                </div>
              )}
            </div>

            {canManage ? (
              <form className="cs-form" onSubmit={saveInfo}>
                <label>
                  <span>Название</span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </label>
                {isChannel && (
                  <label>
                    <span>Описание</span>
                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </label>
                )}
                <p className="cs-hint">
                  {chat.memberCount || 0} подписчиков · создан{' '}
                  {chat.createdAt
                    ? new Date(chat.createdAt).toLocaleDateString('ru-RU')
                    : '—'}
                </p>
                <button type="submit" className="btn-primary" disabled={saving}>
                  Сохранить
                </button>
              </form>
            ) : (
              <>
                <h4 className="cs-name">{chat.name}</h4>
                {chat.description && <p className="cs-desc">{chat.description}</p>}
              </>
            )}
          </div>
        )}

        {tab === 'type' && canManage && (
          <form className="cs-body cs-form" onSubmit={saveInfo}>
            {isChannel && (
              <fieldset className="cs-fieldset">
                <legend>Тип канала</legend>
                <label className="cs-radio">
                  <input
                    type="radio"
                    checked={form.isPublic}
                    onChange={() => setForm((f) => ({ ...f, isPublic: true }))}
                  />
                  <span>
                    <strong>Публичный</strong>
                    <small>Находится в поиске, любой может подписаться</small>
                  </span>
                </label>
                <label className="cs-radio">
                  <input
                    type="radio"
                    checked={!form.isPublic}
                    onChange={() => setForm((f) => ({ ...f, isPublic: false }))}
                  />
                  <span>
                    <strong>Приватный</strong>
                    <small>Только по ссылке-приглашению</small>
                  </span>
                </label>
              </fieldset>
            )}

            <label>
              <span>Ссылка (@username)</span>
              <div className="input-prefix">
                <span>@</span>
                <input
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      slug: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase(),
                    }))
                  }
                  placeholder="my_channel"
                  maxLength={32}
                />
              </div>
            </label>

            {inviteUrl && (
              <div className="cs-invite">
                <span className="cs-invite-url">{inviteUrl}</span>
                <button type="button" className="btn-ghost" onClick={copyInvite}>
                  Копировать
                </button>
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={saving}>
              Сохранить
            </button>
          </form>
        )}

        {tab === 'members' && canManage && (
          <div className="cs-body">
            <form onSubmit={addMember} className="cs-add-form">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="@username"
                required
              />
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-primary">
                +
              </button>
            </form>
            {loading && <p className="cs-hint">Загрузка…</p>}
            <ul className="cs-members">
              {members.map((m) => (
                <li key={m.id}>
                  <div>
                    <strong>{m.displayName}</strong>
                    <span>@{m.username}</span>
                  </div>
                  {m.role === 'owner' ? (
                    <span className="cs-role-badge owner">владелец</span>
                  ) : (
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m.id, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {cropSrc && (
          <AvatarCropModal
            imageSrc={cropSrc}
            onClose={() => setCropSrc(null)}
            onSave={saveCroppedAvatar}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
