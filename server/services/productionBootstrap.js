'use strict';

const { normalizeStructuredName } = require('../domain/personName');
const { createUserId } = require('../domain/systemIds');
const { hashPassword, validatePassword } = require('../security/password');
const { COLLECTIONS, ROLES, nowIso } = require('../schema/firestoreSchema');
const { phoneIdentifierId, queueUserAccountCreation } = require('./accountProvisioningService');

const PRODUCTION_BOOTSTRAP_CONFIRMATION = 'CREATE_INITIAL_HUGPONG_SUPER_ADMIN';
const PRODUCTION_BOOTSTRAP_MARKER_ID = 'initial-super-admin';

function projectId(value) {
  return String(value || '').trim();
}

function assertProductionBootstrapAllowed(env = process.env, actualProjectId) {
  if (String(env.NODE_ENV || '').trim().toLowerCase() !== 'production') {
    throw new Error('Production Super Admin bootstrap requires NODE_ENV=production.');
  }
  if (env.HUGPONG_ALLOW_PRODUCTION_BOOTSTRAP !== 'true') {
    throw new Error('Set HUGPONG_ALLOW_PRODUCTION_BOOTSTRAP=true only for the explicit bootstrap invocation.');
  }
  if (env.HUGPONG_PRODUCTION_BOOTSTRAP_CONFIRM !== PRODUCTION_BOOTSTRAP_CONFIRMATION) {
    throw new Error(`Set HUGPONG_PRODUCTION_BOOTSTRAP_CONFIRM=${PRODUCTION_BOOTSTRAP_CONFIRMATION}.`);
  }
  const expectedProjectId = projectId(env.HUGPONG_PRODUCTION_BOOTSTRAP_PROJECT_ID);
  const configuredProjectId = projectId(env.FIREBASE_PROJECT_ID);
  const activeProjectId = projectId(actualProjectId);
  if (!expectedProjectId || !configuredProjectId || !activeProjectId) {
    throw new Error('The expected, configured, and active Firebase project IDs are all required.');
  }
  if (expectedProjectId !== activeProjectId || configuredProjectId !== activeProjectId) {
    throw new Error(`Firebase project mismatch: expected ${expectedProjectId}, configured ${configuredProjectId}, active ${activeProjectId}.`);
  }
  const smsProvider = String(env.SMS_PROVIDER || '').trim().toLowerCase();
  if (!['semaphore', 'iprog'].includes(smsProvider)) {
    throw new Error('Production Super Admin bootstrap requires a configured production SMS provider for first-login phone verification.');
  }
  if (smsProvider === 'semaphore' && !String(env.SEMAPHORE_API_KEY || '').trim()) {
    throw new Error('Production Super Admin bootstrap requires SEMAPHORE_API_KEY when SMS_PROVIDER=semaphore.');
  }
  if (smsProvider === 'iprog' && !String(env.IPROG_SMS_API_TOKEN || '').trim()) {
    throw new Error('Production Super Admin bootstrap requires IPROG_SMS_API_TOKEN when SMS_PROVIDER=iprog.');
  }
}

function productionSuperAdminInput(env = process.env) {
  const identity = normalizeStructuredName({
    firstName: env.HUGPONG_BOOTSTRAP_FIRST_NAME,
    middleName: env.HUGPONG_BOOTSTRAP_MIDDLE_NAME,
    lastName: env.HUGPONG_BOOTSTRAP_LAST_NAME,
    suffix: env.HUGPONG_BOOTSTRAP_SUFFIX
  });
  const phone = String(env.HUGPONG_BOOTSTRAP_PHONE || '').replace(/\D/g, '');
  if (!/^09\d{9}$/.test(phone)) {
    throw new Error('HUGPONG_BOOTSTRAP_PHONE must be an 11-digit Philippine mobile number.');
  }
  const temporaryPassword = env.HUGPONG_BOOTSTRAP_TEMPORARY_PASSWORD;
  validatePassword(temporaryPassword);
  return { identity, phone, temporaryPassword };
}

async function inspectProductionBootstrap(database) {
  if (!database) throw new Error('Firebase Admin Firestore is unavailable.');
  const markerRef = database.collection(COLLECTIONS.SYSTEM_METADATA).doc(PRODUCTION_BOOTSTRAP_MARKER_ID);
  const [markerSnapshot, userSnapshot] = await Promise.all([
    markerRef.get(),
    database.collection(COLLECTIONS.USERS).limit(1).get()
  ]);
  if (markerSnapshot.exists) {
    return { eligible: false, reason: 'BOOTSTRAP_ALREADY_COMPLETED' };
  }
  if (!userSnapshot.empty) {
    return { eligible: false, reason: 'USER_DATABASE_NOT_EMPTY' };
  }
  return { eligible: true, reason: null };
}

async function bootstrapInitialProductionSuperAdmin({ database, env = process.env, actualProjectId, timestamp = nowIso() }) {
  if (!database) throw new Error('Firebase Admin Firestore is unavailable.');
  assertProductionBootstrapAllowed(env, actualProjectId);
  const { identity, phone, temporaryPassword } = productionSuperAdminInput(env);
  const userId = createUserId(ROLES.SUPER_ADMIN);
  const markerRef = database.collection(COLLECTIONS.SYSTEM_METADATA).doc(PRODUCTION_BOOTSTRAP_MARKER_ID);
  const userRef = database.collection(COLLECTIONS.USERS).doc(userId);
  const credentialRef = database.collection(COLLECTIONS.USER_CREDENTIALS).doc(userId);
  const phoneRef = database.collection(COLLECTIONS.ACCOUNT_IDENTIFIERS).doc(phoneIdentifierId(phone));
  const passwordHash = await hashPassword(temporaryPassword);
  const user = {
    ...identity,
    phone,
    role: ROLES.SUPER_ADMIN,
    status: 'ACTIVE',
    affiliatedBlockFarmId: null,
    phoneVerifiedAt: null,
    requiresPasswordChange: true,
    passwordChangedAt: null,
    authVersion: 1,
    credentialsUpdatedAt: timestamp,
    disabledAt: null,
    approvedByUserId: userId,
    approvedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const credential = {
    passwordHash,
    credentialsUpdatedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await database.runTransaction(async transaction => {
    const [markerSnapshot, usersSnapshot, userSnapshot, credentialSnapshot, phoneSnapshot] = await Promise.all([
      transaction.get(markerRef),
      transaction.get(database.collection(COLLECTIONS.USERS).limit(1)),
      transaction.get(userRef),
      transaction.get(credentialRef),
      transaction.get(phoneRef)
    ]);
    if (markerSnapshot.exists) {
      throw new Error('The production Super Admin bootstrap has already completed.');
    }
    if (!usersSnapshot.empty) {
      throw new Error('The user database is not empty. Refusing to bootstrap an initial production administrator.');
    }
    if (userSnapshot.exists || credentialSnapshot.exists || phoneSnapshot.exists) {
      throw new Error('A generated account identity is already reserved. Refusing to overwrite production data.');
    }
    transaction.create(markerRef, {
      type: 'INITIAL_SUPER_ADMIN_BOOTSTRAP',
      userId,
      projectId: actualProjectId,
      completedAt: timestamp
    });
    queueUserAccountCreation(transaction, database, {
      user,
      credential,
      actorUserId: userId,
      eventType: 'PRODUCTION_SUPER_ADMIN_BOOTSTRAPPED',
      details: `Created initial production Super Admin account ${userId}.`
    }, userId);
  });

  return {
    created: true,
    userId,
    role: ROLES.SUPER_ADMIN,
    phoneVerificationRequired: true,
    passwordChangeRequired: true
  };
}

module.exports = {
  PRODUCTION_BOOTSTRAP_CONFIRMATION,
  PRODUCTION_BOOTSTRAP_MARKER_ID,
  assertProductionBootstrapAllowed,
  productionSuperAdminInput,
  inspectProductionBootstrap,
  bootstrapInitialProductionSuperAdmin
};
