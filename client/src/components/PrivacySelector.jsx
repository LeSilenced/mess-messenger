import './PrivacySelector.css';

const OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'contacts', label: 'Контакты' },
  { value: 'nobody', label: 'Никто' },
];

export default function PrivacySelector({ label, hint, value, onChange }) {
  return (
    <div className="privacy-row">
      <div className="privacy-row-text">
        <span className="privacy-label">{label}</span>
        {hint && <span className="privacy-hint">{hint}</span>}
      </div>
      <div className="privacy-options">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={value === opt.value ? 'active' : ''}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
