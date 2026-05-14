/**
 * server.js — Pipeline Deployment Dashboard backend entry point.
 *
 * Initialises:
 *   • Express with CORS + JSON body parsing
 *   • HTTP server + Socket.IO (with CORS)
 *   • Bull job queue (injects io after Socket.IO is ready)
 *   • API routes
 *   • Socket.IO room management
 */
'use strict';

require('dotenv').config();

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');

// ── Initialise DB (runs schema migrations synchronously on require) ───────────
require('./db');

const { setSocketIO } = require('./queue');
const deployRoutes   = require('./routes/deploy');
const { router: validateRouter } = require('./routes/validate');

// ─────────────────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';
// '*' wildcard is valid behind nginx. cors + socket.io both accept `true` to
// mirror the request Origin header — equivalent to '*' but credentials-safe.
const corsOrigin = FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN;

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin:  corsOrigin,
    methods: ['GET', 'POST'],
  },
  // Allow clients to reconnect for up to 5 minutes with exponential back-off
  pingInterval: 25_000,
  pingTimeout:  20_000,
});

// Inject io into the Bull queue worker so it can emit real-time events
setSocketIO(io);

// ─── Express middleware ───────────────────────────────────────────────────────
app.set('trust proxy', 1); // Required for correct rate-limit IP when behind a proxy

app.use(cors({ origin: corsOrigin }));

// Note: we intentionally do NOT use express.json() for the deploy/validate
// endpoints — those use multipart (multer), which parses the body itself.
// express.json() is still registered for any future JSON-only endpoints.
app.use(express.json({ limit: '100kb' }));

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api', deployRoutes);
app.use('/api', validateRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

// ─── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[express] Unhandled error:', err);
  // Don't leak internal details in production
  const msg = process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message;
  res.status(err.status || 500).json({ error: msg });
});

// ─── Socket.IO — room management ──────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[socket] Client connected: ${socket.id}`);

  socket.on('join', deploymentId => {
    if (typeof deploymentId === 'string' && deploymentId.length < 100) {
      socket.join(`deploy:${deploymentId}`);
      console.log(`[socket] ${socket.id} joined room deploy:${deploymentId}`);
    }
  });

  socket.on('leave', deploymentId => {
    socket.leave(`deploy:${deploymentId}`);
  });

  socket.on('disconnect', reason => {
    console.log(`[socket] ${socket.id} disconnected: ${reason}`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);

server.listen(PORT, () => {
  console.log(`\n🚀  Pipeline Dashboard backend running on http://localhost:${PORT}`);
  console.log(`    CORS allowed origin: ${FRONTEND_ORIGIN}`);
  console.log(`    Press Ctrl+C to stop\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { server.close(() => process.exit(0)); });
