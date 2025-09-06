// src/utils/tempStorage.js
const Redis = require('ioredis');

// For development: in-memory storage
// For production: Redis storage
let storage;

if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL) {
  // Use Redis in production
  const redis = new Redis(process.env.REDIS_URL);
  
  storage = {
    save: async (email, data) => {
      await redis.setex(`temp_user:${email}`, 600, JSON.stringify(data)); // 10 minutes
    },
    get: async (email) => {
      const data = await redis.get(`temp_user:${email}`);
      return data ? JSON.parse(data) : null;
    },
    delete: async (email) => {
      await redis.del(`temp_user:${email}`);
    }
  };
} else {
  // Use in-memory storage for development
  const tempUsers = new Map();
  
  storage = {
    save: async (email, data) => {
      tempUsers.set(email, data);
      // Set expiration (10 minutes)
      setTimeout(() => {
        tempUsers.delete(email);
      }, 10 * 60 * 1000);
    },
    get: async (email) => {
      return tempUsers.get(email);
    },
    delete: async (email) => {
      tempUsers.delete(email);
    }
  };
}

// Export the storage functions
const saveTempUserData = async (email, data) => {
  await storage.save(email, data);
};

const getTempUserData = async (email) => {
  return await storage.get(email);
};

const deleteTempUserData = async (email) => {
  await storage.delete(email);
};

module.exports = {
  saveTempUserData,
  getTempUserData,
  deleteTempUserData
};