const express = require('express');
const router = express.Router();
const { validateCreateAppointment, validateAppointmentId } = require('../validators/appointmentValidator');
const { authenticateToken } = require('../middleware/auth');
const appointmentController = require('../controllers/appointmentController');

// Use controller methods
router.post('/book', authenticateToken, validateCreateAppointment, appointmentController.bookAppointment);
router.get('/my-appointments', authenticateToken, appointmentController.getUserAppointments);
router.patch('/:appointmentId/cancel', authenticateToken, validateAppointmentId, appointmentController.cancelAppointment);
router.patch('/:appointmentId/reschedule', authenticateToken, validateAppointmentId, appointmentController.rescheduleAppointment);
router.patch('/:appointmentId/start', authenticateToken, validateAppointmentId, appointmentController.startAppointment);
router.patch('/:appointmentId/complete', authenticateToken, validateAppointmentId, appointmentController.completeAppointment);
router.get('/doctor/my-appointments', authenticateToken, appointmentController.getDoctorAppointments);
router.get('/:appointmentId', authenticateToken, validateAppointmentId, appointmentController.getAppointmentById);
router.get('/:appointmentId/meeting', authenticateToken, validateAppointmentId, appointmentController.getAppointmentMeeting);

module.exports = router;