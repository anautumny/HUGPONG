'use strict';

// This command is intentionally separate from server startup. Its default mode
// is a read-only eligibility check; creation additionally requires --execute
// and every production gate defined by productionBootstrap.js.
require('../config');
const { admin, db } = require('../firebase-admin');
const {
  inspectProductionBootstrap,
  bootstrapInitialProductionSuperAdmin
} = require('../services/productionBootstrap');

async function main() {
  if (!db) throw new Error('Firebase Admin Firestore is unavailable.');
  const execute = process.argv.includes('--execute');
  const activeProjectId = String(
    admin.app().options.projectId
    || process.env.GCLOUD_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || ''
  ).trim();
  if (!activeProjectId) throw new Error('The active Firebase project ID could not be determined.');

  const readiness = await inspectProductionBootstrap(db);
  process.stdout.write(`${JSON.stringify({
    projectId: activeProjectId,
    mode: execute ? 'EXECUTE' : 'DRY_RUN',
    ...readiness
  }, null, 2)}\n`);
  if (!execute) {
    console.log('[HUGPONG PRODUCTION BOOTSTRAP] Dry run only. No documents were changed.');
    console.log('[HUGPONG PRODUCTION BOOTSTRAP] Execute only after configuring every one-time production bootstrap variable.');
    return;
  }
  if (!readiness.eligible) {
    throw new Error(`Production Super Admin bootstrap is not eligible: ${readiness.reason}.`);
  }

  const result = await bootstrapInitialProductionSuperAdmin({
    database: db,
    env: process.env,
    actualProjectId: activeProjectId
  });
  process.stdout.write(`${JSON.stringify({ projectId: activeProjectId, result }, null, 2)}\n`);
  console.log('[HUGPONG PRODUCTION BOOTSTRAP] Initial Super Admin created. The account owner must verify the registered phone and replace the temporary password on first login.');
  console.log('[HUGPONG PRODUCTION BOOTSTRAP] Remove the allow flag, confirmation, identity fields, phone, and temporary password from the environment now.');
}

main().catch(error => {
  console.error(`[HUGPONG PRODUCTION BOOTSTRAP] ${error.message}`);
  process.exitCode = 1;
});
