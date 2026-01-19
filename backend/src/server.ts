import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { initDatabase } from './db/database';
import { initializeSocketIO } from './services/socketService';
import { telemetryService } from './services/telemetryService';
import { setTelemetryService } from './services/gameTimeService';
import characterRoutes from './routes/characters';
import appRoutes from './routes/apps';
import gameTimeRoutes from './routes/gameTime';
import messageRoutes from './routes/messages';
import settingsRoutes from './routes/settings';
import llmChatRoutes from './routes/llmChat';
import terminalRoutes from './routes/terminal';
import broadcastRoutes from './routes/broadcast';
import gamestateRoutes from './routes/gamestate';

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PHOS_BACKEND_PORT || process.env.PORT || 3100);
const HOST = process.env.PHOS_BACKEND_HOST || '0.0.0.0';

// Async initialization
async function startServer() {
  // Ensure data directory exists
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Initialize database (async for sql.js)
  await initDatabase();

  // Initialize Socket.IO
  initializeSocketIO(server);

  // Start telemetry simulation and link it to game time service
  telemetryService.start();
  setTelemetryService(telemetryService);

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' })); // Increase limit for image uploads

  // Request logging
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

  // API Routes
  app.use('/api/characters', characterRoutes);
  app.use('/api/apps', appRoutes);
  app.use('/api/game-time', gameTimeRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/llm-chat', llmChatRoutes);
  app.use('/api/terminal', terminalRoutes);
  app.use('/api/broadcast', broadcastRoutes);
  app.use('/api/gamestate', gamestateRoutes);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'Phosphorite Backend',
      version: '2.0.0',
      status: 'running',
      endpoints: {
        characters: '/api/characters',
        apps: '/api/apps',
        gameTime: '/api/game-time',
        messages: '/api/messages',
        health: '/api/health'
      }
    });
  });

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal server error'
    });
  });

  // Start server
  server.listen(PORT, HOST, () => {
    console.log('=================================');
    console.log('Phosphorite Backend v2.0');
    console.log('=================================');
    console.log(`Server running on http://${HOST}:${PORT}`);
    console.log(`HTTP: http://${HOST}:${PORT}`);
    console.log(`WebSocket: ws://${HOST}:${PORT}`);
    console.log('=================================');
  });
}

// Start the server
startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
