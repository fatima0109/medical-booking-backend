const pool = require('../db/db');

const setupDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create tables in correct order to respect foreign key dependencies
    await client.query(`
  -- Users table (should be created first as it's referenced by doctors)
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    phone VARCHAR(20),
    verified BOOLEAN DEFAULT false,
    otp VARCHAR(6), -- ADD THIS
    otp_expiry TIMESTAMP, -- ADD THIS
    otp_resend_attempts INT DEFAULT 0,
    last_otp_resend TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reset_token VARCHAR(255),
    reset_token_expiry TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  );
`);

    await client.query(`
      -- Doctors table (references users)
      CREATE TABLE IF NOT EXISTS doctors (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        specialty VARCHAR(100) NOT NULL,
        experience INTEGER NOT NULL,
        license_number VARCHAR(100) UNIQUE NOT NULL,
        verified BOOLEAN DEFAULT FALSE,
        consultation_fee DECIMAL(10,2) NOT NULL,
        languages TEXT[] DEFAULT '{"English"}',
        rating DECIMAL(3,2) DEFAULT 0.0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      -- Doctor Availability Table
      CREATE TABLE IF NOT EXISTS doctor_availability (
        id SERIAL PRIMARY KEY,
        doctor_id INTEGER REFERENCES doctors(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        is_available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(doctor_id, day_of_week)
      );
    `);

    await client.query(`
      -- Appointments Table (with double-booking prevention)
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        doctor_id INTEGER REFERENCES doctors(id) ON DELETE CASCADE,
        appointment_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no-show')),
        consultation_type VARCHAR(20) DEFAULT 'video' CHECK (consultation_type IN ('video', 'voice', 'chat')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(doctor_id, appointment_date, start_time), -- Prevent double-booking
        queue_position INT,
        estimated_wait_time INTERVAL,
        check_in_time TIMESTAMP,
        called_time TIMESTAMP,
        completed_time TIMESTAMP,
        notification_sent BOOLEAN DEFAULT false,
        notification_sent_at TIMESTAMP
      );
    `);

    await client.query(`
      -- Doctor Reviews Table
      CREATE TABLE IF NOT EXISTS doctor_reviews (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        doctor_id INTEGER REFERENCES doctors(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(patient_id, doctor_id)
      );
    `);

    await client.query(`
      -- Notification Errors Table
      CREATE TABLE IF NOT EXISTS notification_errors (
        id SERIAL PRIMARY KEY,
        appointment_id INTEGER REFERENCES appointments(id),
        user_id INTEGER REFERENCES users(id),
        error_type VARCHAR(50) NOT NULL,
        error_message TEXT,
        context JSONB,
        retry_count INTEGER DEFAULT 0,
        last_attempt TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(appointment_id, error_type)
      );
    `);

    await client.query(`
      -- Job Errors Table
      CREATE TABLE IF NOT EXISTS job_errors (
        id SERIAL PRIMARY KEY,
        job_name VARCHAR(100) NOT NULL,
        error_message TEXT,
        stack_trace TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      -- Notifications Table (if not already exists)
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'info',
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        related_entity_type VARCHAR(50),
        related_entity_id INTEGER
      );
    `);

    await client.query(`
      -- Feedback categories table
      CREATE TABLE feedback_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      -- Feedback table
CREATE TABLE feedback (
    id SERIAL PRIMARY KEY,
    appointment_id INTEGER REFERENCES appointments(id),
    patient_id INTEGER REFERENCES users(id),
    doctor_id INTEGER REFERENCES users(id),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    category_id INTEGER REFERENCES feedback_categories(id),
    is_anonymous BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
    `);

    await client.query(`
      -- Doctor ratings summary table (for quick access)
CREATE TABLE doctor_ratings (
    doctor_id INTEGER PRIMARY KEY REFERENCES users(id),
    average_rating DECIMAL(3,2) DEFAULT 0,
    total_ratings INTEGER DEFAULT 0,
    rating_1 INTEGER DEFAULT 0,
    rating_2 INTEGER DEFAULT 0,
    rating_3 INTEGER DEFAULT 0,
    rating_4 INTEGER DEFAULT 0,
    rating_5 INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
    `);

    await client.query('COMMIT');
    console.log('✅ Database setup completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error setting up database:', err);
    throw err;
  } finally {
    client.release();
  }
};

// Function to add OTP columns if they don't exist
const addOTPColumns = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check and add OTP columns if they don't exist
    const columnsToAdd = [
      { name: 'otp', type: 'VARCHAR(6)' },
      { name: 'otp_expiry', type: 'TIMESTAMP' },
      { name: 'otp_resend_attempts', type: 'INTEGER DEFAULT 0' },
      { name: 'last_otp_resend', type: 'TIMESTAMP' },
      { name: 'verified', type: 'BOOLEAN DEFAULT false' }
    ];

    for (const column of columnsToAdd) {
      const checkResult = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = $1
      `, [column.name]);

      if (checkResult.rows.length === 0) {
        await client.query(`
          ALTER TABLE users ADD COLUMN ${column.name} ${column.type}
        `);
        console.log(`✅ Added ${column.name} column to users table`);
      }
    }

    await client.query('COMMIT');
    console.log('✅ OTP columns verification completed');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding OTP columns:', err);
    throw err;
  } finally {
    client.release();
  }
};


const checkAndAddResetTokenColumns = async () => {
  try {
    const columnsToAdd = [
      { name: 'reset_token', type: 'VARCHAR(255)' },
      { name: 'reset_token_expiry', type: 'TIMESTAMP' }
    ];

    for (const column of columnsToAdd) {
      const checkResult = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = $1
      `, [column.name]);

      if (checkResult.rows.length === 0) {
        await pool.query(`ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`);
        console.log(`✅ Added ${column.name} column to users table`);
      } else {
        console.log(`✅ ${column.name} column already exists`);
      }
    }
  } catch (error) {
    console.error('❌ Error checking/adding reset token columns:', error);
  }
};

// Function to add missing columns to existing tables
const migrateDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Add missing columns to appointments table
    await client.query(`
      DO $$ 
      BEGIN
        -- Add notification_sent_at if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'appointments' AND column_name = 'notification_sent_at') THEN
          ALTER TABLE appointments ADD COLUMN notification_sent_at TIMESTAMP;
        END IF;
        
        -- Add type column to notifications table if it exists
        IF EXISTS (SELECT 1 FROM information_schema.tables 
                  WHERE table_name = 'notifications') THEN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'notifications' AND column_name = 'type') THEN
            ALTER TABLE notifications ADD COLUMN type VARCHAR(20) DEFAULT 'info';
          END IF;
        END IF;
      END $$;
    `);
    
    await client.query('COMMIT');
    console.log('✅ Database migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error migrating database:', err);
    throw err;
  } finally {
    client.release();
  }
};

// Export both functions
module.exports = { setupDatabase, migrateDatabase, addOTPColumns, checkAndAddResetTokenColumns };