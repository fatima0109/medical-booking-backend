const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const availabilityController = require('../controllers/availabilityController');
const { validateDoctorId, validateAvailabilitySlot, validateDateQuery } = require('../validators/availabilityValidator');

// Get doctor availability
router.get('/:doctorId', validateDoctorId, availabilityController.getDoctorAvailability);

// Get available slots
router.get('/:doctorId/slots', validateDoctorId, validateDateQuery, availabilityController.getAvailableSlots);

// Update availability (bulk)
router.put('/:doctorId', authenticateToken, validateDoctorId, availabilityController.updateAvailability);

// Update specific slot
router.put('/slot/:availabilityId', authenticateToken, availabilityController.updateAvailabilitySlot);

// Add new slot
router.post('/', authenticateToken, availabilityController.addAvailabilitySlot);

// Delete slot
router.delete('/:availabilityId', authenticateToken, availabilityController.deleteAvailabilitySlot);

module.exports = router;