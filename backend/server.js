require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

// Basic middleware
app.use(cors());
app.use(express.json());

// Simple test route - this MUST work
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working!', time: new Date() });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'NexaBank API' });
});

// Try to load auth routes
try {
  console.log('Current directory:', __dirname);
  console.log('Trying to load auth.js...');
  
  const authPath = './routes/auth.js';
  console.log('Auth path:', authPath);
  
  const authRoutes = require(authPath);
  console.log('Auth routes loaded:', typeof authRoutes);
  
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes mounted at /api/auth');
} catch (err) {
  console.error('❌ Failed to load auth:', err.message);
}

// 404 handler
app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.url);
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Test: http://localhost:${PORT}/test`);
  console.log(`Health: http://localhost:${PORT}/health`);
});