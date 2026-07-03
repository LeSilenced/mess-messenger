import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { profileApi, chatsApi } from '../api';
import { useTheme } from '../context/ThemeContext';
import { THEME_PRESETS } from '../theme/themePresets';
import ThemeEditor from './ThemeEditor';
import { buildThemeShareUrl } from '../utils/appRoutes';
import { getChatDisplay } from '../utils/chatDisplay';
import Avatar from './Avatar';
import AvatarCropModal from './AvatarCropModal';
import { Icon } from './icons';
const AdminPanel = lazy(() => import('./AdminPanel'));
import PrivacySelector from './PrivacySelector';
import './SettingsPanel.css';

const BASE_TABS = [
  { id: 'profile', label: 'Профиль', icon: 'user' },
  { id: 'mesi', label: 'Mesi', icon: 'crystal-white' },
  { id: 'privacy', label: 'Конфиденциальность', icon: 'lock' },
  { id: 'security', label: 'Безопасность', icon: 'shield' },
  { id: 'appearance', label: 'Внешний вид', icon: 'brush' },
];

function emptyProfile(user) {
  let first = user.firstName || '';
  let last = user.lastName || '';
  if (!first && !last && user.displayName) {
    const parts = user.displayName.trim().split(/\s+/);
    first = parts[0] || '';
    last = parts.slice(1).join(' ') || '';
  }
  return {
    firstName: first,
    lastName: last,
    username: user.username || '',
    bio: user.bio || '',
    phone: user.phone || '',
  };
}

export default function SettingsPanel({
  user,
  token,
  onClose,
  onUserUpdate,
  onLogout,
  onOpenChannel,
  modal = false,
}) {
  const [tab, setTab] = useState('profile');
  const theme = useTheme();
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(emptyProfile(user));
  const [emailForm, setEmailForm] = useState({ email: user.email, password: '' });
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [cropSrc, setCropSrc] = useState(null);
  const [privacy, setPrivacy] = useState({
    avatar: user.privacy?.avatar || 'all',
    lastSeen: user.privacy?.lastSeen || 'all',
    bio: user.privacy?.bio || 'all',
    email: user.privacy?.email || 'contacts',
    phone: user.privacy?.phone || 'contacts',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [mesiData, setMesiData] = useState(null);
  const [mesiLoading, setMesiLoading] = useState(false);
  const [myChannels, setMyChannels] = useState([]);
  const [channelSaving, setChannelSaving] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [themeImportUrl, setThemeImportUrl] = useState('');
  const [themeShareUrl, setThemeShareUrl] = useState('');
  const [editingCustom, setEditingCustom] = useState(false);

  useEffect(() => {
    setProfile(emptyProfile(user));
    setEmailForm({ email: user.email, password: '' });
    setPrivacy({
      avatar: user.privacy?.avatar || 'all',
      lastSeen: user.privacy?.lastSeen || 'all',
      bio: user.privacy?.bio || 'all',
      email: user.privacy?.email || 'contacts',
      phone: user.privacy?.phone || 'contacts',
    });
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    profileApi
      .get(token)
      .then((fresh) => {
        if (cancelled) return;
        onUserUpdate?.(fresh);
        setProfile(emptyProfile(fresh));
        setEmailForm({ email: fresh.email, password: '' });
      })
      .catch(() => {
        setProfile(emptyProfile(user));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    chatsApi
      .list(token)
      .then((list) =>
        setMyChannels(
          list.filter(
            (c) => c.type === 'channel' && ['owner', 'admin'].includes(c.myRole)
          )
        )
      )
      .catch(() => setMyChannels([]));
  }, [token]);

  useEffect(() => {
    if (tab !== 'privacy') return;
    setSessionsLoading(true);
    profileApi
      .sessions(token)
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, [tab, token]);

  async function revokeSession(sessionId) {
    clearAlerts();
    try {
      await profileApi.revokeSession(token, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setMessage('Сессия завершена');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (tab !== 'mesi') return;
    setMesiLoading(true);
    profileApi
      .mesi(token)
      .then(setMesiData)
      .catch(() => setMesiData(null))
      .finally(() => setMesiLoading(false));
  }, [tab, token, user.mesiBalance]);

  async function saveProfileChannel(channelId) {
    setChannelSaving(true);
    clearAlerts();
    try {
      const updated = await profileApi.setProfileChannel(token, channelId);
      onUserUpdate(updated);
      setMessage(channelId ? 'Канал привязан к профилю' : 'Канал отвязан');
    } catch (err) {
      setError(err.message);
    } finally {
      setChannelSaving(false);
    }
  }

  function formatTxKind(kind) {
    const map = {
      gift_send: 'Подарок',
      admin_grant: 'Начисление',
    };
    return map[kind] || kind;
  }

  function clearAlerts() {
    setError('');
    setMessage('');
  }

  function switchTab(id) {
    setTab(id);
    clearAlerts();
  }

  function onPickAvatar(e) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function saveCroppedAvatar(blob) {
    try {
      const updated = await profileApi.uploadAvatar(token, blob);
      onUserUpdate(updated);
      setCropSrc(null);
      setMessage('Фото профиля обновлено');
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function savePrivacy() {
    setSaving(true);
    clearAlerts();
    try {
      const updated = await profileApi.updatePrivacy(token, {
        avatar: privacy.avatar,
        lastSeen: privacy.lastSeen,
        bio: privacy.bio,
        email: privacy.email,
        phone: privacy.phone,
      });
      onUserUpdate(updated);
      setMessage('Настройки конфиденциальности сохранены');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeAvatar() {
    setSaving(true);
    clearAlerts();
    try {
      const updated = await profileApi.deleteAvatar(token);
      onUserUpdate(updated);
      setMessage('Фото удалено');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    clearAlerts();
    try {
      const updated = await profileApi.update(token, {
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        username: profile.username.trim().toLowerCase(),
        bio: profile.bio.trim(),
        phone: profile.phone.trim(),
      });
      onUserUpdate(updated);
      setMessage('Профиль сохранён');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveEmail(e) {
    e.preventDefault();
    setSaving(true);
    clearAlerts();
    try {
      const updated = await profileApi.updateEmail(
        token,
        emailForm.email.trim(),
        emailForm.password
      );
      onUserUpdate(updated);
      setEmailForm((f) => ({ ...f, password: '' }));
      setMessage('Email обновлён');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (passwords.next !== passwords.confirm) {
      setError('Пароли не совпадают');
      return;
    }
    setSaving(true);
    clearAlerts();
    try {
      await profileApi.changePassword(token, passwords.current, passwords.next);
      setPasswords({ current: '', next: '', confirm: '' });
      setMessage('Пароль изменён');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const displayName =
    [profile.firstName, profile.lastName].filter(Boolean).join(' ') || user.displayName;

  const tabs = user.silencTools
    ? [...BASE_TABS, { id: 'tools', label: 'Управление', icon: 'settings' }]
    : BASE_TABS;

  const activeTabMeta = tabs.find((t) => t.id === tab);

  function renderContent() {
    return (
      <>
        {error && <p className="settings-alert error">{error}</p>}
        {message && <p className="settings-alert success">{message}</p>}

        {tab === 'profile' && (
          <form onSubmit={saveProfile} className="settings-form">
            <div className="avatar-edit-block">
              <button
                type="button"
                className="avatar-edit-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <Avatar
                  name={displayName}
                  color={user.avatarColor}
                  avatarUrl={user.avatarUrl}
                  avatarVersion={user.avatarVersion}
                  size={96}
                />
                <span className="avatar-edit-overlay">
                  <Icon name="camera" size={28} />
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={onPickAvatar}
              />
              <div className="avatar-edit-actions">
                <button type="button" className="btn-ghost" onClick={() => fileInputRef.current?.click()}>
                  Загрузить фото
                </button>
                {user.avatarUrl && (
                  <button type="button" className="btn-ghost danger-text" onClick={removeAvatar} disabled={saving}>
                    Удалить
                  </button>
                )}
              </div>
            </div>

            <label className="field">
              <span>Имя *</span>
              <input
                value={profile.firstName}
                onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))}
                placeholder="Иван"
                required
                minLength={1}
              />
            </label>

            <label className="field">
              <span>Фамилия *</span>
              <input
                value={profile.lastName}
                onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))}
                placeholder="Иванов"
                required
                minLength={1}
              />
            </label>

            <label className="field">
              <span>Имя пользователя</span>
              <div className="input-prefix">
                <span>@</span>
                <input
                  value={profile.username}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase(),
                    }))
                  }
                  minLength={3}
                  maxLength={32}
                  required
                />
              </div>
              <p className="field-hint">Латиница, цифры и _, от 3 до 32 символов</p>
            </label>

            <label className="field">
              <span>О себе</span>
              <textarea
                rows={3}
                maxLength={280}
                placeholder="Расскажите о себе…"
                value={profile.bio}
                onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
              />
              <p className="field-hint">{profile.bio.length}/280</p>
            </label>

            <label className="field">
              <span>Телефон</span>
              <input
                type="tel"
                placeholder="+7 900 000-00-00"
                value={profile.phone}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
              />
              <p className="field-hint">Видимость — в разделе «Конфиденциальность»</p>
            </label>

            {myChannels.length > 0 && (
              <div className="field profile-channel-field">
                <span>Канал в профиле</span>
                <p className="field-hint">Каналы, где вы администратор</p>
                <ul className="profile-channel-list">
                  <li>
                    <button
                      type="button"
                      className={`profile-channel-option ${!user.profileChannelId ? 'active' : ''}`}
                      disabled={channelSaving}
                      onClick={() => saveProfileChannel(null)}
                    >
                      Не показывать
                    </button>
                  </li>
                  {myChannels.map((ch) => {
                    const d = getChatDisplay(ch, user.id);
                    return (
                      <li key={ch.id}>
                        <button
                          type="button"
                          className={`profile-channel-option ${user.profileChannelId === ch.id ? 'active' : ''}`}
                          disabled={channelSaving}
                          onClick={() => saveProfileChannel(ch.id)}
                        >
                          <Avatar
                            name={d.name}
                            color={d.avatarColor}
                            avatarUrl={d.avatarUrl}
                            avatarVersion={d.avatarVersion}
                            size={36}
                          />
                          <span className="profile-channel-option-text">
                            <strong>{ch.name}</strong>
                            {ch.slug && <small>@{ch.slug}</small>}
                          </span>
                        </button>
                        {ch.slug && onOpenChannel && (
                          <button
                            type="button"
                            className="icon-btn profile-channel-open"
                            title="Открыть канал"
                            onClick={() => onOpenChannel(ch)}
                          >
                            <Icon name="chevron-left" size={18} className="icon-flip-x" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить профиль'}
            </button>
          </form>
        )}

        {tab === 'mesi' && (
          <div className="settings-form">
            <div className="mesi-balance-card">
              <Icon name="crystal-white" size={56} className="mesi-icon" />
              <p className="mesi-label">Ваш баланс</p>
              <p className="mesi-amount">{mesiData?.balance ?? user.mesiBalance ?? 0}</p>
              <p className="mesi-hint">mesi — внутренняя валюта для подарков</p>
            </div>
            <section className="settings-section mesi-history-section">
              <h3>История операций</h3>
              {mesiLoading && <p className="hint">Загрузка…</p>}
              {!mesiLoading && !mesiData?.transactions?.length && (
                <p className="hint">Транзакций пока нет</p>
              )}
              <ul className="mesi-tx-list">
                {mesiData?.transactions?.map((tx) => (
                  <li key={tx.id} className={tx.amount >= 0 ? 'credit' : 'debit'}>
                    <div className="mesi-tx-main">
                      <span className="mesi-tx-kind">{formatTxKind(tx.kind)}</span>
                      {tx.note && <span className="mesi-tx-note">{tx.note}</span>}
                    </div>
                    <div className="mesi-tx-right">
                      <span className="mesi-tx-amount">
                        {tx.amount >= 0 ? '+' : ''}
                        {tx.amount}
                      </span>
                      <span className="mesi-tx-date">
                        {new Date(
                          tx.createdAt.includes('T')
                            ? tx.createdAt
                            : tx.createdAt.replace(' ', 'T') + 'Z'
                        ).toLocaleString('ru-RU')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {tab === 'privacy' && (
          <div className="settings-form">
            <p className="hint section-hint">
              Выберите, кто видит ваши данные: все, только контакты или никто.
            </p>

            <section className="settings-sessions">
              <h3 className="settings-block-title">Сессии</h3>
              <p className="hint">
                Активные входы в аккаунт. Город и страна определяются по IP-адресу.
              </p>
              {sessionsLoading && <p className="sessions-loading">Загрузка сессий…</p>}
              {!sessionsLoading && sessions.length === 0 && (
                <p className="hint">Нет активных сессий</p>
              )}
              <ul className="sessions-list">
                {sessions.map((s) => (
                  <li key={s.id} className={`session-item ${s.isCurrent ? 'current' : ''}`}>
                    <div className="session-item-main">
                      <span className="session-device">{s.deviceName || 'Устройство'}</span>
                      <span className="session-location">{s.location || '—'}</span>
                      <span className="session-meta">
                        IP: {s.ipAddress || '—'} ·{' '}
                        {new Date(
                          (s.lastActiveAt || s.createdAt || '').includes('T')
                            ? s.lastActiveAt || s.createdAt
                            : `${s.lastActiveAt || s.createdAt}`.replace(' ', 'T') + 'Z'
                        ).toLocaleString('ru-RU')}
                      </span>
                    </div>
                    {s.isCurrent ? (
                      <span className="session-badge">Текущая</span>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost session-revoke"
                        onClick={() => revokeSession(s.id)}
                      >
                        Завершить
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <PrivacySelector
              label="Фото профиля"
              hint="Кто может видеть вашу аватарку"
              value={privacy.avatar}
              onChange={(v) => setPrivacy((p) => ({ ...p, avatar: v }))}
            />
            <PrivacySelector
              label="Время захода"
              hint="Когда вы были в сети"
              value={privacy.lastSeen}
              onChange={(v) => setPrivacy((p) => ({ ...p, lastSeen: v }))}
            />
            <PrivacySelector
              label="О себе"
              hint="Текст в профиле"
              value={privacy.bio}
              onChange={(v) => setPrivacy((p) => ({ ...p, bio: v }))}
            />
            <PrivacySelector
              label="Email"
              hint="Почта, указанная при регистрации"
              value={privacy.email}
              onChange={(v) => setPrivacy((p) => ({ ...p, email: v }))}
            />
            <PrivacySelector
              label="Телефон"
              hint="Номер из профиля"
              value={privacy.phone}
              onChange={(v) => setPrivacy((p) => ({ ...p, phone: v }))}
            />
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={savePrivacy}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        )}

        {tab === 'security' && (
          <div className="settings-form">
            <form onSubmit={saveEmail} className="settings-section">
              <h3>
                <Icon name="mail" size={18} /> Почта
              </h3>
              <p className="hint">Привязка или смена email. Нужен текущий пароль.</p>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={emailForm.email}
                  onChange={(e) => setEmailForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span>Пароль для подтверждения</span>
                <input
                  type="password"
                  value={emailForm.password}
                  onChange={(e) => setEmailForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button type="submit" className="btn-primary" disabled={saving}>
                {emailForm.email !== user.email ? 'Привязать / сменить почту' : 'Подтвердить почту'}
              </button>
            </form>

            <form onSubmit={changePassword} className="settings-section">
              <h3>Смена пароля</h3>
              <label className="field">
                <span>Текущий пароль</span>
                <input
                  type="password"
                  value={passwords.current}
                  onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))}
                  autoComplete="current-password"
                />
              </label>
              <label className="field">
                <span>Новый пароль</span>
                <input
                  type="password"
                  value={passwords.next}
                  onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))}
                  minLength={6}
                  autoComplete="new-password"
                />
              </label>
              <label className="field">
                <span>Повторите пароль</span>
                <input
                  type="password"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
                  autoComplete="new-password"
                />
              </label>
              <button type="submit" className="btn-primary" disabled={saving}>
                Изменить пароль
              </button>
            </form>

            <section className="settings-section danger-zone">
              <button type="button" className="btn-danger" onClick={onLogout}>
                <Icon name="logout" size={18} />
                Выйти из аккаунта
              </button>
            </section>
          </div>
        )}

        {tab === 'appearance' && (
          <div className="settings-form">
            <section className="settings-section">
              <div className="theme-section-head">
                <h3>Готовые темы</h3>
                <button
                  type="button"
                  className="btn-primary theme-create-btn"
                  onClick={() => {
                    const id = theme.createTheme('Моя тема');
                    theme.applyCustomTheme(id);
                    setEditingCustom(true);
                    setMessage('Тема создана — настройте цвета ниже');
                  }}
                >
                  Создать тему
                </button>
              </div>
              <div className="theme-grid">
                {Object.values(THEME_PRESETS).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`theme-card ${
                      !theme.isCustomMode && theme.state.preset === preset.id ? 'active' : ''
                    }`}
                    onClick={() => {
                      theme.setPreset(preset.id);
                      setEditingCustom(false);
                    }}
                  >
                    <div
                      className="theme-preview"
                      style={{
                        background: preset.vars['--bg-app'],
                        borderColor: preset.vars['--accent'],
                      }}
                    >
                      <span style={{ background: preset.vars['--accent'] }} />
                      <span style={{ background: preset.vars['--bg-panel'] }} />
                    </div>
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
            </section>

            {theme.state.customThemes.length > 0 && (
              <section className="settings-section">
                <h3>Ваши темы</h3>
                <ul className="custom-theme-list">
                  {theme.state.customThemes.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={`custom-theme-pick ${
                          theme.isCustomMode && theme.state.customThemeId === t.id ? 'active' : ''
                        }`}
                        onClick={() => {
                          theme.applyCustomTheme(t.id);
                          setEditingCustom(true);
                        }}
                      >
                        <span
                          className="custom-theme-swatch"
                          style={{
                            background: t.vars['--bg-app'],
                            borderColor: t.vars['--accent'],
                          }}
                        />
                        {t.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {theme.isCustomMode && theme.activeCustom && editingCustom && (
              <section className="settings-section theme-editor-section">
                <h3>Редактор: {theme.activeCustom.name}</h3>
                <ThemeEditor
                  theme={theme.activeCustom}
                  onChange={(patch) => theme.updateCustomTheme(theme.activeCustom.id, patch)}
                  onDelete={() => {
                    theme.deleteCustomTheme(theme.activeCustom.id);
                    setEditingCustom(false);
                    setMessage('Тема удалена');
                  }}
                />
              </section>
            )}

            <section className="settings-section">
              <h3>Скругление: {theme.state.radius}px</h3>
              <input
                type="range"
                min={6}
                max={20}
                value={theme.state.radius}
                onChange={(e) => theme.setRadius(Number(e.target.value))}
                className="range"
              />
            </section>

            <section className="settings-section">
              <h3>Текст: {Math.round(theme.state.fontScale * 100)}%</h3>
              <input
                type="range"
                min={0.875}
                max={1.25}
                step={0.025}
                value={theme.state.fontScale}
                onChange={(e) => theme.setFontScale(Number(e.target.value))}
                className="range"
              />
            </section>

            <section className="settings-section">
              <h3>Поделиться</h3>
              <button
                type="button"
                className="btn-primary full"
                onClick={() => {
                  const url = buildThemeShareUrl(theme.exportTheme());
                  setThemeShareUrl(url);
                  navigator.clipboard?.writeText(url);
                  setMessage('Ссылка скопирована');
                }}
              >
                Скопировать ссылку на тему
              </button>
              {themeShareUrl && <p className="field-hint theme-share-url">{themeShareUrl}</p>}
              <label className="field">
                <span>Импорт по ссылке</span>
                <input
                  value={themeImportUrl}
                  onChange={(e) => setThemeImportUrl(e.target.value)}
                  placeholder="Вставьте ссылку с ?theme=..."
                />
              </label>
              <button
                type="button"
                className="btn-ghost full"
                onClick={() => {
                  try {
                    const u = new URL(themeImportUrl.trim());
                    const raw = u.searchParams.get('theme');
                    if (!raw) {
                      setError('В ссылке нет параметра theme');
                      return;
                    }
                    const json = decodeURIComponent(
                      escape(atob(raw.replace(/-/g, '+').replace(/_/g, '/')))
                    );
                    const data = JSON.parse(json);
                    if (theme.importTheme(data)) {
                      setEditingCustom(data.mode === 'custom');
                      setMessage('Тема применена');
                      setThemeImportUrl('');
                      setError('');
                    } else setError('Некорректная тема');
                  } catch {
                    setError('Не удалось разобрать ссылку');
                  }
                }}
              >
                Применить тему
              </button>
            </section>

            <button type="button" className="btn-ghost full" onClick={theme.resetTheme}>
              Сбросить оформление
            </button>
          </div>
        )}

        {tab === 'tools' && user.silencTools && (
          <Suspense fallback={<p className="settings-loading">Загрузка панели…</p>}>
            <AdminPanel token={token} user={user} onUserUpdate={onUserUpdate} />
          </Suspense>
        )}
      </>
    );
  }

  return (
    <aside className={`settings-panel ${modal ? 'settings-panel-modal' : ''}`}>
      <header className="settings-header">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
          <Icon name="chevron-left" size={22} />
        </button>
        <div className="settings-header-titles">
          <span className="settings-header-eyebrow">Настройки</span>
          <h1>{activeTabMeta?.label || 'Профиль'}</h1>
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav-icons" aria-label="Разделы настроек">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`settings-nav-icon-btn ${tab === t.id ? 'active' : ''}`}
              onClick={() => switchTab(t.id)}
              aria-label={t.label}
              aria-current={tab === t.id ? 'page' : undefined}
              title={t.label}
            >
              <Icon name={t.icon} size={22} />
            </button>
          ))}
        </nav>
        <div className="settings-content">{renderContent()}</div>
      </div>

      {cropSrc && (
        <AvatarCropModal
          imageSrc={cropSrc}
          onClose={() => setCropSrc(null)}
          onSave={saveCroppedAvatar}
        />
      )}
    </aside>
  );
}
