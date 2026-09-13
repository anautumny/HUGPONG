// ══════════════════════════════════════════════════════════════
// HUGPONG Backend — SMS Gateway Route (Semaphore API)
// ══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const https = require('https');

const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY || '3c06020773b17e7d84a2260cb2143bdd';
const SEMAPHORE_SENDER_NAME = process.env.SEMAPHORE_SENDER_NAME || 'SEMAPHORE';

/**
 * Helper to dispatch SMS via Semaphore REST API
 */
function sendSemaphoreSms(number, message) {
  return new Promise((resolve, reject) => {
    // Standardize number format to 09XXXXXXXXX or 639XXXXXXXXX
    let cleanNumber = String(number).replace(/[^0-9]/g, '');
    if (cleanNumber.startsWith('63')) {
      cleanNumber = '0' + cleanNumber.slice(2);
    }

    const payload = JSON.stringify({
      apikey: SEMAPHORE_API_KEY,
      number: cleanNumber,
      message: message,
      sendername: SEMAPHORE_SENDER_NAME
    });

    const req = https.request({
      hostname: 'api.semaphore.co',
      path: '/api/v4/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(resData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, data: parsed });
          } else {
            resolve({ 
              success: false, 
              status: res.statusCode, 
              error: parsed.message || resData 
            });
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, raw: resData });
          } else {
            resolve({ 
              success: false, 
              status: res.statusCode, 
              error: resData 
            });
          }
        }
      });
    });

    req.on('error', err => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * POST /api/sms/send-otp
 * Body: { phone, otp, name }
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { phone, otp, name } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, error: 'Phone number and OTP code are required.' });
    }

    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    const greeting = name ? `Hello ${name}, ` : '';
    const message = `🌾 [HUGPONG] ${greeting}Your security verification code is ${otp}. Valid for 5 minutes. Do not share this code.`;

    console.log(`[HUGPONG SMS Gateway] Dispatching OTP to ${cleanPhone} via Semaphore...`);
    const smsResult = await sendSemaphoreSms(cleanPhone, message);

    if (smsResult.success) {
      console.log(`[HUGPONG SMS Gateway] SMS successfully delivered to ${cleanPhone}:`, smsResult.data);
      return res.json({
        success: true,
        channel: 'semaphore_sms',
        phone: cleanPhone,
        message: 'SMS verification code dispatched successfully.',
        data: smsResult.data
      });
    } else {
      console.warn(`[HUGPONG SMS Gateway] Semaphore notice (${smsResult.status}):`, smsResult.error);
      return res.json({
        success: false,
        channel: 'simulation_fallback',
        phone: cleanPhone,
        otp: otp, // Local fallback so user is never locked out
        status: smsResult.status,
        notice: smsResult.error || 'Semaphore account pending approval or insufficient credits.'
      });
    }
  } catch (error) {
    console.error('[HUGPONG SMS Gateway Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/sms/send-alert
 * Body: { phone, message }
 */
router.post('/send-alert', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Phone and message are required.' });
    }

    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    const smsResult = await sendSemaphoreSms(cleanPhone, `🌾 [HUGPONG Alert] ${message}`);
    res.json(smsResult);
  } catch (error) {
    console.error('[HUGPONG SMS Alert Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sms/status
 */
router.get('/status', (req, res) => {
  res.json({
    gateway: 'Semaphore Philippines (api.semaphore.co)',
    configuredKey: SEMAPHORE_API_KEY ? '3c06...3bdd' : 'Not configured',
    sender: SEMAPHORE_SENDER_NAME
  });
});

module.exports = router;
