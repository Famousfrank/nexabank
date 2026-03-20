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

// ─── Database Connection ──────────────────────────────────────────────────────
const db = require('./db/pool');

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

// ─── Database Connection Health Check ─────────────────────────────────────────
// Middleware to check DB connection before handling requests
app.use(async (req, res, next) => {
  // Skip health check endpoint to avoid infinite loop
  if (req.path === '/health') {
    return next();
  }
  
  try {
    // Try to get a connection from the pool
    const conn = await db.getConnection();
    conn.release();
    next();
  } catch (err) {
    console.error('❌ Database connection error in middleware:', err.message);
    res.status(503).json({ 
      error: 'Database temporarily unavailable',
      details: 'The database is waking up from sleep mode. Please try again in a few seconds.'
    });
  }
});

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

// Health check - now includes database status
app.get('/health', async (_, res) => {
  let dbStatus = 'disconnected';
  let dbError = null;
  
  try {
    const conn = await db.getConnection();
    await conn.query('SELECT 1');
    conn.release();
    dbStatus = 'connected';
  } catch (err) {
    dbStatus = 'error';
    dbError = err.message;
  }
  
  res.json({ 
    status: 'ok', 
    time: new Date(),
    database: dbStatus,
    dbError: dbError
  });
});

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

// ─── Server Startup with Database Wait ───────────────────────────────────────
const PORT = process.env.PORT || 4000;

// Function to wait for database with retries
async function waitForDatabase(retries = 5, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`⏳ Database connection attempt ${i + 1}/${retries}...`);
      
      const conn = await db.getConnection();
      await conn.query('SELECT 1');
      conn.release();
      
      console.log('✅ Database connected successfully');
      return true;
    } catch (err) {
      console.error(`❌ Attempt ${i + 1} failed:`, err.message);
      
      if (i < retries - 1) {
        console.log(`⏳ Waiting ${delay/1000} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        // Exponential backoff - increase delay each time
        delay = delay * 1.5;
      }
    }
  }
  throw new Error('Could not connect to database after multiple attempts');
}

// Start server only after database is connected
waitForDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`🚀 NexaBank API running on http://localhost:${PORT}`);
      console.log(`📊 Health check available at http://localhost:${PORT}/health`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to start server:', err.message);
    console.log('💡 The database may be sleeping. Retry in a few seconds...');
    
    // Keep trying to connect even after initial failure
    const keepTrying = setInterval(async () => {
      try {
        const conn = await db.getConnection();
        await conn.query('SELECT 1');
        conn.release();
        
        console.log('✅ Database finally connected! Starting server...');
        clearInterval(keepTrying);
        
        server.listen(PORT, () => {
          console.log(`🚀 NexaBank API running on http://localhost:${PORT}`);
          console.log(`📊 Health check available at http://localhost:${PORT}/health`);
        });
      } catch (err) {
        console.log('⏳ Still waiting for database to wake up...');
      }
    }, 10000); // Check every 10 seconds
  });

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, closing server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, closing server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});