const { validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/db');
const { generateOTP } = require('../utils/otpGenerator');
const { sendOTPEmail } = require('../utils/emailSender');

// Temporary storage for OTPs (or use your existing otpStorage)
const otpStorage = new Map();

// Helper function to get user by email
const getUserByEmail = async (email) => {
  return await pool.query('SELECT * FROM users WHERE email = $1', [email]);
};

const authController = {
  // UPDATED SIGN UP METHOD - Creates user in database first
  signUp: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false,
          errors: errors.array(),
          message: 'Validation failed'
        });
      }

      const { email, password, name, contact_number, phone } = req.body;
      
      // Check if user already exists in DATABASE
      const existingUser = await getUserByEmail(email);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'User already exists with this email'
        });
      }

      // Generate OTP
      const otp = generateOTP();
      const otpExpiry = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // CREATE USER IN DATABASE (but not verified yet)
      const newUser = await pool.query(
        `INSERT INTO users (email, password_hash, name, contact_number, phone, otp, otp_expiry, verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, email, name, contact_number, phone`,
        [email, hashedPassword, name, contact_number, phone, otp, otpExpiry, false]
      );

      // Also store in memory for backup
      otpStorage.set(email, {
        otp: otp,
        expiresAt: Date.now() + 180000 // 3 min
      });

      // Send OTP email (or log to console)
      await sendOTPEmail(email, otp);

      console.log('Sign up OTP:', otp); // For testing

      res.status(200).json({
        success: true,
        message: 'OTP sent to your email. Please verify to complete registration.',
        email: email,
        expiresIn: 3 // minutes
      });

    } catch (error) {
      console.error('Sign up error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create user'
      });
    }
  },

  // KEEP YOUR EXISTING handleSignIn METHOD
  handleSignIn: async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array(),
        message: 'Validation failed'
      });
    }

    try {
      const { email, password } = req.body;

      // Check if user exists
      const userResult = await getUserByEmail(email);
      if (!userResult.rows || userResult.rows.length === 0) {
        return res.status(401).json({ 
          success: false,
          error: 'Invalid email or password'
        });
      }
      const user = userResult.rows[0]; 
      
      // Verify password
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ 
          success: false,
          error: 'Invalid email or password'
        });
      }
      
      // Check if user is verified
      if (!user.verified) {
        return res.status(401).json({ 
          success: false,
          error: 'Account not verified. Please verify your email first.',
          requiresVerification: true
        });
      }
      
      // Create JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      return res.status(200).json({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone,
            contact_number: user.contact_number
          }
        },
        redirectTo: '/',
        message: 'Sign in successful'
      });
    } catch (error) {
      console.error('Sign-in error:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  },

  // KEEP YOUR EXISTING logout METHOD
  logout: async (req, res) => {
    try {
      // In a real app, you might want to blacklist the token
      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error' 
      });
    }
  }
};

module.exports = authController;