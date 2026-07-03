import { useState, useEffect } from 'react';
import Avatar from './Avatar';
import { Icon } from './icons';
import { searchApi, chatsApi } from '../api';
import { getChatDisplay } from '../utils/chatDisplay';
import { getContactDisplayName, groupContactsByLetter } from '../utils/contacts';
import { useContacts } from '../hooks/useContacts';
import StoriesBar from './StoriesBar';
import UsernameLink from './UsernameLink';
import CreateChatModal from './CreateChatModal';
import './Sidebar.css';

const TABS = [
  { id: 'chats', label: 'Чаты' },
  { id: 'contacts', label: 'Контакты' },
  { id: 'search', label: 'Поиск' },
];

function formatTime(iso) {
  if (!iso) return '';
  const s = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(s);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function Sidebar({
  user,
  chats,
  activeChatId,
  loading,
  token,
  onSelectChat,
  onChatCreated,
  onOpenSettings,
  onViewProfile,
  onResolve,
  className = '',
}) {
  const [tab, setTab] = useState('chats');
  const [query, setQuery] = useState('');
  const [searchUsers, setSearchUsers] = useState([]);
  const [searchChats, setSearchChats] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [resolveError, setResolveError] = useState('');
  const { contacts, loading: contactsLoading, add, remove, isContact } = useContacts(
    user.id,
    token
  );

  useEffect(() => {
    if (tab !== 'search' || query.trim().length < 2) {
      setSearchUsers([]);
      setSearchChats([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      setActionError('');
      try {
        const { users, chats: foundChats } = await searchApi.global(token, query);
        setSearchUsers(users);
        setSearchChats(foundChats);
      } catch (e) {
        setSearchUsers([]);
        setSearchChats([]);
        setActionError(e.message);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, tab, token]);

  const filteredChats = query.trim()
    ? chats.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : chats;

  const filteredContacts = query.trim()
    ? contacts.filter(
        (c) => {
          const name = getContactDisplayName(c).toLowerCase();
          return (
            name.includes(query.toLowerCase()) ||
            c.username.toLowerCase().includes(query.toLowerCase())
          );
        }
      )
    : contacts;

  async function startChat(targetUser) {
    setActionError('');
    try {
      const chat = await chatsApi.createPrivate(token, targetUser.id);
      onChatCreated(chat);
      setTab('chats');
      setQuery('');
    } catch (e) {
      setActionError(e.message);
    }
  }

  async function toggleContact(u, e) {
    e.stopPropagation();
    try {
      if (isContact(u.id)) await remove(u.id);
      else await add(u);
    } catch (err) {
      setActionError(err.message);
    }
  }

  const contactGroups = groupContactsByLetter(filteredContacts);

  return (
    <aside className={`sidebar ${className}`.trim()}>
      <header className="sidebar-header">
        <button
          type="button"
          className="sidebar-profile"
          onClick={onOpenSettings}
          aria-label="Мой профиль и настройки"
        >
          <Avatar
            name={user.displayName}
            color={user.avatarColor}
            avatarUrl={user.avatarUrl}
            avatarVersion={user.avatarVersion}
            size={40}
            online
          />
          <div className="sidebar-profile-text">
            <span className="sidebar-username">{user.displayName}</span>
            <span className="sidebar-status online">в сети</span>
          </div>
        </button>
        <div className="sidebar-actions">
          <button
            type="button"
            className="icon-btn"
            title="Создать чат или канал"
            onClick={() => setCreateOpen(true)}
          >
            <Icon name="plus" size={20} />
          </button>
          <button
          type="button"
          className="icon-btn settings-btn"
          title="Настройки"
          aria-label="Настройки"
          onClick={onOpenSettings}
        >
          <Icon name="settings" size={22} />
          </button>
        </div>
      </header>

      <StoriesBar user={user} token={token} />

      <div className="sidebar-search">
        <Icon name="search" size={18} className="search-icon" />
        <input
          type="search"
          placeholder={
            tab === 'search'
              ? 'Люди, каналы, @username'
              : tab === 'contacts'
                ? 'Поиск в контактах'
                : 'Поиск в чатах'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="search-clear" onClick={() => setQuery('')}>
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      <nav className="sidebar-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : ''}
            onClick={() => {
              setTab(t.id);
              setActionError('');
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {(actionError || resolveError) && (
        <p className="sidebar-error">{actionError || resolveError}</p>
      )}

      <div className="sidebar-list">
        {tab === 'chats' && (
          <>
            {loading && <p className="chat-list-empty">Загрузка…</p>}
            {!loading && filteredChats.length === 0 && (
              <p className="chat-list-empty">
                {chats.length === 0
                  ? 'Нет чатов. Найдите человека во вкладке «Поиск»'
                  : 'Ничего не найдено'}
              </p>
            )}
            {filteredChats.map((chat) => {
              const display = getChatDisplay(chat, user.id);
              return (
                <button
                  key={chat.id}
                  type="button"
                  className={`chat-item ${activeChatId === chat.id ? 'active' : ''}`}
                  onClick={() => onSelectChat(chat)}
                >
                  <Avatar
                    name={display.name}
                    color={display.avatarColor}
                    avatarUrl={display.avatarUrl}
                    avatarVersion={display.avatarVersion}
                    size={48}
                    online={display.online}
                  />
                  <div className="chat-item-body">
                    <div className="chat-item-top">
                      <span className="chat-item-name">{chat.name}</span>
                      {chat.lastMessage && (
                        <span className="chat-item-time">
                          {formatTime(chat.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <p className="chat-item-preview">
                      {chat.lastMessage ? chat.lastMessage.content : 'Нет сообщений'}
                    </p>
                  </div>
                </button>
              );
            })}
          </>
        )}

        {tab === 'contacts' && (
          <>
            {contactsLoading && <p className="chat-list-empty">Загрузка контактов…</p>}
            {!contactsLoading && filteredContacts.length === 0 && (
              <p className="chat-list-empty">
                {contacts.length === 0
                  ? 'Добавьте людей через поиск или из профиля'
                  : 'Ничего не найдено'}
              </p>
            )}
            {contactGroups.map(([letter, list]) => (
              <div key={letter} className="contact-section">
                <div className="contact-section-letter">{letter}</div>
                {list.map((c) => (
                  <div key={c.id} className="user-row contact-row-tg">
                    <button
                      type="button"
                      className="user-row-main"
                      onClick={() => startChat(c)}
                    >
                      <Avatar
                        name={getContactDisplayName(c)}
                        color={c.avatarColor}
                        avatarUrl={c.avatarUrl}
                        size={48}
                        online={c.isOnline}
                      />
                      <div className="chat-item-body">
                        <span className="chat-item-name">{getContactDisplayName(c)}</span>
                        <span className="chat-item-handle">
                          {c.isOnline ? (
                            <span className="contact-online">в сети</span>
                          ) : (
                            <UsernameLink
                              username={c.username}
                              token={token}
                              onResolve={onResolve}
                              onError={setResolveError}
                              className="inline-handle"
                            />
                          )}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Профиль"
                      onClick={() => onViewProfile?.(c.id)}
                    >
                      <Icon name="user" size={18} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {tab === 'search' && (
          <>
            {query.length < 2 && (
              <p className="chat-list-empty">Введите минимум 2 символа</p>
            )}
            {searchLoading && <p className="chat-list-empty">Поиск…</p>}
            {!searchLoading &&
              query.length >= 2 &&
              searchUsers.length === 0 &&
              searchChats.length === 0 &&
              !actionError && (
                <p className="chat-list-empty">Ничего не найдено</p>
              )}
            {searchChats.length > 0 && (
              <div className="search-section-label">Каналы и группы</div>
            )}
            {searchChats.map((ch) => (
              <div key={`ch-${ch.id}`} className="user-row">
                <button
                  type="button"
                  className="user-row-main"
                  onClick={async () => {
                    setActionError('');
                    try {
                      const opened = await chatsApi.openBySlug(token, ch.slug);
                      onChatCreated(opened);
                      setTab('chats');
                      setQuery('');
                    } catch (e) {
                      setActionError(e.message);
                    }
                  }}
                >
                  <Avatar
                    name={ch.name}
                    color={ch.avatarColor}
                    avatarUrl={ch.avatarUrl}
                    avatarVersion={ch.avatarVersion}
                    size={48}
                  />
                  <div className="chat-item-body">
                    <span className="chat-item-name">{ch.name}</span>
                    <span className="chat-item-handle">
                      {ch.type === 'channel' ? 'Канал' : 'Группа'}
                      {ch.slug && (
                        <>
                          {' · '}
                          <UsernameLink
                            username={ch.slug}
                            token={token}
                            onResolve={onResolve}
                            onError={setResolveError}
                          />
                        </>
                      )}
                    </span>
                  </div>
                </button>
              </div>
            ))}
            {searchUsers.length > 0 && (
              <div className="search-section-label">Люди</div>
            )}
            {searchUsers.map((u) => (
              <div key={u.id} className="user-row">
                <button
                  type="button"
                  className="user-row-main"
                  onClick={() => startChat(u)}
                >
                  <Avatar
                    name={u.displayName}
                    color={u.avatarColor}
                    avatarUrl={u.avatarUrl}
                    size={48}
                  />
                  <div className="chat-item-body">
                    <span className="chat-item-name">
                      <UsernameLink
                        username={u.searchUsername || u.username}
                        token={token}
                        onResolve={onResolve}
                        onError={setResolveError}
                      />
                    </span>
                    <span className="chat-item-handle">
                      {u.searchUsername && u.searchUsername !== u.username ? (
                        <>
                          {u.displayName} ·{' '}
                          <UsernameLink
                            username={u.username}
                            token={token}
                            onResolve={onResolve}
                            onError={setResolveError}
                          />
                        </>
                      ) : (
                        u.displayName
                      )}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  className={`icon-btn contact-toggle ${isContact(u.id) ? 'in-contacts' : ''}`}
                  title={isContact(u.id) ? 'Убрать из контактов' : 'В контакты'}
                  onClick={(e) => toggleContact(u, e)}
                >
                  <Icon name={isContact(u.id) ? 'check' : 'user-plus'} size={18} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Профиль"
                  onClick={() => onViewProfile?.(u.id)}
                >
                  <Icon name="user" size={18} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {createOpen && (
        <CreateChatModal
          token={token}
          onClose={() => setCreateOpen(false)}
          onChatCreated={(chat) => {
            onChatCreated(chat);
            setCreateOpen(false);
          }}
        />
      )}
    </aside>
  );
}
