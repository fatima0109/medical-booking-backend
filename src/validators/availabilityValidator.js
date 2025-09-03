// /backend/src/validators/availabilityValidator.js
const { body, param, validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errors/AppError');

const validateDoctorId = [
  param('doctorId')
    .isInt({ min: 1 })
    .withMessage('Valid doctor ID is required'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    next();
  }
];

const validateAvailabilitySlot = [
  body('day')
    .isInt({ min: 0, max: 6 })
    .withMessage('Day must be between 0-6 (Sunday-Saturday)'),
  
  body('start_time')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Valid start time format required (HH:MM)'),
  
  body('end_time')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Valid end time format required (HH:MM)'),
  
  body('is_available')
    .optional()
    .isBoolean()
    .withMessage('is_available must be boolean'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    next();
  }
];

const validateDateQuery = [
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Valid date format required (YYYY-MM-DD)'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    next();
  }
];

module.exports = {
  validateDoctorId,
  validateAvailabilitySlot,
  validateDateQuery
};