const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { createPaymentForAppointment, handleStripeEvent } = require('../services/paymentService');
const crypto = require('crypto');

router.post('/intent', authenticateToken, [
  body('appointmentId').isInt({ min: 1 }).withMessage('appointmentId is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const { appointmentId } = req.body;
    const result = await createPaymentForAppointment(appointmentId, req.user.id);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Stripe webhook endpoint (raw body recommended in production)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    let event = req.body;
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (endpointSecret && require('stripe') && process.env.STRIPE_SECRET_KEY) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    }

    await handleStripeEvent(event);
    res.json({ received: true });
  } catch (e) {
    console.error('Webhook error:', e);
    res.status(400).send('Webhook error');
  }
});

// Get payment status for an appointment
router.get('/status/:appointmentId', authenticateToken, async (req, res, next) => {
  try {
    const appointmentId = parseInt(req.params.appointmentId, 10);
    if (Number.isNaN(appointmentId)) {
      return res.status(400).json({ success: false, error: 'Invalid appointmentId' });
    }
    // Light touch: read appointment and status
    const result = await require('../db/db').query('SELECT id, status FROM appointments WHERE id = $1', [appointmentId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }
    res.json({ success: true, appointment: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;


