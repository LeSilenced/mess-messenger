/**
 * Production: build client (if needed) and start server with static SPA.
 * Usage: node scripts/start-prod.js
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const distIndex = path.join(root, 'client', 'dist', 'index.html');
const node =
  process.execPath ||
  'C:\\Users\\user\\AppData\\Local\\Programs\\cursor\\resources\\app\\resources\\helpers\\node.exe';

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: 'inherit', shell: false, env: process.env });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
}

async function main() {
  if (!fs.existsSync(distIndex)) {
    console.log('[prod] client/dist not found — building…');
    await run(node, ['node_modules/vite/bin/vite.js', 'build'], path.join(root, 'client')).catch(
      async () => {
        await run('npm', ['run', 'build'], path.join(root, 'client'));
      }
    );
  }

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    SERVE_CLIENT: '1',
  };
  if (!env.JWT_SECRET) {
    console.warn('[prod] JWT_SECRET not set — use a strong secret in .env');
  }

  console.log('[prod] starting server (SERVE_CLIENT=1)…');
  const serverDir = path.join(root, 'server');
  const entry = path.join(serverDir, 'src', 'index.js');
  const child = spawn(node, [entry], {
    cwd: serverDir,
    stdio: 'inherit',
    env,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
