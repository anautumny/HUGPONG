'use strict';

const { hashPassword, validatePassword } = require('../security/password');
const { COLLECTIONS, ROLES, nowIso } = require('../schema/firestoreSchema');

const DEVELOPMENT_SUPER_ADMIN = Object.freeze({
  userId: '01000001',
  displayName: 'Development Super Admin',
  phone: '09170000001'
});

function assertDevelopmentBootstrapAllowed(env = process.env) {
  if (String(env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Development test-account bootstrap is forbidden in production.');
  }
  if (env.ALLOW_DEVELOPMENT_TEST_ACCOUNTS !== 'true') {
    throw new Error('Set ALLOW_DEVELOPMENT_TEST_ACCOUNTS=true to run the explicit development bootstrap.');
  }
  if (String(env.SMS_PROVIDER || '').toLowerCase() !== 'console') {
    throw new Error('Development test-account bootstrap requires SMS_PROVIDER=console.');
  }
  validatePassword(env.DEVELOPMENT_TEST_PASSWORD);
}

async function bootstrapInitialDevelopmentSuperAdmin({ db, password }) {
  if (!db) throw new Error('Firebase Admin Firestore is unavailable.');
  validatePassword(password);

  const existingSuperAdmins = await db.collection(COLLECTIONS.USERS)
    .where('role', '==', ROLES.SUPER_ADMIN)
    .limit(2)
    .get();

  if (!existingSuperAdmins.empty) {
    const existing = existingSuperAdmins.docs.find(doc => doc.id === DEVELOPMENT_SUPER_ADMIN.userId);
    if (existing
      && existing.data().phone === DEVELOPMENT_SUPER_ADMIN.phone
      && existing.data().displayName === DEVELOPMENT_SUPER_ADMIN.displayName
      && existing.data().status === 'ACTIVE') {
      return { created: false, userId: existing.id };
    }
    throw new Error('A legitimate Super Admin already exists. Refusing to create or replace a development Super Admin.');
  }

  const [idSnapshot, phoneSnapshot] = await Promise.all([
    db.collection(COLLECTIONS.USERS).doc(DEVELOPMENT_SUPER_ADMIN.userId).get(),
    db.collection(COLLECTIONS.USERS).where('phone', '==', DEVELOPMENT_SUPER_ADMIN.phone).limit(1).get()
  ]);
  if (idSnapshot.exists || !phoneSnapshot.empty) {
    throw new Error('The reserved development Super Admin ID or phone is already in use. Refusing to overwrite an account.');
  }

  const now = nowIso();
  const user = {
    displayName: DEVELOPMENT_SUPER_ADMIN.displayName,
    phone: DEVELOPMENT_SUPER_ADMIN.phone,
    role: ROLES.SUPER_ADMIN,
    status: 'ACTIVE',
    phoneVerifiedAt: now,
    requiresPasswordChange: false,
    passwordChangedAt: now,
    approvedByUserId: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now
  };
  const batch = db.batch();
  batch.create(db.collection(COLLECTIONS.USERS).doc(DEVELOPMENT_SUPER_ADMIN.userId), user);
  batch.create(db.collection(COLLECTIONS.USER_CREDENTIALS).doc(DEVELOPMENT_SUPER_ADMIN.userId), {
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now
  });
  await batch.commit();
  return { created: true, userId: DEVELOPMENT_SUPER_ADMIN.userId };
}

module.exports = {
  DEVELOPMENT_SUPER_ADMIN,
  assertDevelopmentBootstrapAllowed,
  bootstrapInitialDevelopmentSuperAdmin
};
