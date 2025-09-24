const crypto = require('crypto');
const Redis = require('ioredis');

// Simple token generator
function generateToken(length = 24) {
  return crypto.randomBytes(length).toString('base64url');
}

function generateRoomId() {
  return `room_${crypto.randomBytes(8).toString('hex')}`;
}

// Storage abstraction: Redis in production, in-memory otherwise
let storage;
if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL) {
  const redis = new Redis(process.env.REDIS_URL);
  storage = {
    async set(key, value, ttlSeconds) {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    },
    async get(key) {
      const val = await redis.get(key);
      return val ? JSON.parse(val) : null;
    },
    async del(key) {
      await redis.del(key);
    }
  };
} else {
  const map = new Map();
  storage = {
    async set(key, value, ttlSeconds) {
      map.set(key, value);
      setTimeout(() => map.delete(key), ttlSeconds * 1000);
    },
    async get(key) {
      return map.get(key) || null;
    },
    async del(key) {
      map.delete(key);
    }
  };
}

const DEFAULT_TTL_SECONDS = 2 * 60 * 60; // 2 hours

async function createMeeting(appointmentId, patientId, doctorId, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const key = `appt_video:${appointmentId}`;
  // If already exists, return existing
  const existing = await storage.get(key);
  if (existing) return existing;

  const roomId = generateRoomId();
  const patientToken = generateToken(24);
  const doctorToken = generateToken(24);
  const now = Date.now();
  const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();

  const payload = {
    appointmentId: parseInt(appointmentId),
    roomId,
    patientToken,
    doctorToken,
    patientId,
    doctorId,
    createdAt: new Date(now).toISOString(),
    expiresAt
  };

  await storage.set(key, payload, ttlSeconds);
  return payload;
}

async function getMeeting(appointmentId) {
  const key = `appt_video:${appointmentId}`;
  return await storage.get(key);
}

async function invalidateMeeting(appointmentId) {
  const key = `appt_video:${appointmentId}`;
  await storage.del(key);
}

module.exports = {
  createMeeting,
  getMeeting,
  invalidateMeeting
};


