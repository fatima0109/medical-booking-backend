const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const otpController = require('../controllers/otpController');
const passwordController = require('../controllers/passwordController');
const auth = require('../middleware/auth');
const { authenticateToken } = require('../middleware/auth'); 

// Routes:
// Use otpController for OTP-related routes
router.post('/sign-up', otpController.signUp); // Changed from authController to otpController
router.post('/verify-otp', otpController.verifyOTP); // Changed from authController to otpController
router.post('/resend-otp', otpController.resendOTP); // Changed from authController to otpController

// Use authController for authentication routes
router.post('/sign-in', authController.handleSignIn);
router.post('/logout', authController.logout);
router.delete('/delete-account', authenticateToken, authController.softDeleteAccount);

// Use passwordController for password-related routes
router.post('/forgot-password', passwordController.forgotPassword);
router.post('/reset-password', passwordController.resetPassword);

// Debug routes - these should use otpController
router.get('/debug/otp-storage', otpController.debugTempStorage); // Fixed function name
router.delete('/debug/clear-otps', otpController.clearTempStorage); // Fixed function name
router.post('/debug/set-test-otp', otpController.setTestData); // Fixed function name

module.exports = router;
export default router;