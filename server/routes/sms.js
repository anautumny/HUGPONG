'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { semaphoreApiKey, semaphoreSenderName } = require('../config');
const { sendSemaphoreSms } = require('../services/smsGateway');

router.post('/send-alert', requireAuth, async (req, res) => {
  try {
    const { phone, message } = req.body || {};
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Phone and message are required.' });
    }
    const cleanPhone = String(phone).replace(/\D/g, '');
    const smsResult = await sendSemaphoreSms(cleanPhone, `[HUGPONG Alert] ${message}`);
    if (!smsResult.success) return res.status(502).json({ success: false, error: 'SMS delivery failed.' });
    return res.json({ success: true, providerAccepted: true });
  } catch (error) {
    console.error('[HUGPONG SMS Alert Error]', error);
    const status = error.code === 'SMS_NOT_CONFIGURED' ? 503 : 500;
    return res.status(status).json({ success: false, error: status === 503 ? 'SMS gateway is not configured.' : 'SMS delivery failed.' });
  }
});

router.get('/status', requireAuth, (req, res) => {
  res.json({
    gateway: 'Semaphore Philippines (api.semaphore.co)',
    configured: Boolean(semaphoreApiKey),
    sender: semaphoreSenderName
  });
});

module.exports = router;
