const express = require('express');
const router = express.Router();
const { populateSampleDoctors, populateSampleAvailability } = require('../utils/sample-doctors');
const { testEmailConnection } = require('../utils/emailSender');

// Dev-only seeding endpoints
router.post('/seed-doctors', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, error: 'Disabled in production' });
    }
    await populateSampleDoctors();
    await populateSampleAvailability();
    return res.json({ success: true, message: 'Sample doctors and availability created' });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
export default router;

// Health check for email configuration (dev only)
router.get('/email-health', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, error: 'Disabled in production' });
    }
    const ok = await testEmailConnection();
    return res.json({ success: ok });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});


