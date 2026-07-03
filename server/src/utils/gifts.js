export const GIFT_CATALOG = {
  crystal_white: { mesi: 10, name: 'Белый кристалл', color: '#e8e8e8', icon: 'crystal-white' },
  crystal_black: { mesi: 20, name: 'Чёрный кристалл', color: '#1a1a1a', icon: 'crystal-black' },
  crystal_red: { mesi: 25, name: 'Красный кристалл', color: '#e53935', icon: 'crystal-red' },
  crystal_blue: { mesi: 25, name: 'Синий кристалл', color: '#1e88e5', icon: 'crystal-blue' },
  crystal_green: { mesi: 25, name: 'Зелёный кристалл', color: '#43a047', icon: 'crystal-green' },
};

export function isValidGiftType(type) {
  return !!GIFT_CATALOG[type];
}

export function giftPayload(row) {
  const def = GIFT_CATALOG[row.gift_type] || {};
  return {
    id: row.id,
    type: row.gift_type,
    name: def.name || row.gift_type,
    color: def.color || '#888',
    mesiSpent: row.mesi_spent,
    createdAt: row.created_at,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
  };
}
