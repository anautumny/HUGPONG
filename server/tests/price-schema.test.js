'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { buildSraPrice } = require('../schema/firestoreSchema');
const { publishSraPrice } = require('../services/priceService');

const NOW = '2026-09-17T04:00:00.000Z';
const USER_ID = '02000001';

function validInput(overrides = {}) {
  return {
    id: 'PRC-TEST-001', effectiveDate: '2026-09-17', weekLabel: 'Week 3 Sep',
    sugarPricePerLkg: 2850, sugarPriceChange: 25,
    molassesPricePerMetricTon: 4200, molassesPriceChange: -10,
    circularNumber: 'SRA-2026-117', source: 'Official SRA circular 117', ...overrides
  };
}

function fakeFirestore() {
  const records = new Map(); let createCount = 0;
  return {
    records, get createCount() { return createCount; },
    collection(name) {
      assert.equal(name, 'sra_prices');
      return { doc(id) { return {
        async get() { return records.has(id) ? { exists: true, data: () => records.get(id) } : { exists: false, data: () => undefined }; },
        async create(payload) { assert.equal(records.has(id), false); createCount += 1; records.set(id, payload); }
      }; } };
    }
  };
}

test('buildSraPrice accepts and emits only canonical Phase 2 fields', () => {
  const payload = buildSraPrice(validInput(), { publishedByUserId: USER_ID, publishedAt: NOW });
  assert.deepEqual(Object.keys(payload), ['effectiveDate', 'weekLabel', 'sugarPricePerLkg', 'sugarPriceChange', 'molassesPricePerMetricTon', 'molassesPriceChange', 'circularNumber', 'source', 'publishedByUserId', 'publishedAt']);
  assert.equal(payload.effectiveDate, '2026-09-17');
  assert.equal(payload.sugarPricePerLkg, 2850);
  assert.equal(payload.publishedByUserId, USER_ID);
});

test('price publication creates exactly one record and identical retry is idempotent', async () => {
  const database = fakeFirestore(); const context = { publishedByUserId: USER_ID, publishedAt: NOW };
  const first = await publishSraPrice(database, validInput(), context);
  const replay = await publishSraPrice(database, validInput(), context);
  assert.equal(first.created, true); assert.equal(replay.replayed, true);
  assert.equal(database.createCount, 1); assert.equal(database.records.size, 1);
});

test('human-readable, missing, and impossible effective dates remain rejected', () => {
  assert.throws(() => buildSraPrice(validInput({ effectiveDate: 'Sep 17, 2026' }), { publishedByUserId: USER_ID, publishedAt: NOW }), /YYYY-MM-DD/);
  assert.throws(() => buildSraPrice(validInput({ effectiveDate: '' }), { publishedByUserId: USER_ID, publishedAt: NOW }), /required/);
  assert.throws(() => buildSraPrice(validInput({ effectiveDate: '2026-02-30' }), { publishedByUserId: USER_ID, publishedAt: NOW }), /valid calendar date/);
});

test('missing required sugar or molasses values are rejected before persistence', async () => {
  const database = fakeFirestore();
  await assert.rejects(publishSraPrice(database, validInput({ sugarPricePerLkg: undefined }), { publishedByUserId: USER_ID, publishedAt: NOW }), /sugarPricePerLkg is required/);
  await assert.rejects(publishSraPrice(database, validInput({ molassesPricePerMetricTon: null }), { publishedByUserId: USER_ID, publishedAt: NOW }), /molassesPricePerMetricTon is required/);
  await assert.rejects(publishSraPrice(database, validInput({ sugarPriceChange: undefined }), { publishedByUserId: USER_ID, publishedAt: NOW }), /sugarPriceChange is required/);
  assert.equal(database.createCount, 0);
});

test('React price model emits and validates the exact canonical payload', async () => {
  const modelPath = path.resolve(__dirname, '../../web/react-app/src/domain/priceModel.js');
  const { buildPricePayload, assertCanonicalPrice } = await import(pathToFileURL(modelPath).href);
  const form = { effectiveDate: '2026-09-17', weekLabel: 'Week 3 Sep', sugarPricePerLkg: '2850', molassesPricePerMetricTon: '4200', circularNumber: 'SRA-2026-117', source: 'Official SRA circular 117' };
  const payload = buildPricePayload(form, { sugarPricePerLkg: 2800, molassesPricePerMetricTon: 4100 });
  assert.deepEqual(payload, { effectiveDate: '2026-09-17', weekLabel: 'Week 3 Sep', sugarPricePerLkg: 2850, sugarPriceChange: 50, molassesPricePerMetricTon: 4200, molassesPriceChange: 100, circularNumber: 'SRA-2026-117', source: 'Official SRA circular 117' });
  assert.equal(assertCanonicalPrice({ id: 'PRC-TEST', ...payload }).weekLabel, 'Week 3 Sep');
  for (const key of ['date', 'week', 'price', 'molasses', 'change', 'molassesChange']) assert.equal(Object.hasOwn(payload, key), false);
});

test('React first publication has deterministic zero change and rejects invalid input', async () => {
  const { buildPricePayload } = await import(pathToFileURL(path.resolve(__dirname, '../../web/react-app/src/domain/priceModel.js')).href);
  const form = { effectiveDate: '2026-09-17', weekLabel: 'Week 3 Sep', sugarPricePerLkg: '2850', molassesPricePerMetricTon: '4200', circularNumber: 'SRA-2026-117', source: 'Official circular' };
  assert.equal(buildPricePayload(form).sugarPriceChange, 0);
  assert.equal(buildPricePayload(form).molassesPriceChange, 0);
  assert.throws(() => buildPricePayload({ ...form, effectiveDate: 'Sep 17, 2026' }), /YYYY-MM-DD/);
  assert.throws(() => buildPricePayload({ ...form, sugarPricePerLkg: '' }), /required/);
});
