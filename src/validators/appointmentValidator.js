const { body, param, validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errors/AppError');

// Create appointment validation
const validateCreateAppointment = [
  body('doctorId')
    .isInt({ min: 1 })
    .withMessage('Valid doctor ID is required'),
  
  body('appointmentDate')
    .isISO8601()
    .withMessage('Valid appointment date is required')
    .custom((value) => {
      const appointmentDate = new Date(value);
      const now = new Date();
      if (appointmentDate <= now) {
        throw new Error('Appointment date must be in the future');
      }
      return true;
    }),
  
  body('reason')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Reason must be between 10 and 500 characters'),
  
  body('symptoms')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Symptoms cannot exceed 1000 characters'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    next();
  }
];

// Appointment ID validation
const validateAppointmentId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid appointment ID is required'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    next();
  }
];

module.exports = {
  validateCreateAppointment,
  validateAppointmentId
};