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

// ─── Database Connection (Lazy Loading) ──────────────────────────────────────
let db = null;
let dbConnecting = false;

// Function to initialize database connection
async function initDatabase() {
  if (dbConnecting) return;
  dbConnecting = true;
  
  try {
    console.log('⏳ Attempting to connect to MySQL...');
    const mysql = require('mysql2/promise');
    
    db = await mysql.createPool({
      host:               process.env.DB_HOST,
      port:               parseInt(process.env.DB_PORT || '3306'),
      user:               process.env.DB_USER,
      password:           process.env.DB_PASSWORD,
      database:           process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit:    10,
      queueLimit:         0,
      ssl: { rejectUnauthorized: false },
      connectTimeout: 30000,
      enableKeepAlive: true
    });
    
    // Test connection
    const conn = await db.getConnection();
    await conn.query('SELECT 1');
    conn.release();
    
    console.log('✅ MySQL connected successfully to Aiven');
    
    // Make db available to routes
    app.set('db', db);
    
  } catch (err) {
    console.error('❌ MySQL connection error:', err.message);
    console.log('⏳ Will retry in 30 seconds...');
    
    // Schedule retry
    setTimeout(initDatabase, 30000);
  } finally {
    dbConnecting = false;
  }
}

// ─── Middleware to handle database availability ─────────────────────────────
app.use((req, res, next) => {
  // Skip for health check
  if (req.path === '/health' || req.path === '/') {
    return next();
  }
  
  // Check if db is connected
  if (!db) {
    return res.status(503).json({ 
      error: 'Database is waking up',
      message: 'Please wait a few seconds and refresh',
      status: 'connecting'
    });
  }
  
  // Attach db to request
  req.db = db;
  next();
});

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
// Health check - always works even without DB
app.get('/', (_, res) => {
  res.json({ 
    status: 'NexaBank API is running',
    database: db ? 'connected' : 'connecting',
    timestamp: new Date()
  });
});

app.get('/health', (_, res) => {
  res.json({ 
    status: 'ok', 
    database: db ? 'connected' : 'connecting',
    time: new Date()
  });
});

// Only load routes when db is available
app.use(async (req, res, next) => {
  if (!db) {
    return res.status(503).json({ 
      error: 'Database is waking up',
      message: 'Please wait a few seconds and refresh'
    });
  }
  next();
});

// Load routes after DB check
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/accounts',     require('./routes/accounts'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/users',        require('./routes/users'));
app.use('/api/limits',       require('./routes/limits'));
app.use('/api/loans',        require('./routes/loans'));
app.use('/api/profile',      require('./routes/profile'));

// 404
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Helper: push real-time event to a user ───────────────────────────────────
function pushToUser(userId, event, data) {
  io.to(`user:${userId}`).emit(event, data);
}

module.exports = { pushToUser };

// ─── Start Server Immediately ───────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`🚀 NexaBank API server started on http://localhost:${PORT}`);
  console.log(`⏳ Attempting to connect to MySQL in the background...`);
  
  // Start database connection in background
  initDatabase();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, closing server...');
  server.close(() => {
    console.log('✅ Server closed');
    if (db) {
      db.end().then(() => console.log('✅ Database connection closed'));
    }
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, closing server...');
  server.close(() => {
    console.log('✅ Server closed');
    if (db) {
      db.end().then(() => console.log('✅ Database connection closed'));
    }
    process.exit(0);
  });
});