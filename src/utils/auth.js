// src/utils/auth.js
const jwt = require('jsonwebtoken');

const authenticateToken = (token) => {
  try {
    if (!token) {
      throw new Error('No token provided');
    }
    
    // Remove 'Bearer ' prefix if present
    if (token.startsWith('Bearer ')) {
      token = token.slice(7);
    }
    
    // CORRECTED: Use jwt.verify() instead of jwt.authenticate()
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error('Token verification error:', error.message);
    throw new Error('Invalid token');
  }
};

module.exports = { authenticateToken };