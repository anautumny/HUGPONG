'use strict';

require('../config');
const { admin, db } = require('../firebase-admin');
const {
  assertDevelopmentResetAllowed,
  inventoryFirestore,
  resetDevelopmentFirestore
} = require('../services/developmentReset');

async function main() {
  if (!db) throw new Error('Firestore Admin is unavailable.');
  const projectId = admin.app().options.projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  assertDevelopmentResetAllowed(process.env, projectId);

  const execute = process.argv.includes('--execute');
  const inventory = await inventoryFirestore(db);
  console.log(`[HUGPONG DEV RESET] Target project: ${projectId}`);
  console.log(`[HUGPONG DEV RESET] Firebase application registrations and Authentication users are outside this operation.`);
  if (!inventory.length) console.log('[HUGPONG DEV RESET] Firestore is already empty.');
  inventory.forEach(item => console.log(`[HUGPONG DEV RESET] ${item.collection}: ${item.documentCount} document(s)`));

  if (!execute) {
    console.log('[HUGPONG DEV RESET] Dry run only. Re-run the explicit execute script to delete these Firestore documents.');
    return;
  }

  const result = await resetDevelopmentFirestore(db);
  console.log(`[HUGPONG DEV RESET] Deleted ${result.deletedDocumentCount} top-level document(s), including all nested subcollections.`);
  console.log('[HUGPONG DEV RESET] Verification passed: Firestore contains no documents.');
  console.log('[HUGPONG DEV RESET] Test accounts are not recreated automatically. Use npm run bootstrap:dev-test-accounts explicitly when ready.');
}

main().catch(error => {
  console.error(`[HUGPONG DEV RESET] ${error.message}`);
  process.exitCode = 1;
});
