# Деплой на домен (silencmess.online)

## 1. Сборка и запуск

```bash
# из корня проекта
npm run build
node scripts/start-prod.js
```

Или вручную:

```bash
cd client && npm run build
cd ../server
set SERVE_CLIENT=1
set NODE_ENV=production
set CLIENT_URL=https://silencmess.online
set JWT_SECRET=ваш-секрет
node src/index.js
```

Скопируйте `.env.example` в `server/.env` и задайте переменные.

## 2. Reverse proxy (Nginx)

Проксируйте **весь** трафик на Node (порт 3001), включая WebSocket:

```nginx
location / {
  proxy_pass http://127.0.0.1:3001;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```

API и фронт на одном origin — отдельный `/api` proxy не обязателен.

## 3. Проверка

- `GET https://ваш-домен/api/health` → `{"ok":true,"version":5}`
- Открыть `/`, `/c/slug`, `/u/username`
- Войти как `silenc` или `malice` — вкладка «Инструменты» в настройках

## 4. Демо-аккаунты

| Логин   | Пароль      | Админ-панель |
|---------|-------------|--------------|
| silenc  | Roma-2011   | да           |
| malice  | Malice0403  | да           |
| tester  | demo1234    | нет          |

Подробная инструкция для домашнего сервера и домена: `ИНСТРУКЦИЯ_СЕРВЕР_И_ДОМЕН.txt`
