const { validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { sendOTPEmail } = require('../utils/emailSender');
const { generateOTP } = require('../utils/otpGenerator');

// Temporary storage for OTPs
const otpStorage = new Map();

// NEW: Proper Sign-Up function that creates user first
const signUp = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password, name, contact_number, phone } = req.body;
    
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      });
    }

    // Generate OTP with 3-minute expiry
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // CREATE NEW USER in database with OTP
    const newUser = await pool.query(
      `INSERT INTO users (email, password_hash, name, contact_number, phone, otp, otp_expiry, verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, name, contact_number, phone`,
      [email, hashedPassword, name, contact_number, phone, otp, otpExpiry, false]
    );

    // Store in memory as backup
    otpStorage.set(email, {
      otp: otp,
      expiresAt: Date.now() + 180000, // 3 minutes
      userData: { email, password: hashedPassword, name, contact_number, phone }
    });

    // Send OTP via email (or log to console)
    await sendOTPEmail(email, otp);

    // DEBUG LOG
    console.log('=== NEW USER SIGN UP ===');
    console.log('Email:', email);
    console.log('OTP:', otp);
    console.log('Expires at:', otpExpiry.toISOString());
    console.log('=====================');

    return res.json({
      success: true,
      message: 'OTP sent to your email. Please verify to complete registration.',
      email: email,
      expiresIn: 3 // 3 minutes
    });
  } catch (error) {
    console.error('Sign up error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create user'
    });
  }
};

// OTP Verification Endpoint (3-minute validity)
const verifyOTP = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array(),
      message: 'Validation failed'
    });
  }

  try {
    const { email, otp } = req.body;
    
    console.log('=== OTP VERIFICATION DEBUG ===');
    console.log('Request received at:', new Date().toISOString());
    console.log('Email:', email);
    console.log('Input OTP:', otp);
    
    // Check user in DATABASE first
    const userResult = await pool.query(
      'SELECT id, otp, otp_expiry, name, contact_number, phone FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      console.log('No user found in database for email:', email);
      return res.status(400).json({
        success: false,
        error: 'No user found with this email'
      });
    }

    const user = userResult.rows[0];
    const now = new Date();
    
    console.log('Database OTP data:', {
      storedOTP: user.otp,
      otpExpiry: user.otp_expiry,
      currentTime: now.toISOString(),
      isExpired: new Date(user.otp_expiry) < now,
      otpMatches: user.otp === otp
    });

    // Check if OTP has expired (3 minutes)
    if (new Date(user.otp_expiry) < now) {
      console.log('OTP expired in database');
      return res.status(400).json({
        success: false,
        error: 'OTP expired. Please request a new one.'
      });
    }

    // Check if OTP matches
    if (user.otp !== otp) {
      console.log('OTP mismatch in database');
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP'
      });
    }

    console.log('OTP verified successfully');

    // Mark user as verified and clear OTP
    await pool.query(
      `UPDATE users 
       SET verified = true, otp = NULL, otp_expiry = NULL
       WHERE email = $1`,
      [email]
    );

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Clean up memory storage
    otpStorage.delete(email);

    return res.status(200).json({
      success: true,
      token: token,
      user: {
        id: user.id,
        email: email,
        name: user.name,
        contact_number: user.contact_number,
        phone: user.phone,
        verified: true
      },
      message: 'Account verified successfully',
      redirectTo: '/dashboard'
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Verification failed'
    });
  }
};

// Resend OTP Route (for existing users)
const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if user exists in database
    const userResult = await pool.query(
      'SELECT id, otp_resend_attempts, last_otp_resend FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No user found with this email'
      });
    }

    const user = userResult.rows[0];
    const now = new Date();
    const MAX_RESEND_ATTEMPTS = 3;
    const RESEND_COOLDOWN = 60 * 60 * 1000; // 1 hour in milliseconds

    // Check if user has exceeded resend attempts
    if (user.otp_resend_attempts >= MAX_RESEND_ATTEMPTS) {
      // Check if cooldown period has passed (1 hour)
      if (user.last_otp_resend && 
          (now - new Date(user.last_otp_resend)) < RESEND_COOLDOWN) {
        const timeLeft = Math.ceil((RESEND_COOLDOWN - (now - new Date(user.last_otp_resend))) / 1000 / 60);
        return res.status(429).json({
          success: false,
          error: `Maximum OTP resend attempts exceeded. Please try again after ${timeLeft} minutes.`,
          retryAfter: timeLeft
        });
      } else {
        // Reset attempts if cooldown has passed
        await pool.query(
          'UPDATE users SET otp_resend_attempts = 0 WHERE id = $1',
          [user.id]
        );
      }
    }

    // Generate new OTP with 3-minute expiry
    const newOtp = generateOTP();
    const otpExpiry = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes

    // Update user with new OTP and increment resend attempts
    await pool.query(
      `UPDATE users 
       SET otp = $1, otp_expiry = $2, 
           otp_resend_attempts = otp_resend_attempts + 1,
           last_otp_resend = $3
       WHERE email = $4`,
      [newOtp, otpExpiry, now, email]
    );

    // ADDED: Console log for resend OTP
    console.log('=== RESEND OTP ===');
    console.log('Email:', email);
    console.log('New OTP:', newOtp);
    console.log('Expires at:', otpExpiry.toISOString());
    console.log('Resend attempts:', user.otp_resend_attempts + 1);
    console.log('==================');

    // Update in-memory storage as well
    const storedData = otpStorage.get(email);
    if (storedData) {
      otpStorage.set(email, {
        ...storedData,
        otp: newOtp,
        expiresAt: Date.now() + 180000 // 3 min
      });
    }

    // Send OTP via email
    await sendOTPEmail(email, newOtp);

    const attemptsLeft = MAX_RESEND_ATTEMPTS - (user.otp_resend_attempts + 1);

    return res.json({
      success: true,
      message: 'New verification code sent',
      attemptsLeft: attemptsLeft,
      expiresIn: 3 // 3 minutes
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to resend OTP'
    });
  }
};

// Debug endpoint to check OTP storage
const debugOTPStorage = (req, res) => {
  const storageData = {};
  otpStorage.forEach((value, key) => {
    storageData[key] = {
      otp: value.otp,
      expiresAt: new Date(value.expiresAt).toISOString(),
      timeRemaining: `${Math.round((value.expiresAt - Date.now()) / 1000)} seconds`,
      hasUserData: !!value.userData
    };
  });
  
  res.json({
    totalEntries: otpStorage.size,
    storageData: storageData
  });
};

// Clear all OTPs (for testing)
const clearOTPs = (req, res) => {
  const previousSize = otpStorage.size;
  otpStorage.clear();
  res.json({
    success: true,
    message: `Cleared ${previousSize} OTP entries`,
    currentSize: otpStorage.size
  });
};

// Manually set a test OTP
const setTestOTP = (req, res) => {
  const { email, otp = '123456' } = req.body;
  
  otpStorage.set(email, {
    otp: otp,
    expiresAt: Date.now() + 180000, // 3 minutes
    userData: { 
      email: email,
      password: 'testpassword',
      name: 'Test User',
      contactNumber: '+1234567890'
    }
  });
  
  res.json({
    success: true,
    message: `Test OTP set for ${email}`,
    data: otpStorage.get(email)
  });
};

module.exports = {
  signUp,
  verifyOTP,
  resendOTP,
  debugOTPStorage,
  clearOTPs,
  setTestOTP,
  otpStorage
};