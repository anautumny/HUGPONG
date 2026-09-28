'use strict';

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { normalizeStructuredName } = require('../domain/personName');
const { resolveAccountAssignments } = require('../services/accountAuthorization');
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
const { cleanText } = require('../services/diagnosticService');
const { createRateLimit, clientAddress, identifier, rateLimitState } = require('../middleware/rateLimit');
const {
  PASSWORD_SESSION_ACTIONS,
  authVersionOf,
  nextAuthVersion,
  normalizePasswordSessionAction,
  revokeFirebaseSessions
} = require('../security/accountSecurity');
const { createUserAccount, phoneIdentifierId } = require('../services/accountProvisioningService');
const { queueAuditEvent } = require('../services/auditWriter');
const {
  RECOVERY_CODE_TTL_MS,
  dispatchPasswordRecoveryChallenge,
  verifyPasswordRecoveryCode,
  completePasswordRecovery
} = require('../services/passwordRecoveryService');

const VERIFICATION_CODE_SEND_LIMIT = 3;
const VERIFICATION_CODE_WINDOW_MS = 60 * 60 * 1000;
const VERIFICATION_CODE_RESEND_DELAY_MS = 60 * 1000;
const OTP_REQUEST_LIMITER = 'auth-otp-request';
const PASSWORD_RECOVERY_ACCOUNT_LIMITER = 'auth-password-recovery-account';
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MESSAGE = 'Too many login attempts. Please try again later.';

function canonicalLoginIdentifier(req) {
  const raw = String(req.body?.contactNumber || req.body?.identifier || '').trim().toLowerCase();
  const digits = raw.replace(/\D/g, '');
  if (/^0[1-4]\d{6}$/.test(digits)) return digits;
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^09\d{9}$/.test(digits)) return digits;
  return raw.slice(0, 160);
}

function loginRateLimitData(publicState) {
  return {
    ...publicState,
    attemptsRemaining: publicState.remaining,
    lockoutUntil: publicState.windowResetsAt
  };
}

const loginRateLimit = createRateLimit({
  name: 'auth-login',
  max: LOGIN_ATTEMPT_LIMIT,
  windowMs: LOGIN_LOCKOUT_MS,
  key: req => `${clientAddress(req)}:${canonicalLoginIdentifier(req)}`,
  rejectionCode: 'LOGIN_RATE_LIMITED',
  rejectionMessage: LOGIN_LOCKOUT_MESSAGE,
  rejectionData: loginRateLimitData
});
const loginIpRateLimit = createRateLimit({
  name: 'auth-login-ip',
  max: 30,
  windowMs: LOGIN_LOCKOUT_MS,
  key: clientAddress,
  rejectionCode: 'LOGIN_RATE_LIMITED',
  rejectionMessage: LOGIN_LOCKOUT_MESSAGE,
  rejectionData: loginRateLimitData
});
const loginAccountRateLimit = createRateLimit({
  name: 'auth-login-account',
  max: 10,
  windowMs: LOGIN_LOCKOUT_MS,
  key: req => canonicalLoginIdentifier(req) || 'missing',
  rejectionCode: 'LOGIN_RATE_LIMITED',
  rejectionMessage: LOGIN_LOCKOUT_MESSAGE,
  rejectionData: loginRateLimitData
});
const mobileSessionRateLimit = createRateLimit({ name: 'auth-mobile-session', max: 60, windowMs: 15 * 60 * 1000, key: clientAddress });
const otpRequestRateLimit = createRateLimit({
  name: OTP_REQUEST_LIMITER,
  max: VERIFICATION_CODE_SEND_LIMIT,
  windowMs: VERIFICATION_CODE_WINDOW_MS,
  minIntervalMs: VERIFICATION_CODE_RESEND_DELAY_MS,
  key: identifier
});
const otpVerifyRateLimit = createRateLimit({ name: 'auth-otp-verify', max: 10, windowMs: 15 * 60 * 1000 });
const registrationRateLimit = createRateLimit({ name: 'auth-register', max: 5, windowMs: 60 * 60 * 1000 });
const passwordRateLimit = createRateLimit({ name: 'auth-password-check', max: 10, windowMs: 15 * 60 * 1000, key: req => `${clientAddress(req)}:${identifier(req)}` });
const passwordRecoveryIpRateLimit = createRateLimit({
  name: 'auth-password-recovery-ip',
  max: 20,
  windowMs: 60 * 60 * 1000,
  key: clientAddress
});
const passwordRecoveryAccountRateLimit = createRateLimit({
  name: PASSWORD_RECOVERY_ACCOUNT_LIMITER,
  max: VERIFICATION_CODE_SEND_LIMIT,
  windowMs: VERIFICATION_CODE_WINDOW_MS,
  minIntervalMs: VERIFICATION_CODE_RESEND_DELAY_MS,
  key: req => req.passwordRecoveryUser?.id
    ? `user:${req.passwordRecoveryUser.id}`
    : `unknown:${String(req.body?.identifier || '').trim().toLowerCase().replace(/\D/g, '') || 'missing'}`
});
const passwordRecoveryVerifyRateLimit = createRateLimit({
  name: 'auth-password-recovery-verify',
  max: 10,
  windowMs: 15 * 60 * 1000,
  key: req => `${clientAddress(req)}:${String(req.body?.recoveryId || '').slice(0, 100)}`
});
const passwordRecoveryCompleteRateLimit = createRateLimit({
  name: 'auth-password-recovery-complete',
  max: 5,
  windowMs: 15 * 60 * 1000,
  key: req => `${clientAddress(req)}:${String(req.body?.recoveryId || '').slice(0, 100)}`
});

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
  const assignments = await resolveAccountAssignments(db, userId, role);
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
    authVersion: authVersionOf(user),
    authenticatedAt: nowIso()
  };
}

function verificationSendPolicy(req, limiterName) {
  const state = rateLimitState(req, limiterName);
  return state ? {
    codeRequestLimit: state.limit,
    codeRequestsRemaining: state.remaining,
    resendAfterSeconds: state.retryAfterSeconds,
    resendAvailableAt: state.resendAvailableAt,
    codeLimitResetsAt: state.windowResetsAt
  } : {};
}

async function establishSession(req, user) {
  if (!req.session || typeof req.session.regenerate !== 'function') {
    req.session = { user };
    return;
  }
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.user = user;
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

router.post('/mobile-session', mobileSessionRateLimit, async (req, res) => {
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
    if (Number(decoded.authVersion || 1) !== authVersionOf(snapshot.data())) {
      return res.status(401).json({ success: false, error: 'Your session was revoked. Please sign in again.', code: 'SESSION_REVOKED' });
    }
    const sessionUser = await buildSessionUser(snapshot.id, snapshot.data());
    if (!isRoleAllowedOnPlatform(sessionUser.canonicalRole, 'mobile')) {
      return res.status(403).json({ success: false, error: platformRestrictionMessage(sessionUser.canonicalRole, 'mobile') });
    }
    sessionUser.platform = 'mobile';
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

async function resolvePasswordRecoveryAccount(req, res, next) {
  try {
    req.passwordRecoveryUser = await findUser(req.body?.identifier);
  } catch (error) {
    console.warn('[HUGPONG Auth] Password recovery account lookup notice:', cleanText(error.message));
    req.passwordRecoveryUser = null;
  }
  return next();
}

router.post('/password-recovery/request', passwordRecoveryIpRateLimit, resolvePasswordRecoveryAccount, passwordRecoveryAccountRateLimit, async (req, res) => {
  if (!db) return res.status(503).json({ success: false, error: 'Account recovery is temporarily unavailable.' });
  const requestedIdentifier = String(req.body?.identifier || '').trim().slice(0, 160);
  if (!requestedIdentifier) {
    return res.status(400).json({ success: false, error: 'User ID or registered mobile number is required.' });
  }

  let recoveryId = crypto.randomBytes(32).toString('base64url');
  let expiresAt = new Date(Date.now() + RECOVERY_CODE_TTL_MS).toISOString();
  try {
    const matchedUser = req.passwordRecoveryUser;
    const phone = normalizeContact(matchedUser?.phone);
    const createdChallenge = await dispatchPasswordRecoveryChallenge(db, {
      user: matchedUser,
      phone,
      sendCode: async code => {
        const delivery = await sendSms(
          phone,
          `[HUGPONG] Your password reset code is ${code}. Valid for 10 minutes. Do not share this code.`,
          { otpCode: code, purpose: 'password-recovery' }
        );
        if (!delivery?.success) throw new Error(delivery?.error || 'SMS delivery failed.');
      }
    });
    if (createdChallenge) {
      recoveryId = createdChallenge.recoveryId;
      expiresAt = createdChallenge.expiresAt;
    }
  } catch (error) {
    console.warn('[HUGPONG Auth] Password recovery request notice:', cleanText(error.message));
  }

  return res.status(202).json({
    success: true,
    recoveryId,
    expiresAt,
    ...verificationSendPolicy(req, PASSWORD_RECOVERY_ACCOUNT_LIMITER),
    message: 'If an active account matches that information, a password reset code has been sent to its registered mobile number.'
  });
});

router.post('/password-recovery/verify', passwordRecoveryVerifyRateLimit, async (req, res) => {
  if (!db) return res.status(503).json({ success: false, error: 'Account recovery is temporarily unavailable.' });
  try {
    const result = await verifyPasswordRecoveryCode(db, {
      recoveryId: req.body?.recoveryId,
      code: req.body?.code
    });
    return res.json({
      success: true,
      resetToken: result.resetToken,
      expiresAt: result.expiresAt,
      message: 'Verification complete. Create your new password.'
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      error: status === 400 ? error.message : 'The recovery code could not be verified.'
    });
  }
});

router.post('/password-recovery/complete', passwordRecoveryCompleteRateLimit, async (req, res) => {
  if (!db) return res.status(503).json({ success: false, error: 'Account recovery is temporarily unavailable.' });
  try {
    validatePassword(req.body?.newPassword);
    const result = await completePasswordRecovery(db, {
      recoveryId: req.body?.recoveryId,
      resetToken: req.body?.resetToken,
      passwordHash: await hashPassword(req.body.newPassword)
    });
    await revokeFirebaseSessions(result.userId);
    if (req.session && typeof req.session.destroy === 'function') {
      await new Promise(resolve => req.session.destroy(error => {
        if (error) console.warn('[HUGPONG Auth] Password recovery session cleanup notice:', cleanText(error.message));
        resolve();
      }));
    }
    res.clearCookie('hugpong.sid');
    if (result.phone) {
      sendSms(
        result.phone,
        '[HUGPONG] Your account password was reset successfully. All devices were signed out. If this was not you, contact your administrator immediately.',
        { purpose: 'password-recovery-confirmation' }
      ).catch(error => console.warn('[HUGPONG Auth] Password reset confirmation notice:', cleanText(error.message)));
    }
    return res.json({
      success: true,
      signOutRequired: true,
      message: 'Password reset complete. All devices were signed out; sign in with your new password.'
    });
  } catch (error) {
    const status = error.status || (/Password must|less predictable password/.test(error.message) ? 400 : 500);
    return res.status(status).json({
      success: false,
      error: status === 400 ? error.message : 'The password reset could not be completed.'
    });
  }
});

function rejectedLogin(req, res, error = 'Invalid credentials.') {
  const states = ['auth-login', 'auth-login-account', 'auth-login-ip']
    .map(name => rateLimitState(req, name))
    .filter(Boolean)
    .sort((left, right) => left.remaining - right.remaining);
  const state = states[0] || null;
  const exhaustedState = states.find(item => item.remaining === 0) || null;
  const exhausted = Boolean(exhaustedState);
  if (exhausted) res.set('Retry-After', String(exhaustedState.retryAfterSeconds));
  return res.status(exhausted ? 429 : 401).json({
    success: false,
    error: exhausted ? LOGIN_LOCKOUT_MESSAGE : error,
    code: exhausted ? 'LOGIN_RATE_LIMITED' : 'INVALID_CREDENTIALS',
    data: (exhaustedState || state) ? loginRateLimitData(exhaustedState || state) : undefined
  });
}

router.post('/login', (req, res, next) => {
  const identifier = req.body?.contactNumber || req.body?.identifier;
  const password = req.body?.password;
  if (!String(identifier || '').trim() || !password) {
    return res.status(400).json({ success: false, error: 'User ID or contact number and password are required.' });
  }
  return next();
}, loginIpRateLimit, loginAccountRateLimit, loginRateLimit, async (req, res) => {
  const identifier = req.body?.contactNumber || req.body?.identifier;
  const password = req.body?.password;
  if (!db || !auth) return res.status(503).json({ success: false, error: 'Authentication service is unavailable.' });
  try {
    const matchedUser = await findUser(identifier);
    if (!matchedUser) return rejectedLogin(req, res);
    if (matchedUser.status !== 'ACTIVE') return res.status(403).json({ success: false, error: 'This account is not active.' });
    if (!(await verifyCurrentPassword(matchedUser.id, password))) {
      return rejectedLogin(req, res);
    }
    await Promise.all([
      loginRateLimit.reset(req),
      loginAccountRateLimit.reset(req)
    ]).catch(error => console.warn('[HUGPONG Auth] Login throttle reset notice:', cleanText(error.message)));
    const sessionUser = await buildSessionUser(matchedUser.id, matchedUser);
    const clientPlatform = String(req.headers['x-client-platform'] || req.body?.clientPlatform || '').trim().toLowerCase();
    if (!['web', 'mobile'].includes(clientPlatform)) {
      return res.status(403).json({ success: false, error: 'A recognized client platform is required.', code: 'CLIENT_PLATFORM_REQUIRED' });
    }
    if (!isRoleAllowedOnPlatform(sessionUser.canonicalRole, clientPlatform)) {
      return res.status(403).json({
        success: false,
        error: platformRestrictionMessage(sessionUser.canonicalRole, clientPlatform)
      });
    }
    sessionUser.platform = clientPlatform;
    await establishSession(req, sessionUser);
    const credentials = await issueCredentials(sessionUser);
    recordActivity(db, {
      userId: sessionUser.employeeId,
      platform: clientPlatform,
      clientInstanceId: req.headers['x-client-instance-id'] || req.body?.clientInstanceId || `${clientPlatform}-login`,
      event: 'LOGIN'
    }).catch(error => console.warn('[HUGPONG Auth] Activity telemetry notice:', cleanText(error.message)));
    return res.json({
      success: true,
      user: sessionUser,
      roleKey: sessionUser.roleKey,
      ...credentials
    });
  } catch (error) {
    res.locals.diagnosticError = error;
    return res.status(500).json({ success: false, error: 'Authentication could not be completed.' });
  }
});

router.post('/registration-otp/request', otpRequestRateLimit, async (req, res) => {
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
    return res.json({
      success: true,
      expiresAt: challenge.expiresAt,
      ...verificationSendPolicy(req, OTP_REQUEST_LIMITER),
      message: 'Verification code sent.'
    });
  } catch (error) {
    const status = error.code === 'OTP_RATE_LIMITED' ? 429 : (error.code === 'SMS_NOT_CONFIGURED' ? 503 : 502);
    return res.status(status).json({ success: false, error: error.message || 'Verification code could not be sent.' });
  }
});

router.post('/registration-otp/verify', otpVerifyRateLimit, async (req, res) => {
  const phone = normalizeContact(req.body?.phone);
  const code = String(req.body?.code || '').trim();
  if (!/^09\d{9}$/.test(phone) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, error: 'A valid mobile number and 6-digit code are required.' });
  }
  const result = verifyOtp('registration', phone, phone, code);
  if (!result.success) return res.status(400).json(result);
  return res.json({ success: true, verified: true });
});

router.post('/register', registrationRateLimit, async (req, res) => {
  if (!db) return res.status(503).json({ success: false, error: 'Account database is unavailable.' });
  try {
    const role = canonicalRole(req.body?.role || ROLES.MEMBER_FARMER);
    if (role !== ROLES.MEMBER_FARMER) {
      return res.status(403).json({ success: false, error: 'Self-registration is limited to Farm Member accounts.' });
    }
    const identity = normalizeStructuredName(req.body || {});
    const displayName = identity.displayName;
    const phone = normalizeContact(req.body?.phone);
    const password = req.body?.password;
    const blockFarmId = String(req.body?.blockFarmId || '').trim().toUpperCase();
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
    const now = nowIso();
    const user = {
      ...identity,
      displayName,
      phone,
      role,
      status: 'PENDING',
      requestedBlockFarmId: blockFarmId || null,
      phoneVerifiedAt: now,
      requiresPasswordChange: false,
      passwordChangedAt: now,
      authVersion: 1,
      credentialsUpdatedAt: now,
      disabledAt: null,
      approvedByUserId: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now
    };
    const userId = await createUserAccount(db, {
      user,
      credential: {
        passwordHash: await hashPassword(password),
        credentialsUpdatedAt: now,
        createdAt: now,
        updatedAt: now
      },
      eventType: 'USER_SELF_REGISTERED',
      details: `Registered pending Farm Member account for ${displayName}.`
    });
    return res.status(201).json({ success: true, pendingApproval: true, accountId: userId, user: publicUser(user, userId) });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.post('/request-phone-verification', requireAuth, otpRequestRateLimit, async (req, res) => {
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
    return res.json({
      success: true,
      expiresAt: challenge.expiresAt,
      ...verificationSendPolicy(req, OTP_REQUEST_LIMITER),
      message: 'Verification code sent.'
    });
  } catch (error) {
    const status = error.code === 'OTP_RATE_LIMITED' ? 429 : (error.code === 'SMS_NOT_CONFIGURED' ? 503 : 502);
    return res.status(status).json({ success: false, error: error.message || 'Verification code could not be sent.' });
  }
});

router.post('/verify-phone', requireAuth, otpVerifyRateLimit, async (req, res) => {
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
    const batch = db.batch();
    batch.update(snapshot.ref, { phoneVerifiedAt, updatedAt: phoneVerifiedAt });
    queueAuditEvent(batch, db, {
      eventType: 'USER_PHONE_VERIFIED', actorUserId: employeeId,
      entityType: 'USER', entityId: employeeId,
      details: `Verified the registered phone for account ${employeeId}.`, createdAt: phoneVerifiedAt
    });
    await batch.commit();
    Object.assign(req.session.user, { phoneVerified: true, pendingFirstLoginVerification: false, phoneVerifiedAt });
    return res.json({ success: true, user: req.session.user, ...(await issueCredentials(req.session.user)) });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Phone verification could not be saved.' });
  }
});

router.post('/verify-password', requireAuth, passwordRateLimit, async (req, res) => {
  const valid = await verifyCurrentPassword(req.session.user.employeeId, req.body?.password);
  if (!valid) return res.status(403).json({ success: false, error: 'Password verification failed.', code: 'INVALID_CURRENT_PASSWORD' });
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

router.post('/change-password', requireAuth, passwordRateLimit, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const employeeId = req.session.user.employeeId;
  if (!db) return res.status(503).json({ success: false, error: 'Account database is unavailable.' });
  try {
    const sessionAction = normalizePasswordSessionAction(req.body?.sessionAction);
    validatePassword(newPassword);
    if (req.session.user.requiresPasswordChange !== true && !(await verifyCurrentPassword(employeeId, currentPassword))) {
      return res.status(403).json({ success: false, error: 'Current password is incorrect.', code: 'INVALID_CURRENT_PASSWORD' });
    }
    if (await verifyCurrentPassword(employeeId, newPassword)) {
      return res.status(400).json({ success: false, error: 'New password must be different from the current or temporary password.' });
    }
    const userSnapshot = await db.collection(COLLECTIONS.USERS).doc(employeeId).get();
    if (!userSnapshot.exists) return res.status(404).json({ success: false, error: 'Authenticated account was not found.' });
    const now = nowIso();
    const authVersion = nextAuthVersion(userSnapshot.data());
    const batch = db.batch();
    batch.set(db.collection(COLLECTIONS.USER_CREDENTIALS).doc(employeeId), { passwordHash: await hashPassword(newPassword), updatedAt: now, credentialsUpdatedAt: now }, { merge: true });
    batch.update(db.collection(COLLECTIONS.USERS).doc(employeeId), { requiresPasswordChange: false, passwordChangedAt: now, credentialsUpdatedAt: now, authVersion, updatedAt: now });
    queueAuditEvent(batch, db, {
      eventType: 'USER_PASSWORD_CHANGED', actorUserId: employeeId,
      entityType: 'USER', entityId: employeeId,
      details: sessionAction === PASSWORD_SESSION_ACTIONS.SIGN_OUT_ALL
        ? `Changed the password for account ${employeeId} and signed out all devices.`
        : `Changed the password for account ${employeeId}, signed out other devices, and kept the current device signed in.`,
      createdAt: now
    });
    await batch.commit();
    await revokeFirebaseSessions(employeeId);

    if (sessionAction === PASSWORD_SESSION_ACTIONS.SIGN_OUT_ALL) {
      if (req.session) req.session.user = null;
      if (req.session && typeof req.session.destroy === 'function') {
        await new Promise(resolve => req.session.destroy(error => {
          if (error) console.warn('[HUGPONG Auth] Current-session destruction was not acknowledged.');
          resolve();
        }));
      }
      res.clearCookie('hugpong.sid');
      return res.json({
        success: true,
        message: 'Password updated successfully. All devices have been signed out.',
        sessionAction,
        signOutRequired: true
      });
    }

    Object.assign(req.session.user, { requiresPasswordChange: false, passwordChanged: true, passwordChangedAt: now, authVersion });
    return res.json({
      success: true,
      message: 'Password updated successfully. This device remains signed in; other devices have been signed out.',
      sessionAction,
      signOutRequired: false,
      user: req.session.user,
      ...(await issueCredentials(req.session.user))
    });
  } catch (error) {
    const status = error.status || (/Password must|less predictable password/.test(error.message) ? 400 : 500);
    return res.status(status).json({ success: false, error: status === 400 ? error.message : 'Password update could not be saved.' });
  }
});

router.post('/change-phone', requireAuth, passwordRateLimit, async (req, res) => {
  const employeeId = req.session.user.employeeId;
  const phone = normalizeContact(req.body?.phone);
  if (!db) return res.status(503).json({ success: false, error: 'Account database is unavailable.' });
  if (!/^09\d{9}$/.test(phone)) return res.status(400).json({ success: false, error: 'A valid Philippine mobile number is required.' });
  if (!(await verifyCurrentPassword(employeeId, req.body?.currentPassword))) {
    return res.status(403).json({ success: false, error: 'Current password is incorrect.', code: 'INVALID_CURRENT_PASSWORD' });
  }
  const duplicate = await db.collection(COLLECTIONS.USERS).where('phone', '==', phone).limit(1).get();
  if (!duplicate.empty && duplicate.docs[0].id !== employeeId) {
    return res.status(409).json({ success: false, error: 'This mobile number is already registered.' });
  }
  const snapshot = await db.collection(COLLECTIONS.USERS).doc(employeeId).get();
  if (!snapshot.exists) return res.status(404).json({ success: false, error: 'Authenticated account was not found.' });
  if (phone === normalizeContact(snapshot.data().phone)) {
    return res.status(400).json({ success: false, error: 'Enter a different mobile number.' });
  }
  const now = nowIso();
  const authVersion = nextAuthVersion(snapshot.data());
  try {
    await db.runTransaction(async transaction => {
      const liveSnapshot = await transaction.get(snapshot.ref);
      if (!liveSnapshot.exists) throw Object.assign(new Error('Authenticated account was not found.'), { status: 404 });
      const live = liveSnapshot.data();
      if (live.updatedAt !== snapshot.data().updatedAt) {
        throw Object.assign(new Error('Account was changed by another request. Reload and try again.'), { status: 409 });
      }
      const newPhoneRef = db.collection(COLLECTIONS.ACCOUNT_IDENTIFIERS).doc(phoneIdentifierId(phone));
      const oldPhoneRef = db.collection(COLLECTIONS.ACCOUNT_IDENTIFIERS).doc(phoneIdentifierId(live.phone));
      const [newClaim, oldClaim] = await Promise.all([transaction.get(newPhoneRef), transaction.get(oldPhoneRef)]);
      if (newClaim.exists && newClaim.data().userId !== employeeId) {
        throw Object.assign(new Error('This mobile number is already registered.'), { status: 409 });
      }
      if (!newClaim.exists) transaction.create(newPhoneRef, { type: 'PHONE', userId: employeeId, createdAt: now, updatedAt: now });
      if (oldClaim.exists && oldClaim.data().userId === employeeId) transaction.delete(oldPhoneRef);
      transaction.update(snapshot.ref, { phone, phoneVerifiedAt: null, credentialsUpdatedAt: now, authVersion, updatedAt: now });
      queueAuditEvent(transaction, db, {
        eventType: 'USER_PHONE_CHANGED', actorUserId: employeeId,
        entityType: 'USER', entityId: employeeId,
        details: `Changed the registered phone for account ${employeeId}.`, createdAt: now
      });
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'Mobile number update could not be saved.' });
  }
  await revokeFirebaseSessions(employeeId);
  Object.assign(req.session.user, { contact: phone, mobile: phone, phoneVerified: false, pendingFirstLoginVerification: true, authVersion });
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
    if (!['web', 'mobile'].includes(clientPlatform)) {
      return res.status(403).json({ success: false, authenticated: false, error: 'A recognized client platform is required.', code: 'CLIENT_PLATFORM_REQUIRED' });
    }
    if (!isRoleAllowedOnPlatform(sessionUser.canonicalRole, clientPlatform)) {
      req.session.user = null;
      res.clearCookie('hugpong.sid');
      return res.status(403).json({
        success: false,
        authenticated: false,
        error: platformRestrictionMessage(sessionUser.canonicalRole, clientPlatform)
      });
    }
    sessionUser.platform = clientPlatform;
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
