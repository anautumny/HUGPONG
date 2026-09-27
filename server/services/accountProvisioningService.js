'use strict';

const crypto = require('crypto');
const { COLLECTIONS } = require('../schema/firestoreSchema');
const { createUserId } = require('../domain/systemIds');
const { queueAuditEvent } = require('./auditWriter');

const MAX_ID_ATTEMPTS = 30;

function phoneIdentifierId(phone) {
  const normalized = String(phone || '').replace(/\D/g, '');
  if (!/^09\d{9}$/.test(normalized)) throw new Error('A valid Philippine mobile number is required.');
  return crypto.createHash('sha256').update(`HUGPONG_PHONE:${normalized}`).digest('hex');
}

function isAlreadyExists(error) {
  const code = String(error?.code ?? '').toLowerCase();
  return code === '6' || code === 'already-exists' || /already exists/i.test(String(error?.message || ''));
}

async function createUserAccount(database, input) {
  const requestedUserId = input.requestedUserId || null;
  const phoneRef = database.collection(COLLECTIONS.ACCOUNT_IDENTIFIERS).doc(phoneIdentifierId(input.user.phone));
  for (let attempt = 0; attempt < (requestedUserId ? 1 : MAX_ID_ATTEMPTS); attempt += 1) {
    const userId = requestedUserId || createUserId(input.user.role);
    const batch = database.batch();
    batch.create(database.collection(COLLECTIONS.USERS).doc(userId), input.user);
    batch.create(database.collection(COLLECTIONS.USER_CREDENTIALS).doc(userId), input.credential);
    batch.create(phoneRef, {
      type: 'PHONE',
      userId,
      createdAt: input.user.createdAt,
      updatedAt: input.user.updatedAt
    });
    queueAuditEvent(batch, database, {
      eventType: input.eventType || 'USER_ACCOUNT_CREATED',
      actorUserId: input.actorUserId || userId,
      entityType: 'USER',
      entityId: userId,
      details: input.details || `Created ${input.user.role} account ${userId}.`,
      createdAt: input.user.createdAt
    });
    try {
      await batch.commit();
      return userId;
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      const phoneOwner = await phoneRef.get();
      if (phoneOwner.exists) {
        const conflict = new Error('phone is already registered.');
        conflict.status = 409;
        throw conflict;
      }
      if (requestedUserId) throw error;
    }
  }
  const exhausted = new Error('A unique User ID could not be issued. Please try again.');
  exhausted.status = 503;
  throw exhausted;
}

module.exports = { createUserAccount, phoneIdentifierId, isAlreadyExists };
