import { useState, useEffect, useCallback } from 'react';
import Auth from './components/Auth';
import Messenger from './components/Messenger';
import { ThemeProvider } from './context/ThemeContext';
import { checkServer, profileApi } from './api';
import { getSocket, disconnectSocket } from './socket';
import './App.css';

const STORAGE_KEY = 'mess_auth';

function loadAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveAuth(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export default function App() {
  const [auth, setAuth] = useState(loadAuth);
  const [serverWarning, setServerWarning] = useState(null);

  const login = useCallback((data) => {
    saveAuth(data);
    setAuth(data);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    disconnectSocket();
    setAuth(null);
  }, []);

  const updateUser = useCallback((user) => {
    setAuth((prev) => {
      if (!prev) return prev;
      const next = { ...prev, user };
      saveAuth(next);
      return next;
    });
  }, []);

  useEffect(() => {
    checkServer().then((r) => setServerWarning(r.ok ? null : r.message));
  }, [auth]);

  useEffect(() => {
    if (!auth?.token) return;
    profileApi.get(auth.token).then((fresh) => {
      setAuth((prev) => {
        if (!prev) return prev;
        const next = { ...prev, user: fresh };
        saveAuth(next);
        return next;
      });
    }).catch(() => {});
  }, [auth?.token]);

  useEffect(() => {
    if (auth?.token) {
      getSocket(auth.token);
    }
    return () => disconnectSocket();
  }, [auth?.token]);

  return (
    <ThemeProvider>
      {serverWarning && (
        <div className="server-banner" role="alert">
          {serverWarning}
        </div>
      )}
      {!auth ? (
        <Auth onAuth={login} />
      ) : (
        <Messenger auth={auth} onLogout={logout} onUserUpdate={updateUser} />
      )}
    </ThemeProvider>
  );
}
