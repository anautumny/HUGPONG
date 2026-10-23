'use strict';
const crypto = require('crypto');
const { COLLECTIONS } = require('../schema/firestoreSchema');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

function creationReceipt(database, actorId, context, input, namespace = 'FIELD_ENROLLMENT') {
  if (!context) throw Object.assign(new Error('A stable enrollment request key is required. Update the app and try again.'), { status: 400, code: 'MUTATION_KEY_REQUIRED' });
  const ref = database.collection(COLLECTIONS.MUTATION_RECEIPTS).doc(hash([namespace, actorId, context.idempotencyKey]));
  const inputHash = hash(input);
  return {
    async read(transaction) {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const record = snapshot.data();
      if (record.inputHash !== inputHash) throw Object.assign(new Error('This enrollment request key was already used for different field details. Start a new enrollment.'), { status: 409 });
      return record.result;
    },
    write(transaction, result, now) {
      transaction.create(ref, { actorUserId: actorId, inputHash, result, createdAt: now,
        deleteAfter: new Date(Date.parse(now) + 90 * 24 * 60 * 60 * 1000) });
    }
  };
}
module.exports = { creationReceipt };
