// ══════════════════════════════════════════════════════════════
// HUGPONG — User Management API
// ══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');

// ── GET /api/users ───────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let users = [];
    if (db) {
      const snap = await db.collection('users').get();
      if (!snap.empty) {
        snap.forEach(docSnap => users.push({ id: docSnap.id, ...docSnap.data() }));
      }
    }
    return res.json({ success: true, count: users.length, data: users });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/users/approve (Super Admin & Managers) ────────
router.post('/approve', requireAuth, requireRole(['super admin', 'farm manager', 'admin']), async (req, res) => {
  const { contact, name, role, blockFarm, blockFarmId, fieldId } = req.body;

  if (!contact) {
    return res.status(400).json({ success: false, error: 'User contact is required.' });
  }

  const sessionUser = req.session ? req.session.user : null;
  const isManager = sessionUser && String(sessionUser.role || '').toLowerCase().includes('manager');
  const isSuperAdmin = sessionUser && String(sessionUser.role || '').toLowerCase().includes('super');
  const isSRAAdmin = sessionUser && (String(sessionUser.role || '').toLowerCase().includes('sra') || (String(sessionUser.role || '').toLowerCase().includes('admin') && !isManager));

  let assignedRole = role || 'Member';
  let assignedBlockFarm = blockFarm ? String(blockFarm).trim() : '';

  // Privilege escalation guard: Farm Managers can ONLY approve Members for their assigned block farm
  if (isManager && !isSuperAdmin && !isSRAAdmin) {
    if (assignedRole !== 'Member') {
      return res.status(403).json({
        success: false,
        error: 'Permission Denied: Farm Managers are only authorized to approve cooperative Members.'
      });
    }
    if (sessionUser.blockFarm) {
      assignedBlockFarm = sessionUser.blockFarm;
    }
  }

  const cleanContact = contact.replace(/\D/g, '');
  let prefix = '04';
  const roleLower = String(assignedRole).toLowerCase();
  if (roleLower.includes('super admin')) prefix = '01';
  else if (roleLower.includes('sra') || (roleLower.includes('admin') && !roleLower.includes('farm'))) prefix = '02';
  else if (roleLower.includes('manager')) prefix = '03';
  const employeeId = req.body.employeeId || `${prefix}${Math.floor(100000 + Math.random() * 900000)}`;

  const roleKey = roleLower.includes('super') ? 'super_admin' : (roleLower.includes('sra') || (roleLower.includes('admin') && !roleLower.includes('farm')) ? 'sra_admin' : (roleLower.includes('manager') ? 'farm_manager' : 'member'));
  const userPayload = {
    employeeId,
    contact: cleanContact,
    name: name ? String(name).trim() : 'Approved Member',
    role: assignedRole,
    roleKey,
    blockFarm: assignedBlockFarm,
    blockFarmId: blockFarmId || '',
    fieldId: fieldId || '',
    status: 'Active',
    approvedBy: sessionUser ? sessionUser.name : 'Administrator',
    approvedAt: new Date().toISOString()
  };

  try {
    if (db) {
      await db.collection('users').doc(employeeId || cleanContact).set(userPayload, { merge: true });

      // 2-Way Symmetrical Synchronization: If Farm Manager assigned to a Block Farm, update block_farms
      if (roleKey === 'farm_manager' && assignedBlockFarm) {
        let bfTargetDoc = null;
        if (blockFarmId) {
          bfTargetDoc = db.collection('block_farms').doc(blockFarmId);
        } else {
          // Search by name
          const bfSnap = await db.collection('block_farms').where('name', '==', assignedBlockFarm).limit(1).get();
          if (!bfSnap.empty) {
            bfTargetDoc = bfSnap.docs[0].ref;
          }
        }

        if (bfTargetDoc) {
          await bfTargetDoc.set({
            farmManagerId: employeeId,
            farmManagerName: userPayload.name,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      }
    }
    console.log(`[HUGPONG Users] User Approved: ${userPayload.name} (${userPayload.role}) -> Block Farm: ${assignedBlockFarm || 'Unassigned'}`);
    return res.json({ success: true, data: userPayload });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
