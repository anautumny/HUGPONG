'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { smsProvider, semaphoreApiKey, semaphoreSenderName } = require('../config');
const { sendSms } = require('../services/smsGateway');
const { db } = require('../firebase-admin');
const { COLLECTIONS, ROLES } = require('../schema/firestoreSchema');
const { createRateLimit } = require('../middleware/rateLimit');

const alertRateLimit = createRateLimit({ name: 'sms-alert', max: 10, windowMs: 60 * 60 * 1000 });
const ALERT_TEMPLATES = Object.freeze({
  ACCOUNT_ATTENTION: name => `Hello ${name}, your HUGPONG account needs attention. Please sign in or contact system support.`,
  SUPPORT_UPDATE: name => `Hello ${name}, your HUGPONG support request has an update. Please sign in to review it.`
});

router.post('/send-alert', requireAuth, requireRole([ROLES.SUPER_ADMIN]), alertRateLimit, async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').replace(/\D/g, '');
    const template = String(req.body?.template || '').trim().toUpperCase();
    if (!/^09\d{9}$/.test(phone) || !ALERT_TEMPLATES[template]) {
      return res.status(400).json({ success: false, error: 'A valid account phone and approved alert template are required.' });
    }
    if (!db) return res.status(503).json({ success: false, error: 'Account database is unavailable.' });
    const recipient = await db.collection(COLLECTIONS.USERS).where('phone', '==', phone).limit(1).get();
    if (recipient.empty || recipient.docs[0].data().status !== 'ACTIVE') {
      return res.status(404).json({ success: false, error: 'An active HUGPONG account was not found for that phone.' });
    }
    const account = recipient.docs[0].data();
    const smsResult = await sendSms(phone, `[HUGPONG] ${ALERT_TEMPLATES[template](account.displayName || 'User')}`);
    if (!smsResult.success) return res.status(502).json({ success: false, error: 'SMS delivery failed.' });
    return res.json({ success: true, providerAccepted: true });
  } catch (error) {
    res.locals.diagnosticError = error;
    const status = error.code === 'SMS_NOT_CONFIGURED' ? 503 : 500;
    return res.status(status).json({ success: false, error: status === 503 ? 'SMS gateway is not configured.' : 'SMS delivery failed.' });
  }
});

router.get('/status', requireAuth, requireRole([ROLES.SUPER_ADMIN]), (req, res) => {
  res.json({
    gateway: smsProvider,
    configured: smsProvider === 'console' || Boolean(semaphoreApiKey),
    sender: semaphoreSenderName
  });
});

module.exports = router;
