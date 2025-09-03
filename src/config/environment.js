const environment = process.env.NODE_ENV || 'development';

const isProduction = environment === 'production';
const isDevelopment = environment === 'development';
const isTest = environment === 'test';

const config = {
  environment,
  isProduction,
  isDevelopment,
  isTest,
  
  // Database
  databaseUrl: process.env.DATABASE_URL,
  
  // Email
  email: {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
    from: process.env.EMAIL_FROM,
    secure: process.env.EMAIL_SECURE === 'true',
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    file: process.env.LOG_FILE || './logs/app.log',
    console: process.env.LOG_CONSOLE !== 'false',
  },
  
  // Features
  features: {
    enableEmail: process.env.ENABLE_EMAIL !== 'false',
    enableSMS: process.env.ENABLE_SMS === 'true',
    enableWebSocket: process.env.ENABLE_WEBSOCKET !== 'false',
    maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
  },
  
  // OTP Configuration
  otp: {
    length: parseInt(process.env.OTP_LENGTH) || 6,
    expiry: parseInt(process.env.OTP_EXPIRY) || 3, // minutes
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS) || 3,
    cooldown: parseInt(process.env.OTP_COOLDOWN) || 60, // minutes
  },
  
  // Queue Configuration
  queue: {
    checkInBuffer: parseInt(process.env.QUEUE_CHECKIN_BUFFER) || 15, // minutes
    maxWaitTime: parseInt(process.env.QUEUE_MAX_WAIT) || 120, // minutes
    notificationLead: parseInt(process.env.QUEUE_NOTIFICATION_LEAD) || 10, // minutes
  }
};

module.exports = config;