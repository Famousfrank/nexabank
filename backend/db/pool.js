const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER     || 'root',   
  password:           process.env.DB_PASSWORD || '',       
  database:           process.env.DB_NAME     || 'nexabank',
  waitForConnections: true,
  connectionLimit:    20,
  queueLimit:         0,
  timezone:           'Z',
  dateStrings:        false,
  ssl: {
    rejectUnauthorized: false
  },
  // Add these connection timeout settings
  connectTimeout: 60000, // 60 seconds
  acquireTimeout: 60000, // 60 seconds
  timeout: 60000, // 60 seconds
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000 // 10 seconds
});

// Add connection error handling
pool.on('connection', (connection) => {
  console.log('✅ New MySQL connection established');
  connection.on('error', (err) => {
    console.error('❌ MySQL connection error:', err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      console.log('🔄 Reconnecting to MySQL...');
    }
  });
});

// Test connection with retry
async function testConnection(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await pool.getConnection();
      console.log('✅ MySQL connected successfully to Aiven');
      conn.release();
      return true;
    } catch (err) {
      console.error(`❌ Connection attempt ${i + 1} failed:`, err.message);
      if (i < retries - 1) {
        console.log(`⏳ Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  throw new Error('Failed to connect to MySQL after multiple retries');
}

// Test connection immediately
testConnection().catch(err => {
  console.error('❌ Fatal: Could not connect to MySQL:', err.message);
});

module.exports = pool;