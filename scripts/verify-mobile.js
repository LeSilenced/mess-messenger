/**
 * Проверка мобильной вёрстки без браузера: файлы, селекторы, хуки.
 * Запуск: node scripts/verify-mobile.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(root, 'client');

const checks = [];

function ok(name) {
  checks.push({ name, pass: true });
}

function fail(name, detail) {
  checks.push({ name, pass: false, detail });
}

function read(rel) {
  return fs.readFileSync(path.join(client, rel), 'utf8');
}

function fileExists(rel) {
  return fs.existsSync(path.join(client, rel));
}

// 1. Файлы
const requiredFiles = [
  'src/hooks/useIsMobile.js',
  'src/hooks/useVisualViewportInset.js',
  'src/styles/mobile.css',
];

for (const f of requiredFiles) {
  if (fileExists(f)) ok(`файл ${f}`);
  else fail(`файл ${f}`, 'отсутствует');
}

// 2. main.jsx импортирует mobile.css
const main = read('src/main.jsx');
if (main.includes("styles/mobile.css")) ok('main.jsx импортирует mobile.css');
else fail('main.jsx', 'нет import mobile.css');

// 3. index.html viewport
const html = fs.readFileSync(path.join(client, 'index.html'), 'utf8');
if (html.includes('viewport-fit=cover')) ok('viewport-fit=cover в index.html');
else fail('index.html', 'нет viewport-fit=cover');

// 4. Ключевые CSS-правила
const mobileCss = read('src/styles/mobile.css');
const cssRules = [
  'html.is-mobile',
  '100dvh',
  'safe-area-inset',
  'mobile-chat-open',
  'translateX',
  'font-size: 16px',
];

for (const rule of cssRules) {
  if (mobileCss.includes(rule)) ok(`CSS: ${rule}`);
  else fail(`CSS: ${rule}`, 'не найдено в mobile.css');
}

// 5. Messenger использует useIsMobile
const messenger = read('src/components/Messenger.jsx');
if (messenger.includes('useIsMobile')) ok('Messenger.jsx → useIsMobile');
else fail('Messenger.jsx', 'нет useIsMobile');

if (messenger.includes('settings-portal-overlay')) ok('Messenger → settings portal');
else fail('Messenger.jsx', 'нет settings-portal-overlay');

const chatCss = read('src/components/ChatWindow.css');
if (chatCss.includes('channel-post') && chatCss.includes('text-align: left'))
  ok('канал: посты выровнены влево');
else fail('ChatWindow.css', 'стили канала');

const settings = read('src/components/SettingsPanel.jsx');
if (settings.includes("icon: 'brush'") && settings.includes('settings-nav-icons'))
  ok('настройки: иконки + кисть');
else fail('SettingsPanel.jsx', 'навигация настроек');

if (read('src/components/icons.jsx').includes("case 'brush'")) ok('иконка brush');
else fail('icons.jsx', 'нет brush');

const themePresets = read('src/theme/themePresets.js');
if (themePresets.includes('sakura') && themePresets.includes('azure'))
  ok('темы: сакура, лазурь и др.');
else fail('themePresets.js', 'нет пресетов');

if (settings.includes('Создать тему') && fileExists('src/components/ThemeEditor.jsx'))
  ok('редактор своих тем');
else fail('SettingsPanel / ThemeEditor', 'нет создать тему');

const giftModal = read('src/components/GiftModal.jsx');
if (giftModal.includes('maxLength={16}') && giftModal.includes('нельзя изменить'))
  ok('подарок: сообщение до 16 символов');
else fail('GiftModal.jsx', 'нет лимита сообщения');

const profile = read('src/components/UserProfileModal.jsx');
if (profile.includes('profile-gift-message') && profile.includes('g.message'))
  ok('профиль: показ сообщения подарка');
else fail('UserProfileModal.jsx', 'нет gift message');

const adminAccess = fs.readFileSync(
  path.join(root, 'server', 'src', 'utils', 'adminAccess.js'),
  'utf8'
);
if (adminAccess.includes('malice')) ok('админ: malice');
else fail('adminAccess.js', 'нет malice');

// 6. ChatWindow — клавиатура
const chatWin = read('src/components/ChatWindow.jsx');
if (chatWin.includes('useVisualViewportInset')) ok('ChatWindow → viewport inset');
else fail('ChatWindow.jsx', 'нет useVisualViewportInset');

// 7. Логика breakpoint
const hook = read('src/hooks/useIsMobile.js');
if (hook.includes('768') && hook.includes('is-mobile')) ok('breakpoint 768px + class is-mobile');
else fail('useIsMobile.js', 'ожидались 768 и is-mobile');

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass);

console.log('\n=== Проверка мобильной версии Mess ===\n');
for (const c of checks) {
  console.log(c.pass ? '  ✓' : '  ✗', c.name, c.detail ? `— ${c.detail}` : '');
}
console.log(`\nИтого: ${passed}/${checks.length} OK\n`);

if (failed.length) {
  process.exit(1);
}

console.log('Как проверить вручную в браузере:');
console.log('  1. node scripts/dev.js');
console.log('  2. Откройте http://localhost:5173');
console.log('  3. F12 → Toggle device toolbar → iPhone 14 / 390×844');
console.log('  4. Список чатов на весь экран → тап по чату → слайд чата');
console.log('  5. Кнопка «назад» возвращает к списку\n');
