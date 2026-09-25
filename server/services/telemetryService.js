'use strict';

const crypto = require('crypto');
const { admin } = require('../firebase-admin');
const { COLLECTIONS, ROLES, nowIso } = require('../schema/firestoreSchema');

const SYNC_STATES = Object.freeze(['UP_TO_DATE', 'PENDING_SYNC', 'SYNCING', 'SYNC_FAILED', 'OFFLINE', 'UNKNOWN']);
const CONNECTION_STATES = Object.freeze(['ONLINE', 'OFFLINE', 'UNKNOWN']);
const RECENT_ACTIVITY_MS = 15 * 60 * 1000;
const STALE_SYNC_REPORT_MS = 72 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ATTENTION_INACTIVITY_MS = 3 * DAY_MS;
const CRITICAL_INACTIVITY_MS = 5 * DAY_MS;

function normalizePlatform(value) {
  const platform = String(value || '').trim().toUpperCase();
  if (!['WEB', 'MOBILE'].includes(platform)) throw new Error('platform must be WEB or MOBILE.');
  return platform;
}

function normalizeClientInstanceId(value) {
  const instanceId = String(value || '').trim();
  if (!instanceId || instanceId.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(instanceId)) {
    throw new Error('A valid client installation identifier is required.');
  }
  return instanceId;
}

function deviceDocumentId(userId, platform, clientInstanceId) {
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedInstance = normalizeClientInstanceId(clientInstanceId);
  const digest = crypto.createHash('sha256')
    .update(`${userId}:${normalizedPlatform}:${normalizedInstance}`)
    .digest('hex')
    .slice(0, 32);
  return `${String(userId).replace(/[^A-Za-z0-9_-]/g, '_')}-${normalizedPlatform.toLowerCase()}-${digest}`;
}

function optionalText(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function boundedInteger(value, field, max = 100000) {
  const number = Number(value == null ? 0 : value);
  if (!Number.isInteger(number) || number < 0 || number > max) {
    throw new Error(`${field} must be an integer between 0 and ${max}.`);
  }
  return number;
}

function serverOwnedDeviceFields({ userId, platform, clientInstanceId, metadata = {}, at }) {
  const normalizedPlatform = normalizePlatform(platform);
  return {
    schemaVersion: 2,
    userId,
    deviceId: deviceDocumentId(userId, normalizedPlatform, clientInstanceId),
    platform: normalizedPlatform,
    model: optionalText(metadata.model),
    os: optionalText(metadata.os),
    appVersion: optionalText(metadata.appVersion, 120),
    updatedAt: at
  };
}

async function recordActivity(db, { userId, platform, clientInstanceId, event = 'HEARTBEAT', metadata = {}, at = nowIso() }) {
  const base = serverOwnedDeviceFields({ userId, platform, clientInstanceId, metadata, at });
  const ref = db.collection(COLLECTIONS.TERMINAL_DIAGNOSTICS).doc(base.deviceId);
  const patch = {
    ...base,
    lastActiveAt: at,
    lastPlatform: base.platform,
    activityReportedAt: at
  };
  if (String(event).toUpperCase() === 'LOGIN') patch.lastLoginAt = at;
  const current = await ref.get();
  if (!current.exists) patch.createdAt = at;
  await ref.set(patch, { merge: true });
  return patch;
}

async function recordSyncTelemetry(db, {
  userId,
  platform,
  clientInstanceId,
  pendingMutationCount,
  failedMutationCount,
  syncState,
  connectionState = 'UNKNOWN',
  syncSucceeded = false,
  metadata = {},
  at = nowIso()
}) {
  const normalizedState = String(syncState || '').trim().toUpperCase();
  const normalizedConnection = String(connectionState || 'UNKNOWN').trim().toUpperCase();
  if (!SYNC_STATES.includes(normalizedState)) throw new Error(`syncState must be one of: ${SYNC_STATES.join(', ')}.`);
  if (!CONNECTION_STATES.includes(normalizedConnection)) throw new Error(`connectionState must be one of: ${CONNECTION_STATES.join(', ')}.`);
  const base = serverOwnedDeviceFields({ userId, platform, clientInstanceId, metadata, at });
  const ref = db.collection(COLLECTIONS.TERMINAL_DIAGNOSTICS).doc(base.deviceId);
  const patch = {
    ...base,
    pendingMutationCount: boundedInteger(pendingMutationCount, 'pendingMutationCount'),
    failedMutationCount: boundedInteger(failedMutationCount, 'failedMutationCount'),
    syncState: normalizedState,
    connectionState: normalizedConnection,
    syncReportedAt: at,
    telemetryReportedAt: at
  };
  if (syncSucceeded === true) patch.lastSuccessfulSyncAt = at;
  const current = await ref.get();
  if (!current.exists) patch.createdAt = at;
  await ref.set(patch, { merge: true });
  return patch;
}

function validTime(value) {
  if (!value) return null;
  const time = typeof value?.toMillis === 'function'
    ? value.toMillis()
    : typeof value?.toDate === 'function'
      ? value.toDate().getTime()
      : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function classifyAccountActivity({ lastActiveAt, accountCreatedAt } = {}, now = Date.now()) {
  const lastActiveTime = validTime(lastActiveAt);
  const accountCreatedTime = validTime(accountCreatedAt);
  const referenceTime = lastActiveTime ?? accountCreatedTime;
  const basedOn = lastActiveTime != null
    ? 'LAST_ACTIVITY'
    : accountCreatedTime != null
      ? 'ACCOUNT_CREATED'
      : 'NO_ACTIVITY_DATE';

  if (referenceTime == null) {
    return {
      attentionStatus: 'NEEDS_ATTENTION',
      inactiveDays: null,
      monitoringSinceAt: null,
      basedOn
    };
  }

  const inactiveMs = Math.max(0, Number(now) - referenceTime);
  const attentionStatus = inactiveMs >= CRITICAL_INACTIVITY_MS
    ? 'CRITICAL'
    : inactiveMs >= ATTENTION_INACTIVITY_MS
      ? 'NEEDS_ATTENTION'
      : 'WITHIN_WINDOW';

  return {
    attentionStatus,
    inactiveDays: Math.floor(inactiveMs / DAY_MS),
    monitoringSinceAt: new Date(referenceTime).toISOString(),
    basedOn
  };
}

function newestValue(records, field) {
  return records.reduce((latest, record) => {
    const time = validTime(record[field]);
    return time != null && (!latest || time > latest.time) ? { time, value: record[field], record } : latest;
  }, null);
}

function aggregateSubjectTelemetry(subject, records = [], now = Date.now()) {
  const activity = newestValue(records, 'lastActiveAt');
  const login = newestValue(records, 'lastLoginAt');
  const successfulSync = newestValue(records, 'lastSuccessfulSyncAt');
  const canonicalSyncRecords = records.filter(record => record.schemaVersion === 2 && record.syncReportedAt);
  const lastSyncReport = newestValue(canonicalSyncRecords, 'syncReportedAt');
  const pendingMutationCount = canonicalSyncRecords.reduce((sum, record) => sum + Number(record.pendingMutationCount || 0), 0);
  const failedMutationCount = canonicalSyncRecords.reduce((sum, record) => sum + Number(record.failedMutationCount || 0), 0);

  let syncState = 'UNKNOWN';
  if (failedMutationCount > 0 || canonicalSyncRecords.some(record => record.syncState === 'SYNC_FAILED')) syncState = 'SYNC_FAILED';
  else if (pendingMutationCount > 0 || canonicalSyncRecords.some(record => record.syncState === 'PENDING_SYNC')) syncState = 'PENDING_SYNC';
  else if (canonicalSyncRecords.some(record => record.syncState === 'SYNCING')) syncState = 'SYNCING';
  else if (successfulSync && canonicalSyncRecords.length > 0) syncState = 'UP_TO_DATE';
  if (syncState === 'UP_TO_DATE' && (!lastSyncReport || now - lastSyncReport.time > STALE_SYNC_REPORT_MS)) syncState = 'UNKNOWN';

  let activityState = 'NOT_REPORTED';
  if (activity) activityState = now - activity.time <= RECENT_ACTIVITY_MS ? 'ACTIVE_RECENTLY' : 'INACTIVE';
  const latestConnection = canonicalSyncRecords
    .filter(record => record.connectionState)
    .sort((a, b) => validTime(b.syncReportedAt) - validTime(a.syncReportedAt))[0];
  const connectionIsFresh = latestConnection && now - validTime(latestConnection.syncReportedAt) <= RECENT_ACTIVITY_MS;
  const activityAttention = classifyAccountActivity({
    lastActiveAt: activity?.value,
    accountCreatedAt: subject.accountCreatedAt
  }, now);

  return {
    userId: subject.userId,
    displayName: subject.displayName,
    role: subject.role,
    isSelf: subject.isSelf === true,
    blockFarmId: subject.blockFarmId || null,
    blockFarmName: subject.blockFarmName || '',
    activity: {
      state: activityState,
      lastActiveAt: activity?.value || null,
      lastLoginAt: login?.value || null,
      lastPlatform: activity?.record?.lastPlatform || activity?.record?.platform || null,
      ...activityAttention
    },
    sync: {
      state: syncState,
      lastSuccessfulSyncAt: successfulSync?.value || null,
      pendingMutationCount,
      failedMutationCount,
      lastReportedAt: lastSyncReport?.value || null,
      reportingNote: canonicalSyncRecords.length ? 'LAST_REPORTED' : 'NOT_REPORTED'
    },
    connection: {
      state: connectionIsFresh ? latestConnection.connectionState : 'UNKNOWN',
      reportedAt: latestConnection?.syncReportedAt || null
    },
    devices: records.map(record => ({
      platform: record.platform || null,
      model: record.model || '',
      os: record.os || '',
      appVersion: record.appVersion || '',
      lastActiveAt: record.lastActiveAt || null,
      lastSuccessfulSyncAt: record.lastSuccessfulSyncAt || null,
      pendingMutationCount: record.schemaVersion === 2 ? Number(record.pendingMutationCount || 0) : null,
      failedMutationCount: record.schemaVersion === 2 ? Number(record.failedMutationCount || 0) : null,
      syncState: record.schemaVersion === 2 ? record.syncState || 'UNKNOWN' : 'UNKNOWN',
      lastReportedAt: record.telemetryReportedAt || record.syncReportedAt || record.activityReportedAt || record.updatedAt || null
    }))
  };
}

async function documentsByIds(db, collectionName, ids) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const records = [];
  for (let index = 0; index < uniqueIds.length; index += 10) {
    const snapshot = await db.collection(collectionName)
      .where(admin.firestore.FieldPath.documentId(), 'in', uniqueIds.slice(index, index + 10))
      .get();
    records.push(...snapshot.docs.map(document => ({ id: document.id, ...document.data() })));
  }
  return records;
}

async function telemetryByUserIds(db, userIds) {
  const records = [];
  for (let index = 0; index < userIds.length; index += 10) {
    const snapshot = await db.collection(COLLECTIONS.TERMINAL_DIAGNOSTICS)
      .where('userId', 'in', userIds.slice(index, index + 10))
      .get();
    records.push(...snapshot.docs.map(document => ({ id: document.id, ...document.data() })));
  }
  return records;
}

async function buildAgriculturalMonitor(db, identity) {
  let blockFarms = [];
  const membershipByUser = new Map();
  let permittedUserIds = [identity.userId];

  if (identity.role === ROLES.FARM_MANAGER) {
    const farmSnapshot = await db.collection(COLLECTIONS.BLOCK_FARMS)
      .where('managerUserId', '==', identity.userId)
      .get();
    blockFarms = farmSnapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    const farmIds = blockFarms.map(farm => farm.id);
    const fieldRecords = [];
    for (let index = 0; index < farmIds.length; index += 10) {
      const ids = farmIds.slice(index, index + 10);
      if (!ids.length) continue;
      const snapshot = await db.collection(COLLECTIONS.FIELDS)
        .where('blockFarmId', ids.length === 1 ? '==' : 'in', ids.length === 1 ? ids[0] : ids)
        .get();
      fieldRecords.push(...snapshot.docs.map(document => ({ id: document.id, ...document.data() })));
    }
    for (const field of fieldRecords) {
      if (!field.memberUserId) continue;
      permittedUserIds.push(field.memberUserId);
      if (!membershipByUser.has(field.memberUserId)) membershipByUser.set(field.memberUserId, field.blockFarmId);
    }
  }

  permittedUserIds = Array.from(new Set(permittedUserIds));
  const [users, telemetry] = await Promise.all([
    documentsByIds(db, COLLECTIONS.USERS, permittedUserIds),
    telemetryByUserIds(db, permittedUserIds)
  ]);
  const farmMap = new Map(blockFarms.map(farm => [farm.id, farm.name || farm.displayName || farm.id]));
  const telemetryMap = new Map();
  for (const record of telemetry) {
    if (!telemetryMap.has(record.userId)) telemetryMap.set(record.userId, []);
    telemetryMap.get(record.userId).push(record);
  }
  const subjects = users
    .filter(user => user.status === 'ACTIVE')
    .filter(user => user.id === identity.userId || user.role === ROLES.MEMBER_FARMER)
    .map(user => {
      const blockFarmId = user.id === identity.userId ? blockFarms[0]?.id || null : membershipByUser.get(user.id) || null;
      return aggregateSubjectTelemetry({
        userId: user.id,
        displayName: user.displayName || 'HUGPONG User',
        role: user.role,
        isSelf: user.id === identity.userId,
        blockFarmId,
        blockFarmName: farmMap.get(blockFarmId) || '',
        accountCreatedAt: user.createdAt || null
      }, telemetryMap.get(user.id) || []);
    })
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.displayName.localeCompare(b.displayName));

  return {
    scope: {
      role: identity.role,
      blockFarms: blockFarms.map(farm => ({ id: farm.id, name: farm.name || farm.displayName || farm.id }))
    },
    subjects
  };
}

async function buildSystemMonitor(db, identity) {
  if (identity.role !== ROLES.SUPER_ADMIN) {
    throw Object.assign(new Error('System synchronization telemetry requires Super Admin access.'), { status: 403 });
  }

  const [userSnapshot, telemetrySnapshot] = await Promise.all([
    db.collection(COLLECTIONS.USERS).where('status', '==', 'ACTIVE').get(),
    db.collection(COLLECTIONS.TERMINAL_DIAGNOSTICS).get()
  ]);
  const telemetryMap = new Map();
  for (const document of telemetrySnapshot.docs) {
    const record = { id: document.id, ...document.data() };
    if (!record.userId) continue;
    if (!telemetryMap.has(record.userId)) telemetryMap.set(record.userId, []);
    telemetryMap.get(record.userId).push(record);
  }

  const subjects = userSnapshot.docs
    .map(document => ({ id: document.id, ...document.data() }))
    .map(user => aggregateSubjectTelemetry({
      userId: user.id,
      displayName: user.displayName || 'HUGPONG User',
      role: user.role,
      isSelf: user.id === identity.userId,
      accountCreatedAt: user.createdAt || null
    }, telemetryMap.get(user.id) || []))
    .sort((left, right) => {
      const priority = { CRITICAL: 0, NEEDS_ATTENTION: 1, WITHIN_WINDOW: 2 };
      const statusDelta = (priority[left.activity?.attentionStatus] ?? 3) - (priority[right.activity?.attentionStatus] ?? 3);
      const leftReference = validTime(left.activity?.monitoringSinceAt) ?? Number.MAX_SAFE_INTEGER;
      const rightReference = validTime(right.activity?.monitoringSinceAt) ?? Number.MAX_SAFE_INTEGER;
      return statusDelta || leftReference - rightReference || left.displayName.localeCompare(right.displayName);
    });

  return {
    scope: {
      role: identity.role,
      systemWide: true
    },
    subjects
  };
}

module.exports = {
  SYNC_STATES,
  CONNECTION_STATES,
  normalizePlatform,
  normalizeClientInstanceId,
  deviceDocumentId,
  recordActivity,
  recordSyncTelemetry,
  classifyAccountActivity,
  aggregateSubjectTelemetry,
  buildAgriculturalMonitor,
  buildSystemMonitor
};
