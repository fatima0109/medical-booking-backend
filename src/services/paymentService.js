const Redis = require('ioredis');
const pool = require('../db/db');

let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    // Lazy require to avoid dependency when not installed
    // eslint-disable-next-line global-require
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
} catch (e) {
  console.warn('Stripe not available, running in mock mode.');
}

// Storage for payment metadata (prod: Redis, dev: in-memory)
let storage;
if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL) {
  const redis = new Redis(process.env.REDIS_URL);
  storage = {
    async set(key, value, ttlSeconds = 7 * 24 * 60 * 60) {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    },
    async get(key) {
      const val = await redis.get(key);
      return val ? JSON.parse(val) : null;
    },
    async del(key) {
      await redis.del(key);
    }
  };
} else {
  const map = new Map();
  storage = {
    async set(key, value, ttlSeconds = 7 * 24 * 60 * 60) {
      map.set(key, value);
      setTimeout(() => map.delete(key), ttlSeconds * 1000);
    },
    async get(key) {
      return map.get(key) || null;
    },
    async del(key) {
      map.delete(key);
    }
  };
}

function cents(amount) {
  return Math.round(Number(amount) * 100);
}

async function getAppointmentWithFee(appointmentId) {
  const result = await pool.query(
    `SELECT a.id, a.patient_id, a.doctor_id, a.status, a.appointment_date, a.start_time,
            d.consultation_fee
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     WHERE a.id = $1`,
    [appointmentId]
  );
  return result.rows[0] || null;
}

async function createPaymentForAppointment(appointmentId, userId) {
  const appt = await getAppointmentWithFee(appointmentId);
  if (!appt) {
    throw new Error('Appointment not found');
  }
  if (appt.patient_id !== userId) {
    throw new Error('Not authorized for this appointment');
  }
  if (appt.status !== 'pending_payment') {
    throw new Error('Appointment is not awaiting payment');
  }

  const amountCents = cents(appt.consultation_fee || 0);
  if (!amountCents || amountCents < 50) {
    throw new Error('Invalid consultation fee');
  }

  const metadata = { appointmentId: String(appointmentId), doctorId: String(appt.doctor_id), patientId: String(appt.patient_id) };

  if (stripe) {
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: process.env.STRIPE_CURRENCY || 'usd',
      metadata
    });

    await storage.set(`pay:${appointmentId}`, {
      appointmentId,
      paymentIntentId: intent.id,
      amount: amountCents,
      currency: process.env.STRIPE_CURRENCY || 'usd',
      status: 'created',
      createdAt: new Date().toISOString()
    });

    return { provider: 'stripe', clientSecret: intent.client_secret, paymentIntentId: intent.id };
  }

  // Mock mode
  const mockId = `pi_mock_${appointmentId}_${Date.now()}`;
  await storage.set(`pay:${appointmentId}`, {
    appointmentId,
    paymentIntentId: mockId,
    amount: amountCents,
    currency: 'usd',
    status: 'succeeded',
    createdAt: new Date().toISOString()
  });
  // Immediately confirm appointment in mock mode
  await pool.query(
    `UPDATE appointments SET status = 'scheduled', updated_at = NOW() WHERE id = $1 AND status = 'pending_payment'`,
    [appointmentId]
  );
  return { provider: 'mock', clientSecret: `secret_${mockId}`, paymentIntentId: mockId };
}

async function handleStripeEvent(event) {
  if (!stripe) return; // Ignore when not using Stripe
  const type = event.type;
  const intent = event.data.object;
  if (!intent || !intent.metadata) return;
  const appointmentId = intent.metadata.appointmentId;
  if (!appointmentId) return;

  const key = `pay:${appointmentId}`;
  const current = (await storage.get(key)) || {};
  if (type === 'payment_intent.succeeded') {
    current.status = 'succeeded';
    current.paymentIntentId = intent.id;
    await storage.set(key, current);
    // Confirm the appointment now that payment succeeded
    await pool.query(
      `UPDATE appointments SET status = 'scheduled', updated_at = NOW() WHERE id = $1 AND status = 'pending_payment'`,
      [appointmentId]
    );
  } else if (type === 'payment_intent.payment_failed') {
    current.status = 'failed';
    await storage.set(key, current);
    // Auto-cancel reservation on failed payment
    await pool.query(
      `UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status = 'pending_payment'`,
      [appointmentId]
    );
  }
}

async function maybeRefund(appointmentId) {
  const key = `pay:${appointmentId}`;
  const record = await storage.get(key);
  if (!record || record.status !== 'succeeded') return { refunded: false, reason: 'no_successful_payment' };
  if (!stripe) return { refunded: false, reason: 'no_provider' };

  try {
    const refund = await stripe.refunds.create({ payment_intent: record.paymentIntentId });
    record.status = 'refunded';
    record.refundId = refund.id;
    record.refundedAt = new Date().toISOString();
    await storage.set(key, record);
    return { refunded: true, refundId: refund.id };
  } catch (e) {
    return { refunded: false, reason: e.message };
  }
}

module.exports = {
  createPaymentForAppointment,
  handleStripeEvent,
  maybeRefund
};


