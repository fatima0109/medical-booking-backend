const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const { forgotPassword, resetPassword, verifyResetToken } = require('../controllers/passwordController');

// Forgot password route
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required')
], forgotPassword);

// Token-based reset route
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], resetPassword);

// Verify reset token route
router.get('/verify-token', verifyResetToken);

module.exports = router;