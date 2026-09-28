'use strict';

const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const { Timestamp, GeoPoint } = require('firebase-admin/firestore');
const { COLLECTIONS } = require('../schema/firestoreSchema');

const scrypt = promisify(crypto.scrypt);
const BACKUP_FORMAT = 'HUGPONG_ENCRYPTED_LOGICAL_BACKUP';
const BACKUP_FORMAT_VERSION = 1;
const BACKUP_SCHEMA_VERSION = '2026-09-28';
const MAX_BACKUP_DOCUMENTS = 10000;
const MAX_PLAINTEXT_BYTES = 24 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
const KDF_OPTIONS = Object.freeze({ N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const BACKUP_COLLECTIONS = Object.freeze([
  COLLECTIONS.USERS,
  COLLECTIONS.BLOCK_FARMS,
  COLLECTIONS.FIELDS,
  COLLECTIONS.CROP_CYCLES,
  COLLECTIONS.OPERATION_LOGS,
  COLLECTIONS.AUDIT_REPORTS,
  COLLECTIONS.AUDIT_LOGS,
  COLLECTIONS.SRA_PRICES,
  COLLECTIONS.SUPPORT_TICKETS
]);
const EXCLUDED_SECURITY_COLLECTIONS = Object.freeze([
  COLLECTIONS.USER_CREDENTIALS,
  COLLECTIONS.ACCOUNT_IDENTIFIERS,
  COLLECTIONS.SERVER_SESSIONS,
  COLLECTIONS.SECURITY_RATE_LIMITS,
  COLLECTIONS.PASSWORD_RECOVERY_CHALLENGES,
  COLLECTIONS.TERMINAL_DIAGNOSTICS,
  COLLECTIONS.DIAGNOSTIC_EVENTS,
  COLLECTIONS.BACKUP_OPERATIONS
].filter(Boolean));

function serviceError(message, status = 400, code = 'BACKUP_INVALID') {
  return Object.assign(new Error(message), { status, code });
}

function assertBackupPassphrase(value, currentPassword = '') {
  const passphrase = typeof value === 'string' ? value : '';
  if (passphrase.length < 16 || passphrase.length > 128) {
    throw serviceError('Backup passphrase must contain between 16 and 128 characters.', 400, 'BACKUP_PASSPHRASE_WEAK');
  }
  if (!/[a-z]/.test(passphrase) || !/[A-Z]/.test(passphrase) || !/\d/.test(passphrase) || !/[^A-Za-z0-9]/.test(passphrase)) {
    throw serviceError('Backup passphrase must contain uppercase, lowercase, number, and symbol characters.', 400, 'BACKUP_PASSPHRASE_WEAK');
  }
  if (currentPassword && passphrase === currentPassword) {
    throw serviceError('Backup passphrase must be different from the account password.', 400, 'BACKUP_PASSPHRASE_REUSED');
  }
  return passphrase;
}

function safeDocumentId(value) {
  const id = String(value || '');
  if (!id || id === '.' || id === '..' || id.includes('/') || Buffer.byteLength(id, 'utf8') > 1500) {
    throw serviceError('Backup contains an invalid document identifier.', 400, 'BACKUP_DOCUMENT_INVALID');
  }
  return id;
}

function encodeValue(value, depth = 0) {
  if (depth > 30) throw serviceError('Backup data nesting exceeds the supported depth.', 413, 'BACKUP_TOO_LARGE');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw serviceError('Backup data contains a non-finite number.');
    return value;
  }
  if (value === undefined) return null;
  if (value instanceof Date) return { __hugpongType: 'date', value: value.toISOString() };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { __hugpongType: 'bytes', value: Buffer.from(value).toString('base64') };
  }
  if (typeof value?.toDate === 'function') {
    return { __hugpongType: 'timestamp', value: value.toDate().toISOString() };
  }
  if (Number.isFinite(value?.latitude) && Number.isFinite(value?.longitude)) {
    return { __hugpongType: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (typeof value?.path === 'string' && typeof value?.get === 'function') {
    return { __hugpongType: 'reference', value: value.path };
  }
  if (Array.isArray(value)) return value.map(item => encodeValue(item, depth + 1));
  if (!value || typeof value !== 'object') throw serviceError('Backup data contains an unsupported value.');
  const encoded = {};
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw serviceError('Backup data contains a forbidden property name.');
    }
    encoded[key] = encodeValue(child, depth + 1);
  }
  return encoded;
}

function decodeValue(value, database, depth = 0) {
  if (depth > 30) throw serviceError('Backup data nesting exceeds the supported depth.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map(item => decodeValue(item, database, depth + 1));
  if (!value || typeof value !== 'object') throw serviceError('Backup data contains an unsupported value.');
  if (value.__hugpongType) {
    if (value.__hugpongType === 'date') return new Date(value.value);
    if (value.__hugpongType === 'timestamp') return Timestamp.fromDate(new Date(value.value));
    if (value.__hugpongType === 'bytes') return Buffer.from(String(value.value || ''), 'base64');
    if (value.__hugpongType === 'geopoint') return new GeoPoint(Number(value.latitude), Number(value.longitude));
    if (value.__hugpongType === 'reference') {
      if (!/^([^/]+\/[^/]+)(\/[^/]+\/[^/]+)*$/.test(String(value.value || ''))) {
        throw serviceError('Backup contains an invalid document reference.');
      }
      return database.doc(value.value);
    }
    throw serviceError('Backup contains an unsupported typed value.');
  }
  const decoded = {};
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw serviceError('Backup data contains a forbidden property name.');
    }
    decoded[key] = decodeValue(child, database, depth + 1);
  }
  return decoded;
}

async function readCollection(database, name) {
  const snapshot = await database.collection(name).get();
  return snapshot.docs
    .map(document => ({ id: safeDocumentId(document.id), data: encodeValue(document.data()) }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function payloadChecksum(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function createBackupArchive(database, { passphrase, projectId, actorUserId, now = new Date() }) {
  if (!database) throw serviceError('Database is unavailable.', 503, 'DATABASE_UNAVAILABLE');
  assertBackupPassphrase(passphrase);
  const collections = {};
  let documentCount = 0;
  for (const name of BACKUP_COLLECTIONS) {
    const documents = await readCollection(database, name);
    documentCount += documents.length;
    if (documentCount > MAX_BACKUP_DOCUMENTS) {
      throw serviceError(`Backup exceeds the ${MAX_BACKUP_DOCUMENTS}-document safety limit.`, 413, 'BACKUP_TOO_LARGE');
    }
    collections[name] = documents;
  }

  const createdAt = now.toISOString();
  const core = {
    format: 'HUGPONG_LOGICAL_BACKUP',
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt,
    sourceProjectId: String(projectId || '').trim(),
    createdByUserId: String(actorUserId || '').trim(),
    includedCollections: [...BACKUP_COLLECTIONS],
    excludedSecurityCollections: [...EXCLUDED_SECURITY_COLLECTIONS],
    documentCount,
    collections
  };
  const payload = { ...core, checksumSha256: payloadChecksum(core) };
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  if (plaintext.length > MAX_PLAINTEXT_BYTES) {
    throw serviceError('Backup exceeds the uncompressed safety limit.', 413, 'BACKUP_TOO_LARGE');
  }

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = Buffer.from(await scrypt(passphrase, salt, 32, KDF_OPTIONS));
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${BACKUP_FORMAT}:${BACKUP_FORMAT_VERSION}`));
  const compressed = zlib.gzipSync(plaintext, { level: 9 });
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const archiveEnvelope = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    kdf: { name: 'scrypt', N: KDF_OPTIONS.N, r: KDF_OPTIONS.r, p: KDF_OPTIONS.p, salt: salt.toString('base64') },
    cipher: { name: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') },
    payload: ciphertext.toString('base64')
  };
  const archive = Buffer.from(JSON.stringify(archiveEnvelope), 'utf8');
  if (archive.length > MAX_ARCHIVE_BYTES) {
    throw serviceError('Encrypted backup exceeds the downloadable safety limit.', 413, 'BACKUP_TOO_LARGE');
  }
  const compactTimestamp = createdAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return {
    archiveBase64: archive.toString('base64'),
    fileName: `hugpong-backup-${compactTimestamp}.hpbak`,
    metadata: {
      createdAt,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      documentCount,
      collectionCounts: Object.fromEntries(BACKUP_COLLECTIONS.map(name => [name, collections[name].length])),
      archiveByteSize: archive.length,
      archiveSha256: crypto.createHash('sha256').update(archive).digest('hex')
    }
  };
}

function strictArchiveBuffer(archiveBase64) {
  const value = String(archiveBase64 || '');
  if (!value || value.length > Math.ceil(MAX_ARCHIVE_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw serviceError('Backup archive is missing, malformed, or too large.', 400, 'BACKUP_ARCHIVE_INVALID');
  }
  const archive = Buffer.from(value, 'base64');
  if (!archive.length || archive.length > MAX_ARCHIVE_BYTES) {
    throw serviceError('Backup archive is missing, malformed, or too large.', 400, 'BACKUP_ARCHIVE_INVALID');
  }
  return archive;
}

function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw serviceError('Backup envelope is invalid.');
  if (envelope.format !== BACKUP_FORMAT || envelope.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw serviceError('Backup format is not supported.', 400, 'BACKUP_FORMAT_UNSUPPORTED');
  }
  if (envelope.kdf?.name !== 'scrypt' || envelope.kdf.N !== KDF_OPTIONS.N || envelope.kdf.r !== KDF_OPTIONS.r || envelope.kdf.p !== KDF_OPTIONS.p) {
    throw serviceError('Backup key-derivation settings are invalid.');
  }
  if (envelope.cipher?.name !== 'aes-256-gcm') throw serviceError('Backup encryption settings are invalid.');
}

function validateBackupPayload(payload, projectId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw serviceError('Backup payload is invalid.');
  if (payload.format !== 'HUGPONG_LOGICAL_BACKUP' || payload.formatVersion !== BACKUP_FORMAT_VERSION || payload.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw serviceError('Backup schema is not supported.', 400, 'BACKUP_SCHEMA_UNSUPPORTED');
  }
  if (String(payload.sourceProjectId || '') !== String(projectId || '')) {
    throw serviceError('Backup belongs to a different Firebase project.', 409, 'BACKUP_PROJECT_MISMATCH');
  }
  if (!Array.isArray(payload.includedCollections) || payload.includedCollections.length !== BACKUP_COLLECTIONS.length
    || payload.includedCollections.some((name, index) => name !== BACKUP_COLLECTIONS[index])) {
    throw serviceError('Backup collection manifest is invalid.');
  }
  if (!payload.collections || typeof payload.collections !== 'object' || Array.isArray(payload.collections)) {
    throw serviceError('Backup collection data is invalid.');
  }
  let count = 0;
  for (const name of BACKUP_COLLECTIONS) {
    const documents = payload.collections[name];
    if (!Array.isArray(documents)) throw serviceError(`Backup collection ${name} is invalid.`);
    const ids = new Set();
    for (const document of documents) {
      const id = safeDocumentId(document?.id);
      if (ids.has(id)) throw serviceError(`Backup collection ${name} contains a duplicate document.`);
      ids.add(id);
      if (!document.data || typeof document.data !== 'object' || Array.isArray(document.data)) {
        throw serviceError(`Backup collection ${name} contains invalid document data.`);
      }
      count += 1;
      if (count > MAX_BACKUP_DOCUMENTS) throw serviceError('Backup document limit is exceeded.', 413, 'BACKUP_TOO_LARGE');
    }
  }
  if (count !== Number(payload.documentCount)) throw serviceError('Backup document count does not match its manifest.');
  const { checksumSha256, ...core } = payload;
  const actualChecksum = payloadChecksum(core);
  if (!/^[a-f0-9]{64}$/.test(String(checksumSha256 || '')) || !crypto.timingSafeEqual(Buffer.from(checksumSha256), Buffer.from(actualChecksum))) {
    throw serviceError('Backup integrity verification failed.', 400, 'BACKUP_INTEGRITY_FAILED');
  }
  return payload;
}

async function decryptBackupArchive(database, archiveBase64, passphrase, projectId) {
  assertBackupPassphrase(passphrase);
  const archive = strictArchiveBuffer(archiveBase64);
  let envelope;
  try {
    envelope = JSON.parse(archive.toString('utf8'));
  } catch (_) {
    throw serviceError('Backup envelope could not be read.', 400, 'BACKUP_ARCHIVE_INVALID');
  }
  validateEnvelope(envelope);
  try {
    const salt = Buffer.from(envelope.kdf.salt, 'base64');
    const iv = Buffer.from(envelope.cipher.iv, 'base64');
    const tag = Buffer.from(envelope.cipher.tag, 'base64');
    const ciphertext = Buffer.from(envelope.payload, 'base64');
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || !ciphertext.length || ciphertext.length > MAX_ARCHIVE_BYTES) {
      throw new Error('Invalid encryption fields.');
    }
    const key = Buffer.from(await scrypt(passphrase, salt, 32, KDF_OPTIONS));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(`${BACKUP_FORMAT}:${BACKUP_FORMAT_VERSION}`));
    decipher.setAuthTag(tag);
    const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const plaintext = zlib.gunzipSync(compressed, { maxOutputLength: MAX_PLAINTEXT_BYTES });
    const payload = validateBackupPayload(JSON.parse(plaintext.toString('utf8')), projectId);
    return {
      payload,
      archiveSha256: crypto.createHash('sha256').update(archive).digest('hex'),
      archiveByteSize: archive.length
    };
  } catch (error) {
    if (error?.code?.startsWith?.('BACKUP_')) throw error;
    throw serviceError('Backup passphrase is incorrect or the archive was modified.', 400, 'BACKUP_DECRYPTION_FAILED');
  }
}

async function analyzeMissingRecords(database, payload) {
  const collectionCounts = {};
  let missingCount = 0;
  let existingCount = 0;
  for (const name of BACKUP_COLLECTIONS) {
    let collectionMissing = 0;
    let collectionExisting = 0;
    const documents = payload.collections[name];
    for (let index = 0; index < documents.length; index += 200) {
      const slice = documents.slice(index, index + 200);
      const refs = slice.map(document => database.collection(name).doc(document.id));
      const snapshots = refs.length ? await database.getAll(...refs) : [];
      for (const snapshot of snapshots) {
        if (snapshot.exists) collectionExisting += 1;
        else collectionMissing += 1;
      }
    }
    collectionCounts[name] = { missing: collectionMissing, existing: collectionExisting, total: documents.length };
    missingCount += collectionMissing;
    existingCount += collectionExisting;
  }
  return { missingCount, existingCount, total: missingCount + existingCount, collectionCounts };
}

async function restoreMissingRecords(database, payload) {
  let restoredCount = 0;
  let skippedExistingCount = 0;
  for (const name of BACKUP_COLLECTIONS) {
    const documents = payload.collections[name];
    for (let index = 0; index < documents.length; index += 200) {
      const slice = documents.slice(index, index + 200);
      const refs = slice.map(document => database.collection(name).doc(document.id));
      const snapshots = refs.length ? await database.getAll(...refs) : [];
      const batch = database.batch();
      let writes = 0;
      snapshots.forEach((snapshot, snapshotIndex) => {
        if (snapshot.exists) {
          skippedExistingCount += 1;
          return;
        }
        batch.create(refs[snapshotIndex], decodeValue(slice[snapshotIndex].data, database));
        writes += 1;
      });
      if (writes) {
        await batch.commit();
        restoredCount += writes;
      }
    }
  }
  return { restoredCount, skippedExistingCount };
}

module.exports = {
  BACKUP_COLLECTIONS,
  EXCLUDED_SECURITY_COLLECTIONS,
  BACKUP_FORMAT_VERSION,
  BACKUP_SCHEMA_VERSION,
  MAX_ARCHIVE_BYTES,
  assertBackupPassphrase,
  createBackupArchive,
  decryptBackupArchive,
  analyzeMissingRecords,
  restoreMissingRecords,
  _test: { encodeValue, decodeValue, validateBackupPayload, strictArchiveBuffer }
};
