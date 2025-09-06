const { body } = require('express-validator');

const feedbackValidator = {
  submitFeedback: [
    body('appointment_id')
      .isInt({ min: 1 })
      .withMessage('Valid appointment ID is required'),
    
    body('rating')
      .isInt({ min: 1, max: 5 })
      .withMessage('Rating must be between 1 and 5'),
    
    body('comment')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Comment must be less than 1000 characters'),
    
    body('category_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Valid category ID is required'),
    
    body('is_anonymous')
      .optional()
      .isBoolean()
      .withMessage('is_anonymous must be a boolean')
  ],

  updateFeedbackStatus: [
    body('status')
      .isIn(['pending', 'approved', 'rejected'])
      .withMessage('Status must be one of: pending, approved, rejected')
  ]
};

module.exports = feedbackValidator;