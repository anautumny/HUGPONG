'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { buildSraPrice } = require('../schema/firestoreSchema');
const { prepareHistoricalPrices, applyHistoricalPrices, digest } = require('../services/historicalPriceImportService');
const { buildPriceAnalytics, decoratePriceHistory, comparableChange } = require('../services/priceAnalyticsService');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const csv = fs.readFileSync(path.join(__dirname, '../data/SRA_Weekly_Prices_2026_By_Month_Week.csv'), 'utf8');
const prepared = () => prepareHistoricalPrices(csv, '2026-10-16T04:00:00.000Z');

test('39 supplied CSV rows retain source values, missing statuses, dates, and deterministic IDs', () => {
  const { records, sourceFileSha256 } = prepared();
  assert.equal(records.length, 39);
  assert.equal(sourceFileSha256, digest(csv));
  assert.equal(new Set(records.map(row => row.id)).size, 39);
  assert.equal(records[0].sugarPricePerLkg, 2184.85);
  assert.equal(records.at(-1).effectiveDate, '2026-09-27');
  const mixed = records.find(row => row.effectiveDate === '2026-06-07');
  assert.equal(mixed.sugarPriceStatus, 'REPORTED');
  assert.equal(mixed.sugarPricePerLkg, 2210);
  assert.equal(mixed.molassesPriceStatus, 'NO_BIDDING');
  assert.equal(mixed.molassesPricePerMetricTon, null);
  assert.equal(records.at(-1).sugarPriceStatus, 'MILLING_ENDED');
  assert.equal(records.at(-1).sugarPricePerLkg, null);
  assert.deepEqual(records.map(row => row.id), prepared().records.map(row => row.id));
});

test('CSV import rejects duplicate dates, invalid labels, contradictory amounts, and unsupported statuses', () => {
  assert.throws(() => prepareHistoricalPrices(csv + csv.split('\n')[1]), /Duplicate week/);
  assert.throws(() => prepareHistoricalPrices(csv.replace('January,Week 1', 'February,Week 1')), /period labels/);
  assert.throws(() => prepareHistoricalPrices(csv.replace('2026-06-07,2210.00,,', '2026-06-07,2210.00,0,')), /must be blank/);
  assert.throws(() => prepareHistoricalPrices(csv.replace('No bidding', 'Guess')), /Unsupported CSV status/);
});

test('schema accepts per-product statuses and rejects zero or contradictory quotations', () => {
  const sample = prepared().records.find(row => row.effectiveDate === '2026-06-07');
  assert.equal(buildSraPrice(sample).molassesPricePerMetricTon, null);
  assert.throws(() => buildSraPrice({ ...sample, molassesPricePerMetricTon: 0 }), /must be null/);
  assert.throws(() => buildSraPrice({ ...sample, sugarPricePerLkg: 0 }), /greater than zero/);
  assert.throws(() => buildSraPrice({ ...sample, sugarPriceStatus: 'GUESS' }), /must be one of/);
});

test('API monthly means exclude unavailable weeks independently for each commodity', () => {
  const analytics = buildPriceAnalytics(prepared().records, '2026-10-16');
  const june = analytics.monthly.trendPoints.find(point => point.periodLabel === '2026-06');
  assert.equal(june.sugarPrice, 2239.58);
  assert.equal(june.molassesPrice, 19887.5);
  assert.equal(june.sugarReportedWeeks, 3);
  assert.equal(june.molassesReportedWeeks, 2);
  assert.equal(june.totalWeeks, 4);
  const august = analytics.monthly.trendPoints.find(point => point.periodLabel === '2026-08');
  assert.equal(august.sugarPrice, null);
  assert.equal(august.sugarReportedWeeks, 0);
  assert.equal(august.sugarStatus, 'MILLING_ENDED');
  assert.equal(analytics.weekly.trendPoints.length, 39);
  assert.equal(analytics.weekly.currentSugar, null);
  assert.equal(analytics.summary.isStale, true);
  assert.deepEqual(analytics.summary.lastReported.sugar, { value: 2205, date: '2026-07-12', market: null });
  assert.equal(analytics.summary.lastReported.molasses.date, '2026-06-21');
  assert.equal(analytics.summary.sugarPeriodChangePercent, null);
});

test('price changes stop at unavailable weeks, mismatched markets, and missing calendar weeks', () => {
  const rows = prepared().records;
  assert.equal(comparableChange(rows[1], rows[0], 'sugar'), 31.94);
  assert.equal(rows.find(row => row.effectiveDate === '2026-06-14').molassesPriceChange, null);
  assert.equal(rows.find(row => row.effectiveDate === '2026-07-12').sugarPriceChange, null);
  assert.equal(comparableChange(rows[2], rows[0], 'sugar'), null);
  assert.equal(comparableChange({ ...rows[1], molassesMarket: 'Other' }, rows[0], 'molasses'), null);
});

test('historical import atomically replaces only selected unchanged mock records and is replay safe', async () => {
  const original = { circularNumber: 'CHECK', source: 'MEMYSELFANDI' };
  const database = memoryFirestore({ 'sra_prices/MOCK': original, 'sra_prices/KEEP': { effectiveDate: '2025-01-01' } });
  const result = await applyHistoricalPrices(database, prepared(), [{ id: 'MOCK', fingerprint: digest(JSON.stringify(original)) }]);
  assert.equal(result.created, 39);
  assert.equal(result.removed, 1);
  assert.equal(database.records.has('sra_prices/MOCK'), false);
  assert.equal(database.records.has('sra_prices/KEEP'), true);
  const replay = await applyHistoricalPrices(database, prepared(), []);
  assert.equal(replay.created, 0);
  assert.equal([...database.records.keys()].filter(key => key.startsWith('audit_logs/')).length, 1);
  const changed = memoryFirestore({ 'sra_prices/MOCK': { ...original, source: 'Changed' } });
  await assert.rejects(applyHistoricalPrices(changed, prepared(), [{ id: 'MOCK', fingerprint: digest(JSON.stringify(original)) }]), /changed/);
  assert.equal(changed.records.size, 1);
});

test('Web and Mobile mappers retain null quotes, provenance, and the same server analytics snapshot', async () => {
  const root = path.join(__dirname, '../..');
  const web = await import(pathToFileURL(path.join(root, 'web/react-app/src/services/firestoreSchema.js')).href);
  const source = fs.readFileSync(path.join(root, 'mobile/src/data/firestoreSchema.js'), 'utf8');
  const start = source.indexOf('export function toPriceDocument'), end = source.indexOf('export function toSupportTicketDocument', start);
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, end).replace(/export /g, ''), context);
  const latest = decoratePriceHistory(prepared().records, '2026-10-16')[0];
  const expected = web.fromPrice(latest.id, latest);
  assert.deepEqual(JSON.parse(JSON.stringify(context.fromPriceDocument(latest.id, latest))), expected);
  assert.equal(expected.sugarPricePerLkg, null);
  assert.equal(expected.priceAnalytics.weekly.trendPoints.length, 39);
});

test('clients consume authoritative trends and display missing statuses without currency zeros or regional product labels', async () => {
  const root = path.join(__dirname, '../..');
  const web = await import(pathToFileURL(path.join(root, 'web/react-app/src/services/analyticsSelectors.js')).href);
  const mobileSource = fs.readFileSync(path.join(root, 'mobile/src/services/analyticsSelectors.js'), 'utf8');
  const start = mobileSource.indexOf('export function selectPriceTrends');
  const context = vm.createContext({});
  vm.runInContext(mobileSource.slice(start).replace('export function', 'function'), context);
  const data = decoratePriceHistory(prepared().records, '2026-10-16');
  for (const timeframe of ['weekly', 'monthly']) assert.deepEqual(JSON.parse(JSON.stringify(context.selectPriceTrends({ prices: data, timeframe }))), web.selectPriceTrends({ prices: data, timeframe }));
  const presentation = await import(pathToFileURL(path.join(root, 'web/react-app/src/utils/pricePresentation.js')).href);
  assert.equal(presentation.priceText(null, 'NO_BIDDING'), 'No bidding');
  assert.equal(presentation.priceText(null, 'MILLING_ENDED'), 'Milling ended');
  assert.equal(presentation.movementText(null), 'No comparison');
  for (const file of ['web/react-app/src/components/prices/PriceReferenceCard.jsx', 'mobile/src/components/PriceReferenceCard.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /Negros/);
  }
});
