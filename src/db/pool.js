const { Pool } = require('pg');
require('dotenv').config();

const { getDatabaseConfig } = require('../config');

// Get the configuration based on environment
const dbConfig = getDatabaseConfig();

// Create pool configuration
let poolConfig;

if (process.env.DATABASE_URL) {
  // Use DATABASE_URL if available (for production)
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    ...dbConfig // Spread additional config options
  };
} else {
  // Use individual environment variables
  poolConfig = {
    user: process.env.DB_USER || dbConfig.user,
    host: process.env.DB_HOST || dbConfig.host,
    database: process.env.DB_NAME || dbConfig.database,
    password: process.env.DB_PASSWORD || dbConfig.password,
    port: parseInt(process.env.DB_PORT) || dbConfig.port,
    ...dbConfig // Spread additional config options like max, idleTimeoutMillis, etc.
  };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // REDUCE if you have many connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000, // ADD CONNECTION TIMEOUT
});

// Add connection tracking
let connectionCount = 0;

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

pool.on('connect', (client) => {
  connectionCount++;
  console.log(`New connection established. Total active: ${connectionCount}`);
});

pool.on('remove', (client) => {
  connectionCount = Math.max(0, connectionCount - 1);
  console.log(`Connection released. Total active: ${connectionCount}`);
});

// Enhanced error handling
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test connection with proper error handling
const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('Database connected successfully at:', result.rows[0].now);
    
    // Get pool statistics (using available properties)
    console.log('Pool status:', {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    });
  } catch (err) {
    console.error('Database connection failed:', err.message);
    console.error('Please check your database configuration and ensure PostgreSQL is running');
    
    // Don't exit in development to allow for auto-restart with fixes
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

testConnection();

// Enhanced connection stats method
pool.getConnectionStats = () => ({
  active: connectionCount,
  idle: pool.idleCount,
  waiting: pool.waitingCount,
  total: pool.totalCount
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\nShutting down database pool gracefully...');
  await pool.end();
  console.log('Pool has ended');
  process.exit(0);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params)
};