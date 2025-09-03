// const express = require('express');
// const router = express.Router();
// const auth = require('../middleware/auth');
// const {
//   getDoctors,
//   addDoctor,
//   getAvailableSlots,
//   addAvailability,
//   bookAppointment,
//   getDoctorAppointments,
//   getAllBookings,
//   createBooking,
//   getAppointmentsByUser
// } = require('../controllers/bookingController');

// // API versioning prefix (recommended)
// router.use('/api/v1', router);

// // Doctor management (public routes)
// router.get('/doctors', async (req, res, next) => {
//   try {
//     const doctors = await getDoctors();
//     res.json({ success: true, data: doctors });
//   } catch (error) {
//     next(error);
//   }
// });

// router.post('/doctors', async (req, res, next) => {
//   try {
//     const doctor = await addDoctor(req.body);
//     res.status(201).json({ success: true, data: doctor });
//   } catch (error) {
//     next(error);
//   }
// });

// // Availability management (protected routes - admin only)
// router.get('/availability/:doctorId/:date', auth, async (req, res, next) => {
//   try {
//     const { doctorId, date } = req.params;
//     const slots = await getAvailableSlots(doctorId, date);
//     res.json({ success: true, data: slots });
//   } catch (error) {
//     next(error);
//   }
// });

// router.post('/availability', auth, async (req, res, next) => {
//   try {
//     const availability = await addAvailability(req.body);
//     res.status(201).json({ success: true, data: availability });
//   } catch (error) {
//     next(error);
//   }
// });

// // Appointment management (protected routes)
// router.get('/', auth, async (req, res, next) => {
//   try {
//     const appointments = await getAppointmentsByUser(req.user.id);
//     res.json({ success: true, data: appointments });
//   } catch (error) {
//     next(error);
//   }
// });

// // Get all bookings (protected - admin only)
// router.get('/appointments', auth, async (req, res, next) => {
//   try {
//     const bookings = await getAllBookings();
//     res.json({ success: true, data: bookings });
//   } catch (error) {
//     next(error);
//   }
// });

// // Get doctor-specific appointments (protected)
// router.get('/appointments/:doctorId', auth, async (req, res, next) => {
//   try {
//     const { doctorId } = req.params;
//     const appointments = await getDoctorAppointments(doctorId);
//     res.json({ success: true, data: appointments });
//   } catch (error) {
//     next(error);
//   }
// });

// // Book appointment (protected)
// router.post('/', auth, async (req, res, next) => {
//   try {
//     const { doctorId, date, timeSlot } = req.body;
    
//     if (!doctorId || !date || !timeSlot) {
//       const err = new Error('Missing required fields');
//       err.statusCode = 400;
//       throw err;
//     }
    
//     const result = await bookAppointment({
//       doctorId,
//       date,
//       timeSlot,
//       userId: req.user.id
//     });
    
//     res.status(201).json({ 
//       success: true,
//       data: result,
//       message: 'Appointment booked successfully'
//     });
//   } catch (error) {
//     next(error);
//   }
// });

// // Generic booking endpoint (protected)
// router.post('/book', auth, async (req, res, next) => {
//   try {
//     const { availabilityId, reason } = req.body;
    
//     if (!availabilityId) {
//       const err = new Error('Availability ID is required');
//       err.statusCode = 400;
//       throw err;
//     }
    
//     const booking = await createBooking({
//       availabilityId,
//       userId: req.user.id,
//       reason
//     });
    
//     res.status(201).json({ 
//       success: true,
//       data: booking,
//       message: 'Booking created successfully'
//     });
//   } catch (error) {
//     next(error);
//   }
// });

// // Example route with proper JSON response
// router.get('/availability/:doctorId/:date', async (req, res, next) => {
//   try {
//     const { doctorId, date } = req.params;
//     const slots = await getAvailableSlots(doctorId, date);
    
//     res.json({ success: true, data: slots });
//   } catch (error) {
//     next(error);
//   }
// });

// module.exports = router;







// const db = require('../db/queries');
// const pool = require('../db/db'); // Assuming you have this for transactions

// // Get all doctors
// const getDoctors = async (req, res) => {
//   try {
//     const { rows } = await db.getDoctors();
//     res.json({ success: true, data: rows });
//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message });
//   }
// };

// // Get all bookings (appointments) - NEW
// const getAllBookings = async (req, res) => {
//   try {
//     const { rows } = await pool.query(`
//       SELECT a.*, d.name as doctor_name, d.specialty 
//       FROM appointments a
//       JOIN doctors d ON a.doctor_id = d.id
//       ORDER BY a.date, a.time_slot
//     `);
//     res.json({ success: true, data: rows });
//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message });
//   }
// };

// // Generic booking creation - NEW
// const createBooking = async (req, res) => {
//   const { doctorId, date, timeSlot, patientName, patientEmail, reason } = req.body;
  
//   try {
//     const client = await pool.connect();
//     await client.query('BEGIN');
    
//     // 1. Find or create availability slot
//     const availability = await client.query(
//       `INSERT INTO availability 
//        (doctor_id, date, start_time, end_time, is_available)
//        VALUES ($1, $2, $3, $4, false)
//        ON CONFLICT (doctor_id, date, start_time) 
//        DO UPDATE SET is_available = false
//        RETURNING id`,
//       [doctorId, date, timeSlot, timeSlot] // Using same time for start/end for simplicity
//     );
    
//     // 2. Create appointment
//     const appointment = await client.query(
//       `INSERT INTO appointments 
//        (doctor_id, availability_id, patient_name, patient_email, date, time_slot, reason) 
//        VALUES ($1, $2, $3, $4, $5, $6, $7)
//        RETURNING *`,
//       [doctorId, availability.rows[0].id, patientName, patientEmail, date, timeSlot, reason]
//     );
    
//     await client.query('COMMIT');
//     client.release();
    
//     res.status(201).json({ success: true, data: appointment.rows[0] });
//   } catch (err) {
//     await client.query('ROLLBACK');
//     res.status(400).json({ success: false, error: err.message });
//   }
// };

// // Get available slots for a doctor on a specific date
// const getAvailableSlots = async (req, res) => {
//   const { doctorId, date } = req.params;
  
//   if (isNaN(doctorId)) {
//     return res.status(400).json({ success: false, error: "Invalid doctor ID" });
//   }

//   try {
//     const { rows } = await pool.query(
//       `SELECT id, start_time, end_time
//        FROM availability 
//        WHERE doctor_id = $1 AND date = $2 AND is_available = true
//        ORDER BY start_time`,
//       [doctorId, date]
//     );
    
//     res.json({ success: true, data: rows });
//   } catch (err) {
//     console.error(`Error fetching slots:`, err);
//     res.status(500).json({ 
//       success: false,
//       error: "Failed to fetch availability",
//       details: err.message
//     });
//   }
// };

// // Add new availability slot (for doctors/admin)
// const addAvailability = async (req, res) => {
//   const { doctorId, date, startTime, endTime } = req.body;
//   try {
//     const { rows } = await db.addAvailabilitySlot(doctorId, date, startTime, endTime);
//     res.status(201).json({ success: true, data: rows[0] });
//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message });
//   }
// };

// // Book an appointment (specific slot)
// const bookAppointment = async (req, res) => {
//   const { availabilityId, patientName, patientEmail, date, timeSlot, reason } = req.body;

//   try {
//     const client = await pool.connect();
//     await client.query('BEGIN');
    
//     await client.query(
//       'UPDATE availability SET is_available = false WHERE id = $1',
//       [availabilityId]
//     );
    
//     const appointment = await client.query(
//       `INSERT INTO appointments 
//        (availability_id, patient_name, patient_email, date, time_slot, reason) 
//        VALUES ($1, $2, $3, $4, $5, $6) 
//        RETURNING *`,
//       [availabilityId, patientName, patientEmail, date, timeSlot, reason]
//     );
    
//     await client.query('COMMIT');
//     client.release();
    
//     res.status(201).json({ success: true, data: appointment.rows[0] });
//   } catch (err) {
//     await client.query('ROLLBACK');
//     res.status(500).json({ success: false, error: err.message });
//   }
// };

// // Get all appointments for a doctor
// const getDoctorAppointments = async (req, res) => {
//   const { doctorId } = req.params;
//   try {
//     const { rows } = await db.getAppointmentsByDoctor(doctorId);
//     res.json({ success: true, data: rows });
//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message });
//   }
// };

// // Add new doctor (for admin)
// const addDoctor = async (req, res) => {
//   const { name, specialty } = req.body;
//   try {
//     const { rows } = await db.addDoctor(name, specialty);
//     res.status(201).json({ success: true, data: rows[0] });
//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message });
//   }
// };

// module.exports = {
//   getDoctors,
//   addDoctor,
//   getAvailableSlots,
//   addAvailability,
//   bookAppointment,
//   getDoctorAppointments,
//   getAllBookings,    // Added
//   createBooking      // Added
// };


