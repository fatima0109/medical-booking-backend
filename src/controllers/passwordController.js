// src/controllers/passwordController.js
const { validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/db');
const { getUserByEmail } = require('../db/queries');
const { sendPasswordResetEmail, sendPasswordChangeNotification } = require('../utils/emailSender'); // ADDED

// Generate a simple reset token (for database storage)
const generateResetToken = () => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

// Forgot Password Route
const forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array(),
        message: 'Validation failed'
      });
    }

    const { email } = req.body;

    // Check if user exists
    const userResult = await getUserByEmail(email);
    
    // For security, always return success even if email doesn't exist
    if (!userResult.rows.length) {
      return res.status(200).json({
        success: true,
        message: 'If this email exists, a reset link has been sent'
      });
    }

    const user = userResult.rows[0];

    // Generate reset token (expires in 15 minutes)
    const resetToken = generateResetToken();
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store reset token in database
    await pool.query(
      `UPDATE users 
       SET reset_token = $1, reset_token_expiry = $2
       WHERE id = $3`,
      [resetToken, resetTokenExpiry, user.id]
    );

    try {
      // Try to send password reset email
      await sendPasswordResetEmail(email, resetToken);
      
      return res.status(200).json({
        success: true,
        message: 'Password reset link sent to email',
        redirectTo: '/sign-in'
      });
    } catch (emailError) {
      console.error('Email sending failed, but reset token was generated:', emailError.message);
      
      // Still return success but provide the token for development
      return res.status(200).json({
        success: true,
        message: 'Password reset initiated. Check your console for the reset link.',
        developmentNote: process.env.NODE_ENV === 'development' ? 
          `Email service unavailable. Use this reset token: ${resetToken}` : 
          'Please try again later or contact support'
      });
    }

  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Reset Password with Token
const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array(),
        message: 'Validation failed'
      });
    }

    const { token, newPassword } = req.body;

    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    }

    // Check if token exists in database and hasn't expired
    const userCheck = await pool.query(
      `SELECT id, email, name, reset_token_expiry 
       FROM users 
       WHERE reset_token = $1 AND reset_token_expiry > NOW()`,
      [token]
    );

    if (userCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    const user = userCheck.rows[0];

    // Update password and clear reset token
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      `UPDATE users 
       SET password_hash = $1, 
           updated_at = NOW(),
           reset_token = NULL,
           reset_token_expiry = NULL
       WHERE id = $2 
       RETURNING id, email, name`,
      [hashedPassword, user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const updatedUser = result.rows[0];
    
    // Send password change notification email
    try {
      await sendPasswordChangeNotification(updatedUser.email, updatedUser.name);
      console.log('Password change notification sent to:', updatedUser.email);
    } catch (emailError) {
      console.error('Failed to send password change notification:', emailError.message);
      // Don't fail the request if email fails, just log it
    }

    res.status(200).json({ 
      success: true,
      message: 'Password updated successfully',
      redirectTo: '/sign-in'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({
        success: false,
        error: 'Reset link has expired. Please request a new one.'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Verify Reset Token (for frontend to check token validity)
const verifyResetToken = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      });
    }

    const userCheck = await pool.query(
      `SELECT id, email, reset_token_expiry 
       FROM users 
       WHERE reset_token = $1 AND reset_token_expiry > NOW()`,
      [token]
    );

    if (userCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: 'Invalid or expired reset token'
      });
    }

    res.status(200).json({
      success: true,
      valid: true,
      message: 'Token is valid'
    });

  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

const testEmailConfig = async (req, res) => {
  try {
    const { testEmailConnection } = require('../utils/emailSender');
    const result = await testEmailConnection();
    
    res.status(200).json({
      success: result,
      message: result ? 'Email configuration is working' : 'Email configuration failed'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  forgotPassword,
  resetPassword,
  verifyResetToken,
  testEmailConfig
};