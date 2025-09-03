const pool = require('../db/db');
const { getIO } = require('./socketService');

class QueueService {
  // Add appointment to queue
  static async addToQueue(appointmentId) {
    try {
      // Get current queue position for this doctor today
      const queueResult = await pool.query(
        `SELECT COUNT(*) as queue_count 
         FROM appointments 
         WHERE doctor_id = (SELECT doctor_id FROM appointments WHERE id = $1)
         AND appointment_date::date = CURRENT_DATE
         AND status = 'in-progress'`,
        [appointmentId]
      );

      const queuePosition = parseInt(queueResult.rows[0].queue_count) + 1;
      
      // Calculate estimated wait time (average 15 minutes per appointment)
      const estimatedWait = queuePosition * 15; // minutes
      
      await pool.query(
        `UPDATE appointments 
         SET status = 'in-progress', 
             queue_position = $1,
             estimated_wait_time = $2 * INTERVAL '1 minute',
             check_in_time = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [queuePosition, estimatedWait, appointmentId]
      );

      // Notify all connected clients about queue update
      const appointment = await pool.query(
        `SELECT doctor_id FROM appointments WHERE id = $1`,
        [appointmentId]
      );
      
      this.broadcastQueueUpdate(appointment.rows[0].doctor_id);
      
      return { success: true, queuePosition, estimatedWait };
    } catch (error) {
      console.error('Queue add error:', error);
      throw error;
    }
  }

  // Get current queue status for a doctor
  static async getQueueStatus(doctorId) {
    try {
      const result = await pool.query(
        `SELECT 
           a.id, a.queue_position, a.estimated_wait_time,
           a.check_in_time, a.called_time,
           p.name as patient_name,
           u.name as doctor_name
         FROM appointments a
         INNER JOIN users p ON a.patient_id = p.id
         INNER JOIN doctors d ON a.doctor_id = d.id
         INNER JOIN users u ON d.user_id = u.id
         WHERE a.doctor_id = $1 
         AND a.appointment_date::date = CURRENT_DATE
         AND a.status = 'in-progress'
         ORDER BY a.queue_position`,
        [doctorId]
      );

      return result.rows;
    } catch (error) {
      console.error('Queue status error:', error);
      throw error;
    }
  }

  // Call next patient
  static async callNextPatient(doctorId) {
    try {
      // Get the next patient in queue
      const nextPatient = await pool.query(
        `SELECT id FROM appointments 
         WHERE doctor_id = $1 
         AND appointment_date::date = CURRENT_DATE
         AND status = 'in-progress'
         ORDER BY queue_position 
         LIMIT 1`,
        [doctorId]
      );

      if (nextPatient.rows.length === 0) {
        return { success: false, message: 'No patients in queue' };
      }

      const appointmentId = nextPatient.rows[0].id;
      
      await pool.query(
        `UPDATE appointments 
         SET status = 'in-consultation',
             called_time = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [appointmentId]
      );

      // Notify the specific patient
      this.notifyPatientCalled(appointmentId);
      
      // Update queue positions for remaining patients
      await this.updateQueuePositions(doctorId);
      
      this.broadcastQueueUpdate(doctorId);
      
      return { success: true, appointmentId };
    } catch (error) {
      console.error('Call next patient error:', error);
      throw error;
    }
  }

  // Update queue positions after a patient is called
  static async updateQueuePositions(doctorId) {
    await pool.query(
      `UPDATE appointments 
       SET queue_position = queue_position - 1,
           estimated_wait_time = GREATEST(estimated_wait_time - INTERVAL '15 minutes', INTERVAL '0 minutes')
       WHERE doctor_id = $1 
       AND appointment_date::date = CURRENT_DATE
       AND status = 'in-progress'`,
      [doctorId]
    );
  }

  // Complete consultation
  static async completeAppointment(appointmentId) {
    await pool.query(
      `UPDATE appointments 
       SET status = 'completed',
           completed_time = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [appointmentId]
    );

    const appointment = await pool.query(
      `SELECT doctor_id FROM appointments WHERE id = $1`,
      [appointmentId]
    );
    
    this.broadcastQueueUpdate(appointment.rows[0].doctor_id);
  }

  // Broadcast queue update to all connected clients
  static async broadcastQueueUpdate(doctorId) {
    try {
      const queueStatus = await this.getQueueStatus(doctorId);
      const io = this.getIO();
      
      io.to(`doctor-${doctorId}`).emit('queue-update', {
        queue: queueStatus,
        timestamp: new Date()
      });

      // Also send updates to individual patients in the queue
      queueStatus.forEach(patient => {
        io.to(`patient-${patient.patient_id}`).emit('patient-queue-update', {
          position: patient.queue_position,
          estimatedWait: patient.estimated_wait_time,
          doctorName: patient.doctor_name
        });
      });
    } catch (error) {
      console.error('Broadcast queue update error:', error);
    }
  }

  // Notify specific patient they've been called
  static async notifyPatientCalled(appointmentId) {
    try {
      const result = await pool.query(
        `SELECT a.*, p.id as patient_id, u.name as doctor_name 
         FROM appointments a
         INNER JOIN doctors d ON a.doctor_id = d.id
         INNER JOIN users u ON d.user_id = u.id
         INNER JOIN users p ON a.patient_id = p.id
         WHERE a.id = $1`,
        [appointmentId]
      );

      if (result.rows.length > 0) {
        const appointment = result.rows[0];
        const io = this.getIO();
        
        io.to(`patient-${appointment.patient_id}`).emit('doctor-calling', {
          message: `Dr. ${appointment.doctor_name} is ready to see you`,
          appointmentId: appointmentId,
          room: `consultation-${appointmentId}`
        });
      }
    } catch (error) {
      console.error('Notify patient called error:', error);
    }
  }

  // Safe IO getter with fallback - ADDED THIS METHOD
  static getIO() {
    try {
      return getIO();
    } catch (error) {
      console.warn('Socket.io not initialized, skipping real-time notification');
      return { 
        to: () => ({
          emit: () => {} // Mock emit method that does nothing
        }),
        emit: () => {} // Mock emit method that does nothing
      };
    }
  }
}

module.exports = QueueService;