// ══════════════════════════════════════════════════════════════
// HUGPONG — Support & Issue Ticketing API
// ══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');

// ── GET /api/tickets ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let tickets = [];
    if (db) {
      const snap = await db.collection('support_tickets').get();
      if (!snap.empty) {
        snap.forEach(docSnap => tickets.push({ id: docSnap.id, ...docSnap.data() }));
      }
    }
    return res.json({ success: true, count: tickets.length, data: tickets });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/tickets (Create ticket) ────────────────────────
router.post('/', async (req, res) => {
  const { title, author, blockFarm, category, priority, details } = req.body;

  if (!title) {
    return res.status(400).json({ success: false, error: 'Ticket title is required.' });
  }

  const ticketId = req.body.id || `TCK-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
  const ticketPayload = {
    id: ticketId,
    title,
    author: author || (req.session && req.session.user ? req.session.user.name : 'Mobile User'),
    blockFarm: blockFarm || (req.session && req.session.user ? req.session.user.blockFarm || '' : ''),
    category: category || 'General Support',
    priority: priority || 'Normal',
    status: 'Open',
    date: new Date().toISOString().split('T')[0],
    details: details || '',
    createdAt: new Date().toISOString()
  };

  try {
    if (db) {
      await db.collection('support_tickets').doc(ticketId).set(ticketPayload);
    }
    console.log(`[HUGPONG Tickets] Support Ticket Filed: ${ticketId} - ${title}`);
    return res.json({ success: true, data: ticketPayload });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
