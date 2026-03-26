const mysql = require('mysql2/promise');

// Use DATABASE_URL if available (for cloud hosting like Render/Aiven/TiDB)
// Otherwise fallback to individual variables for local development
const poolConfig = process.env.DB_URI
  ? {
      uri: process.env.DB_URI,
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      timezone: 'Z',
      dateStrings: false,
      // Many cloud MySQL instances require SSL
      ssl: {
        rejectUnauthorized: false
      }
    }
  : {
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
    };

const pool = mysql.createPool(poolConfig);

pool.getConnection()
  .then(conn => { console.log('✅ MySQL connected'); conn.release(); })
  .catch(err => { console.error('❌ MySQL connection error:', err.message); process.exit(1); });

module.exports = pool;