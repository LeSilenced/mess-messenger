import { useState, useEffect, useCallback } from 'react';
import { contactsApi } from '../api';
import { getLegacyContacts, clearLegacyContacts } from '../utils/contacts';

export function useContacts(userId, token) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await contactsApi.list(token);
      setContacts(list);
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !userId) return;
      try {
        const legacy = getLegacyContacts(userId);
        if (legacy.length) {
          await contactsApi.sync(token, legacy);
          clearLegacyContacts(userId);
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, token, refresh]);

  useEffect(() => {
    const onChange = () => refresh();
    window.addEventListener('mess-contacts-changed', onChange);
    return () => window.removeEventListener('mess-contacts-changed', onChange);
  }, [refresh]);

  async function add(user) {
    const c = await contactsApi.add(token, user.id);
    setContacts((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
    window.dispatchEvent(new CustomEvent('mess-contacts-changed'));
    return c;
  }

  async function remove(contactId) {
    await contactsApi.remove(token, contactId);
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
    window.dispatchEvent(new CustomEvent('mess-contacts-changed'));
  }

  async function updateNames(contactId, customFirstName, customLastName) {
    const c = await contactsApi.update(token, contactId, {
      customFirstName,
      customLastName,
    });
    setContacts((prev) => prev.map((x) => (x.id === contactId ? c : x)));
    window.dispatchEvent(new CustomEvent('mess-contacts-changed'));
    return c;
  }

  function isContact(contactId) {
    return contacts.some((c) => c.id === contactId);
  }

  return {
    contacts,
    loading,
    refresh,
    add,
    remove,
    updateNames,
    isContact,
  };
}
