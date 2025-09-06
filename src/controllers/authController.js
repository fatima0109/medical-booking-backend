const { validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/db');
const { generateOTP } = require('../utils/otpGenerator');
const { sendOTPEmail } = require('../utils/emailSender');

// Temporary storage for registration data (use Redis in production)
const tempUserStorage = new Map();

// Helper function to get user by email
const getUserByEmail = async (email) => {
  return await pool.query('SELECT * FROM users WHERE email = $1', [email]);
};

const authController = {
  // MODIFIED: Sign up only stores temp data and sends OTP
  signUp: async (req, res, next) => {
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
        // Check if it's a deleted account
        if (existingUser.rows[0].deleted) {
          return res.status(400).json({
            success: false,
            error: 'This email was previously used. Please contact support to restore your account.'
          });
        }
        
        return res.status(400).json({
          success: false,
          error: 'User already exists with this email'
        });
      }

      // Generate OTP
      const otp = generateOTP();
      const otpExpiry = Date.now() + 3 * 60 * 1000; // 3 minutes
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Store user data temporarily (NOT in database yet)
      const tempUser = {
        email,
        password_hash: hashedPassword,
        name,
        contact_number,
        phone,
        otp,
        otpExpiry,
        createdAt: new Date()
      };
      
      // Save to temporary storage
      tempUserStorage.set(email, tempUser);
      
      // Set expiration for temp data (3 minutes)
      setTimeout(() => {
        if (tempUserStorage.has(email)) {
          tempUserStorage.delete(email);
          console.log(`Temp data for ${email} expired`);
        }
      }, 3 * 60 * 1000);

      // Send OTP email
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
      next(error); // Use error handling middleware
    }
  },

  // NEW: OTP verification that creates the user
  verifyOTP: async (req, res, next) => {
    try {
      const { email, otp } = req.body;
      
      // Check if we have temp data for this email
      if (!tempUserStorage.has(email)) {
        return res.status(400).json({
          success: false,
          error: 'No pending registration found or OTP expired'
        });
      }
      
      const tempUser = tempUserStorage.get(email);
      
      // Check if OTP is expired
      if (Date.now() > tempUser.otpExpiry) {
        tempUserStorage.delete(email);
        return res.status(400).json({
          success: false,
          error: 'OTP expired. Please request a new one.'
        });
      }
      
      // Verify OTP
      if (tempUser.otp !== otp) {
        return res.status(400).json({
          success: false,
          error: 'Invalid OTP'
        });
      }
      
      // OTP verified - Create user in database
      const newUser = await pool.query(
        `INSERT INTO users (email, password_hash, name, contact_number, phone, verified)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, name, contact_number, phone`,
        [tempUser.email, tempUser.password_hash, tempUser.name, 
         tempUser.contact_number, tempUser.phone, true]
      );
      
      // Clean up temporary data
      tempUserStorage.delete(email);
      
      // Create JWT token
      const token = jwt.sign(
        {
          userId: newUser.rows[0].id,
          email: newUser.rows[0].email
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          token,
          user: {
            id: newUser.rows[0].id,
            email: newUser.rows[0].email,
            name: newUser.rows[0].name,
            phone: newUser.rows[0].phone,
            contact_number: newUser.rows[0].contact_number
          }
        }
      });
      
    } catch (error) {
      console.error('OTP verification error:', error);
      next(error);
    }
  },

  // NEW: Resend OTP
  resendOTP: async (req, res, next) => {
    try {
      const { email } = req.body;
      
      // Check if we have temp data for this email
      if (!tempUserStorage.has(email)) {
        return res.status(400).json({
          success: false,
          error: 'No pending registration found'
        });
      }
      
      const tempUser = tempUserStorage.get(email);
      
      // Generate new OTP
      const newOtp = generateOTP();
      const newOtpExpiry = Date.now() + 3 * 60 * 1000; // 3 minutes
      
      // Update temp data
      tempUser.otp = newOtp;
      tempUser.otpExpiry = newOtpExpiry;
      tempUserStorage.set(email, tempUser);
      
      // Send new OTP
      await sendOTPEmail(email, newOtp);
      
      console.log('Resent OTP:', newOtp); // For testing
      
      res.status(200).json({
        success: true,
        message: 'New OTP sent to your email',
        email: email,
        expiresIn: 3 // minutes
      });
      
    } catch (error) {
      console.error('Resend OTP error:', error);
      next(error);
    }
  },

  // UPDATED: handleSignIn with soft delete check
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
      
      // Check if account is deleted
      if (user.deleted) {
        return res.status(401).json({ 
          success: false,
          error: 'This account has been deactivated'
        });
      }
      
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
  },

  // NEW: Soft delete account method
  softDeleteAccount: async (req, res) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const userId = req.userId;
      const { password } = req.body;
      
      // Verify password if provided
      if (password) {
        const userResult = await client.query(
          'SELECT password_hash FROM users WHERE id = $1 AND deleted = false',
          [userId]
        );
        
        if (userResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }
        
        const isMatch = await bcrypt.compare(password, userResult.rows[0].password_hash);
        if (!isMatch) {
          await client.query('ROLLBACK');
          return res.status(401).json({
            success: false,
            error: 'Incorrect password'
          });
        }
      }
      
      // Mark account as deleted instead of actually deleting
      const newEmail = `deleted_${Date.now()}_${userId}@example.com`;
      await client.query(
        'UPDATE users SET deleted = true, email = $1, deleted_at = $2 WHERE id = $3',
        [newEmail, new Date(), userId]
      );
      
      await client.query('COMMIT');
      
      res.status(200).json({
        success: true,
        message: 'Account deactivated successfully'
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Soft delete account error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to deactivate account'
      });
    } finally {
      client.release();
    }
  }
};

module.exports = authController;