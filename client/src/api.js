/** В dev Vite проксирует /api на :3001. Для продакшена задайте VITE_API_URL при сборке. */
const API = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

function serverUnreachableMessage() {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `API недоступен на ${host}. Запустите backend или настройте прокси /api на порт 3001.`;
  }
  return 'Сервер не запущен. Дважды щёлкните start.bat в папке проекта или выполните: node scripts/dev.js';
}

function buildHeaders(token, json = true) {
  const h = {};
  if (json) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function checkServer() {
  try {
    const res = await fetch(`${API}/health`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: `Сервер ответил с ошибкой (${res.status}). ${serverUnreachableMessage()}` };
    }
    if (data.version < 5) {
      return {
        ok: false,
        message: 'Сервер устарел. Остановите его и выполните: npm run dev',
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: serverUnreachableMessage() };
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, options);
  } catch {
    throw new Error(serverUnreachableMessage());
  }

  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (res.status === 404) {
        throw new Error(
          'Сервер устарел или не запущен. Перезапустите: npm run dev'
        );
      }
      throw new Error(`Ошибка сервера (${res.status})`);
    }
  }

  if (!res.ok) {
    throw new Error(data.error || `Ошибка (${res.status})`);
  }
  return data;
}

export const authApi = {
  login: (login, password) =>
    request('/auth/login', {
      method: 'POST',
      headers: buildHeaders(null),
      body: JSON.stringify({ login, password }),
    }),
  register: (body) =>
    request('/auth/register', {
      method: 'POST',
      headers: buildHeaders(null),
      body: JSON.stringify(body),
    }),
};

export const contactsApi = {
  list: (token) => request('/contacts', { headers: buildHeaders(token) }),
  add: (token, userId) =>
    request('/contacts', {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ userId }),
    }),
  update: (token, userId, names) =>
    request(`/contacts/${userId}`, {
      method: 'PATCH',
      headers: buildHeaders(token),
      body: JSON.stringify(names),
    }),
  remove: (token, userId) =>
    request(`/contacts/${userId}`, { method: 'DELETE', headers: buildHeaders(token) }),
  sync: (token, contacts) =>
    request('/contacts/sync', {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ contacts }),
    }),
};

export const searchApi = {
  global: (token, q) =>
    request(`/search?q=${encodeURIComponent(q)}`, {
      headers: buildHeaders(token),
    }),
};

export const usersApi = {
  search: (token, q) =>
    request(`/users/search?q=${encodeURIComponent(q)}`, {
      headers: buildHeaders(token),
    }),
  profile: (token, userId) =>
    request(`/users/profile/${userId}`, { headers: buildHeaders(token) }),
};

export const profileApi = {
  get: (token) => request('/users/me', { headers: buildHeaders(token) }),
  update: (token, body) =>
    request('/users/me', {
      method: 'PATCH',
      headers: buildHeaders(token),
      body: JSON.stringify(body),
    }),
  updatePrivacy: (token, body) =>
    request('/users/me/privacy', {
      method: 'PATCH',
      headers: buildHeaders(token),
      body: JSON.stringify(body),
    }),
  updateEmail: (token, email, password) =>
    request('/users/me/email', {
      method: 'PATCH',
      headers: buildHeaders(token),
      body: JSON.stringify({ email, password }),
    }),
  changePassword: (token, currentPassword, newPassword) =>
    request('/users/me/password', {
      method: 'PATCH',
      headers: buildHeaders(token),
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  uploadAvatar: async (token, blob) => {
    let res;
    try {
      const fd = new FormData();
      fd.append('avatar', blob, 'avatar.jpg');
      res = await fetch(`${API}/users/me/avatar`, {
        method: 'POST',
        headers: buildHeaders(token, false),
        body: fd,
      });
    } catch {
      throw new Error('Нет связи с сервером');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Не удалось загрузить фото');
    }
    return data;
  },
  deleteAvatar: (token) =>
    request('/users/me/avatar', { method: 'DELETE', headers: buildHeaders(token) }),
  mesi: (token) => request('/users/me/mesi', { headers: buildHeaders(token) }),
  setProfileChannel: (token, channelId) =>
    request('/users/me/profile-channel', {
      method: 'PATCH',
      headers: buildHeaders(token),
      body: JSON.stringify({ channelId }),
    }),
  sessions: (token) => request('/users/me/sessions', { headers: buildHeaders(token) }),
  revokeSession: (token, id) =>
    request(`/users/me/sessions/${id}`, { method: 'DELETE', headers: buildHeaders(token) }),
};

export const resolveApi = {
  resolve: (token, username) =>
    request(`/resolve/${encodeURIComponent(username.replace(/^@/, ''))}`, {
      headers: buildHeaders(token),
    }),
};

export const chatsApi = {
  list: (token) => request('/chats', { headers: buildHeaders(token) }),
  createPrivate: (token, userId) =>
    request('/chats/private', {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ userId }),
    }),
  createGroup: (token, body) =>
    request('/chats/group', {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify(body),
    }),
  createChannel: (token, body) =>
    request('/chats/channel', {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify(body),
    }),
  chatWith: (token, userId) =>
    request(`/chats/with/${userId}`, { headers: buildHeaders(token) }),
  openBySlug: (token, slug) =>
    request(`/chats/slug/${encodeURIComponent(slug.replace(/^@/, ''))}/open`, {
      method: 'POST',
      headers: buildHeaders(token),
    }),
  update: (token, chatId, body) =>
    request(`/chats/${chatId}`, {
      method: 'PATCH',
      headers: buildHeaders(token),
      body: JSON.stringify(body),
    }),
  getMembers: (token, chatId) =>
    request(`/chats/${chatId}/members`, { headers: buildHeaders(token) }),
  addMember: (token, chatId, username, role) =>
    request(`/chats/${chatId}/members`, {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ username, role }),
    }),
  updateMember: (token, chatId, userId, body) =>
    request(`/chats/${chatId}/members/${userId}`, {
      method: 'PATCH',
      headers: buildHeaders(token),
      body: JSON.stringify(body),
    }),
  uploadFile: async (token, chatId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API}/chats/${chatId}/upload`, {
      method: 'POST',
      headers: buildHeaders(token, false),
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Не удалось отправить файл');
    return data;
  },
  delete: (token, chatId) =>
    request(`/chats/${chatId}`, { method: 'DELETE', headers: buildHeaders(token) }),
  uploadAvatar: async (token, chatId, blob) => {
    const fd = new FormData();
    fd.append('avatar', blob, 'avatar.jpg');
    const res = await fetch(`${API}/chats/${chatId}/avatar`, {
      method: 'POST',
      headers: buildHeaders(token, false),
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Не удалось загрузить фото');
    return data;
  },
  deleteAvatar: (token, chatId) =>
    request(`/chats/${chatId}/avatar`, { method: 'DELETE', headers: buildHeaders(token) }),
  markRead: (token, chatId) =>
    request(`/chats/${chatId}/read`, {
      method: 'POST',
      headers: buildHeaders(token),
    }).catch(() => null),
  messages: (token, chatId, before) => {
    let url = `/chats/${chatId}/messages?limit=50`;
    if (before) url += `&before=${encodeURIComponent(before)}`;
    return request(url, { headers: buildHeaders(token) });
  },
};

export const storiesApi = {
  feed: (token) => request('/stories/feed', { headers: buildHeaders(token) }),
  publish: async (token, file) => {
    const fd = new FormData();
    fd.append('media', file);
    const res = await fetch(`${API}/stories`, {
      method: 'POST',
      headers: buildHeaders(token, false),
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Не удалось опубликовать');
    return data;
  },
  userStories: (token, userId) =>
    request(`/stories/user/${userId}`, { headers: buildHeaders(token) }),
  view: (token, storyId) =>
    request(`/stories/${storyId}/view`, { method: 'POST', headers: buildHeaders(token) }),
};

export const giftsApi = {
  catalog: (token) => request('/gifts/catalog', { headers: buildHeaders(token) }),
  send: (token, toUserId, giftType, message = '') =>
    request('/gifts/send', {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ toUserId, giftType, message }),
    }),
  forUser: (token, userId) =>
    request(`/gifts/user/${userId}`, { headers: buildHeaders(token) }),
};

export const adminApi = {
  panel: (token) => request('/admin/panel', { headers: buildHeaders(token) }),
  addAlias: (token, username) =>
    request('/admin/aliases', {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ username }),
    }),
  removeAlias: (token, id) =>
    request(`/admin/aliases/${id}`, { method: 'DELETE', headers: buildHeaders(token) }),
  grantMesi: (token, username, amount) =>
    request('/admin/mesi/grant', {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ username, amount }),
    }),
  updateProfile: (token, body) =>
    request('/admin/profile', {
      method: 'PATCH',
      headers: buildHeaders(token),
      body: JSON.stringify(body),
    }),
  uploadProfileMedia: async (token, file) => {
    const fd = new FormData();
    fd.append('media', file);
    const res = await fetch(`${API}/admin/profile/media`, {
      method: 'POST',
      headers: buildHeaders(token, false),
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Не удалось загрузить');
    return data;
  },
  deleteProfileMedia: (token) =>
    request('/admin/profile/media', { method: 'DELETE', headers: buildHeaders(token) }),
  listGifts: (token) => request('/admin/gifts', { headers: buildHeaders(token) }),
  createGift: (token, body) =>
    request('/admin/gifts', {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify(body),
    }),
  updateGift: (token, id, body) =>
    request(`/admin/gifts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: buildHeaders(token),
      body: JSON.stringify(body),
    }),
  uploadGiftImage: async (token, id, file) => {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch(`${API}/admin/gifts/${encodeURIComponent(id)}/image`, {
      method: 'POST',
      headers: buildHeaders(token, false),
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Не удалось загрузить картинку');
    return data;
  },
};

export const messagesApi = {
  edit: (token, messageId, content) =>
    request(`/messages/${messageId}`, {
      method: 'PATCH',
      headers: buildHeaders(token),
      body: JSON.stringify({ content }),
    }),
  remove: (token, messageId) =>
    request(`/messages/${messageId}`, {
      method: 'DELETE',
      headers: buildHeaders(token),
    }),
};

export function normalizeMessage(msg) {
  return {
    ...msg,
    deleted: !!msg.deleted,
    deletedText: msg.deletedText || 'Сообщение удалено',
    readByOther: !!msg.readByOther,
    canEdit: !!msg.canEdit,
    canDelete: !!msg.canDelete,
    editedAt: msg.editedAt || null,
    messageType: msg.messageType || 'text',
    attachment: msg.attachment || null,
    user: msg.user || {},
  };
}
