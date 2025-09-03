const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth'); 
const { getUserById } = require('../db/queries');
const pool = require('../db/db');
const { validateUpdateProfile, validateUserId } = require('../validators/userValidator');

// Import user controller if you have one
// const userController = require('../controllers/userController');

// Get current user's profile (protected)
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await getUserById(req.user.id);
    
    if (!user || user.rows.length === 0) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }
    
    // Don't return sensitive data
    const userData = user.rows[0];
    const { password_hash, reset_token, ...safeUserData } = userData;
    
    res.json({ 
      success: true,
      data: safeUserData 
    });
  } catch (error) {
    next(error);
  }
});

// Update user profile (protected) - WITH VALIDATION
router.patch('/me', authenticateToken, validateUpdateProfile, async (req, res, next) => {
  try {
    const { name, phone, dateOfBirth } = req.body;
    
    // Update user in database
    const result = await pool.query(
      `UPDATE users 
       SET name = COALESCE($1, name), 
           phone = COALESCE($2, phone),
           date_of_birth = COALESCE($3, date_of_birth),
           updated_at = NOW()
       WHERE id = $4 
       RETURNING id, name, email, phone, date_of_birth, created_at, updated_at`,
      [name, phone, dateOfBirth, req.user.id]
    );
    
    if (result.rows.length === 0) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }
    
    res.json({ 
      success: true,
      data: result.rows[0],
      message: 'Profile updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Get user by ID - WITH VALIDATION
router.get('/:userId', authenticateToken, validateUserId, async (req, res, next) => {
  try {
    const user = await getUserById(req.params.userId);
    
    if (!user || user.rows.length === 0) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }
    
    // Don't return sensitive data
    const userData = user.rows[0];
    const { password_hash, reset_token, ...safeUserData } = userData;
    
    res.json({ 
      success: true,
      data: safeUserData
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;