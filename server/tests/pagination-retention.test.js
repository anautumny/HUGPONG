'use strict';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-only-session-secret-that-is-longer-than-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  pageLimit,
  encodeCursor,
  decodeCursor
} = require('../services/cursorPagination');
const { DAY_MS, RETENTION_MS, deleteAfter } = require('../services/retentionPolicy');
const {
  EXPIRATION_POLICIES,
  cleanupExpiredOperationalData
} = require('../services/operationalCleanupService');

const root = path.resolve(__dirname, '../..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('cursor pagination defaults to 50, caps at 100, and rejects malformed input', () => {
  assert.equal(DEFAULT_PAGE_LIMIT, 50);
  assert.equal(MAX_PAGE_LIMIT, 100);
  assert.equal(pageLimit(undefined), 50);
  assert.equal(pageLimit('25'), 25);
  assert.equal(pageLimit('1000'), 100);
  assert.throws(() => pageLimit('0'), /positive integer/);
  assert.throws(() => pageLimit('1.5'), /positive integer/);

  const cursor = encodeCursor('2026-09-29T00:00:00.000Z', 'AUD-123');
  assert.deepEqual(decodeCursor(cursor), {
    value: '2026-09-29T00:00:00.000Z',
    id: 'AUD-123'
  });
  assert.throws(() => decodeCursor('not-a-cursor'), /invalid or expired/);
});

test('retention policy keeps short-lived security state brief and diagnostics for 14 days', () => {
  const base = Date.parse('2026-09-29T00:00:00.000Z');
  assert.equal(RETENTION_MS.PASSWORD_RECOVERY, DAY_MS);
  assert.equal(RETENTION_MS.RATE_LIMIT, DAY_MS);
  assert.equal(RETENTION_MS.DIAGNOSTIC_EVENT, 14 * DAY_MS);
  assert.equal(RETENTION_MS.TERMINAL_DIAGNOSTIC, 14 * DAY_MS);
  assert.equal(deleteAfter(base, DAY_MS).toISOString(), '2026-09-30T00:00:00.000Z');
});

test('Audit Ledger and Super Admin directory use stable bounded Firestore cursors', () => {
  const auditRoute = source('server/routes/auditEvents.js');
  const usersRoute = source('server/routes/users.js');

  assert.match(auditRoute, /orderBy\('createdAt', 'desc'\)/);
  assert.match(auditRoute, /FieldPath\.documentId\(\), 'desc'/);
  assert.match(auditRoute, /startAfter\(cursor\.value, cursor\.id\)/);
  assert.match(auditRoute, /limit\(limit \+ 1\)/);
  assert.doesNotMatch(auditRoute, /collection\(COLLECTIONS\.AUDIT_LOGS\)\.get\(\)/);

  assert.match(usersRoute, /actorRole === ROLES\.SUPER_ADMIN/);
  assert.match(usersRoute, /orderBy\('displayName', 'asc'\)/);
  assert.match(usersRoute, /FieldPath\.documentId\(\), 'asc'/);
  assert.match(usersRoute, /query\.limit\(page\.limit \+ 1\)/);
  assert.match(usersRoute, /nextCursor:/);
});

test('system telemetry fetches diagnostics only for the displayed user page', () => {
  const telemetry = source('server/services/telemetryService.js');
  assert.match(telemetry, /userQuery\.limit\(limit \+ 1\)/);
  assert.match(telemetry, /telemetryByUserIds\(db, userDocuments\.map\(document => document\.id\)\)/);
  assert.match(telemetry, /where\('userId', 'in', userIds\.slice\(index, index \+ 10\)\)/);
  assert.doesNotMatch(telemetry, /collection\(COLLECTIONS\.TERMINAL_DIAGNOSTICS\)\.get\(\)/);
});

test('free-tier cleanup covers sessions, recovery, rate limits, and both diagnostics stores', async () => {
  const indexes = JSON.parse(source('firestore.indexes.json'));
  assert.deepEqual(indexes.fieldOverrides, []);

  const now = Date.parse('2026-09-29T00:00:00.000Z');
  const records = new Map(EXPIRATION_POLICIES.map(policy => [policy.collection, [
    { id: 'expired', [policy.field]: new Date(now - 1) },
    { id: 'future', [policy.field]: new Date(now + DAY_MS) }
  ]]));
  const database = {
    collection(name) {
      return {
        where(field, operator, cutoff) {
          assert.equal(operator, '<=');
          return {
            limit(limit) {
              return {
                async get() {
                  const selected = (records.get(name) || [])
                    .filter(record => record[field] <= cutoff)
                    .slice(0, limit);
                  return {
                    empty: selected.length === 0,
                    docs: selected.map(record => ({
                      id: record.id,
                      ref: { name, id: record.id }
                    }))
                  };
                }
              };
            }
          };
        }
      };
    },
    batch() {
      const pending = [];
      return {
        delete(ref) {
          pending.push(ref);
        },
        async commit() {
          pending.forEach(ref => records.set(ref.name,
            records.get(ref.name).filter(record => record.id !== ref.id)));
        }
      };
    }
  };
  const result = await cleanupExpiredOperationalData(database, { now });
  assert.equal(result.deletedCount, EXPIRATION_POLICIES.length);
  EXPIRATION_POLICIES.forEach(policy => {
    assert.deepEqual(records.get(policy.collection).map(record => record.id), ['future']);
  });

  assert.match(source('server/services/firestoreSessionStore.js'), /expiresAt: new Date\(expiresAtMs\)/);
  assert.match(source('server/services/passwordRecoveryService.js'), /deleteAfter: new Date\(now \+ RECOVERY_RETENTION_MS\)/);
  assert.match(source('server/middleware/rateLimit.js'), /deleteAfter: deleteAfter\(evaluated\.windowEndsAtMs, RETENTION_MS\.RATE_LIMIT\)/);
  assert.match(source('server/services/diagnosticService.js'), /deleteAfter: deleteAfter\(record\.timestamp, RETENTION_MS\.DIAGNOSTIC_EVENT\)/);
  assert.match(source('server/services/telemetryService.js'), /deleteAfter: deleteAfter\(at, RETENTION_MS\.TERMINAL_DIAGNOSTIC\)/);
  assert.match(source('server/server.js'), /isProduction && db \? startOperationalCleanup\(db\) : null/);
});

test('Web and Mobile expose server-authoritative cursor loading', () => {
  const webUsers = source('web/react-app/src/services/usersService.js');
  const webAudit = source('web/react-app/src/services/maintenanceService.js');
  const webTelemetry = source('web/react-app/src/services/telemetryService.js');
  const webAuth = source('web/react-app/src/context/AuthContext.jsx');
  const mobileStore = source('mobile/src/data/dataStore.js');
  const mobileTelemetry = source('mobile/src/services/telemetryService.js');

  for (const client of [webUsers, webAudit, webTelemetry]) {
    assert.match(client, /limit=50/);
    assert.match(client, /cursor=\$\{encodeURIComponent\(nextCursor\)\}/);
    assert.match(client, /\.loadMore = async/);
  }
  assert.match(mobileStore, /authenticatedRequest\('\/api\/users\?limit=50'\)/);
  assert.match(mobileStore, /authenticatedRequest\('\/api\/audit-events\?limit=50'\)/);
  assert.match(mobileStore, /export const loadMoreUserDirectory/);
  assert.match(mobileStore, /export const loadMoreAuditEvents/);
  assert.match(mobileTelemetry, /\/api\/terminal-diagnostics\?\$\{query\.toString\(\)\}/);
  assert.match(webTelemetry, /HEARTBEAT_INTERVAL_MS = 15 \* 60 \* 1000/);
  assert.match(webAuth, /setInterval\(report, 15 \* 60 \* 1000\)/);
  assert.match(mobileTelemetry, /ACTIVITY_HEARTBEAT_MS = 15 \* 60 \* 1000/);
});
