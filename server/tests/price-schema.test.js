'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { buildSraPrice } = require('../schema/firestoreSchema');
const { publishSraPrice } = require('../services/priceService');

const NOW = '2026-09-17T04:00:00.000Z';
const USER_ID = '02000001';

function validInput(overrides = {}) {
  return {
    id: 'PRC-TEST-001',
    effectiveDate: '2026-09-17',
    weekLabel: 'Week 3 Sep',
    sugarPricePerLkg: 2850,
    sugarPriceChange: 25,
    molassesPricePerMetricTon: 4200,
    molassesPriceChange: -10,
    circularNumber: 'SRA-2026-117',
    source: 'Official SRA circular 117',
    ...overrides
  };
}

function fakeFirestore() {
  const records = new Map();
  let createCount = 0;
  return {
    records,
    get createCount() { return createCount; },
    collection(name) {
      assert.equal(name, 'sra_prices');
      return {
        doc(id) {
          return {
            async get() {
              return records.has(id)
                ? { exists: true, data: () => records.get(id) }
                : { exists: false, data: () => undefined };
            },
            async create(payload) {
              assert.equal(records.has(id), false);
              createCount += 1;
              records.set(id, payload);
            }
          };
        }
      };
    }
  };
}

test('buildSraPrice accepts and emits only the canonical Phase 2 fields', () => {
  const payload = buildSraPrice(validInput(), { publishedByUserId: USER_ID, publishedAt: NOW });
  assert.deepEqual(Object.keys(payload), [
    'effectiveDate', 'weekLabel', 'sugarPricePerLkg', 'sugarPriceChange',
    'molassesPricePerMetricTon', 'molassesPriceChange', 'circularNumber',
    'source', 'publishedByUserId', 'publishedAt'
  ]);
  assert.equal(payload.effectiveDate, '2026-09-17');
  assert.equal(payload.sugarPricePerLkg, 2850);
  assert.equal(payload.publishedByUserId, USER_ID);
});

test('price publication creates exactly one record and an identical retry is idempotent', async () => {
  const database = fakeFirestore();
  const context = { publishedByUserId: USER_ID, publishedAt: NOW };
  const first = await publishSraPrice(database, validInput(), context);
  const replay = await publishSraPrice(database, validInput(), context);

  assert.equal(first.created, true);
  assert.equal(replay.replayed, true);
  assert.equal(database.createCount, 1);
  assert.equal(database.records.size, 1);
  assert.equal(first.data.effectiveDate, '2026-09-17');
});

test('human-readable, missing, and impossible effective dates remain rejected', () => {
  assert.throws(
    () => buildSraPrice(validInput({ effectiveDate: 'Sep 17, 2026' }), { publishedByUserId: USER_ID, publishedAt: NOW }),
    /effectiveDate must use YYYY-MM-DD/
  );
  assert.throws(
    () => buildSraPrice(validInput({ effectiveDate: '' }), { publishedByUserId: USER_ID, publishedAt: NOW }),
    /effectiveDate is required/
  );
  assert.throws(
    () => buildSraPrice(validInput({ effectiveDate: '2026-02-30' }), { publishedByUserId: USER_ID, publishedAt: NOW }),
    /not a valid calendar date/
  );
});

test('missing required sugar or molasses values are rejected before persistence', async () => {
  const database = fakeFirestore();
  await assert.rejects(
    publishSraPrice(database, validInput({ sugarPricePerLkg: undefined }), { publishedByUserId: USER_ID, publishedAt: NOW }),
    /sugarPricePerLkg is required/
  );
  await assert.rejects(
    publishSraPrice(database, validInput({ molassesPricePerMetricTon: null }), { publishedByUserId: USER_ID, publishedAt: NOW }),
    /molassesPricePerMetricTon is required/
  );
  await assert.rejects(
    publishSraPrice(database, validInput({ sugarPriceChange: undefined }), { publishedByUserId: USER_ID, publishedAt: NOW }),
    /sugarPriceChange is required/
  );
  assert.equal(database.createCount, 0);
});

test('web price mapping validates canonical records and does not recreate legacy aliases', () => {
  const schemaPath = path.join(__dirname, '..', '..', 'web', 'shared', 'firestore-schema.js');
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(schemaPath, 'utf8'), context, { filename: schemaPath });

  const record = context.window.HugpongSchema.fromPrice('PRC-TEST-001', {
    ...buildSraPrice(validInput(), { publishedByUserId: USER_ID, publishedAt: NOW })
  });
  assert.equal(record.weekLabel, 'Week 3 Sep');
  assert.equal(record.sugarPricePerLkg, 2850);
  assert.doesNotThrow(() => record.weekLabel.replace(/Week\s+/i, 'W'));
  assert.doesNotThrow(() => record.weekLabel.replace('Wk', 'Week '));
  assert.equal(Object.hasOwn(record, 'week'), false);
  assert.equal(Object.hasOwn(record, 'price'), false);
  assert.equal(Object.hasOwn(record, 'date'), false);
  assert.throws(
    () => context.window.HugpongSchema.fromPrice('PRC-LEGACY', {
      date: 'Sep 17, 2026', week: 'Week 3 Sep', price: 2850, molasses: 4200
    }),
    /effectiveDate is required/
  );
});

test('web publishers declare canonical change values from current and previous persisted prices', () => {
  const corePath = path.join(__dirname, '..', '..', 'web', 'shared', 'core.js');
  const core = fs.readFileSync(corePath, 'utf8');
  const dashboardStart = core.indexOf('async function submitNewWeeklyPriceFromDashboard()');
  const dashboardEnd = core.indexOf('// ── SUPPORT & TICKETS DESK', dashboardStart);
  const dashboardPublisher = core.slice(dashboardStart, dashboardEnd);
  const modalStart = core.indexOf('async function submitPublishPrice()');
  const modalEnd = core.indexOf('// Topbar logout handler', modalStart);
  const modalPublisher = core.slice(modalStart, modalEnd);

  assert.match(dashboardPublisher, /const prevPrice = .*\?\? price;/);
  assert.match(dashboardPublisher, /const prevMol = .*\?\? molasses;/);
  assert.match(dashboardPublisher, /const sugarPriceChange = price - prevPrice;/);
  assert.match(dashboardPublisher, /const molassesPriceChange = molasses - prevMol;/);
  assert.match(dashboardPublisher, /sugarPriceChange,\s+molassesPricePerMetricTon: molasses,\s+molassesPriceChange,/);
  assert.doesNotMatch(dashboardPublisher, /\b(date|week|price|molasses|change|molassesChange)\s*:/);

  assert.match(modalPublisher, /const sugarPriceChange = sugarPrice - prevPrice;/);
  assert.match(modalPublisher, /const molassesPriceChange = molassesPrice - prevMol;/);
  assert.match(modalPublisher, /sugarPriceChange,\s+molassesPricePerMetricTon: molassesPrice,\s+molassesPriceChange,/);
});

async function executeDashboardPublisher(priceHistory) {
  const corePath = path.join(__dirname, '..', '..', 'web', 'shared', 'core.js');
  const core = fs.readFileSync(corePath, 'utf8');
  const dashboardStart = core.indexOf('async function submitNewWeeklyPriceFromDashboard()');
  const dashboardEnd = core.indexOf('// ── SUPPORT & TICKETS DESK', dashboardStart);
  const dashboardPublisher = core.slice(dashboardStart, dashboardEnd);
  const formValues = {
    'dash-price-week': { value: 'Week 3 Sep' },
    'dash-price-val': { value: '2850' },
    'dash-price-molasses': { value: '4200' },
    'dash-price-date': { value: '2026-09-17' },
    'dash-price-source': { value: 'SRA-2026-117' },
    'btn-submit-dash-price': {}
  };
  const localDb = { priceHistory: priceHistory.map(record => ({ ...record })) };
  let request = null;
  let requestCount = 0;
  const context = {
    window: {
      HugpongSchema: {
        toPrice(value, userId) { return { ...value, publishedByUserId: userId }; },
        fromPrice(id, value) { return { id, ...value }; }
      }
    },
    document: {
      getElementById(id) { return formValues[id] || null; },
      querySelector() { return null; }
    },
    activeUser: { id: USER_ID },
    isCanonicalCalendarDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value); },
    showConfirmDialog: async () => true,
    setButtonLoading() {},
    showGlobalProgress() {},
    hideGlobalProgress() {},
    closePublishPriceModal() {},
    renderDashboard() {},
    renderPrices() {},
    toast() {},
    logSystemEvent() {},
    saveDB() {},
    getDB() { return localDb; },
    getWebAuthSession() { return { user: { name: 'Test SRA Admin' } }; },
    async authenticatedWebRequest(requestPath, options) {
      requestCount += 1;
      request = { path: requestPath, ...options };
      const { id, ...record } = options.body;
      return { data: { id, ...record } };
    },
    setTimeout(callback) { callback(); }
  };
  vm.runInNewContext(`${dashboardPublisher}\nthis.publish = submitNewWeeklyPriceFromDashboard;`, context);
  await context.publish();
  return { request, requestCount, localDb };
}

test('dashboard publisher executes without ReferenceError and sends the exact canonical payload', async () => {
  const previous = {
    id: 'PRC-PREVIOUS',
    sugarPricePerLkg: 2800,
    molassesPricePerMetricTon: 4100
  };
  const result = await executeDashboardPublisher([previous]);

  assert.equal(result.requestCount, 1);
  assert.equal(result.request.path, '/api/prices');
  assert.equal(result.request.method, 'POST');
  assert.equal(result.request.body.effectiveDate, '2026-09-17');
  assert.equal(result.request.body.weekLabel, 'Week 3 Sep');
  assert.equal(result.request.body.sugarPricePerLkg, 2850);
  assert.equal(result.request.body.sugarPriceChange, 50);
  assert.equal(result.request.body.molassesPricePerMetricTon, 4200);
  assert.equal(result.request.body.molassesPriceChange, 100);
  assert.equal(result.request.body.circularNumber, 'SRA-2026-117');
  assert.equal(result.request.body.source, 'SRA-2026-117');
  for (const legacyField of ['date', 'week', 'price', 'molasses', 'change', 'molassesChange']) {
    assert.equal(Object.hasOwn(result.request.body, legacyField), false);
  }
});

test('first price publication derives zero changes from the current submitted values', async () => {
  const result = await executeDashboardPublisher([]);
  assert.equal(result.requestCount, 1);
  assert.equal(result.request.body.sugarPriceChange, 0);
  assert.equal(result.request.body.molassesPriceChange, 0);
});
