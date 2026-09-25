'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { operationAuthorization } = require('../domain/operationAuthorization');

async function importStandaloneModule(relativePath) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('server, Web, and Mobile share field-owner and takeover capability rules', async () => {
  const [web, mobile] = await Promise.all([
    importStandaloneModule('../../web/react-app/src/domain/operationAuthorization.js'),
    importStandaloneModule('../../mobile/src/domain/operationAuthorization.js')
  ]);
  const now = Date.parse('2026-09-24T00:00:00.000Z');
  const manager = { employeeId: '03000001', role: 'FARM_MANAGER' };
  const ownField = { id: 'FLD-OWN', memberUserId: '03000001' };
  const otherField = { id: 'FLD-OTHER', memberUserId: '04000001' };
  const session = { managerId: '03000001', fieldId: 'FLD-OTHER', grant: 'opaque', expiresAt: now + 60_000 };

  const serverOwn = operationAuthorization(manager, ownField);
  const webOwn = web.getOperationCapabilities(manager, ownField, null, now);
  const mobileOwn = mobile.getOperationCapabilities(manager, ownField, null, now);
  for (const value of [serverOwn, webOwn, mobileOwn]) {
    assert.equal(value.canDraft, true);
    assert.equal(value.canPlan, true);
    assert.equal(value.canCreate, true);
    assert.equal(value.requiresTakeover, false);
    assert.equal(value.submissionSource, 'FIELD_OWNER');
  }

  const serverViewOnly = operationAuthorization(manager, otherField, { managedBlockFarm: true, now });
  const webViewOnly = web.getOperationCapabilities(manager, otherField, null, now);
  const mobileViewOnly = mobile.getOperationCapabilities(manager, otherField, null, now);
  for (const value of [serverViewOnly, webViewOnly, mobileViewOnly]) {
    assert.equal(value.canDraft, false);
    assert.equal(value.canPlan, false);
    assert.equal(value.canCreate, false);
    assert.equal(value.requiresTakeover, true);
  }

  const serverTakeover = operationAuthorization({ ...manager, takeoverGrant: { actorId: '03000001', fieldId: 'FLD-OTHER', expiresAt: now + 60_000 } }, otherField, { managedBlockFarm: true, now });
  const webTakeover = web.getOperationCapabilities(manager, otherField, session, now);
  const mobileTakeover = mobile.getOperationCapabilities(manager, otherField, session, now);
  for (const value of [serverTakeover, webTakeover, mobileTakeover]) {
    assert.equal(value.canCreate, true);
    assert.equal(value.canEdit, true);
    assert.equal(value.canDraft, false);
    assert.equal(value.canPlan, false);
    assert.equal(value.submissionSource, 'MANAGER_TAKEOVER');
  }
});
