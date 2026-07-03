import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  getGiftItem,
  listActiveGifts,
  giftPayloadFromSent,
} from '../utils/giftCatalog.js';
import { validateId } from '../middleware/security.js';
import { recordMesiTx } from '../utils/mesi.js';

const router = Router();
router.use(authMiddleware);

router.get('/catalog', (_, res) => {
  res.json(listActiveGifts());
});

router.get('/user/:userId', (req, res) => {
  const userId = validateId(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Некорректный id' });

  const rows = db
    .prepare(`SELECT * FROM gifts WHERE to_user_id = ? ORDER BY id DESC LIMIT 200`)
    .all(userId);

  res.json(rows.map(giftPayloadFromSent));
});

router.post('/send', (req, res) => {
  const toUserId = validateId(req.body.toUserId);
  const giftType = req.body.giftType;
  let giftMessage = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (giftMessage.length > 16) {
    return res.status(400).json({ error: 'Сообщение — не более 16 символов' });
  }
  if (!toUserId || !giftType) {
    return res.status(400).json({ error: 'Некорректный подарок' });
  }
  if (toUserId === req.user.id) {
    return res.status(400).json({ error: 'Нельзя подарить себе' });
  }

  const item = getGiftItem(giftType);
  if (!item) return res.status(400).json({ error: 'Подарок недоступен' });

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(toUserId);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

  if (item.stock === 0) {
    return res.status(400).json({ error: 'Подарок закончился' });
  }

  const cost = item.mesiPrice;
  const sender = db.prepare('SELECT mesi_balance FROM users WHERE id = ?').get(req.user.id);
  if ((sender.mesi_balance || 0) < cost) {
    return res.status(400).json({ error: 'Недостаточно mesi' });
  }

  const tx = db.transaction(() => {
    const newBal = (sender.mesi_balance || 0) - cost;
    db.prepare('UPDATE users SET mesi_balance = ? WHERE id = ?').run(newBal, req.user.id);
    if (item.stock > 0) {
      db.prepare('UPDATE gift_items SET stock = stock - 1 WHERE id = ? AND stock > 0').run(
        giftType
      );
    }
    const result = db
      .prepare(
        `INSERT INTO gifts (from_user_id, to_user_id, gift_type, mesi_spent, gift_message)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(req.user.id, toUserId, giftType, cost, giftMessage || null);
    recordMesiTx(req.user.id, -cost, newBal, 'gift_send', 'gift', String(result.lastInsertRowid), item.name);
    return { giftId: result.lastInsertRowid, balance: newBal };
  });

  const { giftId, balance } = tx();
  const row = db.prepare('SELECT * FROM gifts WHERE id = ?').get(giftId);

  const io = req.app.get('io');
  io?.to(`user:${toUserId}`).emit('gift_received', giftPayloadFromSent(row));

  res.status(201).json({ gift: giftPayloadFromSent(row), mesiBalance: balance });
});

export default router;
