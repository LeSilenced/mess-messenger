import { resolveAvatarUrl } from '../utils/avatarUrl';
import './Messenger.css';

export default function Avatar({ name, color, avatarUrl, avatarVersion, size = 40, online }) {
  const letter = (name || '?').charAt(0).toUpperCase();
  const src = resolveAvatarUrl(avatarUrl, avatarVersion);

  const wrap = (node) =>
    online !== undefined ? (
      <span className="avatar-wrap" style={{ width: size, height: size }}>
        {node}
        {online && <span className="avatar-online-dot" aria-label="в сети" />}
      </span>
    ) : (
      node
    );

  if (src) {
    return wrap(
      <img
        className="avatar avatar-img"
        src={src}
        alt=""
        key={src}
        width={size}
        height={size}
        style={{ width: size, height: size, minWidth: size }}
      />
    );
  }

  return wrap(
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        minWidth: size,
        background: color || '#5b8def',
        fontSize: size * 0.42,
      }}
    >
      {letter}
    </div>
  );
}
