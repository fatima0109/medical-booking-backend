const helmet = require('helmet');
const hpp = require('hpp');
const { xss } = require('express-xss-sanitizer');
const { environment } = require('../config');

// Security middleware configuration
const securityMiddleware = [
  // Set security headers
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        fontSrc: ["'self'", "https:", "data:"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
  
  // Prevent XSS attacks
  xss(),
  
  // Prevent parameter pollution
  hpp(),
  
  // Prevent SQL injection (basic protection)
  (req, res, next) => {
    // Sanitize query parameters
    const sanitize = (obj) => {
      if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach(key => {
          if (typeof obj[key] === 'string') {
            // Basic SQL injection prevention
            obj[key] = obj[key].replace(/['";\\]/g, '');
          } else if (typeof obj[key] === 'object') {
            sanitize(obj[key]);
          }
        });
      }
      return obj;
    };
    
    req.query = sanitize(req.query);
    req.body = sanitize(req.body);
    req.params = sanitize(req.params);
    
    next();
  },
  
  // Prevent clickjacking
  (req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  },
  
  // Hide powered-by header
  (req, res, next) => {
    res.removeHeader('X-Powered-By');
    next();
  }
];

// CORS configuration
const corsOptions = {
  origin: environment.isProduction 
    ? [environment.server.frontendUrl] 
    : ['http://localhost:3000', 'http://localhost:5000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Authorization'],
  maxAge: 600 // 10 minutes
};

module.exports = {
  securityMiddleware,
  corsOptions
};