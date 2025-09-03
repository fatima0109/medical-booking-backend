// Ensure proper connection pooling
const { Pool } = require('pg');

const databaseConfig = {
  development: {
    user: 'postgres',
    host: 'localhost',
    database: 'medical_booking',
    password: 'Medical@Booking123!',
    port: 5432,
    max: parseInt(process.env.DB_POOL_MAX) || 20,
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
    connectionTimeoutMillis: 2000,
  },
  production: {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: parseInt(process.env.DB_POOL_MAX) || 20,
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
    connectionTimeoutMillis: 2000,
  },
  test: {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME ? `${process.env.DB_NAME}_test` : 'medical_booking_test',
    password: process.env.DB_PASSWORD || 'Medical@Booking123!',
    port: parseInt(process.env.DB_PORT) || 5432,
    max: 5,
    idleTimeoutMillis: 30000,
  }
};

const getConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  const config = databaseConfig[env];
  
  // For production, if DATABASE_URL is not provided, fall back to individual vars
  if (env === 'production' && !process.env.DATABASE_URL) {
    return {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT) || 5432,
      max: parseInt(process.env.DB_POOL_MAX) || 20,
      idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
      connectionTimeoutMillis: 2000,
    };
  }
  
  return config;
};

module.exports = {
  databaseConfig,
  getConfig
};