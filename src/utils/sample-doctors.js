const pool = require('../db/db');

const populateSampleDoctors = async () => {
  try {
    // First create sample users for doctors
    const users = await pool.query(`
      INSERT INTO users (email, password_hash, name, contact_number, verified) 
      VALUES 
        ('dr.smith@hospital.com', '$2b$10$examplehash', 'Dr. John Smith', '+1234567890', true),
        ('dr.jones@clinic.com', '$2b$10$examplehash', 'Dr. Sarah Jones', '+1234567891', true),
        ('dr.wang@medical.com', '$2b$10$examplehash', 'Dr. Mei Wang', '+1234567892', true)
      RETURNING id
    `);

    // Then create doctors
    await pool.query(`
      INSERT INTO doctors (user_id, specialty, experience, license_number, verified, consultation_fee, languages, rating)
      VALUES 
        (${users.rows[0].id}, 'Cardiology', 15, 'CARD12345', true, 150.00, '{"English","Spanish"}', 4.8),
        (${users.rows[1].id}, 'Pediatrics', 8, 'PED67890', true, 120.00, '{"English","French"}', 4.6),
        (${users.rows[2].id}, 'Dermatology', 12, 'DER54321', true, 135.00, '{"English","Mandarin"}', 4.9)
    `);

    console.log('✅ Sample doctors created');
  } catch (error) {
    console.error('Error creating sample doctors:', error);
  }
};

const populateSampleAvailability = async () => {
  try {
    // Get doctor IDs
    const doctors = await pool.query('SELECT id FROM doctors');
    
    // Create availability for each doctor (Monday-Friday, 9AM-5PM)
    for (const doctor of doctors.rows) {
      for (let day = 1; day <= 5; day++) { // Monday to Friday
        await pool.query(`
          INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time)
          VALUES ($1, $2, $3, $4)
        `, [doctor.id, day, '09:00:00', '17:00:00']);
      }
    }
    
    console.log('✅ Sample availability created');
  } catch (error) {
    console.error('Error creating sample availability:', error);
  }
};

// Run if this file is executed directly
if (require.main === module) {
  (async () => {
    await populateSampleDoctors();
    await populateSampleAvailability();
  })();
}

module.exports = { populateSampleDoctors, populateSampleAvailability };