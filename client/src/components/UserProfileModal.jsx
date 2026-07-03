import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usersApi, chatsApi, storiesApi, giftsApi } from '../api';
import Avatar from './Avatar';
import { Icon } from './icons';
import GiftModal from './GiftModal';
import UsernameLink from './UsernameLink';
import { getContactDisplayName } from '../utils/contacts';
import { useContacts } from '../hooks/useContacts';
import { resolveMediaUrl } from '../utils/mediaUrl';
import './UserProfileModal.css';

const GIFT_META = {
  crystal_white: { icon: 'crystal-white', name: 'Белый кристалл', color: '#e8e8e8' },
  crystal_black: { icon: 'crystal-black', name: 'Чёрный кристалл', color: '#1a1a1a' },
  crystal_red: { icon: 'crystal-red', name: 'Красный кристалл', color: '#e53935' },
  crystal_blue: { icon: 'crystal-blue', name: 'Синий кристалл', color: '#1e88e5' },
  crystal_green: { icon: 'crystal-green', name: 'Зелёный кристалл', color: '#43a047' },
};

export default function UserProfileModal({
  userId,
  currentUserId,
  currentUser,
  token,
  onClose,
  onChatCreated,
  onDeleteChat,
  onUserUpdate,
  onResolve,
}) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [contactEditOpen, setContactEditOpen] = useState(false);
  const [contactFirst, setContactFirst] = useState('');
  const [contactLast, setContactLast] = useState('');
  const [giftOpen, setGiftOpen] = useState(false);
  const [chatId, setChatId] = useState(null);
  const [section, setSection] = useState('info');
  const [stories, setStories] = useState([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [giftDetails, setGiftDetails] = useState([]);
  const [giftsLoading, setGiftsLoading] = useState(false);
  const menuRef = useRef(null);
  const { isContact, add, remove, updateNames, contacts } = useContacts(currentUserId, token);

  const isOwn = userId === currentUserId;
  const inContacts = isContact(userId);
  const contactRecord = contacts.find((c) => c.id === userId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setSection('info');
    setContactEditOpen(false);
    usersApi
      .profile(token, userId)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    chatsApi
      .chatWith(token, userId)
      .then((r) => {
        if (!cancelled) setChatId(r.chatId);
      })
      .catch(() => {});

    setGiftsLoading(true);
    giftsApi
      .forUser(token, userId)
      .then((list) => {
        if (!cancelled) setGiftDetails(list);
      })
      .catch(() => {
        if (!cancelled) setGiftDetails([]);
      })
      .finally(() => {
        if (!cancelled) setGiftsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, token, currentUserId]);

  useEffect(() => {
    if (inContacts && contactRecord) {
      setContactFirst(contactRecord.customFirstName || '');
      setContactLast(contactRecord.customLastName || '');
    }
  }, [inContacts, contactRecord?.id, contactRecord?.customFirstName, contactRecord?.customLastName]);

  useEffect(() => {
    if (section !== 'stories' || !profile) return;
    setStoriesLoading(true);
    storiesApi
      .userStories(token, userId)
      .then(setStories)
      .catch(() => setStories([]))
      .finally(() => setStoriesLoading(false));
  }, [section, userId, token, profile]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  async function openChat() {
    try {
      const chat = await chatsApi.createPrivate(token, userId);
      onChatCreated?.(chat);
      onClose();
    } catch (e) {
      setError(e.message);
    }
  }

  async function toggleContact() {
    if (!profile) return;
    try {
      if (inContacts) {
        await remove(userId);
        setContactEditOpen(false);
      } else {
        await add(profile);
        setContactFirst(profile.firstName || '');
        setContactLast(profile.lastName || '');
        setContactEditOpen(true);
      }
      setMenuOpen(false);
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveContactNames() {
    try {
      await updateNames(userId, contactFirst.trim(), contactLast.trim());
      setContactEditOpen(false);
      setMenuOpen(false);
    } catch (e) {
      setError(e.message);
    }
  }

  async function deleteChat() {
    if (!chatId) return;
    try {
      await chatsApi.delete(token, chatId);
      onDeleteChat?.(chatId);
      setMenuOpen(false);
      onClose();
    } catch (e) {
      setError(e.message);
    }
  }

  function openGift() {
    setMenuOpen(false);
    setGiftOpen(true);
  }

  function handleResolve(result) {
    onResolve?.(result);
    if (result.type !== 'user' || result.id !== userId) {
      onClose();
    }
  }

  function openLinkedChannel() {
    if (!profile?.linkedChannel) return;
    const ch = profile.linkedChannel;
    onResolve?.({
      type: ch.type,
      id: ch.id,
      username: ch.slug,
      label: ch.name,
    });
    onClose();
  }

  const themeColor =
    profile?.profileThemeColor || profile?.profileColor || null;
  const hasStyledProfile = !!(themeColor || profile?.profileMediaUrl);

  const modalStyle = themeColor
    ? {
        '--profile-accent': themeColor,
        '--profile-inline-bg': `linear-gradient(165deg, ${themeColor} 0%, color-mix(in srgb, ${themeColor} 72%, #0d0d12) 38%, #121218 100%)`,
        borderColor: `color-mix(in srgb, ${themeColor} 55%, var(--border))`,
      }
    : undefined;

  const heroStyle =
    !profile?.profileMediaUrl && themeColor
      ? {
          background: `linear-gradient(135deg, ${themeColor}, color-mix(in srgb, ${themeColor} 48%, #12121a))`,
        }
      : !profile?.profileMediaUrl && profile?.profileBanner
        ? { backgroundImage: `url(${profile.profileBanner})`, backgroundSize: 'cover' }
        : undefined;

  const titleName =
    inContacts && contactRecord
      ? getContactDisplayName({ ...profile, ...contactRecord })
      : profile?.displayName;

  const giftsList = giftDetails.length ? giftDetails : profile?.gifts || [];

  const content = giftOpen && profile ? (
    <GiftModal
      token={token}
      userId={userId}
      userName={titleName || profile.displayName}
      mesiBalance={currentUser?.mesiBalance}
      onClose={() => setGiftOpen(false)}
      onSent={(gift) => {
        setGiftDetails((prev) => [{ ...gift, name: gift.name, imageUrl: gift.imageUrl }, ...prev]);
        if (gift.mesiBalance != null) {
          onUserUpdate?.({ ...currentUser, mesiBalance: gift.mesiBalance });
        }
      }}
    />
  ) : (
    <div className="profile-overlay" onClick={onClose}>
      <div
        className={`profile-modal ${hasStyledProfile ? 'profile-themed profile-themed-full' : ''}`}
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-modal-top">
          <button type="button" className="icon-btn profile-close" onClick={onClose}>
            <Icon name="close" size={22} />
          </button>
          {!isOwn && (
            <div className="profile-menu-wrap" ref={menuRef}>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Меню"
              >
                <Icon name="more-vertical" size={22} />
              </button>
              {menuOpen && (
                <div className="profile-dropdown">
                  <button type="button" onClick={toggleContact}>
                    <Icon name={inContacts ? 'check' : 'user-plus'} size={16} />
                    {inContacts ? 'Убрать из контактов' : 'Добавить в контакты'}
                  </button>
                  {inContacts && (
                    <button
                      type="button"
                      onClick={() => {
                        setContactEditOpen((v) => !v);
                      }}
                    >
                      <Icon name="user" size={16} /> Имя в контактах
                    </button>
                  )}
                  <button type="button" onClick={openGift}>
                    <Icon name="gift" size={16} /> Подарить подарок
                  </button>
                  {chatId && (
                    <button type="button" className="danger-text" onClick={deleteChat}>
                      <Icon name="trash" size={16} /> Удалить чат
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {loading && <p className="profile-loading">Загрузка…</p>}
        {error && <p className="profile-error">{error}</p>}

        {profile && !loading && (
          <>
            <div className="profile-hero" style={heroStyle}>
              {profile.profileMediaUrl && profile.profileMediaType === 'video' && (
                <video
                  className="profile-hero-media"
                  src={resolveMediaUrl(profile.profileMediaUrl)}
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              )}
              {profile.profileMediaUrl && profile.profileMediaType !== 'video' && (
                <img
                  className="profile-hero-media"
                  src={resolveMediaUrl(profile.profileMediaUrl)}
                  alt=""
                />
              )}
              <div className="profile-avatar-ring">
                {profile.avatarHidden ? (
                  <div className="avatar-hidden-placeholder">
                    <Icon name="lock" size={32} />
                  </div>
                ) : (
                  <Avatar
                    name={titleName || profile.displayName}
                    color={profile.avatarColor}
                    avatarUrl={profile.avatarUrl}
                    avatarVersion={profile.avatarVersion}
                    size={96}
                    online={profile.isOnline}
                  />
                )}
              </div>
            </div>

            <h2>{titleName}</h2>
            {(profile.firstName || profile.lastName) && titleName !== profile.displayName && (
              <p className="profile-real-name">
                {profile.firstName} {profile.lastName}
              </p>
            )}
            <p className="profile-username">
              <UsernameLink username={profile.username} token={token} onResolve={handleResolve} />
            </p>
            {profile.extraUsernames?.length > 0 && (
              <div className="profile-aliases">
                {profile.extraUsernames.map((u) => (
                  <UsernameLink
                    key={u}
                    username={u}
                    token={token}
                    onResolve={handleResolve}
                  />
                ))}
              </div>
            )}
            {profile.linkedChannel && (
              <button type="button" className="profile-channel-link" onClick={openLinkedChannel}>
                <Icon name="users" size={16} />
                {profile.linkedChannel.name}
                {profile.linkedChannel.slug && <> · @{profile.linkedChannel.slug}</>}
              </button>
            )}
            {!profile.lastSeenHidden && profile.lastSeenText && (
              <p className={`profile-last-seen ${profile.isOnline ? 'online' : ''}`}>
                {profile.lastSeenText}
              </p>
            )}

            {contactEditOpen && inContacts && (
              <div className="profile-contact-edit">
                <p className="profile-contact-edit-title">Как отображать в ваших контактах</p>
                <div className="profile-contact-edit-row">
                  <input
                    placeholder="Имя"
                    value={contactFirst}
                    onChange={(e) => setContactFirst(e.target.value)}
                  />
                  <input
                    placeholder="Фамилия"
                    value={contactLast}
                    onChange={(e) => setContactLast(e.target.value)}
                  />
                </div>
                <button type="button" className="btn-primary small" onClick={saveContactNames}>
                  Сохранить
                </button>
              </div>
            )}

            <nav className="profile-tabs">
              <button
                type="button"
                className={section === 'info' ? 'active' : ''}
                title="Информация"
                onClick={() => setSection('info')}
              >
                <Icon name="user" size={20} />
              </button>
              <button
                type="button"
                className={section === 'stories' ? 'active' : ''}
                title="Истории"
                onClick={() => setSection('stories')}
              >
                <Icon name="story" size={20} />
              </button>
              <button
                type="button"
                className={section === 'gifts' ? 'active' : ''}
                title="Подарки"
                onClick={() => setSection('gifts')}
              >
                <Icon name="gift" size={20} />
                {giftsList.length > 0 && (
                  <span className="profile-tab-badge">{giftsList.length}</span>
                )}
              </button>
            </nav>

            <div className="profile-section">
              {section === 'info' && (
                <>
                  {!profile.bioHidden && profile.bio && (
                    <p className="profile-bio">{profile.bio}</p>
                  )}

                  <div className="profile-info-rows">
                    {!profile.emailHidden && profile.email && (
                      <div className="profile-info-row">
                        <Icon name="mail" size={16} />
                        <span>{profile.email}</span>
                      </div>
                    )}
                    {!profile.phoneHidden && profile.phone && (
                      <div className="profile-info-row">
                        <Icon name="phone" size={16} />
                        <span>{profile.phone}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {section === 'stories' && (
                <div className="profile-stories">
                  {storiesLoading && <p className="profile-empty">Загрузка…</p>}
                  {!storiesLoading && stories.length === 0 && (
                    <p className="profile-empty">Нет активных историй</p>
                  )}
                  <div className="profile-stories-grid">
                    {stories.map((s) => (
                      <div key={s.id} className="profile-story-item">
                        {s.mediaType === 'video' ? (
                          <video src={s.mediaUrl} controls className="profile-story-media" />
                        ) : (
                          <img src={s.mediaUrl} alt="" className="profile-story-media" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {section === 'gifts' && (
                <div className="profile-gifts">
                  {giftsLoading && <p className="profile-empty">Загрузка…</p>}
                  {!giftsLoading && giftsList.length === 0 && (
                    <p className="profile-empty">Подарков пока нет</p>
                  )}
                  {!giftsLoading && giftsList.length > 0 && (
                    <>
                      <p className="profile-gifts-hint">
                        Листайте влево-вправо · всего {giftsList.length}
                      </p>
                      <div className="profile-gifts-scroll">
                        {giftsList.map((g) => {
                          const meta = GIFT_META[g.type] || {};
                          const name = g.name || meta.name || g.type;
                          const shade = g.color || meta.color || '#94a3b8';
                          const img = resolveMediaUrl(g.imageUrl);
                          return (
                            <div key={g.id} className="profile-gift-item">
                              {img ? (
                                <img src={img} alt="" className="profile-gift-img" />
                              ) : (
                                <span className="profile-gift-crystal" style={{ color: shade }}>
                                  <Icon name="crystal-white" size={56} />
                                </span>
                              )}
                              <span className="profile-gift-name">{name}</span>
                              {g.message && (
                                <span className="profile-gift-message" title="Сообщение нельзя изменить">
                                  «{g.message}»
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {!isOwn && (
              <div className="profile-actions">
                <button type="button" className="btn-primary" onClick={openChat}>
                  Написать
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
