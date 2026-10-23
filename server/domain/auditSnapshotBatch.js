'use strict';

const { buildFieldSnapshots } = require('./auditWorkflow');
const { buildOperationSnapshot } = require('../schema/firestoreSchema');

// Leave room for report metadata and Firestore's per-field encoding overhead.
const MAX_OPERATIONS = 500;
const SNAPSHOT_BYTE_BUDGET = 700 * 1024;
function auditSnapshotBatch(documents, fields) {
  const sorted = [...documents].sort((a, b) => a.id.localeCompare(b.id));
  let count = Math.min(sorted.length, MAX_OPERATIONS);
  while (count) {
    const operationSnapshots = sorted.slice(0, count).map(doc => buildOperationSnapshot(doc.id, doc.data()));
    const fieldSnapshots = buildFieldSnapshots(operationSnapshots, fields);
    const sourceLogIds = operationSnapshots.map(operation => operation.operationLogId);
    if (Buffer.byteLength(JSON.stringify({ operationSnapshots, fieldSnapshots, sourceLogIds }), 'utf8') <= SNAPSHOT_BYTE_BUDGET) {
      return { operationSnapshots, fieldSnapshots, sourceLogIds, remainingOperationCount: sorted.length - count };
    }
    if (count === 1) break;
    count = Math.max(1, Math.floor(count / 2));
  }
  const error = new Error('An operation record is too large for an audit report. Reduce its attachments or line items before compiling.');
  error.status = 422;
  throw error;
}
module.exports = { auditSnapshotBatch, MAX_OPERATIONS, SNAPSHOT_BYTE_BUDGET };
