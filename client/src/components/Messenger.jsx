import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '../hooks/useIsMobile';
import { chatsApi, resolveApi } from '../api';
import { getSocket, startPresenceHeartbeat } from '../socket';
import { patchChatsPresence } from '../utils/lastSeen';
import { chatPath, parsePath, setAppPath, userPath } from '../utils/appRoutes';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';
import SettingsPanel from './SettingsPanel';
import UserProfileModal from './UserProfileModal';
import '../App.css';
import './Messenger.css';

export default function Messenger({ auth, onLogout, onUserUpdate }) {
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewProfileId, setViewProfileId] = useState(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const routeHandled = useRef(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile) setMobileShowChat(false);
  }, [isMobile]);

  const loadChats = useCallback(async () => {
    try {
      const list = await chatsApi.list(auth.token);
      setChats(list);
      setActiveChat((prev) => {
        if (!prev) return prev;
        const fresh = list.find((c) => c.id === prev.id);
        return fresh || prev;
      });
      return list;
    } catch {
      setChats([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [auth.token]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    const onContactsChanged = () => loadChats();
    window.addEventListener('mess-contacts-changed', onContactsChanged);
    return () => window.removeEventListener('mess-contacts-changed', onContactsChanged);
  }, [loadChats]);

  const openFromRoute = useCallback(
    async (route, list) => {
      if (!route) return;
      if (route.kind === 'user') {
        try {
          const result = await resolveApi.resolve(auth.token, route.username);
          if (result.type === 'user') {
            setViewProfileId(result.id);
            setAppPath(userPath(route.username), true);
          } else {
            await handleResolve(result, list);
          }
        } catch {
          /* ignore */
        }
        return;
      }
      if (route.kind === 'chat') {
        const existing = (list || chats).find(
          (c) => c.slug?.toLowerCase() === route.slug
        );
        if (existing) {
          selectChat(existing, true);
          return;
        }
        try {
          const chat = await chatsApi.openBySlug(auth.token, route.slug);
          handleChatCreated(chat);
          selectChat(chat, true);
        } catch {
          /* ignore */
        }
      }
    },
    [auth.token, chats]
  );

  useEffect(() => {
    if (routeHandled.current || loading) return;
    const route = parsePath();
    if (!route) return;
    routeHandled.current = true;
    openFromRoute(route, chats);
  }, [loading, chats, openFromRoute]);

  useEffect(() => {
    const onPop = () => {
      const route = parsePath();
      if (!route) {
        setActiveChat(null);
        setViewProfileId(null);
        setMobileShowChat(false);
        return;
      }
      openFromRoute(route, chats);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [chats, openFromRoute]);

  useEffect(() => {
    const socket = getSocket(auth.token);
    startPresenceHeartbeat(socket);

    const onPresence = (payload) => {
      setChats((prev) => patchChatsPresence(prev, payload));
      setActiveChat((prev) => {
        if (!prev) return prev;
        const [updated] = patchChatsPresence([prev], payload);
        return updated;
      });
    };

    const onNewMessage = (msg) => {
      setChats((prev) => {
        const inList = prev.some((c) => c.id === msg.chatId);
        if (!inList) {
          loadChats();
          return prev;
        }
        const updated = prev.map((c) =>
          c.id === msg.chatId
            ? {
                ...c,
                lastMessage: {
                  content: msg.deleted ? 'Сообщение удалено' : msg.content,
                  createdAt: msg.createdAt,
                  senderName: msg.user.displayName,
                },
              }
            : c
        );
        const chat = updated.find((c) => c.id === msg.chatId);
        const rest = updated.filter((c) => c.id !== msg.chatId);
        return chat ? [chat, ...rest] : updated;
      });
    };

    socket.on('new_message', onNewMessage);
    socket.on('message_updated', onNewMessage);
    socket.on('presence_update', onPresence);
    return () => {
      socket.off('new_message', onNewMessage);
      socket.off('message_updated', onNewMessage);
      socket.off('presence_update', onPresence);
    };
  }, [auth.token, loadChats]);

  function handleChatCreated(chat) {
    setActiveChat(chat);
    if (isMobile) setMobileShowChat(true);
    setSettingsOpen(false);
    setChats((prev) => {
      if (prev.some((c) => c.id === chat.id)) return prev;
      return [chat, ...prev];
    });
    getSocket(auth.token).emit('join_chat', chat.id);
    const path = chatPath(chat, auth.user.id);
    if (path !== '/') setAppPath(path);
  }

  function selectChat(chat, replace = false) {
    setActiveChat(chat);
    if (isMobile) setMobileShowChat(true);
    setSettingsOpen(false);
    setViewProfileId(null);
    getSocket(auth.token).emit('join_chat', chat.id);
    const path = chatPath(chat, auth.user.id);
    if (path !== '/') setAppPath(path, replace);
    else setAppPath('/', replace);
  }

  async function handleDeleteChat(chatId) {
    try {
      await chatsApi.delete(auth.token, chatId);
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (activeChat?.id === chatId) {
        setActiveChat(null);
        setMobileShowChat(false);
        setAppPath('/', true);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleResolve(result, list) {
    if (result.type === 'user') {
      setViewProfileId(result.id);
      setAppPath(userPath(result.username), true);
      return;
    }
    try {
      const slug = result.username || result.label;
      const chat = await chatsApi.openBySlug(auth.token, slug);
      handleChatCreated(chat);
      selectChat(chat, true);
      setViewProfileId(null);
      setSettingsOpen(false);
    } catch {
      let chat = (list || chats).find((c) => c.id === result.id);
      if (!chat) {
        try {
          const freshList = await chatsApi.list(auth.token);
          setChats(freshList);
          chat = freshList.find((c) => c.id === result.id);
        } catch {
          return;
        }
      }
      if (chat) {
        selectChat(chat, true);
        setViewProfileId(null);
        setSettingsOpen(false);
      }
    }
  }

  return (
    <div
      className={`app ${isMobile && mobileShowChat && activeChat ? 'mobile-chat-open' : ''}`}
    >
      <Sidebar
        user={auth.user}
        chats={chats}
        activeChatId={activeChat?.id}
        loading={loading}
        token={auth.token}
        className={isMobile && mobileShowChat && activeChat ? 'mobile-hidden' : ''}
        onSelectChat={selectChat}
        onChatCreated={handleChatCreated}
        onOpenSettings={() => {
          setSettingsOpen(true);
          setMobileShowChat(false);
          setAppPath('/');
        }}
        onViewProfile={(id) => {
          setViewProfileId(id);
          setAppPath('/');
        }}
        onResolve={(r) => handleResolve(r)}
      />
      {!settingsOpen && (
        <ChatWindow
          chat={activeChat}
          currentUser={auth.user}
          token={auth.token}
          onBack={() => {
            setMobileShowChat(false);
            setAppPath('/');
          }}
          onViewProfile={(id) => {
            setViewProfileId(id);
            setAppPath('/');
          }}
          onResolve={handleResolve}
          onDeleteChat={handleDeleteChat}
          onChatUpdated={(updated) => {
            setActiveChat(updated);
            setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            const path = chatPath(updated, auth.user.id);
            if (path !== '/') setAppPath(path, true);
          }}
        />
      )}
      {settingsOpen &&
        createPortal(
          <div className="settings-portal-overlay" onClick={() => setSettingsOpen(false)}>
            <div
              className="settings-portal-wrap"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Настройки"
            >
              <SettingsPanel
                user={auth.user}
                token={auth.token}
                modal
                onClose={() => setSettingsOpen(false)}
                onUserUpdate={(u) => {
                  onUserUpdate(u);
                  loadChats();
                }}
                onOpenChannel={(ch) => {
                  setSettingsOpen(false);
                  handleResolve({
                    type: ch.type || 'channel',
                    id: ch.id,
                    username: ch.slug,
                    label: ch.name,
                  });
                }}
                onLogout={onLogout}
              />
            </div>
          </div>,
          document.body
        )}
      {viewProfileId && (
        <UserProfileModal
          userId={viewProfileId}
          currentUserId={auth.user.id}
          currentUser={auth.user}
          token={auth.token}
          onClose={() => {
            setViewProfileId(null);
            if (activeChat) {
              const path = chatPath(activeChat, auth.user.id);
              setAppPath(path !== '/' ? path : '/');
            } else setAppPath('/');
          }}
          onChatCreated={handleChatCreated}
          onDeleteChat={handleDeleteChat}
          onUserUpdate={onUserUpdate}
          onResolve={handleResolve}
        />
      )}
    </div>
  );
}
