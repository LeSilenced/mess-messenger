export function formatLastSeen(iso, isOnline) {
  if (isOnline) return 'в сети';
  if (!iso) return 'был недавно';
  const s = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(s);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'был(а) только что';
  if (diff < 3600) return `был(а) ${Math.floor(diff / 60)} мин. назад`;
  if (diff < 86400) return `был(а) ${Math.floor(diff / 3600)} ч. назад`;
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return `был(а) в ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return `был(а) ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
}

function patchMember(member, { isOnline, lastSeenAt }) {
  if (!member || member.lastSeenHidden) return member;
  return {
    ...member,
    isOnline,
    lastSeenAt,
    lastSeenText: formatLastSeen(lastSeenAt, isOnline),
  };
}

export function patchChatsPresence(chats, payload) {
  const { userId, isOnline, lastSeenAt } = payload;
  return chats.map((chat) => ({
    ...chat,
    members: chat.members?.map((m) =>
      m.id === userId ? patchMember(m, { isOnline, lastSeenAt }) : m
    ),
  }));
}
