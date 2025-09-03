const express = require('express');
const router = express.Router();
const { validateCreateAppointment, validateAppointmentId } = require('../validators/appointmentValidator');
const { authenticateToken } = require('../middleware/auth');
const appointmentController = require('../controllers/appointmentController');

// Use controller methods
router.post('/book', authenticateToken, validateCreateAppointment, appointmentController.bookAppointment);
router.get('/my-appointments', authenticateToken, appointmentController.getUserAppointments);
router.patch('/:appointmentId/cancel', authenticateToken, validateAppointmentId, appointmentController.cancelAppointment);
router.get('/:id', authenticateToken, validateAppointmentId, appointmentController.getAppointmentById);

module.exports = router;