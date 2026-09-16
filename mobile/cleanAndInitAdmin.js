'use strict';

const { db } = require('../server/firebase-admin');
const { hashPassword } = require('../server/security/password');
const { COLLECTIONS } = require('../server/schema/firestoreSchema');

function requiredEnvironment(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function initializeAdmin() {
  const userId = requiredEnvironment('HUGPONG_BOOTSTRAP_USER_ID');
  const displayName = requiredEnvironment('HUGPONG_BOOTSTRAP_DISPLAY_NAME');
  const phone = requiredEnvironment('HUGPONG_BOOTSTRAP_PHONE').replace(/\D/g, '');
  const password = requiredEnvironment('HUGPONG_BOOTSTRAP_PASSWORD');
  if (!/^01\d{6}$/.test(userId)) throw new Error('HUGPONG_BOOTSTRAP_USER_ID must be an eight-digit Super Admin ID beginning with 01.');
  if (!/^09\d{9}$/.test(phone)) throw new Error('HUGPONG_BOOTSTRAP_PHONE must be an 11-digit Philippine mobile number.');
  if (password.length < 12) throw new Error('HUGPONG_BOOTSTRAP_PASSWORD must contain at least 12 characters.');

  const now = new Date().toISOString();
  if (!db) throw new Error('Firebase Admin is not configured.');
  const passwordHash = await hashPassword(password);
  const user = {
    displayName,
    phone,
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    phoneVerifiedAt: now,
    requiresPasswordChange: true,
    passwordChangedAt: null,
    approvedByUserId: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now
  };
  const batch = db.batch();
  batch.set(db.collection(COLLECTIONS.USERS).doc(userId), user);
  batch.set(db.collection(COLLECTIONS.USER_CREDENTIALS).doc(userId), {
    passwordHash,
    createdAt: now,
    updatedAt: now
  });
  await batch.commit();
  console.info(`[HUGPONG] Super Admin profile and server-only credentials created for ${userId}.`);
}

initializeAdmin().catch(error => {
  console.error(`[HUGPONG] Bootstrap failed: ${error.message}`);
  process.exitCode = 1;
});
