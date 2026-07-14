import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import uploadImageHandler from './api/upload-image.js';
import latestImageHandler from './api/latest-image.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Debug logging for reverse proxy issues
  app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.url} - ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
    next();
  });

  // Same handlers Vercel runs as serverless functions under /api
  app.all('/api/upload-image', uploadImageHandler);
  app.all('/api/latest-image', latestImageHandler);

  // API Route to fetch history (DEPRECATED - App now uses Client SDK)
  app.get('/api/history', async (req, res) => {
    res.json({ info: "Use Firebase Client SDK for history" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
