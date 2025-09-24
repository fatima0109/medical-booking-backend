const { body, param, validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errors/AppError');

// Create appointment validation aligned with controller expectations
// Controller expects: doctorId, date, timeSlot { start, end }, consultationType, notes
const validateCreateAppointment = [
  body('doctorId')
    .isInt({ min: 1 })
    .withMessage('Valid doctor ID is required'),

  body('date')
    .isISO8601()
    .withMessage('Valid appointment date is required')
    .custom((value) => {
      const appointmentDate = new Date(value);
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (appointmentDate < startOfToday) {
        throw new Error('Appointment date must be today or in the future');
      }
      return true;
    }),

  body('timeSlot')
    .custom((value) => {
      if (!value || typeof value !== 'object') {
        throw new Error('timeSlot is required');
      }
      const { start, end } = value;
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
      if (!timeRegex.test(start) || !timeRegex.test(end)) {
        throw new Error('timeSlot.start and timeSlot.end must be HH:MM or HH:MM:SS');
      }
      return true;
    }),

  body('consultationType')
    .optional()
    .isIn(['video', 'voice', 'chat'])
    .withMessage('Invalid consultationType'),

  body('notes')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }
    next();
  }
];

// Appointment ID validation for routes using :appointmentId
const validateAppointmentId = [
  param('appointmentId')
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