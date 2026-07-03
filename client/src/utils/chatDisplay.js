import { resolveAvatarUrl } from './avatarUrl';

/** Аватар и подпись для строки чата / шапки */
export function getChatDisplay(chat, currentUserId) {
  if (!chat) {
    return { name: '', avatarUrl: null, avatarColor: '#5b8def', avatarVersion: null };
  }

  if (chat.type === 'private') {
    const other = chat.members?.find((m) => m.id !== currentUserId);
    return {
      name: chat.name,
      avatarUrl: other?.avatarHidden ? null : resolveAvatarUrl(other?.avatarUrl, other?.avatarVersion),
      avatarColor: other?.avatarColor || '#5b8def',
      avatarVersion: other?.avatarVersion,
      online: other?.isOnline,
      subtitleUser: other,
    };
  }

  if (chat.avatarUrl) {
    return {
      name: chat.name,
      avatarUrl: resolveAvatarUrl(chat.avatarUrl, chat.avatarVersion),
      avatarColor: '#5b8def',
      avatarVersion: chat.avatarVersion,
    };
  }

  const owner =
    chat.members?.find((m) => m.role === 'owner') ||
    (chat.createdBy && chat.members?.find((m) => m.id === chat.createdBy));

  if (owner) {
    return {
      name: chat.name,
      avatarUrl: owner.avatarHidden ? null : resolveAvatarUrl(owner.avatarUrl, owner.avatarVersion),
      avatarColor: owner.avatarColor || '#5b8def',
      avatarVersion: owner.avatarVersion,
    };
  }

  return {
    name: chat.name,
    avatarUrl: null,
    avatarColor: '#5b8def',
    avatarVersion: null,
  };
}
