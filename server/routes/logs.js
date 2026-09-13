// ══════════════════════════════════════════════════════════════
// HUGPONG — Operation Logs & Certification API
// ══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');

// ── GET /api/logs ────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let logs = [];
    if (db) {
      const snap = await db.collection('operation_logs').get();
      if (!snap.empty) {
        snap.forEach(docSnap => logs.push({ id: docSnap.id, ...docSnap.data() }));
      }
    }
    return res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/logs (Create/Submit Operation Log) ───────────
router.post('/', async (req, res) => {
  const logData = req.body;
  if (!logData || !logData.fieldId) {
    return res.status(400).json({ success: false, error: 'Field ID and log details are required.' });
  }

  const cleanFieldId = String(logData.fieldId).trim().toUpperCase();
  const logId = logData.id || `LOG-${cleanFieldId.replace(/[^A-Z0-9]/g, '')}-${Date.now().toString(36).toUpperCase()}`;
  const totalCostVal = Number(logData.totalCost !== undefined ? logData.totalCost : (logData.cost !== undefined ? logData.cost : 0));
  
  const logPayload = {
    ...logData,
    id: logId,
    fieldId: cleanFieldId,
    cost: totalCostVal,
    totalCost: totalCostVal,
    hectares: logData.hectares !== undefined ? Number(logData.hectares) : 1.5,
    people: String(logData.people || '2'),
    activity: String(logData.activity || logData.operationName || 'Operation Log').trim(),
    operationName: String(logData.operationName || logData.activity || 'Operation Log').trim(),
    sraOperationId: logData.sraOperationId || 'CUSTOM',
    category: logData.category || 'prep',
    isCustom: Boolean(logData.isCustom || String(logData.sraOperationId || '').includes('COP') || logData.sraOperationId === 'CUSTOM'),
    isGroup: Boolean(logData.isGroup),
    subItems: Array.isArray(logData.subItems) ? logData.subItems : [],
    loggedById: logData.loggedById || (req.session?.user ? req.session.user.employeeId : ''),
    status: logData.status || 'Recorded',
    synced: true,
    syncedAt: new Date().toISOString(),
    createdAt: logData.createdAt || new Date().toISOString()
  };

  try {
    if (db) {
      await db.collection('operation_logs').doc(logId).set(logPayload, { merge: true });
    }
    console.log(`[HUGPONG Logs] Log Recorded in Database: ${logId} (${logPayload.activity}) for Field ${cleanFieldId}`);
    return res.json({ success: true, data: logPayload });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/logs/certify (Managers & SRA Admins) ───────────
router.post('/certify', requireAuth, requireRole(['farm manager', 'sra (admin)', 'super admin']), async (req, res) => {
  const { logId, status, notes } = req.body;

  if (!logId) {
    return res.status(400).json({ success: false, error: 'Log ID is required.' });
  }

  const certificationPayload = {
    status: status || 'Certified',
    certifiedBy: req.session.user ? req.session.user.name : 'Authorized Officer',
    certifiedAt: new Date().toISOString(),
    notes: notes || 'Verified and approved in operations review'
  };

  try {
    if (db) {
      await db.collection('operation_logs').doc(logId).set(certificationPayload, { merge: true });
    }
// ── DELETE /api/logs/:id (Delete/Void Operation Log) ───────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ success: false, error: 'Log ID is required.' });
  }

  try {
    if (db) {
      await db.collection('operation_logs').doc(id).delete();
    }
    console.log(`[HUGPONG Logs] Log Deleted from Database: ${id}`);
    return res.json({ success: true, message: `Log ${id} deleted successfully.`, id });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/logs/past/purge (Purge Past Cycles) ─────────
router.post('/purge-past', async (req, res) => {
  const { fieldId } = req.body || {};
  try {
    if (db) {
      const snap = await db.collection('operation_logs').get();
      const batch = db.batch();
      let count = 0;
      snap.forEach(docSnap => {
        const data = docSnap.data();
        const matchesField = !fieldId || fieldId === 'ALL' || (data.fieldId || '').trim().toUpperCase() === fieldId.trim().toUpperCase();
        const isPast = data.isPastCycle === true || data.isArchived === true || data.status === 'Archived' || docSnap.id.startsWith('PAST-');
        if (matchesField && isPast) {
          batch.delete(docSnap.ref);
          count++;
        }
      });
      if (count > 0) {
        await batch.commit();
      }
      console.log(`[HUGPONG Logs] Purged ${count} past cycle logs from Database.`);
      return res.json({ success: true, count, message: `Successfully purged ${count} past cycle logs.` });
    }
    return res.json({ success: true, count: 0 });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
