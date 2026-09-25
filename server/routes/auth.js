'use strict';

const express = require('express');
const router = express.Router();
const { db, auth } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { issueToken } = require('../security/token');
const { hashPassword, verifyPassword, validatePassword } = require('../security/password');
const { publicUser } = require('../security/userProjection');
const { buildFirebaseClaims } = require('../security/firebaseClaims');
const { issueTakeoverGrant, TAKEOVER_GRANT_TTL_MS, TAKEOVER_GRANT_PURPOSE } = require('../security/takeoverGrant');
const { issueOtp, verifyOtp, consumeVerifiedOtp, verifyAndConsumeOtp, discardOtp } = require('../security/otp');
const { sendSms } = require('../services/smsGateway');
const { assertManagerFieldAssignment } = require('../services/takeoverAuthorizationService');
const { COLLECTIONS, ROLES, canonicalRole, publicRoleLabel, nowIso, isRoleAllowedOnPlatform } = require('../schema/firestoreSchema');
const { recordActivity } = require('../services/telemetryService');

function normalizeContact(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('639') && digits.length === 12 ? `0${digits.slice(2)}` : digits;
}

function getRoleKey(role) {
  const canonical = canonicalRole(role);
  if (canonical === ROLES.SUPER_ADMIN) return 'superadmin';
  if (canonical === ROLES.FARM_MANAGER) return 'manager';
  if (canonical === ROLES.SRA_ADMIN) return 'admin';
  return 'member';
}

function platformRestrictionMessage(role, platform) {
  const canonical = canonicalRole(role);
  const normalizedPlatform = String(platform || '').trim().toLowerCase();
  if (canonical === ROLES.MEMBER_FARMER && normalizedPlatform === 'web') {
    return 'Farm Member accounts are restricted to the HUGPONG mobile application.';
  }
  if (canonical === ROLES.SUPER_ADMIN && normalizedPlatform === 'mobile') {
    return 'Super Admin access is restricted to the Web Management Console.';
  }
  return 'This account is not authorized for the requested platform.';
}

function createUserId(role) {
  const prefixes = { [ROLES.SUPER_ADMIN]: '01', [ROLES.SRA_ADMIN]: '02', [ROLES.FARM_MANAGER]: '03', [ROLES.MEMBER_FARMER]: '04' };
  return `${prefixes[role]}${Math.floor(100000 + Math.random() * 900000)}`;
}

async function resolveAssignments(userId, role) {
  if (!db) return { blockFarmId: '', fieldId: '' };
  if (role === ROLES.FARM_MANAGER) {
    const farms = await db.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', userId).limit(1).get();
    const fields = await db.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', userId).limit(1).get();
    const field = fields.empty ? null : fields.docs[0];
    return {
      blockFarmId: field ? field.data().blockFarmId : (farms.empty ? '' : farms.docs[0].id),
      fieldId: field ? field.id : ''
    };
  }
  if (role === ROLES.MEMBER_FARMER) {
    const fields = await db.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', userId).limit(1).get();
    const field = fields.empty ? null : fields.docs[0];
    return { blockFarmId: field ? field.data().blockFarmId : '', fieldId: field ? field.id : '' };
  }
  return { blockFarmId: '', fieldId: '' };
}

async function findUser(identifier) {
  if (!db) return null;
  const raw = String(identifier || '').trim();
  const normalized = normalizeContact(raw);
  if (/^0[1-4]\d{6}$/.test(raw)) {
    const direct = await db.collection(COLLECTIONS.USERS).doc(raw).get();
    if (direct.exists) return { id: direct.id, ...direct.data() };
  }
  if (normalized) {
    const match = await db.collection(COLLECTIONS.USERS).where('phone', '==', normalized).limit(1).get();
    if (!match.empty) return { id: match.docs[0].id, ...match.docs[0].data() };
  }
  return null;
}

async function buildSessionUser(userId, user) {
  const role = canonicalRole(user.role);
  if (!role) throw new Error('Account has an invalid role.');
  const assignments = await resolveAssignments(userId, role);
  const requiresPasswordChange = user.requiresPasswordChange === true;
  return {
    employeeId: userId,
    contact: user.phone || '',
    mobile: user.phone || '',
    name: user.displayName || 'HUGPONG Operator',
    role: publicRoleLabel(role),
    canonicalRole: role,
    roleKey: getRoleKey(role),
    blockFarmId: assignments.blockFarmId,
    fieldId: assignments.fieldId,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    pendingFirstLoginVerification: !user.phoneVerifiedAt,
    requiresPasswordChange,
    passwordChanged: Boolean(user.passwordChangedAt) || !requiresPasswordChange,
    authenticatedAt: nowIso()
  };
}

async function issueCredentials(sessionUser) {
  if (!auth) throw new Error('Firebase Authentication is unavailable.');
  return {
    token: issueToken(sessionUser, sessionUser.roleKey),
    firebaseCustomToken: await auth.createCustomToken(sessionUser.employeeId, buildFirebaseClaims(sessionUser))
  };
}

async function verifyCurrentPassword(userId, password) {
  if (!db) return false;
  const credential = await db.collection(COLLECTIONS.USER_CREDENTIALS).doc(userId).get();
  return credential.exists && verifyPassword(password, credential.data().passwordHash);
}

router.post('/mobile-session', async (req, res) => {
  if (!db || !auth) return res.status(503).json({ success: false, error: 'Authentication services are unavailable.' });
  if (String(req.headers['x-client-platform'] || '').toLowerCase() !== 'mobile') {
    return res.status(403).json({ success: false, error: 'This session refresh endpoint is restricted to the mobile client.' });
  }
  const header = String(req.headers.authorization || '');
  const firebaseIdToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!firebaseIdToken) return res.status(401).json({ success: false, error: 'Firebase authentication is required.' });
  try {
    const decoded = await auth.verifyIdToken(firebaseIdToken, true);
    const snapshot = await db.collection(COLLECTIONS.USERS).doc(decoded.uid).get();
    if (!snapshot.exists || snapshot.data().status !== 'ACTIVE') {
      return res.status(403).json({ success: false, error: 'The account is no longer authorized.' });
    }
    const sessionUser = await buildSessionUser(snapshot.id, snapshot.data());
    if (!isRoleAllowedOnPlatform(sessionUser.canonicalRole, 'mobile')) {
      return res.status(403).json({ success: false, error: platformRestrictionMessage(sessionUser.canonicalRole, 'mobile') });
    }
    if (req.session) req.session.user = sessionUser;
    return res.json({ success: true, authenticated: true, user: sessionUser, ...(await issueCredentials(sessionUser)) });
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Firebase authentication could not be refreshed.' });
  }
});

async function sendVerificationCode(phone, code, displayName, purpose = 'verification') {
  const greeting = displayName ? `Hello ${displayName}, ` : '';
  const result = await sendSms(
    phone,
    `[HUGPONG] ${greeting}Your security verification code is ${code}. Valid for 5 minutes. Do not share this code.`,
    { otpCode: code, purpose }
  );
  if (!result.success) {
    const error = new Error('SMS delivery failed.');
    error.code = 'SMS_DELIVERY_FAILED';
    throw error;
  }
}

router.post('/login', async (req, res) => {
  const identifier = req.body?.contactNumber || req.body?.identifier;
  const password = req.body?.password;
  if (!String(identifier || '').trim() || !password) {
    return res.status(400).json({ success: false, error: 'User ID or contact number and password are required.' });
  }
  if (!db || !auth) return res.status(503).json({ success: false, error: 'Authentication service is unavailable.' });
  try {
    const matchedUser = await findUser(identifier);
    if (!matchedUser) return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    if (matchedUser.status !== 'ACTIVE') return res.status(403).json({ success: false, error: 'This account is not active.' });
    if (!(await verifyCurrentPassword(matchedUser.id, password))) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }
    const sessionUser = await buildSessionUser(matchedUser.id, matchedUser);
    const clientPlatform = String(req.headers['x-client-platform'] || req.body?.clientPlatform || '').trim().toLowerCase();
    if (clientPlatform && !isRoleAllowedOnPlatform(sessionUser.canonicalRole, clientPlatform)) {
      return res.status(403).json({
        success: false,
        error: platformRestrictionMessage(sessionUser.canonicalRole, clientPlatform)
      });
    }
    req.session.user = sessionUser;
    const credentials = await issueCredentials(sessionUser);
    recordActivity(db, {
      userId: sessionUser.employeeId,
      platform: clientPlatform,
      clientInstanceId: req.headers['x-client-instance-id'] || req.body?.clientInstanceId || `${clientPlatform}-login`,
      event: 'LOGIN'
    }).catch(error => console.warn('[HUGPONG Auth] Activity telemetry notice:', error.message));
    return res.json({
      success: true,
      user: sessionUser,
      roleKey: sessionUser.roleKey,
      ...credentials
    });
  } catch (error) {
    console.error('[HUGPONG Auth] Login error:', error);
    return res.status(500).json({ success: false, error: 'Authentication could not be completed.' });
  }
});

router.post('/registration-otp/request', async (req, res) => {
  if (!db) return res.status(503).json({ success: false, error: 'Account database is unavailable.' });
  const phone = normalizeContact(req.body?.phone);
  if (!/^09\d{9}$/.test(phone)) return res.status(400).json({ success: false, error: 'A valid Philippine mobile number is required.' });
  try {
    const duplicate = await db.collection(COLLECTIONS.USERS).where('phone', '==', phone).limit(1).get();
    if (!duplicate.empty) return res.status(409).json({ success: false, error: 'This mobile number is already registered.' });
    const challenge = issueOtp('registration', phone, phone);
    try {
      await sendVerificationCode(phone, challenge.code, String(req.body?.displayName || '').trim(), 'registration');
    } catch (error) {
      discardOtp('registration', phone);
      throw error;
    }
    return res.json({ success: true, expiresAt: challenge.expiresAt, message: 'Verification code sent.' });
  } catch (error) {
    const status = error.code === 'OTP_RATE_LIMITED' ? 429 : (error.code === 'SMS_NOT_CONFIGURED' ? 503 : 502);
    return res.status(status).json({ success: false, error: error.message || 'Verification code could not be sent.' });
  }
});

router.post('/registration-otp/verify', async (req, res) => {
  const phone = normalizeContact(req.body?.phone);
  const code = String(req.body?.code || '').trim();
  if (!/^09\d{9}$/.test(phone) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, error: 'A valid mobile number and 6-digit code are required.' });
  }
  const result = verifyOtp('registration', phone, phone, code);
  if (!result.success) return res.status(400).json(result);
  return res.json({ success: true, verified: true });
});

router.post('/register', async (req, res) => {
  if (!db) return res.status(503).json({ success: false, error: 'Account database is unavailable.' });
  try {
    const role = canonicalRole(req.body?.role || ROLES.MEMBER_FARMER);
    if (role !== ROLES.MEMBER_FARMER) {
      return res.status(403).json({ success: false, error: 'Self-registration is limited to Farm Member accounts.' });
    }
    const displayName = String(req.body?.displayName || '').trim();
    const phone = normalizeContact(req.body?.phone);
    const password = req.body?.password;
    const blockFarmId = String(req.body?.blockFarmId || '').trim().toUpperCase();
    if (!displayName || displayName.length > 200) throw new Error('A valid display name is required.');
    if (!/^09\d{9}$/.test(phone)) throw new Error('A valid Philippine mobile number is required.');
    validatePassword(password);
    if (blockFarmId) {
      const farm = await db.collection(COLLECTIONS.BLOCK_FARMS).doc(blockFarmId).get();
      if (!farm.exists) throw new Error('The selected block farm does not exist.');
    }
    const duplicate = await db.collection(COLLECTIONS.USERS).where('phone', '==', phone).limit(1).get();
    if (!duplicate.empty) return res.status(409).json({ success: false, error: 'This mobile number is already registered.' });
    if (!consumeVerifiedOtp('registration', phone, phone)) {
      return res.status(403).json({ success: false, error: 'Server-verified phone confirmation is required before registration.' });
    }
    const userId = createUserId(role);
    const now = nowIso();
    const user = {
      displayName,
      phone,
      role,
      status: 'PENDING',
      requestedBlockFarmId: blockFarmId || null,
      phoneVerifiedAt: now,
      requiresPasswordChange: false,
      passwordChangedAt: now,
      approvedByUserId: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now
    };
    const batch = db.batch();
    batch.create(db.collection(COLLECTIONS.USERS).doc(userId), user);
    batch.create(db.collection(COLLECTIONS.USER_CREDENTIALS).doc(userId), {
      passwordHash: await hashPassword(password),
      createdAt: now,
      updatedAt: now
    });
    await batch.commit();
    return res.status(201).json({ success: true, pendingApproval: true, user: publicUser(user, userId) });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/request-phone-verification', requireAuth, async (req, res) => {
  const employeeId = req.session.user.employeeId;
  if (!db) return res.status(503).json({ success: false, error: 'Account database is unavailable.' });
  try {
    const snapshot = await db.collection(COLLECTIONS.USERS).doc(employeeId).get();
    if (!snapshot.exists) return res.status(404).json({ success: false, error: 'Authenticated account was not found.' });
    const user = snapshot.data();
    const phone = normalizeContact(user.phone);
    if (!/^09\d{9}$/.test(phone)) return res.status(400).json({ success: false, error: 'The account does not have a valid mobile number.' });
    const challenge = issueOtp('first-login', employeeId, phone);
    try {
      await sendVerificationCode(phone, challenge.code, user.displayName, 'first-login');
    } catch (error) {
      discardOtp('first-login', employeeId);
      throw error;
    }
    return res.json({ success: true, expiresAt: challenge.expiresAt, message: 'Verification code sent.' });
  } catch (error) {
    const status = error.code === 'OTP_RATE_LIMITED' ? 429 : (error.code === 'SMS_NOT_CONFIGURED' ? 503 : 502);
    return res.status(status).json({ success: false, error: error.message || 'Verification code could not be sent.' });
  }
});

router.post('/verify-phone', requireAuth, async (req, res) => {
  const employeeId = req.session.user.employeeId;
  const code = String(req.body?.code || '').trim();
  if (!db) return res.status(503).json({ success: false, error: 'Account database is unavailable.' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ success: false, error: 'A valid 6-digit verification code is required.' });
  try {
    const snapshot = await db.collection(COLLECTIONS.USERS).doc(employeeId).get();
    if (!snapshot.exists) return res.status(404).json({ success: false, error: 'Authenticated account was not found.' });
    const phone = normalizeContact(snapshot.data().phone);
    const verification = verifyAndConsumeOtp('first-login', employeeId, phone, code);
    if (!verification.success) return res.status(403).json(verification);
    const phoneVerifiedAt = nowIso();
    await snapshot.ref.update({ phoneVerifiedAt, updatedAt: phoneVerifiedAt });
    Object.assign(req.session.user, { phoneVerified: true, pendingFirstLoginVerification: false, phoneVerifiedAt });
    return res.json({ success: true, user: req.session.user, ...(await issueCredentials(req.session.user)) });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Phone verification could not be saved.' });
  }
});

router.post('/verify-password', requireAuth, async (req, res) => {
  const valid = await verifyCurrentPassword(req.session.user.employeeId, req.body?.password);
  if (!valid) return res.status(403).json({ success: false, error: 'Password verification failed.' });
  if (req.body?.purpose !== TAKEOVER_GRANT_PURPOSE) {
    return res.json({ success: true, verified: true });
  }
  if (canonicalRole(req.session.user.role || req.session.user.roleKey) !== ROLES.FARM_MANAGER) {
    return res.status(403).json({ success: false, error: 'Only Farm Managers may authorize a field takeover.' });
  }
  let assignment;
  try {
    assignment = await assertManagerFieldAssignment(db, req.session.user.employeeId, req.body?.fieldId);
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
  const issuedAt = Date.now();
  return res.json({
    success: true,
    verified: true,
    takeoverGrant: issueTakeoverGrant({ actorId: req.session.user.employeeId, fieldId: assignment.fieldId }, issuedAt),
    takeoverGrantExpiresAt: issuedAt + TAKEOVER_GRANT_TTL_MS
  });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const employeeId = req.session.user.employeeId;
  if (!db) return res.status(503).json({ success: false, error: 'Account database is unavailable.' });
  try {
    validatePassword(newPassword);
    if (req.session.user.requiresPasswordChange !== true && !(await verifyCurrentPassword(employeeId, currentPassword))) {
      return res.status(403).json({ success: false, error: 'Current password is incorrect.' });
    }
    const now = nowIso();
    const batch = db.batch();
    batch.set(db.collection(COLLECTIONS.USER_CREDENTIALS).doc(employeeId), { passwordHash: await hashPassword(newPassword), updatedAt: now }, { merge: true });
    batch.update(db.collection(COLLECTIONS.USERS).doc(employeeId), { requiresPasswordChange: false, passwordChangedAt: now, updatedAt: now });
    await batch.commit();
    Object.assign(req.session.user, { requiresPasswordChange: false, passwordChanged: true, passwordChangedAt: now });
    return res.json({ success: true, message: 'Password updated successfully.', user: req.session.user, ...(await issueCredentials(req.session.user)) });
  } catch (error) {
    const status = /between 8 and 256/.test(error.message) ? 400 : 500;
    return res.status(status).json({ success: false, error: status === 400 ? error.message : 'Password update could not be saved.' });
  }
});

router.post('/change-phone', requireAuth, async (req, res) => {
  const employeeId = req.session.user.employeeId;
  const phone = normalizeContact(req.body?.phone);
  if (!db) return res.status(503).json({ success: false, error: 'Account database is unavailable.' });
  if (!/^09\d{9}$/.test(phone)) return res.status(400).json({ success: false, error: 'A valid Philippine mobile number is required.' });
  if (!(await verifyCurrentPassword(employeeId, req.body?.currentPassword))) {
    return res.status(403).json({ success: false, error: 'Current password is incorrect.' });
  }
  const duplicate = await db.collection(COLLECTIONS.USERS).where('phone', '==', phone).limit(1).get();
  if (!duplicate.empty && duplicate.docs[0].id !== employeeId) {
    return res.status(409).json({ success: false, error: 'This mobile number is already registered.' });
  }
  const now = nowIso();
  await db.collection(COLLECTIONS.USERS).doc(employeeId).update({ phone, phoneVerifiedAt: null, updatedAt: now });
  Object.assign(req.session.user, { contact: phone, mobile: phone, phoneVerified: false, pendingFirstLoginVerification: true });
  return res.json({ success: true, user: req.session.user, ...(await issueCredentials(req.session.user)) });
});

router.get('/session', requireAuth, async (req, res) => {
  try {
    const snapshot = await db.collection(COLLECTIONS.USERS).doc(req.session.user.employeeId).get();
    if (!snapshot.exists || snapshot.data().status !== 'ACTIVE') {
      return res.status(401).json({ success: false, authenticated: false, error: 'The account is no longer active.' });
    }
    const sessionUser = await buildSessionUser(snapshot.id, snapshot.data());
    const clientPlatform = String(req.headers['x-client-platform'] || '').trim().toLowerCase();
    if (clientPlatform && !isRoleAllowedOnPlatform(sessionUser.canonicalRole, clientPlatform)) {
      req.session.user = null;
      res.clearCookie('hugpong.sid');
      return res.status(403).json({
        success: false,
        authenticated: false,
        error: platformRestrictionMessage(sessionUser.canonicalRole, clientPlatform)
      });
    }
    req.session.user = sessionUser;
    return res.json({ success: true, authenticated: true, user: sessionUser, ...(await issueCredentials(sessionUser)) });
  } catch (error) {
    return res.status(503).json({ success: false, authenticated: false, error: 'Firebase authentication is unavailable.' });
  }
});

router.post('/logout', (req, res) => {
  if (!req.session || typeof req.session.destroy !== 'function') return res.json({ success: true, message: 'Signed out locally.' });
  req.session.destroy(error => {
    if (error) return res.status(500).json({ success: false, error: 'Could not log out.' });
    res.clearCookie('hugpong.sid');
    return res.json({ success: true, message: 'Logged out successfully.' });
  });
});

module.exports = router;
module.exports._test = { normalizeContact, getRoleKey, platformRestrictionMessage };
