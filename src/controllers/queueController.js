const pool = require('../db/db');
const QueueService = require('../services/queueService');
const { DatabaseError, ValidationError } = require('../utils/errors/AppError');

const queueController = {
  // Check-in to virtual waiting room
  checkIn: async (req, res, next) => {
    try {
      const { appointmentId } = req.params;
      
      // Verify patient owns this appointment
      const appointmentCheck = await pool.query(
        'SELECT * FROM appointments WHERE id = $1 AND patient_id = $2',
        [appointmentId, req.user.id] // Fixed: req.user.id instead of req.userId
      );

      if (appointmentCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Appointment not found or access denied'
        });
      }

      const result = await QueueService.addToQueue(appointmentId);
      
      res.json({
        success: true,
        message: 'Checked in successfully',
        queuePosition: result.queuePosition,
        estimatedWait: result.estimatedWait
      });
    } catch (error) {
      next(error);
    }
  },

  // Get current queue status (for doctors)
  getQueueStatus: async (req, res, next) => {
    try {
      const { doctorId } = req.params;
      
      // Verify user is this doctor or admin
      if (req.user.id !== parseInt(doctorId) && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const queueStatus = await QueueService.getQueueStatus(doctorId);
      
      res.json({
        success: true,
        queue: queueStatus,
        totalPatients: queueStatus.length
      });
    } catch (error) {
      next(error);
    }
  },

  // Call next patient (doctor only)
  callNextPatient: async (req, res, next) => {
    try {
      const { doctorId } = req.params;
      
      if (req.user.role !== 'doctor' && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Only doctors can call patients'
        });
      }

      const result = await QueueService.callNextPatient(doctorId);
      
      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: result.message || 'No patients in queue'
        });
      }
      
      res.json({
        success: true,
        message: result.message,
        appointmentId: result.appointmentId,
        patientName: result.patientName
      });
    } catch (error) {
      next(error);
    }
  },

  // Get patient's queue status
  getPatientStatus: async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT 
          a.*, 
          u.name as doctor_name,
          d.specialty,
          COALESCE(a.queue_position, 0) as queue_position,
          COALESCE(a.estimated_wait_time, '0 minutes') as estimated_wait_time
         FROM appointments a
         INNER JOIN doctors d ON a.doctor_id = d.id
         INNER JOIN users u ON d.user_id = u.id
         WHERE a.patient_id = $1 
         AND a.appointment_date::date = CURRENT_DATE
         AND a.status IN ('scheduled', 'in-progress')
         ORDER BY a.queue_position NULLS LAST, a.appointment_date`,
        [req.user.id] // Fixed: req.user.id instead of req.userId
      );

      res.json({
        success: true,
        appointments: result.rows,
        currentTime: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  },

  // Complete consultation
  completeConsultation: async (req, res, next) => {
    try {
      const { appointmentId } = req.params;
      
      if (req.user.role !== 'doctor' && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Only doctors can complete consultations'
        });
      }

      // Verify doctor owns this appointment
      const appointmentCheck = await pool.query(
        `SELECT a.* FROM appointments a
         INNER JOIN doctors d ON a.doctor_id = d.id
         WHERE a.id = $1 AND d.user_id = $2`,
        [appointmentId, req.user.id]
      );

      if (appointmentCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Appointment not found or access denied'
        });
      }

      await QueueService.completeAppointment(appointmentId);
      
      res.json({
        success: true,
        message: 'Consultation completed successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Remove patient from queue (doctor or patient)
  removeFromQueue: async (req, res, next) => {
    try {
      const { appointmentId } = req.params;
      
      // Check if user has permission
      const appointmentCheck = await pool.query(
        `SELECT a.*, d.user_id as doctor_user_id 
         FROM appointments a
         INNER JOIN doctors d ON a.doctor_id = d.id
         WHERE a.id = $1 AND (a.patient_id = $2 OR d.user_id = $2)`,
        [appointmentId, req.user.id]
      );

      if (appointmentCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Appointment not found or access denied'
        });
      }

      await QueueService.removeFromQueue(appointmentId);
      
      res.json({
        success: true,
        message: 'Removed from queue successfully'
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = queueController;