// ══════════════════════════════════════════════════════════════
// HUGPONG — Field Plot Registry API
// ══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');

// ── GET /api/fields ──────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let fields = [];
    if (db) {
      const snap = await db.collection('fields').get();
      if (!snap.empty) {
        snap.forEach(docSnap => fields.push({ id: docSnap.id, ...docSnap.data() }));
      }
    }
    return res.json({ success: true, count: fields.length, data: fields });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/fields (Managers & Admins) ──────────────────────
router.post('/', requireAuth, requireRole(['farm manager', 'super admin', 'admin']), async (req, res) => {
  const {
    id,
    memberId,
    memberName,
    member,
    memberContact,
    blockFarmId,
    ha,
    stage,
    stageNumber,
    blockFarm,
    customStages,
    customOperations,
    variety,
    soilType,
    cycleType,
    cropYear,
    month,
    batchMonth
  } = req.body;

  if (!id || typeof id !== 'string' || !id.trim()) {
    return res.status(400).json({ success: false, error: 'Validation Error: Field ID is required.' });
  }
  const cleanId = String(id).trim().toUpperCase();
  if (!/^[A-Za-z0-9_-]{3,25}$/.test(cleanId)) {
    return res.status(400).json({ success: false, error: 'Validation Error: Field ID must be 3-25 alphanumeric characters (e.g., FLD-NCY-006).' });
  }

  const parsedHa = Number(ha);
  if (isNaN(parsedHa) || parsedHa <= 0 || parsedHa > 500) {
    return res.status(400).json({ success: false, error: 'Validation Error: Hectares must be a positive number between 0.01 and 500.' });
  }

  const sessionUser = req.session ? req.session.user : null;
  const isManager = sessionUser && String(sessionUser.role || '').toLowerCase().includes('manager');
  const isSuperAdmin = sessionUser && String(sessionUser.role || '').toLowerCase().includes('super');
  const isSRAAdmin = sessionUser && (String(sessionUser.role || '').toLowerCase().includes('sra') || (String(sessionUser.role || '').toLowerCase().includes('admin') && !isManager));

  if (isManager && !isSuperAdmin && !isSRAAdmin) {
    const mgrFarm = (sessionUser.blockFarm || '').trim().toLowerCase();
    const reqFarm = (blockFarm || '').trim().toLowerCase();
    if (mgrFarm && reqFarm && mgrFarm !== reqFarm) {
      return res.status(403).json({
        success: false,
        error: `Permission Denied: Farm Managers are restricted to their assigned block farm (${sessionUser.blockFarm}).`
      });
    }
  }

  const assignedBlockFarm = (isManager && !isSuperAdmin && !isSRAAdmin && sessionUser?.blockFarm) 
    ? sessionUser.blockFarm 
    : (blockFarm || '');

  const fieldPayload = {
    id: cleanId,
    blockFarmId: blockFarmId || '',
    blockFarm: assignedBlockFarm,
    memberId: memberId || '',
    memberName: memberName || member || 'Assigned Member',
    member: memberName || member || 'Assigned Member',
    memberContact: memberContact || '',
    ha: parsedHa,
    stage: stage || 'Pre-Planting & Land Preparation',
    stageNumber: stageNumber !== undefined ? Number(stageNumber) : 1,
    variety: variety || 'VMC 84-524',
    soilType: soilType || 'Clay Loam',
    cycleType: cycleType || 'Plant Cane (New Plant)',
    cropYear: cropYear || 'CY 2025–2026',
    month: month !== undefined ? Number(month) : 0.5,
    batchMonth: batchMonth !== undefined ? Number(batchMonth) : 1,
    customStages: Array.isArray(customStages) ? customStages : [],
    customOperations: (customOperations && typeof customOperations === 'object') ? customOperations : {},
    synced: true,
    lastSync: 'Just now',
    updatedAt: new Date().toISOString()
  };

  try {
    if (db) {
      await db.collection('fields').doc(cleanId).set(fieldPayload, { merge: true });
    }
    console.log(`[HUGPONG Fields] Field Saved: ${cleanId} (${fieldPayload.stage}) with ${Object.keys(fieldPayload.customOperations).length} stage custom operation sets`);
    return res.json({ success: true, data: fieldPayload });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/fields/:id/custom-operations ─────────────────────
router.put('/:id/custom-operations', requireAuth, async (req, res) => {
  const fieldId = String(req.params.id || '').trim().toUpperCase();
  const { customOperations, stageNumber, operations } = req.body;

  if (!fieldId) {
    return res.status(400).json({ success: false, error: 'Field ID is required.' });
  }

  try {
    let updatedOps = {};
    if (db) {
      const fieldDoc = await db.collection('fields').doc(fieldId).get();
      const existingData = fieldDoc.exists ? fieldDoc.data() : {};
      updatedOps = { ...(existingData.customOperations || {}) };

      if (customOperations && typeof customOperations === 'object') {
        updatedOps = { ...updatedOps, ...customOperations };
      } else if (stageNumber !== undefined && Array.isArray(operations)) {
        updatedOps[stageNumber] = operations;
      }

      await db.collection('fields').doc(fieldId).set({
        customOperations: updatedOps,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
    console.log(`[HUGPONG Fields] Custom Operations persisted for ${fieldId}`);
    return res.json({ success: true, fieldId, customOperations: updatedOps });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/fields/:id/custom-stages ─────────────────────────
router.put('/:id/custom-stages', requireAuth, async (req, res) => {
  const fieldId = String(req.params.id || '').trim().toUpperCase();
  const { customStages } = req.body;

  if (!fieldId || !Array.isArray(customStages)) {
    return res.status(400).json({ success: false, error: 'Field ID and valid customStages array required.' });
  }

  try {
    if (db) {
      await db.collection('fields').doc(fieldId).set({
        customStages,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
    console.log(`[HUGPONG Fields] Custom Stages persisted for ${fieldId}`);
    return res.json({ success: true, fieldId, customStages });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
