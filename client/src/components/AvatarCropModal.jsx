import { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from './icons';
import './AvatarCropModal.css';

const VIEWPORT = 300;
const OUTPUT = 512;

export default function AvatarCropModal({ imageSrc, onClose, onSave }) {
  const imgRef = useRef(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [minScale, setMinScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const [saving, setSaving] = useState(false);

  const scale = minScale * zoom;

  const onImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img?.naturalWidth) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    const ms = Math.max(VIEWPORT / w, VIEWPORT / h);
    setMinScale(ms);
    setZoom(1);
    setPos({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    onImageLoad();
  }, [imageSrc, onImageLoad]);

  function onPointerDown(e) {
    e.preventDefault();
    setDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: pos.x,
      posY: pos.y,
    };
  }

  function onPointerMove(e) {
    if (!dragging) return;
    setPos({
      x: dragStart.current.posX + (e.clientX - dragStart.current.x),
      y: dragStart.current.posY + (e.clientY - dragStart.current.y),
    });
  }

  function onPointerUp() {
    setDragging(false);
  }

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  });

  async function handleSave() {
    const img = imgRef.current;
    if (!img) return;
    setSaving(true);
    try {
      const blob = await cropToBlob(img, scale, pos);
      await onSave(blob);
    } finally {
      setSaving(false);
    }
  }

  const imgW = natural.w * scale || VIEWPORT;
  const imgH = natural.h * scale || VIEWPORT;

  return (
    <div className="crop-overlay">
      <div className="crop-modal">
        <header className="crop-header">
          <button type="button" className="icon-btn" onClick={onClose}>
            <Icon name="close" size={22} />
          </button>
          <h2>Фото профиля</h2>
          <button
            type="button"
            className="crop-save-text"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '…' : 'Готово'}
          </button>
        </header>

        <p className="crop-hint">Перетащите и увеличьте фото, затем нажмите «Готово»</p>

        <div
          className="crop-viewport"
          onPointerDown={onPointerDown}
          style={{ touchAction: 'none' }}
        >
          <div className="crop-mask" />
          <img
            ref={imgRef}
            src={imageSrc}
            alt=""
            className="crop-image"
            draggable={false}
            onLoad={onImageLoad}
            style={{
              width: imgW,
              height: imgH,
              left: VIEWPORT / 2 - imgW / 2 + pos.x,
              top: VIEWPORT / 2 - imgH / 2 + pos.y,
            }}
          />
        </div>

        <div className="crop-controls">
          <Icon name="search" size={16} className="crop-zoom-icon" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="range"
          />
        </div>
      </div>
    </div>
  );
}

function cropToBlob(image, scale, pos) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const factor = OUTPUT / VIEWPORT;
    const w = image.naturalWidth * scale * factor;
    const h = image.naturalHeight * scale * factor;
    const x = (VIEWPORT / 2 - (image.naturalWidth * scale) / 2 + pos.x) * factor;
    const y = (VIEWPORT / 2 - (image.naturalHeight * scale) / 2 + pos.y) * factor;

    ctx.drawImage(image, x, y, w, h);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось обработать фото'))),
      'image/jpeg',
      0.92
    );
  });
}
