import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { resolveUsername } from '../utils/resolve.js';

const router = Router();
router.use(authMiddleware);

router.get('/:username', (req, res) => {
  const raw = (req.params.username || '').replace(/^@/, '');
  const result = resolveUsername(raw);
  if (!result.ok) return res.status(404).json({ error: result.error });
  res.json(result);
});

export default router;
