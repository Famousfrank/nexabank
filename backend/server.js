require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const http       = require('http');
const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const fs         = require('fs');
const path       = require('path');

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

// CORS configuration
const allowedOrigins = [
  'https://nexabank-frontend.onrender.com',
  'http://localhost:5173',
  'http://localhost:4000',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests
app.options('*', cors());
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

// Debug: List all files in routes directory
app.get('/api/debug/files', (req, res) => {
  try {
    const routesDir = path.join(__dirname, 'routes');
    const files = fs.readdirSync(routesDir);
    res.json({ 
      routesDirectory: routesDir,
      files: files,
      exists: fs.existsSync(routesDir)
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Debug: List all registered routes
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  
  app._router.stack.forEach(layer => {
    if (layer.route) {
      // Route layer
      const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
      routes.push({
        path: layer.route.path,
        methods: methods
      });
    } else if (layer.name === 'router' && layer.handle.stack) {
      // Router layer - get the base path
      let basePath = '';
      if (layer.regexp) {
        basePath = layer.regexp.source
          .replace('\\/?(?=\\/|$)', '')
          .replace(/\\\//g, '/')
          .replace(/\^/g, '')
          .replace(/\$/g, '')
          .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param');
      }
      
      layer.handle.stack.forEach(handler => {
        if (handler.route) {
          const methods = Object.keys(handler.route.methods).join(', ').toUpperCase();
          routes.push({
            path: basePath + handler.route.path,
            methods: methods
          });
        }
      });
    }
  });
  
  res.json({ 
    routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
    total: routes.length,
    dbConnected: db ? 'yes' : 'no'
  });
});

// Load routes with error handling
console.log('\n🔍 Loading routes from:', path.join(__dirname, 'routes'));

// Check if routes directory exists
try {
  const routesDir = path.join(__dirname, 'routes');
  if (fs.existsSync(routesDir)) {
    console.log('✅ Routes directory found');
    const files = fs.readdirSync(routesDir);
    console.log('📁 Available route files:', files);
  } else {
    console.log('❌ Routes directory NOT found at:', routesDir);
  }
} catch (err) {
  console.error('❌ Error checking routes directory:', err.message);
}

// Load auth routes first (most important)
try {
  console.log('⏳ Attempting to load auth routes...');
  const authPath = path.join(__dirname, 'routes', 'auth.js');
  console.log('📄 Auth path:', authPath);
  
  if (fs.existsSync(authPath)) {
    const authRoutes = require(authPath);
    console.log('✅ Auth routes loaded successfully');
    console.log('📦 Auth routes type:', typeof authRoutes);
    app.use('/api/auth', authRoutes);
  } else {
    console.log('❌ Auth file not found at:', authPath);
  }
} catch (err) {
  console.error('❌ Failed to load auth routes:', err.message);
  console.error(err.stack);
}

// Load other routes
const routeFiles = [
  { name: 'admin', path: 'admin.js' },
  { name: 'accounts', path: 'accounts.js' },
  { name: 'transactions', path: 'transactions.js' },
  { name: 'users', path: 'users.js' },
  { name: 'limits', path: 'limits.js' },
  { name: 'loans', path: 'loans.js' },
  { name: 'profile', path: 'profile.js' }
];

routeFiles.forEach(route => {
  try {
    const routePath = path.join(__dirname, 'routes', route.path);
    if (fs.existsSync(routePath)) {
      const routeModule = require(routePath);
      console.log(`✅ ${route.name} routes loaded`);
      app.use(`/api/${route.name}`, routeModule);
    } else {
      console.log(`❌ ${route.name} file not found:`, routePath);
    }
  } catch (err) {
    console.error(`❌ Failed to load ${route.name} routes:`, err.message);
  }
});

// 404 handler
app.use((req, res) => {
  console.log('❌ 404 - Not Found:', req.method, req.url);
  res.status(404).json({ error: 'Route not found' });
});

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
  console.log(`\n🚀 NexaBank API server started on http://localhost:${PORT}`);
  console.log(`⏳ Attempting to connect to MySQL in the background...`);
  console.log(`📊 Debug endpoints:`);
  console.log(`   - GET /api/debug/files`);
  console.log(`   - GET /api/debug/routes`);
  console.log(`   - GET /health\n`);
  
  // Start database connection in background
  initDatabase();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, closing server...');
  server.close(() => {
    console.log('✅ Server closed');
    if (db && db.end) {
      db.end().then(() => console.log('✅ Database connection closed'));
    }
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, closing server...');
  server.close(() => {
    console.log('✅ Server closed');
    if (db && db.end) {
      db.end().then(() => console.log('✅ Database connection closed'));
    }
    process.exit(0);
  });
});