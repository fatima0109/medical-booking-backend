const pool = require('../db/db');
const { getIO } = require('./socketService');
const { sendEmail } = require('../utils/emailSender'); // Added email sender

class NotificationService {
  // SIMPLE NOTIFICATION METHOD - Added this
  static async sendNotification({ to, subject, message, type = 'general', data = {} }) {
    try {
      console.log(`Notification sent:`, { to, subject, message, type, data });
      
      // Send email for most notification types
      if (to && subject && message) {
        await sendEmail(to, subject, message);
      }
      
      // Store notification in database if needed
      await this.storeNotificationInDatabase({ to, subject, message, type, data });
      
      return true;
    } catch (error) {
      console.error('Notification error:', error);
      return false;
    }
  }

  // STORE NOTIFICATION IN DATABASE - Added this helper
  static async storeNotificationInDatabase({ to, subject, message, type, data }) {
    try {
      await pool.query(
        `INSERT INTO notifications (recipient_email, subject, message, type, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [to, subject, message, type, JSON.stringify(data)]
      );
    } catch (error) {
      console.error('Failed to store notification in database:', error);
    }
  }

  // CORRECTED METHOD SYNTAX - remove 'async' from method declaration
  static async sendUpcomingAppointmentNotifications() {
    let client;
    try {
      client = await pool.connect();
      
      // ADD QUERY TIMEOUT - CRITICAL!
      await client.query('SET statement_timeout = 5000');
      
      // Get appointments in smaller batches
      const upcomingAppointments = await client.query(
        `SELECT a.*, u.name as patient_name, u2.name as doctor_name,
                u.email as patient_email, u.phone as patient_phone
         FROM appointments a
         INNER JOIN users u ON a.patient_id = u.id
         INNER JOIN doctors d ON a.doctor_id = d.id
         INNER JOIN users u2 ON d.user_id = u2.id
         WHERE a.appointment_date BETWEEN NOW() AND NOW() + INTERVAL '30 minutes'
         AND a.status = 'scheduled'
         AND (a.notification_sent = false OR a.notification_sent IS NULL)
         LIMIT 20` // REDUCE BATCH SIZE
      );

      let successful = 0;
      let failed = 0;

      // Process in even smaller batches
      for (let i = 0; i < upcomingAppointments.rows.length; i += 5) {
        const batch = upcomingAppointments.rows.slice(i, i + 5);
        
        for (const appointment of batch) {
          try {
            // YIELD EVENT LOOP between appointments
            await new Promise(resolve => setTimeout(resolve, 0));
            
            await this.processSingleAppointment(appointment);
            successful++;
          } catch (error) {
            console.error(`Failed appointment ${appointment.id}:`, error);
            failed++;
            // CONTINUE - don't stop the whole batch
          }
        }
      }
      
      console.log(`Notification job completed: ${successful} successful, ${failed} failed`);
      return { successful, failed };
      
    } catch (error) {
      console.error('Notification service error:', error);
      return { successful: 0, failed: 0, error: error.message };
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  // PROCESS ONE APPOINTMENT AT A TIME
  static async processSingleAppointment(appointment) {
    const client = await pool.connect();
    try {
      // Send WebSocket notification
      const io = this.getIO();
      io.to(`patient-${appointment.patient_id}`).emit('appointment-reminder', {
        message: `Your appointment with Dr. ${appointment.doctor_name} is in 30 minutes`,
        appointmentId: appointment.id,
        appointmentTime: appointment.appointment_date,
        doctorName: appointment.doctor_name,
        type: 'reminder'
      });

      // Send email notification using the new simple method
      await this.sendNotification({
        to: appointment.patient_email,
        subject: 'Appointment Reminder',
        message: `Dear ${appointment.patient_name}, your appointment with Dr. ${appointment.doctor_name} is in 30 minutes.`,
        type: 'appointment_reminder',
        data: { appointmentId: appointment.id }
      });

      // Mark as notified
      await client.query(
        `UPDATE appointments SET notification_sent = true, notification_sent_at = NOW() WHERE id = $1`,
        [appointment.id]
      );

      console.log(`Sent reminder for appointment ${appointment.id}`);
      
    } finally {
      client.release();
    }
  }

  // Enhanced wait time update with retry logic
  static async sendWaitTimeUpdate(patientId, waitTime, position, retryCount = 0) {
    const maxRetries = 3;
    
    try {
      const io = this.getIO();
      const socketEmitted = io.to(`patient-${patientId}`).emit('wait-time-update', {
        position: position,
        estimatedWait: waitTime,
        message: `Your estimated wait time is ${waitTime} minutes`,
        timestamp: new Date().toISOString(),
        type: 'wait_time'
      });
      
      // If using Socket.io with acknowledgements, you could check for delivery confirmation
      console.log(`Sent wait time update to patient ${patientId}`);
      return true;
    } catch (error) {
      console.error(`Wait time update error for patient ${patientId}:`, error);
      
      // Retry logic for transient failures
      if (retryCount < maxRetries) {
        console.log(`Retrying wait time update for patient ${patientId} (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
        return this.sendWaitTimeUpdate(patientId, waitTime, position, retryCount + 1);
      }
      
      // Log persistent failure
      await this.logNotificationError(
        null, 
        patientId, 
        'wait_time_update', 
        error, 
        { waitTime, position }
      );
      
      return false;
    }
  }

  // Enhanced appointment status update with delivery confirmation
  static async sendAppointmentStatusUpdate(patientId, doctorId, appointmentId, status, message) {
    try {
      const io = this.getIO();
      
      // Notify patient
      io.to(`patient-${patientId}`).emit('appointment-status-changed', {
        appointmentId: appointmentId,
        status: status,
        message: message,
        timestamp: new Date().toISOString(),
        type: 'status_update'
      });

      // Notify doctor
      io.to(`doctor-${doctorId}`).emit('appointment-status-changed', {
        appointmentId: appointmentId,
        status: status,
        message: message,
        timestamp: new Date().toISOString(),
        type: 'status_update'
      });

      console.log(`Sent status update for appointment ${appointmentId}`);
      return true;
    } catch (error) {
      console.error('Appointment status update error:', error);
      
      // Log the error for later investigation
      await this.logNotificationError(
        appointmentId, 
        patientId, 
        'status_update', 
        error, 
        { status, message, doctorId }
      );
      
      return false;
    }
  }

 // Enhanced doctor calling notification with REAL acknowledgement
  static async sendDoctorCallingNotification(patientId, doctorName, roomNumber, timeoutMs = 10000) {
    try {
      const io = this.getIO();
      
      // Get the specific patient's socket using the helper method
      const patientSocket = await this.getPatientSocket(patientId);
      
      if (!patientSocket) {
        throw new Error(`Patient ${patientId} is not connected`);
      }

      // Create a promise that waits for client acknowledgement
      const notificationPromise = new Promise((resolve, reject) => {
        // Set a timeout for the notification
        const timeout = setTimeout(() => {
          reject(new Error(`Notification timeout for patient ${patientId}`));
        }, timeoutMs);
        
        // Send notification with acknowledgement requirement
        patientSocket.emit('doctor-calling', {
          message: `Dr. ${doctorName} is ready to see you`,
          doctorName: doctorName,
          room: roomNumber || 'Consultation Room',
          timestamp: new Date().toISOString(),
          type: 'doctor_calling'
        }, (acknowledgement) => {
          // This callback runs when client acknowledges
          clearTimeout(timeout);
          
          if (acknowledgement && acknowledgement.success) {
            console.log(`Doctor calling notification acknowledged by patient ${patientId}`);
            resolve(true);
          } else {
            const errorMsg = acknowledgement && acknowledgement.error 
              ? `Patient ${patientId} failed to acknowledge: ${acknowledgement.error}`
              : `Patient ${patientId} failed to acknowledge notification`;
            reject(new Error(errorMsg));
          }
        });
      });
      
      await notificationPromise;
      console.log(`Doctor calling notification delivered to patient ${patientId}`);
      return true;
      
    } catch (error) {
      console.error('Doctor calling notification error:', error);
      
      // Log the error
      await this.logNotificationError(
        null, 
        patientId, 
        'doctor_calling', 
        error, 
        { doctorName, roomNumber }
      );
      
      return false;
    }
  }

  // Helper method to get patient's socket
  static async getPatientSocket(patientId) {
    try {
      const io = this.getIO();
      
      // Use fetchSockets() to get all sockets in the patient's room
      const sockets = await io.in(`patient-${patientId}`).fetchSockets();
      
      if (sockets.length === 0) {
        console.log(`No sockets found for patient ${patientId}`);
        return null;
      }
      
      // Return the first socket (you could implement more complex logic here)
      // For example, return the most recently connected socket
      return sockets[0];
      
    } catch (error) {
      console.error('Error getting patient socket:', error);
      return null;
    }
  }

  // Enhanced email notification with retry logic
  static async sendEmailNotification(appointment, retryCount = 0) {
    const maxRetries = 2;
    
    try {
      // Use the new simple notification method instead
      await this.sendNotification({
        to: appointment.patient_email,
        subject: 'Appointment Notification',
        message: `Regarding your appointment with Dr. ${appointment.doctor_name}`,
        type: 'appointment_notification',
        data: { appointmentId: appointment.id }
      });
      
      return true;
    } catch (error) {
      console.error(`Email notification failed for appointment ${appointment.id}:`, error);
      
      if (retryCount < maxRetries) {
        console.log(`Retrying email notification for appointment ${appointment.id}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return this.sendEmailNotification(appointment, retryCount + 1);
      }
      
      // Log persistent failure
      await this.logNotificationError(
        appointment.id,
        appointment.patient_id,
        'email',
        error,
        { email: appointment.patient_email }
      );
      
      return false;
    }
  }

  // Enhanced SMS notification with retry logic
  static async sendSMSNotification(appointment, retryCount = 0) {
    const maxRetries = 2;
    
    try {
      // Implement actual SMS service integration here
      console.log(`Would send SMS to ${appointment.patient_phone} about appointment`);
      
      // Simulate potential failure for demonstration
      if (Math.random() < 0.1) { // 10% chance of failure for testing
        throw new Error('Simulated SMS service failure');
      }
      
      return true;
    } catch (error) {
      console.error(`SMS notification failed for appointment ${appointment.id}:`, error);
      
      if (retryCount < maxRetries) {
        console.log(`Retrying SMS notification for appointment ${appointment.id}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return this.sendSMSNotification(appointment, retryCount + 1);
      }
      
      // Log persistent failure
      await this.logNotificationError(
        appointment.id,
        appointment.patient_id,
        'sms',
        error,
        { phone: appointment.patient_phone }
      );
      
      return false;
    }
  }

  // Utility method to log notification errors
  static async logNotificationError(appointmentId, userId, errorType, error, context = {}) {
    try {
      await pool.query(
        `INSERT INTO notification_errors 
         (appointment_id, user_id, error_type, error_message, context, retry_count)
         VALUES ($1, $2, $3, $4, $5, 1)
         ON CONFLICT (appointment_id, error_type) 
         DO UPDATE SET 
           error_message = EXCLUDED.error_message,
           context = EXCLUDED.context,
           retry_count = notification_errors.retry_count + 1,
           last_attempt = NOW()`,
        [appointmentId, userId, errorType, error.message, JSON.stringify(context)]
      );
    } catch (dbError) {
      console.error('Failed to log notification error:', dbError);
      // Fallback to console if DB logging fails
      console.error('Original error:', {
        appointmentId,
        userId,
        errorType,
        error: error.message,
        context
      });
    }
  }

  // Utility method to log job errors
  static async logJobError(jobName, error) {
    try {
      await pool.query(
        `INSERT INTO job_errors (job_name, error_message, stack_trace)
         VALUES ($1, $2, $3)`,
        [jobName, error.message, error.stack]
      );
    } catch (dbError) {
      console.error('Failed to log job error:', dbError);
      console.error('Original job error:', error);
    }
  }

  // Method to retry failed notifications
  static async retryFailedNotifications() {
    try {
      const failedNotifications = await pool.query(
        `SELECT * FROM notification_errors 
         WHERE retry_count <= 3 AND last_attempt < NOW() - INTERVAL '1 hour'`
      );
      
      // Implementation would vary based on your notification types
      console.log(`Found ${failedNotifications.rows.length} failed notifications to retry`);
      
      // Actual retry logic would go here
    } catch (error) {
      console.error('Failed to retry notifications:', error);
    }
  }
}

module.exports = NotificationService;