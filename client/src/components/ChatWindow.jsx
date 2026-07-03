import { useState, useEffect, useRef, useCallback } from 'react';
import { chatsApi, messagesApi, normalizeMessage } from '../api';
import { getSocket } from '../socket';
import Avatar from './Avatar';
import { Icon } from './icons';
import UsernameLink from './UsernameLink';
import ChatSettingsModal from './ChatSettingsModal';
import { getChatDisplay } from '../utils/chatDisplay';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { useIsMobile } from '../hooks/useIsMobile';
import { useVisualViewportInset } from '../hooks/useVisualViewportInset';
import './ChatWindow.css';

function formatMsgTime(iso) {
  if (!iso) return '';
  const s = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(s);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatWindow({
  chat,
  currentUser,
  token,
  onViewProfile,
  onResolve,
  onDeleteChat,
  onChatUpdated,
  onBack,
}) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [actionError, setActionError] = useState('');
  const bottomRef = useRef(null);
  const typingTimeout = useRef(null);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMobile = useIsMobile();
  const keyboardInset = useVisualViewportInset(isMobile && !!chat);

  const scrollBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const markRead = useCallback(() => {
    if (!chat) return;
    getSocket(token).emit('mark_read', { chatId: chat.id });
    chatsApi.markRead(token, chat.id).catch(() => {});
  }, [chat, token]);

  useEffect(() => {
    if (!chat) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setEditingId(null);
    setActionError('');
    chatsApi
      .messages(token, chat.id)
      .then((msgs) => {
        if (!cancelled) {
          setMessages(msgs.map(normalizeMessage));
          setTimeout(scrollBottom, 50);
          markRead();
        }
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chat?.id, token, scrollBottom, markRead]);

  useEffect(() => {
    if (!chat) return;
    const socket = getSocket(token);

    const onMessage = (msg) => {
      if (msg.chatId !== chat.id) return;
      const normalized = normalizeMessage(msg);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === normalized.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = normalized;
          return next;
        }
        return [...prev, normalized];
      });
      setTimeout(scrollBottom, 50);
      if (msg.user.id !== currentUser.id) {
        markRead();
      }
    };

    const onTyping = (data) => {
      if (data.chatId === chat.id && data.userId !== currentUser.id) {
        setTyping(true);
        clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => setTyping(false), 2000);
      }
    };

    const onRead = (data) => {
      if (data.chatId !== chat.id || data.userId === currentUser.id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.user.id === currentUser.id && m.id <= data.lastReadMessageId
            ? { ...m, readByOther: true }
            : m
        )
      );
    };

    socket.on('new_message', onMessage);
    socket.on('message_updated', onMessage);
    socket.on('user_typing', onTyping);
    socket.on('messages_read', onRead);
    socket.emit('join_chat', chat.id);

    return () => {
      socket.off('new_message', onMessage);
      socket.off('message_updated', onMessage);
      socket.off('user_typing', onTyping);
      socket.off('messages_read', onRead);
    };
  }, [chat?.id, token, currentUser.id, scrollBottom, markRead]);

  useEffect(() => {
    if (!menuOpen) return;
    function close(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  function send(e) {
    e.preventDefault();
    const content = text.trim();
    if (!content || !chat) return;
    setText('');
    getSocket(token).emit('send_message', { chatId: chat.id, content });
  }

  function handleInput(e) {
    setText(e.target.value);
    if (chat) getSocket(token).emit('typing', { chatId: chat.id });
  }

  async function saveEdit(messageId) {
    const content = editText.trim();
    if (!content) return;
    setActionError('');
    try {
      const updated = await messagesApi.edit(token, messageId, content);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? normalizeMessage(updated) : m))
      );
      setEditingId(null);
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function deleteMessage(messageId) {
    if (!confirm('Удалить сообщение?')) return;
    setActionError('');
    try {
      const updated = await messagesApi.remove(token, messageId);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? normalizeMessage(updated) : m))
      );
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleFilePick(e) {
    const file = e.target.files?.[0];
    if (!file || !chat) return;
    if (file.size > 150 * 1024 * 1024) {
      setActionError('Файл больше 150 МБ');
      e.target.value = '';
      return;
    }
    setUploading(true);
    setActionError('');
    try {
      const msg = await chatsApi.uploadFile(token, chat.id, file);
      setMessages((prev) => [...prev, normalizeMessage(msg)]);
      setTimeout(scrollBottom, 50);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function renderMessageBody(msg) {
    if (msg.deleted) {
      return <p className="deleted-text">{msg.deletedText}</p>;
    }
    if (msg.messageType === 'image' && msg.attachment?.url) {
      return (
        <>
          <a href={msg.attachment.url} target="_blank" rel="noreferrer" className="msg-attachment-img">
            <img src={resolveMediaUrl(msg.attachment.url)} alt="картинка" />
          </a>
          {msg.content && msg.content !== 'картинка' && <p>{msg.content}</p>}
        </>
      );
    }
    if (msg.messageType === 'file' && msg.attachment?.url) {
      return (
        <a href={msg.attachment.url} target="_blank" rel="noreferrer" className="msg-attachment-file">
          <Icon name="paperclip" size={18} />
          <span>{msg.attachment.name || 'Файл'}</span>
          {msg.attachment.size && (
            <span className="file-size">{Math.round(msg.attachment.size / 1024)} КБ</span>
          )}
        </a>
      );
    }
    return <p>{msg.content}</p>;
  }

  function handleDeleteChat() {
    setMenuOpen(false);
    if (!confirm('Удалить переписку? Сообщения исчезнут из вашего списка.')) return;
    onDeleteChat?.(chat.id);
  }

  if (!chat) {
    return (
      <main className="chat-window empty">
        <div className="empty-state">
          <div className="empty-icon-wrap">
            <Icon name="chat" size={48} />
          </div>
          <h2>Выберите чат</h2>
          <p>Или создайте новый, чтобы начать переписку</p>
        </div>
      </main>
    );
  }

  const other = chat.members?.find((m) => m.id !== currentUser.id);
  const isPrivate = chat.type === 'private';
  const isChannel = chat.type === 'channel';
  const canManage = ['owner', 'admin'].includes(chat.myRole);
  const display = getChatDisplay(chat, currentUser.id);

  return (
    <main className={`chat-window ${isChannel ? 'is-channel' : ''}`}>
      <header className="chat-header">
        {onBack && (
          <button type="button" className="icon-btn chat-back-btn" onClick={onBack} aria-label="Назад">
            <Icon name="chevron-left" size={24} />
          </button>
        )}
        <button
          type="button"
          className="chat-header-user"
          onClick={() => {
            if (isPrivate && other) onViewProfile?.(other.id);
            else if (!isPrivate && canManage) setSettingsOpen(true);
          }}
        >
          <Avatar
            name={display.name}
            color={display.avatarColor}
            avatarUrl={display.avatarUrl}
            avatarVersion={display.avatarVersion}
            size={44}
            online={isPrivate ? display.online : undefined}
          />
          <div className="chat-header-info">
            <h2>{chat.name}</h2>
            {typing && <span className="chat-typing">печатает…</span>}
            {!typing && isPrivate && other && (
              <span className={`chat-status ${other.isOnline ? 'online' : ''}`}>
                {other.lastSeenText || (
                  <UsernameLink
                    username={other.username}
                    token={token}
                    onResolve={onResolve}
                    className="chat-status-link"
                  />
                )}
              </span>
            )}
            {!typing && !isPrivate && (
              <span className="chat-status">
                {chat.slug ? (
                  <>
                    <UsernameLink username={chat.slug} token={token} onResolve={onResolve} /> ·{' '}
                  </>
                ) : null}
                {chat.type === 'channel' ? 'Канал' : 'Группа'} ·{' '}
                {chat.memberCount || chat.members?.length || 0} уч.
              </span>
            )}
          </div>
        </button>

        <div className="chat-header-menu" ref={menuRef}>
          <button
            type="button"
            className="icon-btn"
            title="Меню чата"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <Icon name="more" size={22} />
          </button>
          {menuOpen && (
            <div className="chat-dropdown">
              {other && isPrivate && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onViewProfile?.(other.id);
                  }}
                >
                  <Icon name="user" size={18} /> Профиль
                </button>
              )}
              {!isPrivate && canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                >
                  <Icon name="settings" size={18} /> Управление
                </button>
              )}
              <button type="button" className="danger" onClick={handleDeleteChat}>
                <Icon name="trash" size={18} /> Удалить переписку
              </button>
            </div>
          )}
        </div>
      </header>

      {actionError && <p className="chat-action-error">{actionError}</p>}

      <div className="messages-area" onClick={() => markRead()}>
        {loading && <p className="messages-loading">Загрузка сообщений…</p>}
        {!loading &&
          messages.map((msg) => {
            const mine = msg.user.id === currentUser.id;
            const isEditing = editingId === msg.id;

            return (
              <div
                key={msg.id}
                className={
                  isChannel
                    ? 'message-row channel-post'
                    : `message-row ${mine ? 'mine' : 'theirs'}`
                }
              >
                {!mine && !isChannel && (
                  <Avatar
                    name={msg.user.displayName}
                    color={msg.user.avatarColor}
                    avatarUrl={msg.user.avatarUrl}
                    size={34}
                  />
                )}
                <div className={`message-wrap ${mine ? 'mine' : ''}`}>
                  <div
                    className={`message-bubble ${mine ? 'out' : 'in'} ${msg.deleted ? 'deleted' : ''}`}
                  >
                    {(!mine || isChannel) && !msg.deleted && (
                      <span className="message-sender">{msg.user.displayName}</span>
                    )}
                    {isEditing ? (
                      <div className="message-edit">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          autoFocus
                        />
                        <div className="message-edit-actions">
                          <button type="button" onClick={() => setEditingId(null)}>
                            Отмена
                          </button>
                          <button type="button" className="save" onClick={() => saveEdit(msg.id)}>
                            Сохранить
                          </button>
                        </div>
                      </div>
                    ) : (
                      renderMessageBody(msg)
                    )}
                    <div className="message-meta">
                      {msg.editedAt && !msg.deleted && (
                        <span className="edited-label">изм.</span>
                      )}
                      <time>{formatMsgTime(msg.createdAt)}</time>
                      {mine && !msg.deleted && (
                        <span
                          className={`read-mark ${msg.readByOther ? 'read' : ''}`}
                          title={msg.readByOther ? 'Прочитано' : 'Отправлено'}
                        >
                          <Icon name={msg.readByOther ? 'checks' : 'check'} size={14} />
                        </span>
                      )}
                    </div>
                  </div>
                  {mine && !msg.deleted && (msg.canEdit || msg.canDelete) && !isEditing && (
                    <div className="message-actions">
                      {msg.canEdit && (
                        <button
                          type="button"
                          title="Редактировать"
                          onClick={() => {
                            setEditingId(msg.id);
                            setEditText(msg.content);
                          }}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                      )}
                      {msg.canDelete && (
                        <button
                          type="button"
                          title="Удалить"
                          onClick={() => deleteMessage(msg.id)}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        <div ref={bottomRef} />
      </div>

      <form
        className="composer"
        onSubmit={send}
        style={keyboardInset ? { paddingBottom: `calc(12px + ${keyboardInset}px)` } : undefined}
      >
        <button
          type="button"
          className="icon-btn attach-btn"
          title="Фото или файл до 150 МБ"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon name="paperclip" size={20} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={handleFilePick}
        />
        <textarea
          rows={1}
          placeholder="Напишите сообщение…"
          value={text}
          onChange={handleInput}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(e);
            }
          }}
        />
        <button type="submit" className="send-btn" disabled={!text.trim() || uploading} aria-label="Отправить">
          <Icon name="send" size={20} />
        </button>
      </form>

      {settingsOpen && (
        <ChatSettingsModal
          chat={chat}
          token={token}
          currentUserId={currentUser.id}
          onClose={() => setSettingsOpen(false)}
          onUpdated={(updated) => {
            onChatUpdated?.(updated);
          }}
        />
      )}
    </main>
  );
}
