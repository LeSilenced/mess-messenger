import db from '../db.js';

export function contactsMiddleware(req, res, next) {
  if (!req.user?.id) {
    req.contactIds = [];
    return next();
  }
  req.contactIds = db
    .prepare('SELECT contact_user_id FROM user_contacts WHERE owner_id = ?')
    .all(req.user.id)
    .map((r) => r.contact_user_id);
  next();
}
