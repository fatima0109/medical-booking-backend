const { serverConfig, validateConfig } = require('./server');
const { databaseConfig, getConfig } = require('./database');
const environment = require('./environment');

// Validate configuration on startup
try {
  validateConfig();
  console.log('✅ Configuration validated successfully');
} catch (error) {
  console.error('❌ Configuration validation failed:', error.message);
  if (environment.isProduction) {
    process.exit(1);
  }
}

module.exports = {
  server: serverConfig,
  database: databaseConfig,
  getDatabaseConfig: getConfig,
  environment,
  
  // Helper functions
  getDatabaseUrl: () => {
    if (environment.databaseUrl) return environment.databaseUrl;
    
    const config = getConfig();
    return `postgres://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
  },
  
  isEmailEnabled: () => {
    return environment.features.enableEmail && 
           environment.email.user && 
           environment.email.pass;
  }
};