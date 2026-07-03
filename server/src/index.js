import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RAILWAY_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : null;
const CLIENT_ORIGIN = process.env.CLIENT_URL || RAILWAY_URL || 'http://localhost:5173';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import chatRoutes from './routes/chats.js';
import messageRoutes from './routes/messages.js';
import { setupSocket } from './socket.js';
import storiesRoutes from './routes/stories.js';
import giftsRoutes from './routes/gifts.js';
import adminRoutes from './routes/admin.js';
import resolveRoutes from './routes/resolve.js';
import contactsRoutes from './routes/contacts.js';
import { seedGiftItems } from './utils/giftCatalog.js';
import { maintainDemoUsers } from './utils/demoUsers.js';
import searchRoutes from './routes/search.js';
import { limitBodySize } from './middleware/security.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Contact-Ids'],
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(limitBodySize);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (filePath.includes('avatars')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

seedGiftItems();
try {
  maintainDemoUsers();
} catch (e) {
  console.error('[demo] maintainDemoUsers failed:', e.message);
}

app.get('/api/health', (_, res) => res.json({ ok: true, version: 5 }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/stories', storiesRoutes);
app.use('/api/gifts', giftsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/resolve', resolveRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/search', searchRoutes);

setupSocket(io);
app.set('io', io);

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
const serveClient =
  process.env.SERVE_CLIENT === '1' && fs.existsSync(path.join(clientDist, 'index.html'));

if (serveClient) {
  app.use(
    express.static(clientDist, {
      maxAge: process.env.NODE_ENV === 'production' ? '365d' : 0,
      index: false,
    })
  );
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads') ||
      req.path.startsWith('/socket.io')
    ) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((req, res, next) => {
  if (res.headersSent) return next();
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API не найден' });
  }
  next();
});
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  process.env.SERVE_CLIENT = '1';
  console.log(`[railway] public domain: ${RAILWAY_URL}`);
}
httpServer.listen(PORT, () => {
  console.log(`Mess server: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});
