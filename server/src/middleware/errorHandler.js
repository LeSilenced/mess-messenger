export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  console.error('[API error]', req.method, req.path, err.message);
  const msg = String(err.message || err);
  if (msg.includes('UNIQUE') || msg.includes('constraint')) {
    return res.status(409).json({ error: 'Данные уже используются' });
  }
  if (msg.includes('no such column') || msg.includes('SQLITE_ERROR')) {
    return res.status(500).json({
      error: 'Ошибка базы данных. Перезапустите сервер (npm run dev:server).',
    });
  }
  res.status(500).json({ error: msg || 'Внутренняя ошибка сервера' });
}
