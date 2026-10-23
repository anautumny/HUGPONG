'use strict';

const path = require('node:path');
const { collectDeploymentEnvironment } = require('../services/deploymentReadinessService');
const { planFirestoreIndexes, createMissingIndexes, assertIndexProject } = require('../services/firestoreIndexPreparation');
const root = path.resolve(__dirname, '../..');

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--apply', '--check'].includes(arg)) || args.includes('--apply') && args.includes('--check')) {
    throw new Error('Use no arguments to plan, --check to require readiness, or --apply to create missing indexes.');
  }
  const { admin } = require('../firebase-admin');
  const projectId = admin.app().options.projectId;
  assertIndexProject(projectId, collectDeploymentEnvironment(root));
  const token = await admin.app().options.credential.getAccessToken();
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/collectionGroups`;
  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(`Firestore index request failed (${response.status}, ${data.error?.status || 'UNKNOWN'}): ${String(data.error?.message || '').replaceAll(projectId, '[project]')}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }
  const remote = [];
  let pageToken;
  const seen = new Set();
  do {
    const result = await request(`${base}/-/indexes${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    remote.push(...(result.indexes || []));
    pageToken = result.nextPageToken;
    if (pageToken && seen.has(pageToken)) throw new Error('Index inventory did not advance; no indexes were changed.');
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  const plan = planFirestoreIndexes(require('../../firestore.indexes.json').indexes, remote);
  if (args.includes('--apply')) {
    await createMissingIndexes(plan, async definition => {
      try {
        await request(`${base}/${encodeURIComponent(definition.collectionGroup)}/indexes`, {
          method: 'POST', body: JSON.stringify({ queryScope: definition.queryScope, fields: definition.fields }),
        });
        return { created: true };
      } catch (error) {
        // Another operator may have created the same index after our inventory.
        // A subsequent --check still has to confirm the exact definition READY.
        if (error.status === 409) return { createdByAnotherRequest: true };
        throw error;
      }
    });
  }
  console.log(JSON.stringify({ mode: args.includes('--apply') ? 'CREATE_MISSING_ONLY' : 'READ_ONLY',
    readyBeforeChanges: plan.ready, requiredCount: plan.requiredCount,
    missingCount: plan.missing.length, missing: plan.missing, pending: plan.pending,
    nextStep: args.includes('--apply') ? 'Run with --check until every configured index is READY.' : plan.ready ? null : 'Prepare missing indexes, then require --check before app deployment.',
  }, null, 2));
  if (args.includes('--check') && !plan.ready) process.exitCode = 2;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
