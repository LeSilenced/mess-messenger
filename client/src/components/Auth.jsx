import { useState } from 'react';
import { authApi } from '../api';
import './Auth.css';

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    login: '',
    username: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data =
        mode === 'login'
          ? await authApi.login(form.login, form.password)
          : await authApi.register({
              username: form.username,
              firstName: form.firstName,
              lastName: form.lastName,
              email: form.email,
              phone: form.phone.trim() || undefined,
              password: form.password,
            });
      onAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">M</div>
        <h1>Mess</h1>
        <p className="auth-sub">Быстрый и простой мессенджер</p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            Вход
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === 'login' ? (
            <input
              type="text"
              placeholder="Имя пользователя или email"
              value={form.login}
              onChange={set('login')}
              required
              autoComplete="username"
            />
          ) : (
            <>
              <input
                type="text"
                placeholder="Имя *"
                value={form.firstName}
                onChange={set('firstName')}
                required
                minLength={1}
              />
              <input
                type="text"
                placeholder="Фамилия *"
                value={form.lastName}
                onChange={set('lastName')}
                required
                minLength={1}
              />
              <input
                type="text"
                placeholder="Имя пользователя (@username)"
                value={form.username}
                onChange={set('username')}
                required
                autoComplete="username"
              />
              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={set('email')}
                required
                autoComplete="email"
              />
              <input
                type="tel"
                placeholder="Телефон (необязательно)"
                value={form.phone}
                onChange={set('phone')}
                autoComplete="tel"
              />
              <p className="auth-field-hint">
                Username — латиница и _, с буквой (не только цифры). Имя «B Two» — это имя и
                фамилия, @username — отдельное поле.
              </p>
            </>
          )}
          <input
            type="password"
            placeholder="Пароль"
            value={form.password}
            onChange={set('password')}
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Загрузка…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>
      </div>
    </div>
  );
}
