'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { hashPassword, validatePassword } = require('../security/password');
const { publicUser } = require('../security/userProjection');
const { issueOtp, verifyOtp, consumeVerifiedOtp, discardOtp } = require('../security/otp');
const { sendSms } = require('../services/smsGateway');
const {
  COLLECTIONS,
  ROLES,
  canonicalRole,
  requiredString,
  nowIso
} = require('../schema/firestoreSchema');
const { readMutationContext, assertBaseVersion } = require('../services/mutationContext');

function createUserId(role) {
  const prefixes = {
    [ROLES.SUPER_ADMIN]: '01',
    [ROLES.SRA_ADMIN]: '02',
    [ROLES.FARM_MANAGER]: '03',
    [ROLES.MEMBER_FARMER]: '04'
  };
  return `${prefixes[role]}${Math.floor(100000 + Math.random() * 900000)}`;
}

function phoneChallengeSubject(actorUserId, phone) {
  return `${actorUserId}:${phone}`;
}

async function managerFarmIds(userId) {
  const farms = await db.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', userId).get();
  return farms.docs.map(doc => doc.id);
}

async function assertManagerUserScope(actorId, targetUserId, requestedBlockFarmId = null) {
  const farmIds = await managerFarmIds(actorId);
  if (requestedBlockFarmId && farmIds.includes(String(requestedBlockFarmId).trim().toUpperCase())) return;
  const fields = await db.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', targetUserId).get();
  if (!fields.docs.some(doc => farmIds.includes(doc.data().blockFarmId))) {
    throw Object.assign(new Error('Member account is outside the Farm Manager assigned block farm.'), { status: 403 });
  }
}

router.post('/phone-verification/request', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN]), async (req, res) => {
  const phone = String(req.body?.phone || '').replace(/\D/g, '');
  if (!/^09\d{9}$/.test(phone)) return res.status(400).json({ success: false, error: 'A valid Philippine mobile number is required.' });
  const subject = phoneChallengeSubject(req.session.user.employeeId, phone);
  try {
    const challenge = issueOtp('personnel-phone', subject, phone);
    const greeting = req.body?.displayName ? `Hello ${String(req.body.displayName).trim()}, ` : '';
    try {
      const result = await sendSms(
        phone,
        `[HUGPONG] ${greeting}Your personnel phone verification code is ${challenge.code}. Valid for 5 minutes.`,
        { otpCode: challenge.code, purpose: 'personnel-phone' }
      );
      if (!result.success) throw new Error('SMS delivery failed.');
    } catch (error) {
      discardOtp('personnel-phone', subject);
      throw error;
    }
    return res.json({ success: true, phone, expiresAt: challenge.expiresAt });
  } catch (error) {
    const status = error.code === 'OTP_RATE_LIMITED' ? 429 : (error.code === 'SMS_NOT_CONFIGURED' ? 503 : 502);
    return res.status(status).json({ success: false, error: error.message || 'Verification code could not be sent.' });
  }
});

router.post('/phone-verification/verify', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN]), (req, res) => {
  const phone = String(req.body?.phone || '').replace(/\D/g, '');
  const code = String(req.body?.code || '').trim();
  if (!/^09\d{9}$/.test(phone) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, error: 'A valid phone and 6-digit code are required.' });
  }
  const result = verifyOtp('personnel-phone', phoneChallengeSubject(req.session.user.employeeId, phone), phone, code);
  return res.status(result.success ? 200 : 400).json(result);
});

router.get('/', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const snapshot = await db.collection(COLLECTIONS.USERS).get();
    const actorRole = canonicalRole(req.session.user.role || req.session.user.roleKey);
    const actorId = String(req.session.user.employeeId || '').trim();
    let permittedIds = null;
    let permittedFarmIds = [];
    if (actorRole === ROLES.FARM_MANAGER) {
      permittedFarmIds = await managerFarmIds(actorId);
      const fields = await db.collection(COLLECTIONS.FIELDS).get();
      permittedIds = new Set([actorId, ...fields.docs.filter(doc => permittedFarmIds.includes(doc.data().blockFarmId)).map(doc => doc.data().memberUserId).filter(Boolean)]);
    }
    const data = snapshot.docs
      .filter(doc => !permittedIds || permittedIds.has(doc.id) || (doc.data().status === 'PENDING' && permittedFarmIds.includes(doc.data().requestedBlockFarmId)))
      .filter(doc => actorRole !== ROLES.SRA_ADMIN || canonicalRole(doc.data().role) !== ROLES.SUPER_ADMIN)
      .map(doc => publicUser(doc.data(), doc.id));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/approve', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const mutationContext = readMutationContext(req);
    const actorRole = canonicalRole(req.session.user.role || req.session.user.roleKey);
    let role = canonicalRole(req.body.role || ROLES.MEMBER_FARMER);
    if (!role) throw new Error('role must be a canonical HUGPONG role.');
    if (actorRole === ROLES.FARM_MANAGER && role !== ROLES.MEMBER_FARMER) {
      return res.status(403).json({ success: false, error: 'Farm Managers may approve only Member Farmer accounts.' });
    }
    if (actorRole === ROLES.SRA_ADMIN && role !== ROLES.FARM_MANAGER) {
      return res.status(403).json({ success: false, error: 'SRA Admins may approve only Farm Manager accounts.' });
    }
    const userId = req.body.id ? requiredString(req.body.id, 'id', { max: 8 }) : createUserId(role);
    if (!/^\d{8}$/.test(userId)) throw new Error('id must be an eight-digit HUGPONG user ID.');
    const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
    const existingUser = await userRef.get();
    const now = nowIso();
    if (existingUser.exists) {
      const current = existingUser.data();
      const actorId = String(req.session.user.employeeId || '').trim();
      if (current.status === 'ACTIVE' && current.approvedByUserId === actorId && canonicalRole(current.role) === role) {
        return res.json({ success: true, replayed: true, data: publicUser(current, userId) });
      }
      if (current.status !== 'PENDING') return res.status(409).json({ success: false, error: 'Account already exists and is not pending approval.' });
      if (canonicalRole(current.role) !== role) return res.status(400).json({ success: false, error: 'Pending account role cannot be changed during approval.' });
      assertBaseVersion(current.updatedAt, mutationContext, userId, publicUser(current, userId));
      if (actorRole === ROLES.FARM_MANAGER) await assertManagerUserScope(String(req.session.user.employeeId || '').trim(), userId, current.requestedBlockFarmId);
      const approved = {
        ...current,
        status: 'ACTIVE',
        approvedByUserId: String(req.session.user.employeeId || '').trim(),
        approvedAt: now,
        updatedAt: now
      };
      await userRef.update({
        status: approved.status,
        approvedByUserId: approved.approvedByUserId,
        approvedAt: approved.approvedAt,
        updatedAt: approved.updatedAt
      });
      return res.json({ success: true, data: publicUser(approved, userId) });
    }
    const phone = requiredString(req.body.phone, 'phone', { max: 20 }).replace(/\D/g, '');
    if (!/^09\d{9}$/.test(phone)) throw new Error('phone must be an 11-digit Philippine mobile number.');
    const existing = await db.collection(COLLECTIONS.USERS).where('phone', '==', phone).limit(1).get();
    if (!existing.empty) return res.status(409).json({ success: false, error: 'phone is already registered.' });
    validatePassword(req.body.password);
    if (actorRole === ROLES.FARM_MANAGER) {
      await assertManagerUserScope(String(req.session.user.employeeId || '').trim(), userId, req.body.blockFarmId);
    }
    const phoneVerifiedAt = req.body.phoneVerified === true
      && consumeVerifiedOtp('personnel-phone', phoneChallengeSubject(req.session.user.employeeId, phone), phone)
      ? now
      : null;
    const payload = {
      displayName: requiredString(req.body.displayName, 'displayName', { max: 200 }),
      phone,
      role,
      status: 'ACTIVE',
      // Provisioned accounts verify their own registered phone through the
      // authenticated server OTP flow. An administrator cannot assert this.
      phoneVerifiedAt,
      requiresPasswordChange: req.body.requiresPasswordChange !== false,
      passwordChangedAt: req.body.passwordChangedAt || null,
      approvedByUserId: String(req.session.user.employeeId || req.session.user.userId || '').trim(),
      approvedAt: now,
      createdAt: now,
      updatedAt: now
    };
    const passwordHash = await hashPassword(req.body.password);
    const batch = db.batch();
    batch.create(db.collection(COLLECTIONS.USERS).doc(userId), payload);
    batch.create(db.collection(COLLECTIONS.USER_CREDENTIALS).doc(userId), {
      passwordHash,
      createdAt: now,
      updatedAt: now
    });
    await batch.commit();
    return res.status(201).json({ success: true, data: publicUser(payload, userId) });
  } catch (error) {
    const status = error.status || (/already exists/i.test(error.message) ? 409 : 400);
    return res.status(status).json({ success: false, error: error.message });
  }
});

router.patch('/:userId', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const targetRef = db.collection(COLLECTIONS.USERS).doc(requiredString(req.params.userId, 'userId', { max: 80 }));
    const targetSnapshot = await targetRef.get();
    if (!targetSnapshot.exists) return res.status(404).json({ success: false, error: 'User was not found.' });
    const actorRole = canonicalRole(req.session.user.role || req.session.user.roleKey);
    const current = targetSnapshot.data();
    const targetRole = canonicalRole(req.body.role || current.role);
    if (!targetRole) throw new Error('role must be a canonical HUGPONG role.');
    if (actorRole === ROLES.FARM_MANAGER && targetRole !== ROLES.MEMBER_FARMER) {
      return res.status(403).json({ success: false, error: 'Farm Managers may update only Member Farmer accounts.' });
    }
    if (actorRole === ROLES.FARM_MANAGER) {
      await assertManagerUserScope(String(req.session.user.employeeId || '').trim(), targetSnapshot.id, current.requestedBlockFarmId);
    }
    if (actorRole === ROLES.SRA_ADMIN && targetRole === ROLES.SUPER_ADMIN) {
      return res.status(403).json({ success: false, error: 'SRA Admins may update only Farm Manager accounts.' });
    }
    if (actorRole === ROLES.SRA_ADMIN && canonicalRole(current.role) !== ROLES.FARM_MANAGER) {
      return res.status(403).json({ success: false, error: 'SRA Admins may update only Farm Manager accounts.' });
    }
    const phone = req.body.phone == null ? current.phone : String(req.body.phone).replace(/\D/g, '');
    if (!/^09\d{9}$/.test(phone)) throw new Error('phone must be an 11-digit Philippine mobile number.');
    if (phone !== current.phone) {
      const duplicate = await db.collection(COLLECTIONS.USERS).where('phone', '==', phone).limit(1).get();
      if (!duplicate.empty && duplicate.docs[0].id !== targetSnapshot.id) {
        return res.status(409).json({ success: false, error: 'phone is already registered.' });
      }
    }
    const phoneChanged = phone !== current.phone;
    const phoneVerifiedAt = phoneChanged && req.body.phoneVerified === true
      && consumeVerifiedOtp('personnel-phone', phoneChallengeSubject(req.session.user.employeeId, phone), phone)
      ? nowIso()
      : (phoneChanged ? null : (current.phoneVerifiedAt || null));
    const update = {
      displayName: req.body.displayName == null ? current.displayName : requiredString(req.body.displayName, 'displayName', { max: 200 }),
      phone,
      role: targetRole,
      status: req.body.status == null ? current.status : String(req.body.status).trim().toUpperCase(),
      phoneVerifiedAt,
      updatedAt: nowIso()
    };
    if (!['PENDING', 'ACTIVE', 'DISABLED'].includes(update.status)) throw new Error('status is invalid.');
    await targetRef.update(update);
    return res.json({ success: true, data: publicUser({ ...current, ...update }, targetSnapshot.id) });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

module.exports = router;
