const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/db');
const { 
  getDoctors, 
  getDoctorById,
  searchDoctors, 
  setDoctorAvailability,
  createAppointment
} = require('../db/queries');

// Import validators
const { body, validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errors/AppError');

// Get all doctors
router.get('/', async (req, res, next) => {
  try {
    const doctors = await getDoctors();
    res.json({
      success: true,
      data: doctors.rows,
      count: doctors.rows.length
    });
  } catch (error) {
    next(error);
  }
});

// Basic Search doctors with filters
router.get('/search', async (req, res, next) => {
  try {
    const { specialty, date, experience, minRating, maxFee, language, gender } = req.query;
    
    let query = `
      SELECT 
        d.*,
        u.name as doctor_name,
        u.contact_number,
        da.day_of_week,
        da.start_time,
        da.end_time
      FROM doctors d
      INNER JOIN users u ON d.user_id = u.id
      LEFT JOIN doctor_availability da ON d.id = da.doctor_id
      WHERE u.verified = true AND d.verified = true
    `;
    
    const params = [];
    let paramCount = 0;

    if (specialty) {
      paramCount++;
      params.push(`%${specialty}%`);
      query += ` AND d.specialty ILIKE $${paramCount}`;
    }
    
    if (experience) {
      paramCount++;
      params.push(parseInt(experience));
      query += ` AND d.experience >= $${paramCount}`;
    }
    
    if (minRating) {
      paramCount++;
      params.push(parseFloat(minRating));
      query += ` AND d.rating >= $${paramCount}`;
    }
    
    if (maxFee) {
      paramCount++;
      params.push(parseFloat(maxFee));
      query += ` AND d.consultation_fee <= $${paramCount}`;
    }
    
    if (language) {
      paramCount++;
      params.push(language);
      query += ` AND $${paramCount} = ANY(d.languages)`;
    }
    
    if (gender) {
      paramCount++;
      params.push(gender);
      query += ` AND u.gender = $${paramCount}`;
    }
    
    // For date filtering
    if (date) {
      const dayOfWeek = new Date(date).getDay();
      paramCount++;
      params.push(dayOfWeek);
      query += ` AND da.day_of_week = $${paramCount} AND da.is_available = true`;
    }

    query += ` ORDER BY d.rating DESC, d.experience DESC`;
    
    const result = await pool.query(query, params);
    
    // Group availability by doctor
    const doctorsMap = new Map();
    result.rows.forEach(row => {
      if (!doctorsMap.has(row.id)) {
        doctorsMap.set(row.id, {
          id: row.id,
          name: row.doctor_name,
          specialty: row.specialty,
          experience: row.experience,
          consultation_fee: row.consultation_fee,
          rating: row.rating,
          languages: row.languages,
          license_number: row.license_number,
          contact_number: row.contact_number,
          availability: []
        });
      }
      
      if (row.day_of_week !== null) {
        doctorsMap.get(row.id).availability.push({
          day: row.day_of_week,
          start_time: row.start_time,
          end_time: row.end_time
        });
      }
    });
    
    res.json({
      success: true,
      doctors: Array.from(doctorsMap.values()),
      filters: {
        specialty,
        date,
        experience,
        minRating,
        maxFee,
        language,
        gender
      }
    });
  } catch (error) {
    next(error);
  }
});

// Enhanced Search doctors with pagination and advanced filters
router.get('/search/advanced', async (req, res, next) => {
  try {
    const { specialty, date, minExperience, maxFee, rating, language, page = 1, limit = 10 } = req.query;
    
    let query = `
      SELECT 
        d.*,
        u.name as doctor_name,
        u.contact_number,
        json_agg(
          DISTINCT jsonb_build_object(
            'day', da.day_of_week,
            'start_time', da.start_time,
            'end_time', da.end_time
          )
        ) as availability,
        COUNT(*) OVER() as total_count
      FROM doctors d
      INNER JOIN users u ON d.user_id = u.id
      LEFT JOIN doctor_availability da ON d.id = da.doctor_id AND da.is_available = true
      WHERE u.verified = true AND d.verified = true
    `;
    
    const params = [];
    let paramCount = 0;
    let whereConditions = [];

    if (specialty) {
      paramCount++;
      params.push(`%${specialty}%`);
      whereConditions.push(`d.specialty ILIKE $${paramCount}`);
    }
    
    if (minExperience) {
      paramCount++;
      params.push(parseInt(minExperience));
      whereConditions.push(`d.experience >= $${paramCount}`);
    }
    
    if (rating) {
      paramCount++;
      params.push(parseFloat(rating));
      whereConditions.push(`d.rating >= $${paramCount}`);
    }
    
    if (maxFee) {
      paramCount++;
      params.push(parseFloat(maxFee));
      whereConditions.push(`d.consultation_fee <= $${paramCount}`);
    }
    
    if (language) {
      paramCount++;
      params.push(language);
      whereConditions.push(`$${paramCount} = ANY(d.languages)`);
    }
    
    if (date) {
      const dayOfWeek = new Date(date).getDay();
      paramCount++;
      params.push(dayOfWeek);
      whereConditions.push(`da.day_of_week = $${paramCount}`);
    }

    if (whereConditions.length > 0) {
      query += ' AND ' + whereConditions.join(' AND ');
    }

    query += `
      GROUP BY d.id, u.name, u.contact_number
      ORDER BY d.rating DESC, d.experience DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(parseInt(limit));
    params.push((parseInt(page) - 1) * parseInt(limit));

    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      doctors: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.rows[0]?.total_count || 0,
        pages: Math.ceil((result.rows[0]?.total_count || 0) / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get doctor by ID
router.get('/doctor/:doctorId', async (req, res, next) => {
  try {
    const doctor = await getDoctorById(req.params.id);
    if (doctor.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Doctor not found'
      });
    }
    res.json({
      success: true,
      data: doctor.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Set doctor availability (protected route)
router.post('/doctor/:doctorId/availability',  
  authenticateToken,
  [
    body('day').isInt({ min: 0, max: 6 }).withMessage('Day must be between 0-6'),
    body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid start time format'),
    body('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid end time format')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array());
      }

      const { day, startTime, endTime } = req.body;
      await setDoctorAvailability(req.params.id, { day, startTime, endTime });
      
      res.json({
        success: true,
        message: 'Availability updated'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Book appointment
router.post('/doctor/:doctorId/book',  
  authenticateToken,
  [
    body('date').isISO8601().withMessage('Invalid date format'),
    body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid start time format'),
    body('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid end time format'),
    body('type').isIn(['video', 'voice', 'chat']).withMessage('Invalid appointment type')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Validation failed', errors.array());
      }

      const { date, startTime, endTime, type } = req.body;
      const appointment = await createAppointment(
        req.user.id, // Changed from req.user.userId to req.user.id
        req.params.id,
        date,
        startTime,
        endTime,
        type
      );

      res.status(201).json({
        success: true,
        data: appointment.rows[0],
        message: 'Appointment booked successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;