const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const queueController = require('../controllers/queueController');
const {
  validateAppointmentId,
  validateDoctorId,
  validateQueueAction,
  validateWaitTimeQuery
} = require('../validators/queueValidator');

// Check-in to virtual waiting room
router.post('/:appointmentId/check-in', 
  authenticateToken, 
  validateAppointmentId, 
  queueController.checkIn
);

// Get current queue status (for doctors)
router.get('/doctor/:doctorId/status', 
  authenticateToken, 
  validateDoctorId,
  validateQueueAction,
  queueController.getQueueStatus
);

// Call next patient (doctor only)
router.post('/doctor/:doctorId/call-next', 
  authenticateToken, 
  validateDoctorId,
  validateQueueAction,
  queueController.callNextPatient
);

// Get patient's queue status
router.get('/patient/status', 
  authenticateToken,
  validateWaitTimeQuery,
  queueController.getPatientStatus
);

// Complete consultation
router.patch('/:appointmentId/complete', 
  authenticateToken, 
  validateAppointmentId,
  queueController.completeConsultation
);

// Remove from queue
router.delete('/:appointmentId/remove', 
  authenticateToken, 
  validateAppointmentId,
  queueController.removeFromQueue
);

module.exports = router;