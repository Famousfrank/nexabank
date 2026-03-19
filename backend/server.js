require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const http       = require('http');
const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');

const app    = express();
const server = http.createServer(app);

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }
});

// Store userId → socket mapping for targeted pushes
const userSockets = new Map();

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'nexabank_access_secret_change_me';

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));
  try {
    const payload = jwt.verify(token, ACCESS_SECRET);
    socket.userId = payload.id;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  userSockets.set(socket.userId, socket.id);
  console.log(`🔌 WS connected: ${socket.userId}`);

  socket.join(`user:${socket.userId}`);

  socket.on('disconnect', () => {
    userSockets.delete(socket.userId);
  });
});

// Make io available to routes
app.set('io', io);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use(limiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Too many attempts, try later' } });
app.use('/api/auth', authLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/accounts',     require('./routes/accounts'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/users',        require('./routes/users'));
app.use('/api/limits',       require('./routes/limits'));
app.use('/api/loans',        require('./routes/loans'));
app.use('/api/profile',      require('./routes/profile'));

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Helper: push real-time event to a user ───────────────────────────────────
// Used by routes: require('../../server').pushToUser(userId, event, data)
function pushToUser(userId, event, data) {
  io.to(`user:${userId}`).emit(event, data);
}

module.exports = { pushToUser };

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 NexaBank API running on http://localhost:${PORT}`));