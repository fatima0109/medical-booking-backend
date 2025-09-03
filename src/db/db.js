const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const poolConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
  reapIntervalMillis: 1000,
  createRetryIntervalMillis: 2000
};

const pool = new Pool(poolConfig);

// Connection test with retries
async function testConnection(retries = 3) {
  while (retries > 0) {
    try {
      const res = await pool.query('SELECT NOW()');
      console.log('✅ Database connected at:', res.rows[0].now);
      return true;
    } catch (err) {
      retries--;
      console.error(`Connection failed, ${retries} retries left...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (retries === 0) throw err;
    }
  }
}

// Event listeners
pool.on('error', (err) => {
  console.error('Unexpected database error:', err.message);
  // Optionally: send alert to monitoring system
});

pool.on('connect', () => {
  console.log('New database connection established');
});

pool.on('remove', () => {
  console.log('Database connection closed');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await pool.end();
  console.log('Database pool closed');
  process.exit(0);
});

// Test connection on startup
testConnection()
  .catch(err => {
    console.error('❌ Failed to connect to database after retries:', err);
    process.exit(1);
  });

  pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

module.exports = pool;