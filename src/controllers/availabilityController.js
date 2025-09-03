const pool = require('../db/db');

const availabilityController = {
  // Get doctor availability
  getDoctorAvailability: async (req, res, next) => {
    try {
      const { doctorId } = req.params;
      const { date } = req.query;

      let query = `
        SELECT * FROM doctor_availability 
        WHERE doctor_id = $1 AND is_available = true
      `;
      const params = [doctorId];

      if (date) {
        const dayOfWeek = new Date(date).getDay();
        query += ' AND day_of_week = $2';
        params.push(dayOfWeek);
      }

      query += ' ORDER BY day_of_week, start_time';

      const result = await pool.query(query, params);
      
      res.json({
        success: true,
        availability: result.rows
      });
    } catch (error) {
      next(error);
    }
  },

  // Get available slots
  getAvailableSlots: async (req, res, next) => {
    try {
      const { doctorId } = req.params;
      const { date } = req.query;
      
      if (!date) {
        return res.status(400).json({ 
          success: false,
          error: 'Date parameter is required' 
        });
      }
      
      const dayOfWeek = new Date(date).getDay();
      
      const availabilityResult = await pool.query(
        `SELECT * FROM doctor_availability 
         WHERE doctor_id = $1 AND day_of_week = $2 AND is_available = true`,
        [doctorId, dayOfWeek]
      );
      
      if (availabilityResult.rows.length === 0) {
        return res.json({
          success: true,
          slots: [],
          message: 'No availability for this day'
        });
      }
      
      const availability = availabilityResult.rows[0];
      
      const appointmentsResult = await pool.query(
        `SELECT start_time FROM appointments 
         WHERE doctor_id = $1 AND appointment_date = $2 AND status != 'cancelled'`,
        [doctorId, date]
      );
      
      const bookedSlots = appointmentsResult.rows.map(row => row.start_time);
      
      const availableSlots = generateTimeSlots(
        availability.start_time, 
        availability.end_time, 
        bookedSlots
      );
      
      res.json({
        success: true,
        slots: availableSlots,
        date: date,
        doctor_id: doctorId
      });
    } catch (error) {
      next(error);
    }
  },

  // Update availability (bulk)
  updateAvailability: async (req, res, next) => {
    try {
      const { doctorId } = req.params;
      const { availability } = req.body;

      if (req.user.id !== parseInt(doctorId) && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'You can only update your own availability'
        });
      }

      await pool.query('BEGIN');
      await pool.query('DELETE FROM doctor_availability WHERE doctor_id = $1', [doctorId]);

      for (const slot of availability) {
        await pool.query(
          `INSERT INTO doctor_availability 
           (doctor_id, day_of_week, start_time, end_time, is_available)
           VALUES ($1, $2, $3, $4, $5)`,
          [doctorId, slot.day, slot.start_time, slot.end_time, slot.is_available !== false]
        );
      }

      await pool.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Availability updated successfully'
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      next(error);
    }
  },

  // Update specific slot
  updateAvailabilitySlot: async (req, res, next) => {
    try {
      const { availabilityId } = req.params;
      const { is_available, start_time, end_time } = req.body;
      
      if (req.user.role !== 'doctor' && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Only doctors can update availability'
        });
      }
      
      const availabilityCheck = await pool.query(
        'SELECT doctor_id FROM doctor_availability WHERE id = $1',
        [availabilityId]
      );
      
      if (availabilityCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Availability not found'
        });
      }
      
      if (req.user.id !== availabilityCheck.rows[0].doctor_id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'You can only update your own availability'
        });
      }
      
      const result = await pool.query(
        `UPDATE doctor_availability 
         SET is_available = $1, start_time = $2, end_time = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 RETURNING *`,
        [is_available, start_time, end_time, availabilityId]
      );
      
      res.json({
        success: true,
        availability: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  },

  // Add new slot
  addAvailabilitySlot: async (req, res, next) => {
    try {
      const { doctor_id, day_of_week, start_time, end_time, is_available = true } = req.body;
      
      if (req.user.role !== 'doctor' && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Only doctors can add availability'
        });
      }
      
      if (req.user.id !== parseInt(doctor_id) && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'You can only add availability for your own account'
        });
      }
      
      const result = await pool.query(
        `INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, is_available)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [doctor_id, day_of_week, start_time, end_time, is_available]
      );
      
      res.status(201).json({
        success: true,
        availability: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete slot
  deleteAvailabilitySlot: async (req, res, next) => {
    try {
      const { availabilityId } = req.params;
      
      if (req.user.role !== 'doctor' && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Only doctors can delete availability'
        });
      }
      
      const availabilityCheck = await pool.query(
        'SELECT doctor_id FROM doctor_availability WHERE id = $1',
        [availabilityId]
      );
      
      if (availabilityCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Availability not found'
        });
      }
      
      if (req.user.id !== availabilityCheck.rows[0].doctor_id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'You can only delete your own availability'
        });
      }
      
      const result = await pool.query(
        'DELETE FROM doctor_availability WHERE id = $1 RETURNING *',
        [availabilityId]
      );
      
      res.json({
        success: true,
        message: 'Availability deleted successfully',
        deleted: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
};

// Helper function
function generateTimeSlots(startTime, endTime, bookedSlots, slotDuration = 30) {
  const slots = [];
  const start = new Date(`2000-01-01T${startTime}`);
  const end = new Date(`2000-01-01T${endTime}`);
  
  let current = new Date(start);
  
  while (current < end) {
    const endSlot = new Date(current.getTime() + slotDuration * 60000);
    
    if (endSlot <= end) {
      const timeString = current.toTimeString().slice(0, 8);
      
      if (!bookedSlots.includes(timeString)) {
        slots.push(timeString);
      }
    }
    
    current.setTime(current.getTime() + slotDuration * 60000);
  }
  
  return slots;
}

module.exports = availabilityController;