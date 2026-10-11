'use strict';

require('../config');
const { admin, db, auth } = require('../firebase-admin');
const {
  assertDeletedUserCleanupAllowed,
  inspectDeletedUserArtifacts,
  publicCleanupPlan,
  cleanupDeletedUserArtifacts
} = require('../services/deletedUserCleanupService');
const { auditLegacyData } = require('../services/legacyDataMigrationService');

function argumentValue(name) {
  const prefix = `${name}=`;
  const argument = process.argv.find(value => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : '';
}

async function main() {
  if (!db || !auth) throw new Error('Firebase Admin is unavailable.');
  const execute = process.argv.includes('--execute');
  const userId = argumentValue('--user');
  const identifierId = argumentValue('--identifier');
  const expectedProjectId = argumentValue('--project');
  const confirmedUserId = argumentValue('--confirm-user');
  const confirmation = argumentValue('--confirm');
  const projectId = admin.app().options.projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const inspection = await inspectDeletedUserArtifacts(db, auth, { userId, identifierId });

  process.stdout.write(`${JSON.stringify({
    projectId,
    mode: execute ? 'EXECUTE' : 'DRY_RUN',
    plan: publicCleanupPlan(inspection)
  }, null, 2)}\n`);
  if (!execute) {
    console.log('[HUGPONG DELETED USER CLEANUP] Dry run only. No documents or authentication users were changed.');
    return;
  }

  assertDeletedUserCleanupAllowed({
    execute,
    projectId,
    expectedProjectId,
    userId,
    confirmedUserId,
    confirmation
  });
  const cleanup = await cleanupDeletedUserArtifacts(db, auth, { userId, identifierId });
  const integrity = await auditLegacyData(db);
  process.stdout.write(`${JSON.stringify({ cleanup, integrity }, null, 2)}\n`);
  console.log('[HUGPONG DELETED USER CLEANUP] Cleanup and post-cleanup integrity audit completed.');
}

main().catch(error => {
  console.error(`[HUGPONG DELETED USER CLEANUP] ${error.message}`);
  process.exitCode = 1;
});
