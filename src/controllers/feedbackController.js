const { validationResult } = require('express-validator');
const pool = require('../db/db');

const feedbackController = {
  // Submit feedback for an appointment
  submitFeedback: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
          message: 'Validation failed'
        });
      }

      const { appointment_id, rating, comment, category_id, is_anonymous } = req.body;
      const patient_id = req.user.userId;

      // Check if appointment exists and belongs to the patient
      const appointmentCheck = await pool.query(
        `SELECT id, doctor_id FROM appointments 
         WHERE id = $1 AND patient_id = $2 AND status = 'completed'`,
        [appointment_id, patient_id]
      );

      if (appointmentCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Appointment not found or not completed'
        });
      }

      const doctor_id = appointmentCheck.rows[0].doctor_id;

      // Check if feedback already exists for this appointment
      const existingFeedback = await pool.query(
        'SELECT id FROM feedback WHERE appointment_id = $1',
        [appointment_id]
      );

      if (existingFeedback.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Feedback already submitted for this appointment'
        });
      }

      // Insert feedback
      const newFeedback = await pool.query(
        `INSERT INTO feedback 
         (appointment_id, patient_id, doctor_id, rating, comment, category_id, is_anonymous)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [appointment_id, patient_id, doctor_id, rating, comment, category_id, is_anonymous || false]
      );

      // Update doctor ratings summary
      await updateDoctorRatings(doctor_id);

      res.status(201).json({
        success: true,
        message: 'Feedback submitted successfully',
        data: newFeedback.rows[0]
      });

    } catch (error) {
      console.error('Submit feedback error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to submit feedback'
      });
    }
  },

  // Get feedback for a doctor
  getDoctorFeedback: async (req, res) => {
    try {
      const { doctorId } = req.params;
      const { page = 1, limit = 10, rating } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT f.*, u.name as patient_name, fc.name as category_name
        FROM feedback f
        LEFT JOIN users u ON f.patient_id = u.id
        LEFT JOIN feedback_categories fc ON f.category_id = fc.id
        WHERE f.doctor_id = $1 AND f.status = 'approved'
      `;
      
      let queryParams = [doctorId];
      let paramCount = 1;

      if (rating) {
        paramCount++;
        query += ` AND f.rating = $${paramCount}`;
        queryParams.push(rating);
      }

      query += ` ORDER BY f.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      queryParams.push(limit, offset);

      const feedbackResult = await pool.query(query, queryParams);

      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) FROM feedback WHERE doctor_id = $1 AND status = \'approved\'';
      let countParams = [doctorId];

      if (rating) {
        countQuery += ' AND rating = $2';
        countParams.push(rating);
      }

      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      res.status(200).json({
        success: true,
        data: {
          feedback: feedbackResult.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get doctor feedback error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch feedback'
      });
    }
  },

  // Get doctor rating summary
  getDoctorRatingSummary: async (req, res) => {
    try {
      const { doctorId } = req.params;

      const ratingSummary = await pool.query(
        'SELECT * FROM doctor_ratings WHERE doctor_id = $1',
        [doctorId]
      );

      if (ratingSummary.rows.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            average_rating: 0,
            total_ratings: 0,
            rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
          }
        });
      }

      const summary = ratingSummary.rows[0];
      const ratingDistribution = {
        1: summary.rating_1,
        2: summary.rating_2,
        3: summary.rating_3,
        4: summary.rating_4,
        5: summary.rating_5
      };

      res.status(200).json({
        success: true,
        data: {
          average_rating: parseFloat(summary.average_rating),
          total_ratings: summary.total_ratings,
          rating_distribution: ratingDistribution
        }
      });

    } catch (error) {
      console.error('Get doctor rating summary error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch rating summary'
      });
    }
  },

  // Admin: Get all feedback (with filtering)
  getAllFeedback: async (req, res) => {
    try {
      const { page = 1, limit = 20, status, doctor_id, rating } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT f.*, 
               p.name as patient_name, 
               d.name as doctor_name,
               fc.name as category_name
        FROM feedback f
        LEFT JOIN users p ON f.patient_id = p.id
        LEFT JOIN users d ON f.doctor_id = d.id
        LEFT JOIN feedback_categories fc ON f.category_id = fc.id
        WHERE 1=1
      `;
      
      let queryParams = [];
      let paramCount = 0;

      if (status) {
        paramCount++;
        query += ` AND f.status = $${paramCount}`;
        queryParams.push(status);
      }

      if (doctor_id) {
        paramCount++;
        query += ` AND f.doctor_id = $${paramCount}`;
        queryParams.push(doctor_id);
      }

      if (rating) {
        paramCount++;
        query += ` AND f.rating = $${paramCount}`;
        queryParams.push(rating);
      }

      query += ` ORDER BY f.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      queryParams.push(limit, offset);

      const feedbackResult = await pool.query(query, queryParams);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM feedback f WHERE 1=1';
      let countParams = [];

      if (status) {
        countParams.push(status);
        countQuery += ` AND f.status = $${countParams.length}`;
      }

      if (doctor_id) {
        countParams.push(doctor_id);
        countQuery += ` AND f.doctor_id = $${countParams.length}`;
      }

      if (rating) {
        countParams.push(rating);
        countQuery += ` AND f.rating = $${countParams.length}`;
      }

      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      res.status(200).json({
        success: true,
        data: {
          feedback: feedbackResult.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get all feedback error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch feedback'
      });
    }
  },

  // Admin: Update feedback status
  updateFeedbackStatus: async (req, res) => {
    try {
      const { feedbackId } = req.params;
      const { status } = req.body;

      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status'
        });
      }

      const updatedFeedback = await pool.query(
        'UPDATE feedback SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [status, feedbackId]
      );

      if (updatedFeedback.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Feedback not found'
        });
      }

      // If approving feedback, update doctor ratings
      if (status === 'approved') {
        await updateDoctorRatings(updatedFeedback.rows[0].doctor_id);
      }

      res.status(200).json({
        success: true,
        message: 'Feedback status updated successfully',
        data: updatedFeedback.rows[0]
      });

    } catch (error) {
      console.error('Update feedback status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update feedback status'
      });
    }
  }
};

// Helper function to update doctor ratings
async function updateDoctorRatings(doctor_id) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Calculate new ratings
    const ratingsResult = await client.query(
      `SELECT 
        COUNT(*) as total_ratings,
        AVG(rating) as average_rating,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as rating_1,
        SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as rating_2,
        SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as rating_3,
        SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as rating_4,
        SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as rating_5
       FROM feedback 
       WHERE doctor_id = $1 AND status = 'approved'`,
      [doctor_id]
    );

    const { total_ratings, average_rating, rating_1, rating_2, rating_3, rating_4, rating_5 } = ratingsResult.rows[0];

    // Update or insert into doctor_ratings table
    await client.query(
      `INSERT INTO doctor_ratings 
       (doctor_id, average_rating, total_ratings, rating_1, rating_2, rating_3, rating_4, rating_5)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (doctor_id) 
       DO UPDATE SET 
         average_rating = EXCLUDED.average_rating,
         total_ratings = EXCLUDED.total_ratings,
         rating_1 = EXCLUDED.rating_1,
         rating_2 = EXCLUDED.rating_2,
         rating_3 = EXCLUDED.rating_3,
         rating_4 = EXCLUDED.rating_4,
         rating_5 = EXCLUDED.rating_5,
         updated_at = CURRENT_TIMESTAMP`,
      [doctor_id, average_rating, total_ratings, rating_1, rating_2, rating_3, rating_4, rating_5]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update doctor ratings error:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = feedbackController;