const socketIO = require('socket.io');
const pool = require('../db/db');
const { authenticateSocketToken, handleJWTError } = require('../middleware/auth');

let io;

// Simple in-memory rate limiting
const rateLimitMap = new Map();

const initSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL 
        : ["http://localhost:3000", "http://localhost:3001", "http://localhost:5000"],
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Custom rate limiting middleware
  io.use((socket, next) => {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const maxRequests = 100;
    
    if (!rateLimitMap.has(socket.id)) {
      rateLimitMap.set(socket.id, {
        count: 0,
        startTime: now
      });
    }
    
    const clientRecord = rateLimitMap.get(socket.id);
    
    if (now - clientRecord.startTime > windowMs) {
      clientRecord.count = 0;
      clientRecord.startTime = now;
    }
    
    if (clientRecord.count >= maxRequests) {
      return next(new Error('Rate limit exceeded. Please try again later.'));
    }
    
    clientRecord.count++;
    next();
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('No auth token provided - allowing connection for development');
          socket.userId = 'anonymous';
          socket.userType = 'guest';
          return next();
        }
        return next(new Error('Authentication error: No token provided'));
      }
      
      const decoded = authenticateSocketToken(token);
      socket.userId = decoded.userId || decoded.id;
      socket.userType = decoded.userType || decoded.role;
      
      next();
    } catch (error) {
      console.error('Socket authentication error:', error.message);
      
      if (process.env.NODE_ENV === 'development') {
        console.warn('Invalid token - allowing connection for development');
        socket.userId = 'invalid-token-user';
        socket.userType = 'guest';
        return next();
      }
      
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id, 'User ID:', socket.userId, 'Type:', socket.userType);
    
    // Join user-specific rooms
    if (socket.userType && socket.userId) {
      const roomName = `${socket.userType}-${socket.userId}`;
      socket.join(roomName);
      console.log(`User joined room: ${roomName}`);
    }

    // Handle room joining events
    socket.on('join-doctor-room', (doctorId) => {
      socket.join(`doctor-${doctorId}`);
      console.log(`Socket ${socket.id} joined doctor-${doctorId} room`);
    });

    socket.on('join-patient-room', (patientId) => {
      socket.join(`patient-${patientId}`);
      console.log(`Socket ${socket.id} joined patient-${patientId} room`);
    });

    // Handle appointment status updates
    socket.on('appointment-status-update', async (data) => {
      try {
        const { appointmentId, status } = data;
        
        console.log('Appointment status update:', { appointmentId, status });
        
        // Verify user has permission to update this appointment
        const appointmentCheck = await pool.query(
          'SELECT * FROM appointments WHERE id = $1',
          [appointmentId]
        );
        
        if (appointmentCheck.rows.length === 0) {
          return socket.emit('error', { message: 'Appointment not found' });
        }
        
        const appointment = appointmentCheck.rows[0];
        
        // Check permissions (doctor can only update their own appointments)
        if (socket.userType === 'doctor' && appointment.doctor_id !== socket.userId) {
          return socket.emit('error', { message: 'Unauthorized to update this appointment' });
        }
        
        // Update database
        const result = await pool.query(
          'UPDATE appointments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
          [status, appointmentId]
        );
        
        const updatedAppointment = result.rows[0];
        
        // Notify relevant users
        io.to(`doctor-${updatedAppointment.doctor_id}`).emit('appointment-updated', updatedAppointment);
        io.to(`patient-${updatedAppointment.patient_id}`).emit('appointment-updated', updatedAppointment);
        
      } catch (error) {
        console.error('Appointment update error:', error);
        socket.emit('error', { message: 'Failed to update appointment' });
      }
    });

    // Handle real-time notifications
    socket.on('send-notification', async (data) => {
      try {
        const { recipientId, recipientType, message, type = 'info' } = data;
        
        // Validate recipient type
        if (!['doctor', 'patient'].includes(recipientType)) {
          return socket.emit('error', { message: 'Invalid recipient type' });
        }
        
        console.log('Sending notification:', { recipientId, recipientType, message });
        
        // Save notification to database
        const result = await pool.query(
          'INSERT INTO notifications (user_id, user_type, message, type) VALUES ($1, $2, $3, $4) RETURNING *',
          [recipientId, recipientType, message, type]
        );
        
        // Send to appropriate room
        const roomName = `${recipientType}-${recipientId}`;
        io.to(roomName).emit('new-notification', result.rows[0]);
        
      } catch (error) {
        console.error('Notification error:', error);
        socket.emit('error', { message: 'Failed to send notification' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log('User disconnected:', socket.id, 'Reason:', reason);
      rateLimitMap.delete(socket.id);
    });
    
    // Error handling
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

module.exports = { 
  initSocket, 
  getIO
}; 