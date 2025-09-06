const { validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { sendOTPEmail } = require('../utils/emailSender');
const { generateOTP } = require('../utils/otpGenerator');
const { 
  saveTempUserData, 
  getTempUserData, 
  deleteTempUserData,
  tempUserStorage  // Import this if you need it for debugging
} = require('../utils/tempStorage');

// // Temporary storage for registration data (use Redis in production)
// const tempUserStorage = new Map();

// // Helper functions for temporary storage
// const saveTempUserData = (email, data) => {
//   tempUserStorage.set(email, data);
//   // Set expiration (3 minutes)
//   setTimeout(() => {
//     if (tempUserStorage.has(email)) {
//       tempUserStorage.delete(email);
//       console.log(`Temp data for ${email} expired`);
//     }
//   }, 3 * 60 * 1000);
// };

// const getTempUserData = (email) => {
//   return tempUserStorage.get(email);
// };

// const deleteTempUserData = (email) => {
//   tempUserStorage.delete(email);
// };

// NEW: Sign-Up function that stores data temporarily
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
    
    // Check if user already exists in DATABASE
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

    // Check if there's already a pending registration
    const existingTempData = await getTempUserData(email);
    if (existingTempData) {
      return res.status(400).json({
        success: false,
        error: 'Registration already in progress. Please verify your OTP or wait for it to expire.'
      });
    }

    // Generate OTP with 3-minute expiry
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
    await saveTempUserData(email, tempUser);

    // Send OTP via email
    await sendOTPEmail(email, otp);

    // DEBUG LOG
    console.log('=== NEW USER SIGN UP (TEMP STORAGE) ===');
    console.log('Email:', email);
    console.log('OTP:', otp);
    console.log('Expires at:', new Date(otpExpiry).toISOString());
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
      error: 'Failed to process registration'
    });
  }
};

// MODIFIED: OTP Verification that creates user after verification
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
    
    // Retrieve temporary user data
    const tempUserData = await getTempUserData(email);
    
    if (!tempUserData) {
      console.log('No pending registration found for email:', email);
      return res.status(400).json({
        success: false,
        error: 'No pending registration found or OTP expired'
      });
    }
    
    console.log('Temp user data found:', {
      storedOTP: tempUserData.otp,
      otpExpiry: new Date(tempUserData.otpExpiry).toISOString(),
      currentTime: new Date().toISOString(),
      isExpired: Date.now() > tempUserData.otpExpiry,
      otpMatches: tempUserData.otp === otp
    });

    // Check if OTP is expired
    if (Date.now() > tempUserData.otpExpiry) {
      console.log('OTP expired');
      await deleteTempUserData(email);
      return res.status(400).json({
        success: false,
        error: 'OTP expired. Please request a new one.'
      });
    }
    
    // Verify OTP
    if (tempUserData.otp !== otp) {
      console.log('OTP mismatch');
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP'
      });
    }

    console.log('OTP verified successfully');

    // OTP verified - NOW create the actual user in database
    const newUser = await pool.query(
      `INSERT INTO users (email, password_hash, name, contact_number, phone, verified)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, contact_number, phone`,
      [tempUserData.email, tempUserData.password_hash, tempUserData.name, 
       tempUserData.contact_number, tempUserData.phone, true]
    );

    // Clean up temporary data
    deleteTempUserData(email);

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser.rows[0].id, email: newUser.rows[0].email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      token: token,
      user: {
        id: newUser.rows[0].id,
        email: newUser.rows[0].email,
        name: newUser.rows[0].name,
        contact_number: newUser.rows[0].contact_number,
        phone: newUser.rows[0].phone,
        verified: true
      },
      redirectTo: '/dashboard'
    });
    
  } catch (error) {
    console.error('OTP verification error:', error);
    
    // Handle unique constraint violation (in case user was created elsewhere)
    if (error.code === '23505') { // PostgreSQL unique violation
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Verification failed'
    });
  }
};

// MODIFIED: Resend OTP for pending registrations
const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if we have temp data for this email
    const tempUserData = await getTempUserData(email);
    if (!tempUserData) {
      return res.status(400).json({
        success: false,
        error: 'No pending registration found'
      });
    }

    // Generate new OTP
    const newOtp = generateOTP();
    const newOtpExpiry = Date.now() + 3 * 60 * 1000; // 3 minutes
    
    // Update temp data
    tempUserData.otp = newOtp;
    tempUserData.otpExpiry = newOtpExpiry;
    await saveTempUserData(email, tempUserData);
    
    // Send new OTP
    await sendOTPEmail(email, newOtp);
    
    console.log('=== RESEND OTP ===');
    console.log('Email:', email);
    console.log('New OTP:', newOtp);
    console.log('Expires at:', new Date(newOtpExpiry).toISOString());
    console.log('==================');

    return res.json({
      success: true,
      message: 'New verification code sent',
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

// Debug endpoint to check temporary storage
const debugTempStorage = (req, res) => {
  const storageData = {};
  tempUserStorage.forEach((value, key) => {
    storageData[key] = {
      email: value.email,
      name: value.name,
      otp: value.otp,
      expiresAt: new Date(value.otpExpiry).toISOString(),
      timeRemaining: `${Math.round((value.otpExpiry - Date.now()) / 1000)} seconds`
    };
  });
  
  res.json({
    totalEntries: tempUserStorage.size,
    storageData: storageData
  });
  
  if (process.env.NODE_ENV === 'production') {
    return res.json({
      message: 'Debug endpoint not available in production'
    });
  }

};

// Clear all temporary data (for testing)
const clearTempStorage = (req, res) => {
  const previousSize = tempUserStorage.size;
  tempUserStorage.clear();
  res.json({
    success: true,
    message: `Cleared ${previousSize} temporary entries`,
    currentSize: tempUserStorage.size
  });
};

// Manually set test data (for testing)
const setTestData = (req, res) => {
  const { email, otp = '123456', name = 'Test User' } = req.body;
  
  saveTempUserData(email, {
    email: email,
    password_hash: '$2b$10$examplehashedpassword',
    name: name,
    contact_number: '+1234567890',
    phone: '+1234567890',
    otp: otp,
    otpExpiry: Date.now() + 180000, // 3 minutes
    createdAt: new Date()
  });
  
  res.json({
    success: true,
    message: `Test data set for ${email}`,
    data: getTempUserData(email)
  });
};

module.exports = {
  signUp,
  verifyOTP,
  resendOTP,
  debugTempStorage,
  clearTempStorage,
  setTestData,
  // tempUserStorage
};