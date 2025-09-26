const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const feedbackValidator = require('../validators/feedbackValidator');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

// Patient routes
router.post('/submit', 
  authenticateToken, 
  feedbackValidator.submitFeedback, 
  feedbackController.submitFeedback
);

// Public routes
router.get('/doctor/:doctorId', feedbackController.getDoctorFeedback);
router.get('/doctor/:doctorId/summary', feedbackController.getDoctorRatingSummary);

// Admin routes
router.get('/admin/all', 
  authenticateToken, 
  requireRole('admin'), 
  feedbackController.getAllFeedback
);

router.patch('/admin/:feedbackId/status', 
  authenticateToken, 
  requireRole('admin'), 
  feedbackValidator.updateFeedbackStatus,
  feedbackController.updateFeedbackStatus
);

module.exports = router;