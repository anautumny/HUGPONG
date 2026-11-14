'use strict';

const { COLLECTIONS, buildSraPrice, nowIso, requiredString } = require('../schema/firestoreSchema');
const { createPriceId } = require('../domain/systemIds');
const { queueAuditEvent } = require('./auditWriter');
const { comparableChange } = require('./priceAnalyticsService');
const { creationReceipt } = require('./creationReceipt');

async function publishSraPrice(database, input, context = {}) {
  if (!database) throw new Error('Database is unavailable.');

  const priceId = requiredString(
    input.id || createPriceId(),
    'id',
    { max: 120 }
  );
  // Price deltas are derived from persisted history. Values supplied by a
  // browser or phone are deliberately ignored so a modified client cannot
  // manufacture the reported movement.
  const basePayload = buildSraPrice({
    ...input,
    importBatchId: '',
    sourceFileSha256: '',
    sugarPriceChange: 0,
    molassesPriceChange: 0
  }, {
    publishedByUserId: context.publishedByUserId,
    publishedAt: context.publishedAt || nowIso()
  });
  const ref = database.collection(COLLECTIONS.SRA_PRICES).doc(priceId);
  const fingerprint = Object.fromEntries(Object.entries(basePayload).filter(([key]) => !['publishedAt', 'sugarPriceChange', 'molassesPriceChange'].includes(key)));
  const receipt = context.mutation ? creationReceipt(database, context.publishedByUserId, context.mutation, fingerprint, 'PRICE_PUBLICATION') : null;
  return database.runTransaction(async transaction => {
    const replay = receipt ? await receipt.read(transaction) : null;
    if (replay) return { ...replay, created: false, replayed: true };
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const current = buildSraPrice(existing.data());
      const isReplay = Object.keys(basePayload).filter(key => !['publishedAt', 'sugarPriceChange', 'molassesPriceChange'].includes(key))
        .every(key => JSON.stringify(current[key]) === JSON.stringify(basePayload[key]));
      if (isReplay) {
        const result = { created: false, replayed: true, data: { id: priceId, ...current } };
        receipt?.write(transaction, result, basePayload.publishedAt);
        return result;
      }
      const conflict = new Error('Price ID already belongs to another publication.');
      conflict.statusCode = 409;
      throw conflict;
    }
    const previousQuery = database.collection(COLLECTIONS.SRA_PRICES)
      .where('effectiveDate', '<', basePayload.effectiveDate)
      .orderBy('effectiveDate', 'desc')
      .orderBy('publishedAt', 'desc')
      .orderBy('__name__', 'asc')
      .limit(1);
    const previousSnapshot = await transaction.get(previousQuery);
    const previous = previousSnapshot.docs?.[0]?.data?.() || null;
    const payload = {
      ...basePayload,
      sugarPriceChange: comparableChange(basePayload, previous, 'sugar'),
      molassesPriceChange: comparableChange(basePayload, previous, 'molasses')
    };
    transaction.create(ref, payload);
    queueAuditEvent(transaction, database, {
      eventType: 'SRA_PRICE_PUBLISHED',
      actorUserId: payload.publishedByUserId,
      entityType: 'SRA_PRICE',
      entityId: priceId,
      details: `Published price reference ${payload.circularNumber}, effective ${payload.effectiveDate}.`,
      createdAt: payload.publishedAt
    });
    const result = { created: true, replayed: false, data: { id: priceId, ...payload } };
    receipt?.write(transaction, result, payload.publishedAt);
    return result;
  });
}

module.exports = { publishSraPrice };
