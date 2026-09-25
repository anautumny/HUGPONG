'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  canCreateSupportTicket,
  canManageSupportTickets,
  canonicalTicketStatus,
  assertStatusTransition,
  ticketViewStatuses
} = require('../domain/supportTickets');

function responseCapture() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

function loadCreateHandler(db) {
  const firebasePath = require.resolve('../firebase-admin');
  const routePath = require.resolve('../routes/tickets');
  const previousFirebase = require.cache[firebasePath];
  delete require.cache[routePath];
  require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db } };
  const router = require('../routes/tickets');
  if (previousFirebase) require.cache[firebasePath] = previousFirebase;
  else delete require.cache[firebasePath];
  return router.stack.find(layer => layer.route?.path === '/' && layer.route.methods.post).route.stack.at(-1).handle;
}

function loadListHandler(db) {
  const firebasePath = require.resolve('../firebase-admin');
  const routePath = require.resolve('../routes/tickets');
  const previousFirebase = require.cache[firebasePath];
  delete require.cache[routePath];
  require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db } };
  const router = require('../routes/tickets');
  if (previousFirebase) require.cache[firebasePath] = previousFirebase;
  else delete require.cache[firebasePath];
  return router.stack.find(layer => layer.route?.path === '/' && layer.route.methods.get).route.stack.at(-1).handle;
}

test('only canonical requester roles can create normal support tickets', () => {
  assert.equal(canCreateSupportTicket('Farm Member'), true);
  assert.equal(canCreateSupportTicket('Farm Manager'), true);
  assert.equal(canCreateSupportTicket('SRA Admin'), true);
  assert.equal(canCreateSupportTicket('Super Admin'), false);
  assert.equal(canManageSupportTickets('Super Admin'), true);
});

test('support lifecycle permits only the next meaningful transition', () => {
  assert.equal(assertStatusTransition('OPEN', 'IN_PROGRESS'), 'IN_PROGRESS');
  assert.equal(assertStatusTransition('IN_PROGRESS', 'RESOLVED'), 'RESOLVED');
  assert.equal(assertStatusTransition('RESOLVED', 'CLOSED'), 'CLOSED');
  assert.throws(() => assertStatusTransition('OPEN', 'RESOLVED'), /cannot move/);
  assert.throws(() => assertStatusTransition('CLOSED', 'OPEN'), /cannot move/);
  assert.equal(canonicalTicketStatus('Pending'), 'OPEN');
  assert.deepEqual([...ticketViewStatuses('active')], ['OPEN', 'IN_PROGRESS']);
  assert.deepEqual([...ticketViewStatuses('history')], ['RESOLVED', 'CLOSED']);
});

test('direct Super Admin create-ticket API attempt is rejected before persistence', async () => {
  const handler = loadCreateHandler({});
  const response = responseCapture();
  await handler({
    body: { title: 'Must be rejected', category: 'Other', details: 'Internal incident' },
    session: { user: { employeeId: 'SA-1', role: 'Super Admin', name: 'Administrator' } },
    get: () => ''
  }, response);
  assert.equal(response.statusCode, 403);
  assert.match(response.payload.error, /cannot create/i);
});

test('ticket listing falls back to an authorization-scoped query while a composite index is unavailable', async () => {
  const documents = [
    { id: 'T-OLD', createdByUserId: 'SRA-1', requesterRole: 'SRA_ADMIN', status: 'OPEN', updatedAt: '2026-09-24T00:00:00.000Z' },
    { id: 'T-NEW', createdByUserId: 'SRA-1', requesterRole: 'SRA_ADMIN', status: 'IN_PROGRESS', updatedAt: '2026-09-25T00:00:00.000Z' },
    { id: 'T-OTHER', createdByUserId: 'SRA-2', requesterRole: 'SRA_ADMIN', status: 'OPEN', updatedAt: '2026-09-26T00:00:00.000Z' }
  ];
  let fallbackWasScoped = false;
  const collection = name => {
    if (name === 'users') return { doc: () => ({ get: async () => ({ exists: false }) }) };
    const query = ({ creatorId = null, needsComposite = false } = {}) => ({
      where(field, operator, value) {
        return query({
          creatorId: field === 'createdByUserId' ? value : creatorId,
          needsComposite: needsComposite || field === 'status'
        });
      },
      orderBy() { return query({ creatorId, needsComposite: true }); },
      startAfter() { return this; },
      limit() { return this; },
      async get() {
        if (needsComposite) throw Object.assign(new Error('The query requires an index.'), { code: 9 });
        if (creatorId === 'SRA-1') fallbackWasScoped = true;
        return {
          docs: documents
            .filter(ticket => !creatorId || ticket.createdByUserId === creatorId)
            .map(ticket => ({ id: ticket.id, data: () => ticket }))
        };
      }
    });
    return query();
  };
  const handler = loadListHandler({ collection });
  const response = responseCapture();
  await handler({
    query: { view: 'active', limit: '20' },
    session: { user: { employeeId: 'SRA-1', role: 'SRA Admin', name: 'SRA Officer' } }
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(fallbackWasScoped, true);
  assert.deepEqual(response.payload.data.map(ticket => ticket.id), ['T-NEW', 'T-OLD']);
  assert.equal(response.payload.hasMore, false);
});

test('web and mobile expose the same categories and pending status distinction', () => {
  const web = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/domain/supportTickets.js'), 'utf8');
  const mobile = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/domain/supportTickets.js'), 'utf8');
  for (const value of ['Account / Login', 'Synchronization', 'Field / Operation Data', 'Audit / QR', 'SRA Price', 'Other']) {
    assert.match(web, new RegExp(value.replace('/', '\\/')));
    assert.match(mobile, new RegExp(value.replace('/', '\\/')));
  }
  assert.match(web, /PENDING_SUBMISSION/);
  assert.match(mobile, /PENDING_SUBMISSION/);
});
