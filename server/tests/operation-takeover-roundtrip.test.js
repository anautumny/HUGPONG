'use strict';

process.env.SESSION_SECRET ||= 'test-only-takeover-session-secret-at-least-32-characters';
const test = require('node:test');
const assert = require('node:assert/strict');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const { issueTakeoverGrant } = require('../security/takeoverGrant');
const { COLLECTIONS } = require('../schema/firestoreSchema');

function fixture() {
  const db = memoryFirestore({
    'fields/FLD-1': { blockFarmId: 'BF-1', memberUserId: 'MEM-1', currentCycleId: 'CYC-1', areaHa: 1, status: 'ACTIVE' },
    'block_farms/BF-1': { managerUserId: 'MGR-1', status: 'ACTIVE' },
    'crop_cycles/CYC-1': { fieldId: 'FLD-1', cropYear: '2026-2027', currentStageNumber: 1, status: 'ACTIVE' },
  });
  const firebasePath = require.resolve('../firebase-admin');
  const routePath = require.resolve('../routes/logs');
  const previous = require.cache[firebasePath];
  require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db } };
  delete require.cache[routePath];
  const router = require('../routes/logs');
  if (previous) require.cache[firebasePath] = previous;
  else delete require.cache[firebasePath];
  async function request({ userId = 'MGR-1', role = 'FARM_MANAGER', grant, endpoint = '/', method = 'post', body, id = 'LOG-1' }) {
    const user = { employeeId: userId, role, name: userId };
    const req = { body, params: { id }, headers: grant ? { 'x-hugpong-takeover-grant': grant } : {},
      authorizationVerified: true, authUser: user, session: { user } };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    const stack = router.stack.find(layer => layer.route?.path === endpoint && layer.route.methods[method]).route.stack;
    const invoke = index => stack[index].handle(req, res, () => invoke(index + 1));
    await invoke(0);
    return res;
  }
  const payload = {
    id: 'LOG-1', fieldId: 'FLD-1', cycleId: 'CYC-1', stageNumber: 1,
    operationDefinitionId: 'CUSTOM', operationName: 'Drainage clearing', category: 'General Care',
    performedOn: '2026-10-20', areaHa: 1, peopleCount: 0,
    quantity: { value: 1, unit: 'ha', inputName: 'Drainage clearing' },
    baseCost: 100, totalCost: 100, lineItems: [], laborEntries: [],
    submittedByUserId: 'FORGED', submissionSource: 'MEMBER', blockFarmId: 'FOREIGN',
  };
  return { db, request, payload, grant: issueTakeoverGrant({ actorId: 'MGR-1', fieldId: 'FLD-1' }) };
}

test('real operation routes require a signed current manager grant and stamp the actual actor and source', async () => {
  const { db, request, payload, grant } = fixture();
  assert.equal((await request({ body: payload })).statusCode, 403);
  assert.equal((await request({ body: payload, grant: `${grant}invalid` })).statusCode, 403);
  assert.equal((await request({ body: payload, grant: issueTakeoverGrant({ actorId: 'MGR-1', fieldId: 'FLD-2' }) })).statusCode, 403);
  assert.equal((await request({ body: payload, userId: 'MGR-2', grant })).statusCode, 403);
  assert.equal((await request({ body: payload, grant: issueTakeoverGrant({ actorId: 'MGR-1', fieldId: 'FLD-1' }, Date.now() - 360000) })).statusCode, 403);
  assert.equal(db.records.size, 3, 'denied writes change nothing');
  const result = await request({ body: payload, grant });
  assert.equal(result.statusCode, 201);
  assert.equal(result.body.data.submittedByUserId, 'MGR-1');
  assert.equal(result.body.data.submissionSource, 'MANAGER_TAKEOVER');
  assert.equal(result.body.data.blockFarmId, 'BF-1');
  assert.equal(db.records.get('fields/FLD-1').memberUserId, 'MEM-1', 'takeover does not transfer field ownership');
  assert.equal((await request({ body: payload, grant })).body.replayed, true);
  assert.equal([...db.records.keys()].filter(key => key.startsWith(`${COLLECTIONS.OPERATION_LOGS}/`)).length, 1);
});

test('takeover amendment preserves the original submitter and records the manager reason once', async () => {
  const { request, payload, grant } = fixture();
  const original = await request({ body: payload, userId: 'MEM-1', role: 'MEMBER_FARMER' });
  assert.equal(original.statusCode, 201);
  assert.equal(original.body.data.submissionSource, 'MEMBER');
  const body = {
    changes: { baseCost: 200, totalCost: 200 },
    amendment: { amendmentId: 'AMD-TAKEOVER-1', reason: 'Correct supplier invoice' },
    _mutation: { mutationId: 'MUT-AMEND-1', idempotencyKey: 'MUT-AMEND-1', entityKey: 'logs/LOG-1', baseVersion: original.body.data.updatedAt },
  };
  assert.equal((await request({ body, endpoint: '/:id', method: 'patch' })).statusCode, 403);
  const amended = await request({ body, grant, endpoint: '/:id', method: 'patch' });
  assert.equal(amended.statusCode, 200);
  assert.equal(amended.body.data.submittedByUserId, 'MEM-1');
  assert.equal(amended.body.data.submissionSource, 'MEMBER');
  assert.equal(amended.body.data.amendments[0].amendedByUserId, 'MGR-1');
  assert.equal(amended.body.data.amendments[0].reason, body.amendment.reason);
  const replay = await request({ body, grant, endpoint: '/:id', method: 'patch' });
  assert.equal(replay.body.data.amendments.length, 1);
});

test('a field owner records without takeover, while role changes and manager reassignment revoke takeover writes', async () => {
  const { db, request, payload, grant } = fixture();
  assert.equal((await request({ body: payload, userId: 'MEM-OTHER', role: 'MEMBER_FARMER' })).statusCode, 403);
  assert.equal((await request({ body: payload, userId: 'SRA-1', role: 'SRA_ADMIN', grant })).statusCode, 403);
  db.records.get('block_farms/BF-1').managerUserId = 'MGR-2';
  assert.equal((await request({ body: payload, grant })).statusCode, 403, 'an existing signed grant cannot bypass reassignment');
  db.records.get('fields/FLD-1').memberUserId = 'MGR-1';
  const own = await request({ body: payload });
  assert.equal(own.statusCode, 201);
  assert.equal(own.body.data.submissionSource, 'FIELD_OWNER');
});
