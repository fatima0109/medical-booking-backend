const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const otpController = require('../controllers/otpController');
const passwordController = require('../controllers/passwordController');

// Use your preferred endpoints:
router.post('/sign-up', authController.signUp); // Changed from /register
router.post('/sign-in', authController.handleSignIn); // Changed from /login

// Other routes
router.post('/logout', authController.logout);
router.post('/verify-otp', otpController.verifyOTP);
router.post('/resend-otp', otpController.resendOTP);
router.post('/forgot-password', passwordController.forgotPassword);
router.post('/reset-password', passwordController.resetPassword);

// Debug routes
router.get('/debug/otp-storage', otpController.debugOTPStorage);
router.delete('/debug/clear-otps', otpController.clearOTPs);
router.post('/debug/set-test-otp', otpController.setTestOTP);

module.exports = router;