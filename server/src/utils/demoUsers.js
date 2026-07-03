import bcrypt from 'bcryptjs';
import db from '../db.js';

const DEMO_ACCOUNTS = [
  {
    username: 'silenc',
    email: 'silenc@silencmess.online',
    firstName: 'Silenc',
    lastName: '',
    password: 'Roma-2011',
  },
  {
    username: 'malice',
    email: 'malice@silencmess.online',
    firstName: 'Malice',
    lastName: '',
    password: 'Malice0403',
  },
  {
    username: 'tester',
    email: 'tester@silencmess.online',
    firstName: 'Tester',
    lastName: '',
    password: 'demo1234',
  },
];

const REMOVE_USERNAMES = ['bob'];

export function maintainDemoUsers() {
  for (const name of REMOVE_USERNAMES) {
    const row = db
      .prepare('SELECT id FROM users WHERE LOWER(username) = ?')
      .get(name.toLowerCase());
    if (row) {
      db.prepare('DELETE FROM users WHERE id = ?').run(row.id);
      console.log(`[demo] removed user @${name}`);
    }
  }

  const colors = ['#5b8def', '#9b59b6', '#43a047'];

  DEMO_ACCOUNTS.forEach((acc, i) => {
    const hash = bcrypt.hashSync(acc.password, 10);
    let user = db.prepare('SELECT * FROM users WHERE username = ?').get(acc.username);

    if (!user) {
      const display = [acc.firstName, acc.lastName].filter(Boolean).join(' ') || acc.username;
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO users (username, email, password_hash, display_name, first_name, last_name, avatar_color)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          acc.username,
          acc.email,
          hash,
          display,
          acc.firstName,
          acc.lastName,
          colors[i % colors.length]
        );
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
      console.log(`[demo] created @${acc.username}`);
    } else if (acc.username === 'silenc' || acc.username === 'malice') {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
    }
  });
}
