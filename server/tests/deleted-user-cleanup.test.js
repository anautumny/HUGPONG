'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CLEANUP_CONFIRMATION,
  assertDeletedUserCleanupAllowed
} = require('../services/deletedUserCleanupService');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('deleted-user cleanup requires execution, matching account confirmation, phrase, and project', () => {
  const safe = {
    execute: true,
    projectId: 'hugpong-production',
    expectedProjectId: 'hugpong-production',
    userId: '03755212',
    confirmedUserId: '03755212',
    confirmation: CLEANUP_CONFIRMATION
  };
  assert.throws(() => assertDeletedUserCleanupAllowed({ ...safe, execute: false }), /requires --execute/);
  assert.throws(() => assertDeletedUserCleanupAllowed({ ...safe, confirmedUserId: '03755213' }), /same explicit/);
  assert.throws(() => assertDeletedUserCleanupAllowed({ ...safe, confirmation: 'DELETE' }), /requires --confirm/);
  assert.throws(() => assertDeletedUserCleanupAllowed({ ...safe, expectedProjectId: 'another-project' }), /exactly match/);
  assert.doesNotThrow(() => assertDeletedUserCleanupAllowed(safe));
});

test('cleanup is scoped to orphaned authentication state and preserves business history', () => {
  const service = read('server/services/deletedUserCleanupService.js');
  assert.match(service, /if \(before\.userExists\)/);
  assert.match(service, /identifierOwnedByTarget/);
  assert.match(service, /COLLECTIONS\.USER_CREDENTIALS/);
  assert.match(service, /COLLECTIONS\.ACCOUNT_IDENTIFIERS/);
  assert.match(service, /COLLECTIONS\.SERVER_SESSIONS/);
  assert.match(service, /COLLECTIONS\.PASSWORD_RECOVERY_CHALLENGES/);
  assert.match(service, /authClient\.deleteUser/);
  assert.match(service, /DELETED_USER_AUTH_CLEANUP/);
  assert.doesNotMatch(service, /COLLECTIONS\.(FIELDS|CROP_CYCLES|OPERATION_LOGS|AUDIT_REPORTS)/);
});

test('cleanup command is dry-run by default and exposes the guarded server script', () => {
  const script = read('server/scripts/cleanupDeletedUser.js');
  const packageJson = JSON.parse(read('server/package.json'));
  assert.match(script, /mode: execute \? 'EXECUTE' : 'DRY_RUN'/);
  assert.match(script, /Dry run only/);
  assert.match(script, /auditLegacyData/);
  assert.equal(packageJson.scripts['cleanup:deleted-user'], 'node scripts/cleanupDeletedUser.js');
});
