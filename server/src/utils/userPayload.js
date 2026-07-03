import { canViewPrivacy, formatLastSeen } from './privacy.js';
import { hasAdminTools, isSilenc } from './adminAccess.js';

function avatarVersion(user) {
  if (!user.avatar_url) return null;
  if (user.avatar_updated_at) {
    const t = new Date(
      user.avatar_updated_at.includes('T')
        ? user.avatar_updated_at
        : user.avatar_updated_at.replace(' ', 'T') + 'Z'
    ).getTime();
    return t || Date.now();
  }
  return null;
}

export function userPayload(user) {
  const first = user.first_name?.trim() || '';
  const last = user.last_name?.trim() || '';
  const full = [first, last].filter(Boolean).join(' ').trim();
  const displayName = full || user.display_name?.trim() || user.username;
  const ver = avatarVersion(user);

  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: first,
    lastName: last,
    displayName,
    bio: user.bio?.trim() || '',
    avatarColor: user.avatar_color,
    avatarUrl: user.avatar_url || null,
    avatarVersion: ver,
    privacy: {
      avatar: user.privacy_avatar || 'all',
      lastSeen: user.privacy_last_seen || 'all',
      bio: user.privacy_bio || 'all',
      email: user.privacy_email || 'contacts',
      phone: user.privacy_phone || 'contacts',
    },
    phone: user.phone?.trim() || '',
    isOnline: !!user.is_online,
    lastSeenAt: user.last_seen_at || null,
    mesiBalance: user.mesi_balance || 0,
    profileChannelId: user.profile_channel_id || null,
    ...(isSilenc(user)
      ? {
          profileColor: user.profile_color || null,
          profileBanner: user.profile_banner || null,
          profileThemeColor: user.profile_theme_color || user.profile_color || null,
          profileMediaUrl: user.profile_media_url || null,
          profileMediaType: user.profile_media_type || 'none',
        }
      : {
          profileColor: null,
          profileBanner: null,
          profileThemeColor: null,
          profileMediaUrl: null,
          profileMediaType: 'none',
        }),
  };

  if (hasAdminTools(user)) {
    payload.silencTools = true;
  }
  if (isSilenc(user)) {
    const aliases = user._aliases || [];
    payload.extraUsernames = aliases.map((a) => a.username);
  }

  return payload;
}

export function publicSilencProfile(user, viewerId, contactIds = []) {
  const p = userPayload(user);
  const aliases = user._aliases || [];
  const gifts = user._gifts || [];
  const contact = contactFields(user, viewerId, contactIds);

  return {
    id: p.id,
    username: p.username,
    firstName: p.firstName,
    lastName: p.lastName,
    displayName: p.displayName,
    bio: p.bio,
    bioHidden: false,
    ...contact,
    avatarColor: p.avatarColor,
    avatarUrl: p.avatarUrl,
    avatarVersion: p.avatarVersion,
    avatarHidden: false,
    isOnline: p.isOnline,
    lastSeenAt: p.lastSeenAt,
    lastSeenText: formatLastSeen(p.lastSeenAt, p.isOnline),
    lastSeenHidden: false,
    profileColor: p.profileColor,
    profileBanner: p.profileBanner,
    profileThemeColor: p.profileThemeColor,
    profileMediaUrl: p.profileMediaUrl,
    profileMediaType: p.profileMediaType,
    profileChannelId: p.profileChannelId,
    linkedChannel: user._linkedChannel || null,
    extraUsernames: aliases.map((a) => a.username),
    gifts: gifts.map((g) => ({
      id: g.id,
      type: g.gift_type,
      createdAt: g.created_at,
    })),
  };
}

function contactFields(user, viewerId, contactIds) {
  const showEmail = canViewPrivacy(user, viewerId, 'email', contactIds);
  const showPhone = canViewPrivacy(user, viewerId, 'phone', contactIds);
  return {
    email: showEmail ? user.email : null,
    phone: showPhone ? (user.phone?.trim() || null) : null,
    emailHidden: !showEmail,
    phoneHidden: !showPhone,
  };
}

export function publicProfile(user, viewerId, contactIds = []) {
  const p = userPayload(user);
  const showAvatar = canViewPrivacy(user, viewerId, 'avatar', contactIds);
  const showLastSeen = canViewPrivacy(user, viewerId, 'last_seen', contactIds);
  const showBio = canViewPrivacy(user, viewerId, 'bio', contactIds);
  const contact = contactFields(user, viewerId, contactIds);

  const gifts = user._gifts || [];

  return {
    id: p.id,
    username: p.username,
    firstName: p.firstName,
    lastName: p.lastName,
    displayName: p.displayName,
    bio: showBio ? p.bio : null,
    bioHidden: !showBio,
    ...contact,
    avatarColor: p.avatarColor,
    avatarUrl: showAvatar ? p.avatarUrl : null,
    avatarVersion: showAvatar ? p.avatarVersion : null,
    avatarHidden: !showAvatar,
    isOnline: showLastSeen ? p.isOnline : null,
    lastSeenAt: showLastSeen ? p.lastSeenAt : null,
    lastSeenText: showLastSeen ? formatLastSeen(p.lastSeenAt, p.isOnline) : '',
    lastSeenHidden: !showLastSeen,
    profileChannelId: p.profileChannelId,
    linkedChannel: user._linkedChannel || null,
    ...(isSilenc(user)
      ? {
          profileColor: p.profileColor,
          profileBanner: p.profileBanner,
          profileThemeColor: p.profileThemeColor,
          profileMediaUrl: p.profileMediaUrl,
          profileMediaType: p.profileMediaType,
        }
      : {}),
    gifts: gifts.map((g) => ({
      id: g.id,
      type: g.gift_type,
      createdAt: g.created_at,
    })),
  };
}

export function validateUsername(username) {
  const u = String(username).trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(u)) {
    return { ok: false, error: 'Имя пользователя: 3–32 символа, латиница, цифры и _' };
  }
  if (!/[a-z]/.test(u)) {
    return { ok: false, error: 'Username должен содержать хотя бы одну латинскую букву' };
  }
  if (/^[0-9_]+$/.test(u)) {
    return { ok: false, error: 'Не используйте только цифры в username' };
  }
  return { ok: true, value: u };
}

export function validateName(name, label) {
  const n = String(name || '').trim();
  if (!n || n.length < 1 || n.length > 64) {
    return { ok: false, error: `${label} обязательно (до 64 символов)` };
  }
  return { ok: true, value: n };
}
