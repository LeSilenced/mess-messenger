/**
 * Запуск сервера (3001) и клиента (5173) одной командой через node — npm не обязателен.
 * Использование: node scripts/dev.js
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const node = process.execPath;

function run(label, args, cwd) {
  const child = spawn(node, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
    shell: false,
  });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`[${label}] завершился с кодом ${code}`);
  });
  return child;
}

console.log('Mess: остановка старого процесса на порту 3001…');
await import('./kill-port.js');

const server = run('server', ['--watch', 'src/index.js'], path.join(root, 'server'));

setTimeout(() => {
  const viteBin = path.join(root, 'client', 'node_modules', 'vite', 'bin', 'vite.js');
  run('client', [viteBin], path.join(root, 'client'));
  console.log('\n  Откройте в браузере: http://localhost:5173\n');
  console.log('  API: http://localhost:3001/api/health\n');
}, 1500);

function shutdown() {
  server.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
