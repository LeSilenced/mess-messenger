import { THEME_VAR_KEYS } from '../theme/themePresets';
import './ThemeEditor.css';

const VAR_LABELS = {
  '--bg-app': 'Фон приложения',
  '--bg-panel': 'Панели',
  '--bg-hover': 'Наведение',
  '--bg-input': 'Поля ввода',
  '--bg-message-out': 'Исходящие сообщения',
  '--bg-message-in': 'Входящие сообщения',
  '--accent': 'Акцент',
  '--accent-hover': 'Акцент (hover)',
  '--text': 'Текст',
  '--text-muted': 'Вторичный текст',
  '--border': 'Границы',
  '--gradient-auth': 'Фон входа (CSS)',
};

export default function ThemeEditor({ theme, onChange, onDelete }) {
  if (!theme) return null;

  return (
    <div className="theme-editor">
      <label className="field">
        <span>Название темы</span>
        <input
          value={theme.name}
          onChange={(e) => onChange({ name: e.target.value })}
          maxLength={32}
        />
      </label>

      <div className="theme-editor-colors">
        {THEME_VAR_KEYS.filter((k) => k !== '--gradient-auth').map((key) => (
          <label key={key} className="theme-color-row">
            <span>{VAR_LABELS[key] || key}</span>
            <div className="theme-color-inputs">
              <input
                type="color"
                value={toHex(theme.vars[key])}
                onChange={(e) =>
                  onChange({ vars: { ...theme.vars, [key]: e.target.value } })
                }
              />
              <input
                type="text"
                className="theme-color-text"
                value={theme.vars[key] || ''}
                onChange={(e) =>
                  onChange({ vars: { ...theme.vars, [key]: e.target.value } })
                }
              />
            </div>
          </label>
        ))}
      </div>

      <label className="field">
        <span>Градиент экрана входа</span>
        <input
          className="theme-gradient-input"
          value={theme.vars['--gradient-auth'] || ''}
          onChange={(e) =>
            onChange({ vars: { ...theme.vars, '--gradient-auth': e.target.value } })
          }
        />
      </label>

      {onDelete && (
        <button type="button" className="btn-ghost danger-text full" onClick={onDelete}>
          Удалить эту тему
        </button>
      )}
    </div>
  );
}

function toHex(val) {
  if (!val || typeof val !== 'string') return '#000000';
  if (val.startsWith('#') && (val.length === 7 || val.length === 4)) return val.slice(0, 7);
  return '#17212b';
}
