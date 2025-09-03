const { param, query, validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errors/AppError');

// Validate appointment ID parameter
const validateAppointmentId = [
  param('appointmentId')
    .isInt({ min: 1 })
    .withMessage('Valid appointment ID is required')
    .toInt(),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Queue validation failed', errors.array());
    }
    next();
  }
];

// Validate doctor ID parameter
const validateDoctorId = [
  param('doctorId')
    .isInt({ min: 1 })
    .withMessage('Valid doctor ID is required')
    .toInt(),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Queue validation failed', errors.array());
    }
    next();
  }
];

// Validate queue action query parameters
const validateQueueAction = [
  query('action')
    .optional()
    .isIn(['next', 'skip', 'priority'])
    .withMessage('Action must be one of: next, skip, priority'),
  
  query('reason')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Reason cannot exceed 255 characters'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Queue validation failed', errors.array());
    }
    next();
  }
];

// Validate wait time estimation parameters
const validateWaitTimeQuery = [
  query('includeCompleted')
    .optional()
    .isBoolean()
    .withMessage('includeCompleted must be boolean')
    .toBoolean(),
  
  query('maxWaitTime')
    .optional()
    .isInt({ min: 1, max: 480 })
    .withMessage('Max wait time must be between 1-480 minutes')
    .toInt(),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Queue validation failed', errors.array());
    }
    next();
  }
];

module.exports = {
  validateAppointmentId,
  validateDoctorId,
  validateQueueAction,
  validateWaitTimeQuery
};