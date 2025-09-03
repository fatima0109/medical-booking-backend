const jwt = require('jsonwebtoken');

// Main authentication middleware
const authenticateToken = (req, res, next) => {
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
    req.user = decoded;
    
    console.log(`Authenticated user: ${decoded.email}`);
    next();
  } catch (err) {
    handleJWTError(err, res);
  }
};

// Socket authentication middleware
const authenticateSocketToken = (token) => {
  try {
    if (!token) {
      throw new Error('No token provided');
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

// Optional: Middleware to check if user has a specific role
const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user && req.user.role === role) {
      next();
    } else {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }
  };
};

// Simple authentication middleware (alternative version)
const simpleAuth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
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