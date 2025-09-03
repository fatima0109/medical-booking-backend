const pool = require('./db');

module.exports = {
  // User Authentication
  getUserByEmail: async (email) => {
    const query = 'SELECT * FROM users WHERE email = $1';
    try {
      const result = await pool.query(query, [email]);
      return result;  // ✅ Return full result object, not just rows[0]
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  },

  createUser: async (email, password, name, contactNumber) => {
    const query = `
      INSERT INTO users (email, password_hash, name, contact_number, verified)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, name, contact_number AS "contactNumber", verified
    `;
    try {
      const result = await pool.query(query, [
        email, 
        password, 
        name, 
        contactNumber, 
        false
      ]);
      return result;  // ✅ CORRECT - returns full result object with rows property
    } catch (error) {
      console.error('Database insert error:', error);
      throw error;
    }
  },

  verifyUser: async (userId) => {
    const query = `
      UPDATE users 
      SET verified = true 
      WHERE id = $1 
      RETURNING id, email, name, contact_number AS "contactNumber", verified
    `;
    try {
      const result = await pool.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Database update error:', error);
      throw error;
    }
  },

// Doctor Management
getDoctors: async (filters = {}) => {
  try {
    let query = `
      SELECT d.*, u.name, u.email, u.contact_number,
             json_agg(
               DISTINCT jsonb_build_object(
                 'day', da.day_of_week,
                 'start_time', da.start_time,
                 'end_time', da.end_time,
                 'is_available', da.is_available
               )
             ) as availability
      FROM doctors d 
      JOIN users u ON d.user_id = u.id 
      LEFT JOIN doctor_availability da ON d.id = da.doctor_id
      WHERE d.verified = true
    `;
    
    const values = [];
    let paramCount = 0;
    
    // Add filters if provided
    if (filters.specialty) {
      paramCount++;
      query += ` AND d.specialty = $${paramCount}`;
      values.push(filters.specialty);
    }
    
    if (filters.name) {
      paramCount++;
      query += ` AND u.name ILIKE $${paramCount}`;
      values.push(`%${filters.name}%`);
    }

    if (filters.experience) {
      paramCount++;
      query += ` AND d.experience >= $${paramCount}`;
      values.push(filters.experience);
      paramCount++;
    }

    if (filters.language) {
      paramCount++;
      query += ` AND $${paramCount} = ANY(d.languages)`;
      values.push(filters.language);
      paramCount++;
    }

    if (filters.gender) {
      paramCount++;
      query += ` AND d.gender = $${paramCount}`;
      values.push(filters.gender);
      paramCount++;
    }

    if (filters.maxFee) {
      paramCount++;
      query += ` AND d.consultation_fee <= $${paramCount}`;
      values.push(filters.maxFee);
      paramCount++;
    }
    
    query += ` GROUP BY d.id, u.name, u.email, u.contact_number ORDER BY d.rating DESC, u.name`;
    
    const result = await pool.query(query, values);
    return result;
  } catch (error) {
    console.error('Error fetching doctors:', error);
    throw error;
  }
},

getDoctorById: async (id) => {
  try {
    const result = await pool.query(`
      SELECT d.*, u.name, u.email, u.contact_number,
             json_agg(
               DISTINCT jsonb_build_object(
                 'day', da.day_of_week,
                 'start_time', da.start_time,
                 'end_time', da.end_time,
                 'is_available', da.is_available
               )
             ) as availability
      FROM doctors d 
      JOIN users u ON d.user_id = u.id 
      LEFT JOIN doctor_availability da ON d.id = da.doctor_id
      WHERE d.id = $1 AND d.verified = true
      GROUP BY d.id, u.name, u.email, u.contact_number
    `, [id]);
    return result;
  } catch (error) {
    console.error('Error fetching doctor:', error);
    throw error;
  }
},

addDoctor: async (userId, specialty, experience, qualification, licenseNumber, consultationFee, gender, languages = ['English']) => {
  try {
    const result = await pool.query(
      `INSERT INTO doctors (user_id, specialty, experience, qualification, license_number, consultation_fee, gender, languages) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [userId, specialty, experience, qualification, licenseNumber, consultationFee, gender, languages]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error adding doctor:', error);
    throw error;
  }
},

//search doctors
searchDoctors: async (filters = {}) => {
  // This function can now simply call getDoctors with the filters
  return await module.exports.getDoctors(filters);
},

  // Availability Management
  getDoctorAvailability: async (doctorId, dayOfWeek = null) => {
    let query = `
      SELECT * FROM doctor_availability 
      WHERE doctor_id = $1 AND is_available = true
    `;
    const params = [doctorId];
    
    if (dayOfWeek !== null) {
      query += ` AND day_of_week = $2`;
      params.push(dayOfWeek);
    }
    
    query += ' ORDER BY day_of_week, start_time';
    
    try {
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error fetching doctor availability:', error);
      throw error;
    }
  },

  setDoctorAvailability: async (doctorId, availability) => {
    try {
      // First remove existing availability for this day
      await pool.query(`
        DELETE FROM doctor_availability 
        WHERE doctor_id = $1 AND day_of_week = $2
      `, [doctorId, availability.day]);
      
      // Insert new availability
      const result = await pool.query(`
        INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, timezone)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [doctorId, availability.day, availability.startTime, availability.endTime, availability.timezone || 'UTC']);
      return result.rows[0];
    } catch (error) {
      console.error('Error setting doctor availability:', error);
      throw error;
    }
  },

  // Appointments Management
  createAppointment: async (patientId, doctorId, date, startTime, endTime, type, notes = null) => {
    try {
      const result = await pool.query(`
        INSERT INTO appointments (patient_id, doctor_id, appointment_date, start_time, end_time, type, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [patientId, doctorId, date, startTime, endTime, type, notes]);
      return result;
    } catch (error) {
      console.error('Error creating appointment:', error);
      throw error;
    }
  },

  getPatientAppointments: async (patientId) => {
    try {
      const result = await pool.query(`
        SELECT a.*, u.name as doctor_name, d.specialty
        FROM appointments a
        JOIN doctors d ON a.doctor_id = d.id
        JOIN users u ON d.user_id = u.id
        WHERE a.patient_id = $1
        ORDER BY a.appointment_date DESC, a.start_time DESC
      `, [patientId]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching patient appointments:', error);
      throw error;
    }
  },

  getDoctorAppointments: async (doctorId) => {
    try {
      const result = await pool.query(`
        SELECT a.*, u.name as patient_name, u.contact_number as patient_contact
        FROM appointments a
        JOIN users u ON a.patient_id = u.id
        WHERE a.doctor_id = $1
        ORDER BY a.appointment_date DESC, a.start_time DESC
      `, [doctorId]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching doctor appointments:', error);
      throw error;
    }
  },

  updateAppointmentStatus: async (appointmentId, status) => {
    try {
      const result = await pool.query(`
        UPDATE appointments 
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `, [status, appointmentId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating appointment status:', error);
      throw error;
    }
  },

  // Reviews Management
  addDoctorReview: async (patientId, doctorId, rating, comment = null) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Add the review
      const reviewResult = await client.query(`
        INSERT INTO doctor_reviews (patient_id, doctor_id, rating, comment)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (patient_id, doctor_id) 
        DO UPDATE SET rating = $3, comment = $4, created_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [patientId, doctorId, rating, comment]);
      
      // Update doctor's average rating
      const ratingResult = await client.query(`
        SELECT AVG(rating) as avg_rating, COUNT(*) as review_count
        FROM doctor_reviews 
        WHERE doctor_id = $1
      `, [doctorId]);
      
      await client.query(`
        UPDATE doctors 
        SET rating = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [parseFloat(ratingResult.rows[0].avg_rating), doctorId]);
      
      await client.query('COMMIT');
      return reviewResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error adding doctor review:', error);
      throw error;
    } finally {
      client.release();
    }
  },

  getDoctorReviews: async (doctorId) => {
    try {
      const result = await pool.query(`
        SELECT dr.*, u.name as patient_name
        FROM doctor_reviews dr
        JOIN users u ON dr.patient_id = u.id
        WHERE dr.doctor_id = $1
        ORDER BY dr.created_at DESC
      `, [doctorId]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching doctor reviews:', error);
      throw error;
    }
  }
};