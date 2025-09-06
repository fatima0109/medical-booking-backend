const jwt = require('jsonwebtoken');
const pool = require('../db/db'); // Add this import

// Main authentication middleware - UPDATED to check for deleted users
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user still exists and is not deleted
    const userResult = await pool.query(
      'SELECT id, email, deleted FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (userResult.rows[0].deleted) {
      return res.status(401).json({
        success: false,
        error: 'This account has been deactivated'
      });
    }
    
    req.user = decoded;
    req.userId = decoded.userId; // Add userId for consistency
    
    console.log(`Authenticated user: ${decoded.email}`);
    next();
  } catch (err) {
    handleJWTError(err, res);
  }
};

// Socket authentication middleware - UPDATED to check for deleted users
const authenticateSocketToken = async (token) => {
  try {
    if (!token) {
      throw new Error('No token provided');
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user still exists and is not deleted
    const userResult = await pool.query(
      'SELECT id, email, deleted FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }
    
    if (userResult.rows[0].deleted) {
      throw new Error('Account has been deactivated');
    }
    
    return decoded;
  } catch (err) {
    throw new Error(`Socket authentication failed: ${err.message}`);
  }
};

// Error handler for JWT errors
const handleJWTError = (err, res) => {
  console.error('JWT verification error:', err.message);

  if (err.name === 'TokenExpiredError') {
    return res.status(403).json({
      success: false,
      error: 'Token expired. Please login again'
    });
  } else if (err.name === 'JsonWebTokenError') {
    return res.status(403).json({
      success: false,
      error: 'Invalid token format'
    });
  } else {
    return res.status(403).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
};

// Optional: Middleware to check if user has a specific role - UPDATED
const requireRole = (role) => {
  return async (req, res, next) => {
    try {
      // First authenticate the token
      await authenticateToken(req, res, () => {});
      
      // Then check the role
      if (req.user && req.user.role === role) {
        next();
      } else {
        res.status(403).json({
          success: false,
          error: 'Insufficient permissions'
        });
      }
    } catch (error) {
      res.status(403).json({
        success: false,
        error: 'Authentication failed'
      });
    }
  };
};

// Simple authentication middleware (alternative version) - UPDATED
const simpleAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user still exists and is not deleted
    const userResult = await pool.query(
      'SELECT id, email, deleted FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (userResult.rows[0].deleted) {
      return res.status(401).json({
        success: false,
        error: 'This account has been deactivated'
      });
    }
    
    req.user = decoded;
    req.userId = decoded.userId;
    next();
  } catch (error) {
    handleJWTError(error, res);
  }
};

// Export all authentication functions
module.exports = {
  authenticateToken,
  authenticateSocketToken,
  requireRole,
  simpleAuth,
  handleJWTError
};