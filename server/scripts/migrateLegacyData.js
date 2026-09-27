'use strict';

require('../config');
const { admin, db } = require('../firebase-admin');
const {
  auditLegacyData,
  assertLegacyMigrationAllowed,
  backfillAccountIdentifiers
} = require('../services/legacyDataMigrationService');

function argumentValue(name) {
  const prefix = `${name}=`;
  const argument = process.argv.find(value => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : '';
}

async function main() {
  if (!db) throw new Error('Firestore Admin is unavailable.');
  const execute = process.argv.includes('--execute');
  const projectId = admin.app().options.projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const expectedProjectId = argumentValue('--project') || process.env.HUGPONG_MIGRATION_PROJECT_ID;
  const before = await auditLegacyData(db);

  process.stdout.write(`${JSON.stringify({ projectId, mode: execute ? 'EXECUTE' : 'DRY_RUN', report: before }, null, 2)}\n`);
  if (!execute) {
    console.log('[HUGPONG LEGACY MIGRATION] Dry run only. No documents were changed.');
    console.log('[HUGPONG LEGACY MIGRATION] Resolve every reported ambiguity before using the execute command.');
    return;
  }

  assertLegacyMigrationAllowed({
    execute,
    allowMigration: process.env.HUGPONG_ALLOW_LEGACY_MIGRATION === 'true',
    projectId,
    expectedProjectId
  });
  const result = await backfillAccountIdentifiers(db, before);
  const after = await auditLegacyData(db);
  process.stdout.write(`${JSON.stringify({ migration: result, verification: after }, null, 2)}\n`);
  if (!after.deploymentReady) {
    console.error('[HUGPONG LEGACY MIGRATION] Backfill completed, but unresolved integrity findings still block deployment readiness.');
    process.exitCode = 2;
  } else {
    console.log('[HUGPONG LEGACY MIGRATION] Backfill and deployment-readiness verification passed.');
  }
}

main().catch(error => {
  console.error(`[HUGPONG LEGACY MIGRATION] ${error.message}`);
  process.exitCode = 1;
});
