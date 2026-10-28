import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
function service(file, context = {}) {
  const source = read(`services/${file}`).replace(/^import .*;\r?$/gm, '').replace(/^export \{.*\};\r?$/gm, '').replace(/\bexport /g, '');
  vm.createContext(context); vm.runInContext(source, context); return context;
}
const policy = navigator => service('onlinePolicy.js', { navigator }).assertWebOnline;

test('Web stage and ticket submissions reject offline without writing storage or calling the API', async () => {
  const navigator = { onLine: false };
  let requests = 0;
  const context = { assertWebOnline: policy(navigator), authenticatedRequest: async () => { requests++; },
    TICKET_CATEGORIES: [], TICKET_STATUSES: [], canCreateSupportTicket: () => true, canonicalSupportRole: role => role };
  const stages = service('cropStageService.js', { ...context });
  const tickets = service('ticketsService.js', { ...context });
  await assert.rejects(stages.updateCropStage({ user: { employeeId: '03' }, field: { currentCycleId: 'C1' }, currentStageNumber: 2 }), { code: 'WEB_CONNECTION_REQUIRED' });
  await assert.rejects(tickets.createTicket({ title: 'Offline attempt' }, { role: 'FARM_MANAGER' }), { code: 'WEB_CONNECTION_REQUIRED' });
  assert.equal(requests, 0);
});

test('online stage changes wait for API acceptance and preserve cycle version and takeover authorization', async () => {
  let release;
  const calls = [];
  const stage = service('cropStageService.js', { assertWebOnline: policy({ onLine: true }),
    authenticatedRequest: (path, options) => { calls.push({ path, options }); return new Promise(resolve => { release = resolve; }); } });
  let finished = false;
  const pending = stage.updateCropStage({ user: { employeeId: '03' }, field: { currentCycleId: 'C1', cropCycle: { updatedAt: 'v1' } },
    currentStageNumber: 2, takeoverGrant: 'transient-grant' }).then(value => { finished = true; return value; });
  await Promise.resolve();
  assert.equal(finished, false);
  assert.equal(calls[0].options.baseVersion, 'v1');
  assert.equal(calls[0].options.headers['X-Hugpong-Takeover-Grant'], 'transient-grant');
  release({ success: true, data: { currentStageNumber: 2 } });
  assert.equal((await pending).data.currentStageNumber, 2);
});

test('a lost Web ticket response remains an error and is never converted into offline success', async () => {
  const tickets = service('ticketsService.js', { assertWebOnline: policy({ onLine: true }), TICKET_CATEGORIES: [], TICKET_STATUSES: [],
    canCreateSupportTicket: () => true, canonicalSupportRole: role => role,
    authenticatedRequest: async () => { throw Object.assign(new Error('No connection'), { isNetworkError: true }); } });
  await assert.rejects(tickets.createTicket({ title: 'Ticket' }, { role: 'FARM_MANAGER' }), /No connection/);
});

test('Web cannot restore cached authority or replay legacy queues, and the console blocks lost connections', () => {
  const auth = read('context/AuthContext.jsx');
  assert.doesNotMatch(auth, /localStorage\.getItem\('hugpong_(?:user|role)'\)/);
  assert.match(auth, /sessionUnavailable/);
  assert.match(read('components/layout/AppShell.jsx'), /inert=\{connectionBlocked/);
  assert.match(read('components/layout/AppShell.jsx'), /connectionBlocked && connectionPrompt/);
  for (const file of ['context/SyncContext.jsx', 'services/ticketsService.js', 'views/operations/OperationsView.jsx', 'services/fieldsService.js']) {
    assert.doesNotMatch(read(file), /flushCropStageOutbox|flushTicketOutbox|applyPendingStageUpdate|updateCropStageOfflineFirst/);
  }
});

test('a cached Web read cannot be used after losing the internet connection', async () => {
  const navigator = { onLine: true };
  let requests = 0;
  const source = read('services/apiClient.js').replace(/^import .*;\r?$/gm, '')
    .replace(/import\.meta\.env\.VITE_APP_VERSION/g, "'test'")
    .replace(/export default \{[\s\S]*?\};/, '').replace(/\bexport /g, '');
  const context = { navigator, assertWebOnline: policy(navigator), setTimeout, clearTimeout, AbortController,
    fetch: async () => { requests++; return { ok: true, status: 200, json: async () => ({ success: true, data: ['server-record'] }) }; } };
  vm.createContext(context); vm.runInContext(source, context);
  assert.equal((await context.authenticatedRead('/api/fields')).data[0], 'server-record');
  navigator.onLine = false;
  await assert.rejects(context.authenticatedRead('/api/fields'), { code: 'WEB_CONNECTION_REQUIRED' });
  await assert.rejects(context.authenticatedRequest('/api/fields', { method: 'POST', body: {} }), { code: 'WEB_CONNECTION_REQUIRED' });
  assert.equal(requests, 1);
});
