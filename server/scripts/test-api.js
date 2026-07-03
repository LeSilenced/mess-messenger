const BASE = 'http://localhost:3001/api';

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

async function main() {
  console.log('health', await req('/health'));

  const reg = await req('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'testuser_' + Date.now(),
      email: `t${Date.now()}@t.com`,
      password: 'secret12',
      firstName: 'Test',
      lastName: 'User',
    }),
  });
  console.log('register', reg.status, reg.data.error || 'ok');

  if (!reg.data.token) return;

  const h = { Authorization: `Bearer ${reg.data.token}`, 'Content-Type': 'application/json' };
  console.log('me', await req('/users/me', { headers: h }));
  console.log('chats', await req('/chats', { headers: h }));
  console.log(
    'patch me',
    await req('/users/me', {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ firstName: 'A', lastName: 'B', username: reg.data.user.username, bio: 'x' }),
    })
  );
}

main().catch(console.error);
