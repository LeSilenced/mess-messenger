import db from '../db.js';

const DEFAULT_GIFTS = [
  { id: 'crystal_white', name: 'Белый кристалл', mesi_price: 10, color: '#f0f4f8' },
  { id: 'crystal_silver', name: 'Серебряный', mesi_price: 12, color: '#b0bec5' },
  { id: 'crystal_black', name: 'Чёрный', mesi_price: 20, color: '#263238' },
  { id: 'crystal_red', name: 'Рубиновый', mesi_price: 22, color: '#e53935' },
  { id: 'crystal_crimson', name: 'Бордовый', mesi_price: 24, color: '#c62828' },
  { id: 'crystal_blue', name: 'Сапфировый', mesi_price: 22, color: '#1e88e5' },
  { id: 'crystal_azure', name: 'Лазурный', mesi_price: 24, color: '#0288d1' },
  { id: 'crystal_cobalt', name: 'Кобальт', mesi_price: 26, color: '#1565c0' },
  { id: 'crystal_green', name: 'Изумрудный', mesi_price: 22, color: '#43a047' },
  { id: 'crystal_mint', name: 'Мятный', mesi_price: 24, color: '#26a69a' },
  { id: 'crystal_pink', name: 'Розовый', mesi_price: 22, color: '#ec407a' },
  { id: 'crystal_sakura', name: 'Сакура', mesi_price: 26, color: '#f48fb1' },
  { id: 'crystal_purple', name: 'Аметист', mesi_price: 24, color: '#8e24aa' },
  { id: 'crystal_lavender', name: 'Лаванда', mesi_price: 23, color: '#b39ddb' },
  { id: 'crystal_gold', name: 'Золотой', mesi_price: 30, color: '#ffb300' },
  { id: 'crystal_amber', name: 'Янтарный', mesi_price: 25, color: '#ff8f00' },
  { id: 'crystal_cyan', name: 'Бирюзовый', mesi_price: 24, color: '#00bcd4' },
  { id: 'crystal_indigo', name: 'Индиго', mesi_price: 26, color: '#3949ab' },
];

export function seedGiftItems() {
  for (const g of DEFAULT_GIFTS) {
    const exists = db.prepare('SELECT id FROM gift_items WHERE id = ?').get(g.id);
    if (!exists) {
      db.prepare(
        `INSERT INTO gift_items (id, name, mesi_price, stock, color, active) VALUES (?, ?, ?, -1, ?, 1)`
      ).run(g.id, g.name, g.mesi_price, g.color);
    } else {
      db.prepare('UPDATE gift_items SET color = ?, name = ? WHERE id = ?').run(
        g.color,
        g.name,
        g.id
      );
    }
  }
}

export function giftItemRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    mesi: row.mesi_price,
    mesiPrice: row.mesi_price,
    stock: row.stock,
    imageUrl: row.image_url,
    color: row.color || '#888888',
    active: !!row.active,
    icon: 'crystal',
  };
}

export function getGiftItem(id) {
  return giftItemRow(db.prepare('SELECT * FROM gift_items WHERE id = ? AND active = 1').get(id));
}

export function getGiftItemAny(id) {
  return giftItemRow(db.prepare('SELECT * FROM gift_items WHERE id = ?').get(id));
}

export function listActiveGifts() {
  seedGiftItems();
  return db
    .prepare('SELECT * FROM gift_items WHERE active = 1 ORDER BY mesi_price ASC')
    .all()
    .map(giftItemRow);
}

export function giftPayloadFromSent(row) {
  const item = getGiftItemAny(row.gift_type) || { name: row.gift_type, color: '#888888' };
  const msg = row.gift_message?.trim() || '';
  return {
    id: row.id,
    type: row.gift_type,
    name: item.name,
    color: item.color,
    imageUrl: item.imageUrl,
    message: msg || null,
    mesiSpent: row.mesi_spent,
    createdAt: row.created_at,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
  };
}
