'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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

test('active web price mapping validates canonical records and does not recreate legacy aliases', async () => {
  const schemaUrl = pathToFileURL(path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'services', 'firestoreSchema.js')).href;
  const { fromPrice } = await import(schemaUrl);
  const record = fromPrice('PRC-TEST-001', {
    ...buildSraPrice(validInput(), { publishedByUserId: USER_ID, publishedAt: NOW })
  });
  assert.equal(record.weekLabel, 'Week 3 Sep');
  assert.equal(record.sugarPricePerLkg, 2850);
  assert.equal(Object.hasOwn(record, 'week'), false);
  assert.equal(Object.hasOwn(record, 'price'), false);
  assert.equal(Object.hasOwn(record, 'date'), false);
  assert.throws(
    () => fromPrice('PRC-LEGACY', {
      date: 'Sep 17, 2026', week: 'Week 3 Sep', price: 2850, molasses: 4200
    }),
    /effectiveDate is required/
  );
});

test('active React publisher derives canonical change values and payload fields', () => {
  const modal = fs.readFileSync(
    path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'components', 'prices', 'PublishPriceModal.jsx'),
    'utf8'
  );
  assert.match(modal, /const sugarChange = .*curSugarNum - prevSugar : 0/);
  assert.match(modal, /const molassesChange = .*curMolassesNum - prevMolasses : 0/);
  assert.match(modal, /effectiveDate,\s+weekLabel: weekLabel\.trim\(\),\s+sugarPricePerLkg: curSugarNum,\s+sugarPriceChange: sugarChange,\s+molassesPricePerMetricTon: curMolassesNum,\s+molassesPriceChange: molassesChange,\s+circularNumber:/);
  assert.doesNotMatch(modal, /\b(date|week|price|molasses|change|molassesChange)\s*:/);
});

test('active web price service posts the canonical payload to the authoritative endpoint', () => {
  const service = fs.readFileSync(
    path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'services', 'pricesService.js'),
    'utf8'
  );
  assert.match(service, /authenticatedRequest\('\/api\/prices',\s*\{\s*method: 'POST',\s*body: payload/);
  assert.doesNotMatch(service, /addDoc|setDoc|updateDoc/);
});

test('first active React price publication derives zero changes without fabricating prior prices', () => {
  const modal = fs.readFileSync(
    path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'components', 'prices', 'PublishPriceModal.jsx'),
    'utf8'
  );
  assert.match(modal, /const prevSugar = latestPrice\?\.sugarPricePerLkg != null[\s\S]*?: null/);
  assert.match(modal, /const prevMolasses = latestPrice\?\.molassesPricePerMetricTon != null[\s\S]*?: null/);
  assert.match(modal, /prevSugar !== null \? curSugarNum - prevSugar : 0/);
  assert.match(modal, /prevMolasses !== null \? curMolassesNum - prevMolasses : 0/);
});
