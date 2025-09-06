const pool = require('../db/db');
const { sendNotification } = require('../services/notificationService'); // You might need to create this

const appointmentController = {
  // Book appointment
  bookAppointment: async (req, res, next) => {
    try {
      const { doctorId, date, timeSlot, consultationType = 'video', notes } = req.body;
      const patientId = req.user.id;
      
      // Use your existing availability check logic
      const availabilityCheck = await pool.query(
        `SELECT da.* FROM doctor_availability da
         WHERE da.doctor_id = $1 
         AND da.day_of_week = $2
         AND da.start_time <= $3 
         AND da.end_time >= $4 
         AND da.is_available = true`,
        [doctorId, new Date(date).getDay(), timeSlot.start, timeSlot.end]
      );
      
      if (availabilityCheck.rows.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: 'Doctor not available at this time' 
        });
      }
      
      // Check for conflicting appointments
      const conflictCheck = await pool.query(
        `SELECT id FROM appointments 
         WHERE doctor_id = $1 
         AND appointment_date = $2 
         AND (
           (start_time <= $3 AND end_time > $3) OR
           (start_time < $4 AND end_time >= $4) OR
           (start_time >= $3 AND end_time <= $4)
         ) 
         AND status != 'cancelled'`,
        [doctorId, date, timeSlot.start, timeSlot.end]
      );
      
      if (conflictCheck.rows.length > 0) {
        return res.status(400).json({ 
          success: false,
          error: 'Time slot already booked' 
        });
      }
      
      const appointment = await pool.query(
        `INSERT INTO appointments 
          (patient_id, doctor_id, appointment_date, start_time, end_time, consultation_type, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled') 
         RETURNING *`,
        [patientId, doctorId, date, timeSlot.start, timeSlot.end, consultationType, notes]
      );
      
      res.json({ 
        success: true, 
        appointment: appointment.rows[0] 
      });
    } catch (error) {
      next(error);
    }
  },

  // Get user appointments
  getUserAppointments: async (req, res, next) => {
    try {
      const { status, page = 1, limit = 10 } = req.query;
      const patientId = req.user.id;

      // Calculate offset for pagination
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT a.*, 
               d.first_name as doctor_first_name, 
               d.last_name as doctor_last_name,
               d.specialization as doctor_specialization,
               d.email as doctor_email,
               d.phone as doctor_phone
        FROM appointments a
        JOIN users d ON a.doctor_id = d.id
        WHERE a.patient_id = $1
      `;
      
      const queryParams = [patientId];
      let paramCount = 1;
      
      if (status) {
        paramCount++;
        query += ` AND a.status = $${paramCount}`;
        queryParams.push(status);
      }
      
      // Count total records for pagination
      const countQuery = query.replace(
        'SELECT a.*, d.first_name as doctor_first_name, d.last_name as doctor_last_name, d.specialization as doctor_specialization, d.email as doctor_email, d.phone as doctor_phone',
        'SELECT COUNT(*)'
      );
      
      const countResult = await pool.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);
      
      // Add ordering and pagination
      query += ` ORDER BY a.appointment_date DESC, a.start_time DESC 
                 LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      
      queryParams.push(limit, offset);
      
      const result = await pool.query(query, queryParams);
      
      res.json({
        success: true,
        appointments: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Cancel appointment
  cancelAppointment: async (req, res, next) => {
    try {
      const { appointmentId } = req.params;
      const patientId = req.user.id;

      // First check if appointment exists and belongs to the patient
      const appointmentCheck = await pool.query(
        'SELECT * FROM appointments WHERE id = $1 AND patient_id = $2',
        [appointmentId, patientId]
      );
      
      if (appointmentCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Appointment not found or you do not have permission to cancel it'
        });
      }
      
      const appointment = appointmentCheck.rows[0];
      
      // Check if appointment can be cancelled (e.g., not too close to appointment time)
      const appointmentDateTime = new Date(`${appointment.appointment_date}T${appointment.start_time}`);
      const now = new Date();
      const hoursDifference = (appointmentDateTime - now) / (1000 * 60 * 60);
      
      if (hoursDifference < 24) {
        return res.status(400).json({
          success: false,
          error: 'Appointments can only be cancelled at least 24 hours in advance'
        });
      }
      
      // Update appointment status to cancelled
      const result = await pool.query(
        'UPDATE appointments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        ['cancelled', appointmentId]
      );
      
      res.json({
        success: true,
        message: 'Appointment cancelled successfully',
        appointment: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  },

  // Get appointment by ID
  getAppointmentById: async (req, res, next) => {
    try {
      const { appointmentId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;

      let query = `
        SELECT a.*, 
               d.first_name as doctor_first_name, 
               d.last_name as doctor_last_name,
               d.specialization as doctor_specialization,
               d.email as doctor_email,
               d.phone as doctor_phone,
               p.first_name as patient_first_name,
               p.last_name as patient_last_name,
               p.email as patient_email,
               p.phone as patient_phone
        FROM appointments a
        JOIN users d ON a.doctor_id = d.id
        JOIN users p ON a.patient_id = p.id
        WHERE a.id = $1
      `;
      
      const queryParams = [appointmentId];
      
      // Restrict access based on role
      if (userRole === 'patient') {
        query += ' AND a.patient_id = $2';
        queryParams.push(userId);
      } else if (userRole === 'doctor') {
        query += ' AND a.doctor_id = $2';
        queryParams.push(userId);
      }
      // Admin can see all appointments
      
      const result = await pool.query(query, queryParams);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Appointment not found'
        });
      }
      
      res.json({
        success: true,
        appointment: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  },

  // NEW: Complete appointment (for doctors/admin)
  completeAppointment: async (req, res, next) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { appointmentId } = req.params;
      const { diagnosis, prescription, notes } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;

      // Check if appointment exists and user has permission
      let query = 'SELECT * FROM appointments WHERE id = $1';
      const queryParams = [appointmentId];
      
      if (userRole === 'doctor') {
        query += ' AND doctor_id = $2';
        queryParams.push(userId);
      }
      
      const appointmentCheck = await client.query(query, queryParams);
      
      if (appointmentCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Appointment not found or you do not have permission to complete it'
        });
      }
      
      const appointment = appointmentCheck.rows[0];
      
      // Check if appointment is in a completable state
      if (appointment.status !== 'scheduled' && appointment.status !== 'in-progress') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Only scheduled or in-progress appointments can be completed'
        });
      }
      
      // Update appointment status to completed and add medical notes
      const result = await client.query(
        `UPDATE appointments 
         SET status = 'completed', 
             diagnosis = $1, 
             prescription = $2, 
             doctor_notes = $3,
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $4 
         RETURNING *`,
        [diagnosis, prescription, notes, appointmentId]
      );
      
      // Check if feedback already exists for this appointment
      const feedbackCheck = await client.query(
        'SELECT id FROM feedback WHERE appointment_id = $1',
        [appointmentId]
      );
      
      // If no feedback exists yet, create a placeholder for feedback eligibility
      if (feedbackCheck.rows.length === 0) {
        await client.query(
          `INSERT INTO feedback (appointment_id, patient_id, doctor_id, status)
           VALUES ($1, $2, $3, 'eligible')`,
          [appointmentId, appointment.patient_id, appointment.doctor_id]
        );
      }
      
      await client.query('COMMIT');
      
      // Send notification to patient about completed appointment and feedback request
      try {
        const patientInfo = await client.query(
          'SELECT email, first_name FROM users WHERE id = $1',
          [appointment.patient_id]
        );
        
        if (patientInfo.rows.length > 0) {
          const patient = patientInfo.rows[0];
          // You would implement your notification service here
          await sendNotification({
            to: patient.email,
            subject: 'Your Appointment Has Been Completed',
            message: `Dear ${patient.first_name}, your appointment with Dr. ${req.user.first_name} has been completed. Please provide your feedback to help us improve our services.`,
            type: 'appointment_completed'
          });
        }
      } catch (notificationError) {
        console.error('Failed to send notification:', notificationError);
        // Don't fail the whole request if notification fails
      }
      
      res.status(200).json({
        success: true,
        message: 'Appointment completed successfully. Patient can now submit feedback.',
        data: result.rows[0]
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Complete appointment error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to complete appointment'
      });
    } finally {
      client.release();
    }
  },

  // NEW: Start appointment (for doctors)
  startAppointment: async (req, res, next) => {
    try {
      const { appointmentId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;

      // Check if appointment exists and doctor has permission
      let query = 'SELECT * FROM appointments WHERE id = $1';
      const queryParams = [appointmentId];
      
      if (userRole === 'doctor') {
        query += ' AND doctor_id = $2';
        queryParams.push(userId);
      }
      
      const appointmentCheck = await pool.query(query, queryParams);
      
      if (appointmentCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Appointment not found or you do not have permission to start it'
        });
      }
      
      const appointment = appointmentCheck.rows[0];
      
      // Check if appointment is in a startable state
      if (appointment.status !== 'scheduled') {
        return res.status(400).json({
          success: false,
          error: 'Only scheduled appointments can be started'
        });
      }
      
      // Update appointment status to in-progress
      const result = await pool.query(
        `UPDATE appointments 
         SET status = 'in-progress', 
             started_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 
         RETURNING *`,
        [appointmentId]
      );
      
      res.status(200).json({
        success: true,
        message: 'Appointment started successfully',
        data: result.rows[0]
      });
      
    } catch (error) {
      console.error('Start appointment error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start appointment'
      });
    }
  },

  // NEW: Get appointments for doctor
  getDoctorAppointments: async (req, res, next) => {
    try {
      const { status, date, page = 1, limit = 10 } = req.query;
      const doctorId = req.user.id;

      // Calculate offset for pagination
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT a.*, 
               p.first_name as patient_first_name, 
               p.last_name as patient_last_name,
               p.email as patient_email,
               p.phone as patient_phone
        FROM appointments a
        JOIN users p ON a.patient_id = p.id
        WHERE a.doctor_id = $1
      `;
      
      const queryParams = [doctorId];
      let paramCount = 1;
      
      if (status) {
        paramCount++;
        query += ` AND a.status = $${paramCount}`;
        queryParams.push(status);
      }
      
      if (date) {
        paramCount++;
        query += ` AND a.appointment_date = $${paramCount}`;
        queryParams.push(date);
      }
      
      // Count total records for pagination
      const countQuery = query.replace(
        'SELECT a.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.email as patient_email, p.phone as patient_phone',
        'SELECT COUNT(*)'
      );
      
      const countResult = await pool.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].count);
      
      // Add ordering and pagination
      query += ` ORDER BY a.appointment_date ASC, a.start_time ASC 
                 LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      
      queryParams.push(limit, offset);
      
      const result = await pool.query(query, queryParams);
      
      res.json({
        success: true,
        appointments: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = appointmentController;