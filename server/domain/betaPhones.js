'use strict';

// Internal fixture identifiers, never actual SMS destinations.
const BETA_PHONES = Object.freeze(['09172568029', '09201843355', '09260941246', '09350921060', '09479003575']);
const LEGACY_BETA_PHONES = Object.freeze(['09000000001', '09000000002', '09000000003', '09000000004', '09000000005']);

async function assertNotBetaSmsDestination(number, { database } = {}) {
  const digits = String(number || '').replace(/\D/g, '');
  const normalized = digits.startsWith('63') ? `0${digits.slice(2)}` : digits;
  if (!BETA_PHONES.includes(normalized) && !LEGACY_BETA_PHONES.includes(normalized)) return;

  // Only an existing fixture owns this restriction. Cleanup releases its phone
  // for normal registration/recovery; never cache this decision across requests.
  const db = database || require('../firebase-admin').db;
  if (!db) throw Object.assign(new Error('SMS destination verification is temporarily unavailable.'), { code: 'SMS_DESTINATION_CHECK_UNAVAILABLE' });
  const { COLLECTIONS } = require('../schema/firestoreSchema');
  const { phoneIdentifierId } = require('../services/accountProvisioningService');
  const identifier = await db.collection(COLLECTIONS.ACCOUNT_IDENTIFIERS).doc(phoneIdentifierId(normalized)).get();
  if (!identifier.exists || !identifier.data().userId) return;
  const owner = await db.collection(COLLECTIONS.USERS).doc(identifier.data().userId).get();
  const user = owner.exists ? owner.data() : null;
  if (user?.phone === normalized && user.isBetaData === true && user.betaBatchId) {
    throw Object.assign(new Error('SMS is unavailable for beta fixture phone numbers. Use the supplied beta User ID and password.'), { code: 'BETA_SMS_DISABLED' });
  }
}

module.exports = { BETA_PHONES, assertNotBetaSmsDestination };
