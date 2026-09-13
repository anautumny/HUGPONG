// ══════════════════════════════════════════════════════════════
// HUGPONG — Canonical Block Farm Registry API
// ══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');

// ── GET /api/block-farms ─────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let blockFarms = [];
    if (db) {
      const snap = await db.collection('block_farms').get();
      if (!snap.empty) {
        snap.forEach(docSnap => blockFarms.push({ id: docSnap.id, ...docSnap.data() }));
      }
    }
    return res.json({ success: true, count: blockFarms.length, data: blockFarms });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/block-farms (SRA Admin / Super Admin) ──────────
router.post('/', requireAuth, requireRole(['sra (admin)', 'super admin', 'admin']), async (req, res) => {
  const { id, code, name, location, farmManagerId, farmManagerName, declaredHa } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, error: 'Block farm name is required.' });
  }

  const cleanName = String(name).trim();
  const slug = cleanName.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'BLK';
  const blockFarmId = id || `BLK-${slug}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const blockCode = code || `BF-${slug}`;

  const payload = {
    id: blockFarmId,
    code: blockCode,
    name: cleanName,
    location: location ? String(location).trim() : 'Silay City, Negros Occidental',
    farmManagerId: farmManagerId ? String(farmManagerId).trim() : '',
    farmManagerName: farmManagerName ? String(farmManagerName).trim() : '',
    declaredHa: Number(declaredHa) || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    if (db) {
      await db.collection('block_farms').doc(blockFarmId).set(payload, { merge: true });

      // 2-Way Synchronization: If a Farm Manager was assigned, update their user document
      if (payload.farmManagerId) {
        const mgrRef = db.collection('users').doc(payload.farmManagerId);
        const mgrDoc = await mgrRef.get();
        if (mgrDoc.exists) {
          await mgrRef.set({
            blockFarm: cleanName,
            blockFarmId: blockFarmId,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      }
    }
    console.log(`[HUGPONG Block Farms] Block Farm Created: ${blockFarmId} (${cleanName})`);
    return res.json({ success: true, data: payload });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/block-farms/:id (Assign Manager / Update Details) ─
router.put('/:id', requireAuth, requireRole(['sra (admin)', 'super admin', 'admin']), async (req, res) => {
  const { id } = req.params;
  const { name, location, farmManagerId, farmManagerName, declaredHa } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Block farm ID is required.' });
  }

  try {
    let updatedPayload = {
      updatedAt: new Date().toISOString()
    };
    if (name) updatedPayload.name = String(name).trim();
    if (location !== undefined) updatedPayload.location = String(location).trim();
    if (farmManagerId !== undefined) updatedPayload.farmManagerId = String(farmManagerId).trim();
    if (farmManagerName !== undefined) updatedPayload.farmManagerName = String(farmManagerName).trim();
    if (declaredHa !== undefined) updatedPayload.declaredHa = Number(declaredHa) || 0;

    if (db) {
      await db.collection('block_farms').doc(id).set(updatedPayload, { merge: true });

      // Symmetrical sync: If manager changed, update the user doc
      if (updatedPayload.farmManagerId) {
        const mgrRef = db.collection('users').doc(updatedPayload.farmManagerId);
        const mgrDoc = await mgrRef.get();
        if (mgrDoc.exists) {
          await mgrRef.set({
            blockFarm: updatedPayload.name || id,
            blockFarmId: id,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      }
    }

    console.log(`[HUGPONG Block Farms] Block Farm Updated: ${id}`);
    return res.json({ success: true, data: { id, ...updatedPayload } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
