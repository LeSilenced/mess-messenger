import { useState, useEffect, useRef } from 'react';
import { adminApi } from '../api';
import { Icon } from './icons';
import './AdminPanel.css';

export default function AdminPanel({ token, user, onUserUpdate }) {
  const [data, setData] = useState(null);
  const [gifts, setGifts] = useState([]);
  const [alias, setAlias] = useState('');
  const [grantUser, setGrantUser] = useState('');
  const [grantAmount, setGrantAmount] = useState('');
  const [profileThemeColor, setProfileThemeColor] = useState(
    user.profileThemeColor || user.profileColor || '#5b8def'
  );
  const [profileBanner, setProfileBanner] = useState(user.profileBanner || '');
  const [giftForm, setGiftForm] = useState({
    id: '',
    name: '',
    mesiPrice: '10',
    stock: '-1',
    color: '#888888',
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const mediaRef = useRef(null);
  const giftImgRef = useRef(null);
  const [giftImageTarget, setGiftImageTarget] = useState(null);

  async function refresh() {
    const [panel, giftList] = await Promise.all([
      adminApi.panel(token),
      adminApi.listGifts(token),
    ]);
    setData(panel);
    setGifts(giftList);
    setProfileThemeColor(panel.profileThemeColor || panel.profileColor || '#5b8def');
    setProfileBanner(panel.profileBanner || '');
  }

  useEffect(() => {
    refresh().catch((e) => setErr(e.message));
  }, [token]);

  async function addAlias() {
    setErr('');
    try {
      await adminApi.addAlias(token, alias);
      setAlias('');
      setMsg('Username добавлен');
      await refresh();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function removeAlias(id) {
    try {
      await adminApi.removeAlias(token, id);
      await refresh();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function grantMesi() {
    setErr('');
    try {
      const r = await adminApi.grantMesi(token, grantUser, Number(grantAmount));
      setMsg(`Выдано ${grantAmount} mesi пользователю @${r.username}`);
      setGrantUser('');
      setGrantAmount('');
    } catch (e) {
      setErr(e.message);
    }
  }

  async function saveProfileLook() {
    setErr('');
    try {
      const updated = await adminApi.updateProfile(token, {
        profileColor: profileThemeColor,
        profileThemeColor,
        profileBanner,
      });
      onUserUpdate(updated);
      setMsg('Оформление профиля сохранено');
    } catch (e) {
      setErr(e.message);
    }
  }

  async function onProfileMedia(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    try {
      const updated = await adminApi.uploadProfileMedia(token, file);
      onUserUpdate(updated);
      setMsg('Медиа профиля обновлено');
      await refresh();
    } catch (ex) {
      setErr(ex.message);
    }
    e.target.value = '';
  }

  async function removeProfileMedia() {
    try {
      const updated = await adminApi.deleteProfileMedia(token);
      onUserUpdate(updated);
      setMsg('Медиа удалено');
      await refresh();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function createGift() {
    setErr('');
    try {
      await adminApi.createGift(token, {
        id: giftForm.id.trim().toLowerCase(),
        name: giftForm.name.trim(),
        mesiPrice: Number(giftForm.mesiPrice),
        stock: Number(giftForm.stock),
        color: giftForm.color,
      });
      setGiftForm({ id: '', name: '', mesiPrice: '10', stock: '-1', color: '#888888' });
      setMsg('Подарок создан');
      await refresh();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function toggleGiftActive(g) {
    try {
      await adminApi.updateGift(token, g.id, { active: !g.active });
      await refresh();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function onGiftImage(e) {
    const file = e.target.files?.[0];
    if (!file || !giftImageTarget) return;
    try {
      await adminApi.uploadGiftImage(token, giftImageTarget, file);
      setMsg('Картинка подарка загружена');
      await refresh();
    } catch (ex) {
      setErr(ex.message);
    }
    setGiftImageTarget(null);
    e.target.value = '';
  }

  if (!data && !err) return <p className="admin-hint">Загрузка…</p>;

  if (err && !data) {
    return (
      <div className="admin-panel">
        <p className="settings-alert error">{err}</p>
        <p className="admin-hint">
          Раздел доступен только аккаунту <strong>silenc</strong>. Выйдите и войдите заново после
          перезапуска сервера.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      {err && <p className="settings-alert error">{err}</p>}
      {msg && <p className="settings-alert success">{msg}</p>}

      <section className="settings-section">
        <h3>Дополнительные username</h3>
        <div className="admin-row">
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
            placeholder="новый_username"
          />
          <button type="button" className="btn-primary" onClick={addAlias}>
            Добавить
          </button>
        </div>
        <ul className="alias-list">
          <li>
            @{data?.username || user.username} <span>(основной)</span>
          </li>
          {data?.aliases?.map((a) => (
            <li key={a.id}>
              @{a.username}
              <button
                type="button"
                className="btn-ghost danger-text"
                onClick={() => removeAlias(a.id)}
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="settings-section">
        <h3>Выдать mesi</h3>
        <label className="field">
          <span>Username</span>
          <input value={grantUser} onChange={(e) => setGrantUser(e.target.value)} placeholder="username" />
        </label>
        <label className="field">
          <span>Сумма</span>
          <input
            type="number"
            min={1}
            value={grantAmount}
            onChange={(e) => setGrantAmount(e.target.value)}
          />
        </label>
        <button type="button" className="btn-primary" onClick={grantMesi}>
          Выдать
        </button>
      </section>

      <section className="settings-section">
        <h3>Оформление профиля</h3>
        <label className="field">
          <span>Цвет профиля</span>
          <input type="color" value={profileThemeColor} onChange={(e) => setProfileThemeColor(e.target.value)} />
          <p className="field-hint">Только для аккаунта silenc — другие пользователи не могут менять цвет</p>
        </label>
        <label className="field">
          <span>Баннер (URL или текст)</span>
          <input value={profileBanner} onChange={(e) => setProfileBanner(e.target.value)} />
        </label>
        <div className="admin-media-row">
          <button type="button" className="btn-ghost" onClick={() => mediaRef.current?.click()}>
            Фото/видео в шапку
          </button>
          {data?.profileMediaUrl && (
            <button type="button" className="btn-ghost danger-text" onClick={removeProfileMedia}>
              Удалить медиа
            </button>
          )}
        </div>
        <input ref={mediaRef} type="file" accept="image/*,video/*" hidden onChange={onProfileMedia} />
        <button type="button" className="btn-primary" onClick={saveProfileLook}>
          Сохранить оформление
        </button>
      </section>

      <section className="settings-section">
        <h3>Подарки (каталог)</h3>
        <div className="admin-gift-form">
          <input
            placeholder="id (crystal_gold)"
            value={giftForm.id}
            onChange={(e) =>
              setGiftForm((f) => ({
                ...f,
                id: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase(),
              }))
            }
          />
          <input
            placeholder="Название"
            value={giftForm.name}
            onChange={(e) => setGiftForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            type="number"
            min={1}
            placeholder="Цена mesi"
            value={giftForm.mesiPrice}
            onChange={(e) => setGiftForm((f) => ({ ...f, mesiPrice: e.target.value }))}
          />
          <input
            type="number"
            placeholder="Остаток (-1 = ∞)"
            value={giftForm.stock}
            onChange={(e) => setGiftForm((f) => ({ ...f, stock: e.target.value }))}
          />
          <input
            type="color"
            value={giftForm.color}
            onChange={(e) => setGiftForm((f) => ({ ...f, color: e.target.value }))}
          />
          <button type="button" className="btn-primary" onClick={createGift}>
            Создать
          </button>
        </div>
        <input
          ref={giftImgRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={onGiftImage}
        />
        <p className="field-hint">К каждому подарку — кнопка PNG (до 2 МБ)</p>
        <ul className="admin-gifts-list">
          {gifts.map((g) => (
            <li key={g.id} className={g.active ? '' : 'inactive'}>
              {g.imageUrl ? (
                <img src={g.imageUrl} alt="" className="admin-gift-thumb" />
              ) : (
                <span className="admin-gift-dot" style={{ background: g.color }} />
              )}
              <div className="admin-gift-meta">
                <strong>{g.name}</strong>
                <span>
                  {g.mesi} mesi · stock {g.stock < 0 ? '∞' : g.stock}
                </span>
                <code>{g.id}</code>
              </div>
              <div className="admin-gift-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setGiftImageTarget(g.id);
                    giftImgRef.current?.click();
                  }}
                >
                  PNG
                </button>
                <button type="button" className="btn-ghost" onClick={() => toggleGiftActive(g)}>
                  {g.active ? 'Скрыть' : 'Включить'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
