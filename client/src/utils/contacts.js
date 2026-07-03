const STORAGE_KEY_PREFIX = 'mess_contacts_legacy_';

function legacyKey(ownerId) {
  return `${STORAGE_KEY_PREFIX}${ownerId}`;
}

export function getLegacyContacts(ownerId) {
  try {
    const raw = localStorage.getItem(legacyKey(ownerId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearLegacyContacts(ownerId) {
  localStorage.removeItem(legacyKey(ownerId));
}

export function getContactDisplayName(contact) {
  const custom = [contact.customFirstName, contact.customLastName].filter(Boolean).join(' ').trim();
  if (custom) return custom;
  return contact.contactDisplayName || contact.displayName || contact.username;
}

export function groupContactsByLetter(contacts) {
  const sorted = [...contacts].sort((a, b) =>
    getContactDisplayName(a).localeCompare(getContactDisplayName(b), 'ru')
  );
  const groups = new Map();
  for (const c of sorted) {
    const name = getContactDisplayName(c);
    const ch = (name[0] || '#').toUpperCase();
    const letter = /[A-ZА-ЯЁ0-9]/.test(ch) ? ch : '#';
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(c);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
}
