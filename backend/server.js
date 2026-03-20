require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4000;

// ─── CORS Configuration ───────────────────────────────────────────────────────
const allowedOrigins = [
  'https://nexabank-frontend.onrender.com',
  'http://localhost:5173',
  'http://localhost:4000',
  process.env.FRONTEND_URL
].filter(Boolean);

// CORS options
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// ─── Body Parsing Middleware ────────────────────────────────────────────────
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ─── Simple Routes ──────────────────────────────────────────────────────────
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working!', time: new Date() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

app.get('/', (req, res) => {
  res.json({ message: 'NexaBank API', endpoints: ['/api/auth', '/test', '/health'] });
});

// ─── Database Connection (for routes that need it) ──────────────────────────
let db = null;

async function initDatabase() {
  try {
    console.log('⏳ Attempting to connect to MySQL...');
    const mysql = require('mysql2/promise');
    
    db = await mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'nexabank',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ...(process.env.DB_SSL === 'true' ? {
        ssl: { rejectUnauthorized: false }
      } : {})
    });
    
    const conn = await db.getConnection();
    await conn.query('SELECT 1');
    conn.release();
    
    console.log('✅ MySQL connected successfully');
    app.set('db', db);
  } catch (err) {
    console.error('❌ MySQL connection error:', err.message);
  }
}

// Start database connection in background (don't block server startup)
initDatabase();

// ─── Routes ──────────────────────────────────────────────────────────────────
// Load auth routes
try {
  console.log('📁 Current directory:', __dirname);
  const authPath = path.join(__dirname, 'routes', 'auth.js');
  console.log('📄 Auth path:', authPath);
  
  if (fs.existsSync(authPath)) {
    const authRoutes = require(authPath);
    console.log('✅ Auth routes loaded, type:', typeof authRoutes);
    app.use('/api/auth', authRoutes);
    console.log('✅ Auth routes mounted at /api/auth');
  } else {
    console.log('❌ Auth file not found at:', authPath);
  }
} catch (err) {
  console.error('❌ Failed to load auth:', err.message);
  console.error(err.stack);
}

// Try to load other routes
const routeFiles = ['accounts', 'transactions', 'users', 'limits', 'loans', 'profile', 'admin'];
routeFiles.forEach(routeName => {
  try {
    const routePath = path.join(__dirname, 'routes', `${routeName}.js`);
    if (fs.existsSync(routePath)) {
      const routeModule = require(routePath);
      app.use(`/api/${routeName}`, routeModule);
      console.log(`✅ ${routeName} routes mounted at /api/${routeName}`);
    }
  } catch (err) {
    console.log(`⚠️ Could not load ${routeName} routes:`, err.message);
  }
});

// ─── 404 Handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  console.log('❌ 404 Not Found:', req.method, req.url);
  res.status(404).json({ error: 'Route not found' });
});

// ─── Error Handler ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📡 Test: http://localhost:${PORT}/test`);
  console.log(`💚 Health: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth: http://localhost:${PORT}/api/auth/login/init`);
  console.log(`🌐 CORS allowed origins:`, allowedOrigins);
  console.log();
});