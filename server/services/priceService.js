'use strict';

const { COLLECTIONS, buildSraPrice, nowIso, requiredString } = require('../schema/firestoreSchema');

async function publishSraPrice(database, input, context = {}) {
  if (!database) throw new Error('Database is unavailable.');

  const priceId = requiredString(
    input.id || `PRC-${Date.now().toString(36).toUpperCase()}`,
    'id',
    { max: 120 }
  );
  const payload = buildSraPrice(input, {
    publishedByUserId: context.publishedByUserId,
    publishedAt: context.publishedAt || nowIso()
  });
  const ref = database.collection(COLLECTIONS.SRA_PRICES).doc(priceId);
  const existing = await ref.get();

  if (existing.exists) {
    const current = buildSraPrice(existing.data());
    const isReplay = current.publishedByUserId === payload.publishedByUserId
      && current.effectiveDate === payload.effectiveDate
      && current.circularNumber === payload.circularNumber;
    if (isReplay) return { created: false, replayed: true, data: { id: priceId, ...current } };
    const conflict = new Error('Price ID already belongs to another publication.');
    conflict.statusCode = 409;
    throw conflict;
  }

  await ref.create(payload);
  return { created: true, replayed: false, data: { id: priceId, ...payload } };
}

module.exports = { publishSraPrice };
