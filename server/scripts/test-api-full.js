const BASE = process.env.BASE || 'http://localhost:3002/api';

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  if (!res.ok) throw new Error(`${res.status} ${path}: ${data.error || data.raw || 'fail'}`);
  return data;
}

async function main() {
  await req('/health');
  const a = await req('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'a' + Date.now(),
      email: `a${Date.now()}@x.com`,
      password: 'secret12',
      firstName: 'A',
      lastName: 'One',
    }),
  });
  const b = await req('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'b' + Date.now(),
      email: `b${Date.now()}@x.com`,
      password: 'secret12',
      firstName: 'B',
      lastName: 'Two',
    }),
  });
  const ha = { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' };
  const hb = { Authorization: `Bearer ${b.token}`, 'Content-Type': 'application/json' };

  await req('/users/me', { headers: ha });
  const chat = await req('/chats/private', {
    method: 'POST',
    headers: ha,
    body: JSON.stringify({ userId: b.user.id }),
  });
  const msgs = await req(`/chats/${chat.id}/messages`, { headers: ha });
  console.log('messages count', msgs.length);

  const sendRes = await req('/messages', {
    method: 'POST',
    headers: ha,
    body: JSON.stringify({ chatId: chat.id, content: 'hi' }),
  });
  console.log('sent', sendRes.id, 'readByOther', sendRes.readByOther);

  await req(`/chats/${chat.id}/read`, { method: 'POST', headers: hb });
  const msgs2 = await req(`/chats/${chat.id}/messages`, { headers: ha });
  console.log('after read', msgs2.map((m) => ({ id: m.id, read: m.readByOther })));

  console.log('ALL OK');
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
