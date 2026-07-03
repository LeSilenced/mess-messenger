import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { giftsApi } from '../api';
import { Icon } from './icons';
import { resolveMediaUrl } from '../utils/mediaUrl';
import './GiftModal.css';

export default function GiftModal({ token, userId, userName, mesiBalance, onClose, onSent }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(mesiBalance || 0);
  const [picked, setPicked] = useState(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    giftsApi
      .catalog(token)
      .then(setCatalog)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function confirmSend() {
    if (!picked) return;
    if (balance < picked.mesi) {
      setError('Недостаточно mesi');
      return;
    }
    setSending(true);
    setError('');
    try {
      const r = await giftsApi.send(token, userId, picked.id, message.trim());
      setBalance(r.mesiBalance);
      onSent?.({ ...r.gift, mesiBalance: r.mesiBalance });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div className="gift-overlay" onClick={onClose}>
      <div className="gift-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>
            {picked ? (
              <button type="button" className="gift-back-link" onClick={() => setPicked(null)}>
                ←
              </button>
            ) : null}
            Подарить {userName}
          </h3>
          <button type="button" className="icon-btn" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </header>
        <p className="gift-balance">Ваш баланс: {balance} mesi</p>
        {error && <p className="gift-error">{error}</p>}

        {!picked && (
          <>
            {loading && <p>Загрузка…</p>}
            <div className="gift-grid">
              {catalog.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="gift-item"
                  onClick={() => {
                    setPicked(g);
                    setMessage('');
                    setError('');
                  }}
                  disabled={balance < g.mesi}
                >
                  {g.imageUrl ? (
                    <img src={resolveMediaUrl(g.imageUrl)} alt="" className="gift-catalog-img" />
                  ) : (
                    <span className="gift-crystal-wrap" style={{ color: g.color }}>
                      <Icon name="crystal-white" size={56} />
                    </span>
                  )}
                  <span className="gift-name">{g.name}</span>
                  <span className="gift-price">{g.mesi} mesi</span>
                </button>
              ))}
            </div>
          </>
        )}

        {picked && (
          <div className="gift-confirm">
            <div className="gift-confirm-preview">
              {picked.imageUrl ? (
                <img src={resolveMediaUrl(picked.imageUrl)} alt="" className="gift-catalog-img" />
              ) : (
                <span className="gift-crystal-wrap large" style={{ color: picked.color }}>
                  <Icon name="crystal-white" size={72} />
                </span>
              )}
              <p className="gift-name">{picked.name}</p>
              <p className="gift-price">{picked.mesi} mesi</p>
            </div>
            <label className="gift-message-field">
              <span>Сообщение (до 16 символов, нельзя изменить)</span>
              <input
                type="text"
                maxLength={16}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Например: Спасибо!"
                autoFocus
              />
              <span className="gift-message-count">{message.length}/16</span>
            </label>
            <button
              type="button"
              className="btn-primary full gift-send-btn"
              disabled={sending}
              onClick={confirmSend}
            >
              {sending ? 'Отправка…' : 'Отправить подарок'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
