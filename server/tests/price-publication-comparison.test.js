'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { publishSraPrice } = require('../services/priceService');
const { comparableChange, decoratePriceHistory } = require('../services/priceAnalyticsService');
const { memoryFirestore } = require('./helpers/memoryFirestore');

const entries = [
  ['2026-11-10', 2800, 18000],
  ['2026-11-12', 2850, 18600],
  ['2026-11-15', 2500, 17000],
].map(([effectiveDate, sugarPricePerLkg, molassesPricePerMetricTon], index) => ({
  id: `PRC-COMPARE-${index}`, effectiveDate, sugarPricePerLkg, molassesPricePerMetricTon,
  weekLabel: `November ${effectiveDate.slice(-2)}`, circularNumber: `SRA-COMPARE-${index}`,
  source: 'Publication comparison regression', periodType: 'EFFECTIVE_DATE',
  publishedByUserId: 'SRA-TEST', publishedAt: '2026-11-15T10:00:00.000Z',
}));

test('irregular effective-date publications persist authoritative movements and remain replay safe', async () => {
  const database = memoryFirestore();
  const context = { publishedByUserId: 'SRA-TEST', publishedAt: '2026-11-15T10:00:00.000Z' };
  const publications = [];
  for (const input of entries) publications.push(await publishSraPrice(database,
    { ...input, sugarPriceChange: 9999, molassesPriceChange: 9999 }, context));
  assert.deepEqual(publications.map(result => [result.data.sugarPriceChange, result.data.molassesPriceChange]),
    [[null, null], [50, 600], [-350, -1600]]);
  const count = database.records.size;
  assert.equal((await publishSraPrice(database, entries[2], context)).replayed, true);
  assert.equal(database.records.size, count);
});

test('read projection repairs stored null comparisons and follows effective dates for backdated publications', () => {
  const input = [entries[2], entries[0], entries[1]].map(row => ({ ...row, sugarPriceChange: null, molassesPriceChange: null }));
  const before = structuredClone(input);
  const rows = decoratePriceHistory(input, '2026-11-15');
  assert.deepEqual(rows.map(row => [row.effectiveDate, row.sugarPriceChange, row.molassesPriceChange]), [
    ['2026-11-15', -350, -1600], ['2026-11-12', 50, 600], ['2026-11-10', null, null],
  ]);
  assert.deepEqual(rows[0].priceAnalytics.weekly.trendPoints.map(point => [point.sugarChange, point.molassesChange]),
    [[null, null], [50, 600], [-350, -1600]]);
  assert.deepEqual(input, before, 'existing records are not rewritten to repair the display');
});

test('comparisons retain unavailable-quote, market and historical missing-week safeguards', () => {
  assert.equal(comparableChange({ ...entries[1], sugarPriceStatus: 'NO_BIDDING', sugarPricePerLkg: null }, entries[0], 'sugar'), null);
  assert.equal(comparableChange(entries[1], { ...entries[0], sugarPriceStatus: 'MILLING_ENDED' }, 'sugar'), null);
  assert.equal(comparableChange({ ...entries[1], molassesMarket: 'Other market' }, entries[0], 'molasses'), null);
  assert.equal(comparableChange(entries[0], entries[0], 'sugar'), null);
  assert.equal(comparableChange(entries[0], entries[1], 'sugar'), null);
  assert.equal(comparableChange({ ...entries[1], periodType: 'WEEK_ENDING' }, { ...entries[0], periodType: 'WEEK_ENDING' }, 'sugar'), null);
  assert.equal(comparableChange({ ...entries[1], effectiveDate: '2026-11-17', periodType: 'WEEK_ENDING' },
    { ...entries[0], periodType: 'WEEK_ENDING' }, 'sugar'), 50);
  assert.equal(comparableChange({ ...entries[1], sugarPricePerLkg: entries[0].sugarPricePerLkg }, entries[0], 'sugar'), 0);
});

test('Web and Mobile retain server comparisons and label publication movement independently of weekly movement', async () => {
  const root = path.join(__dirname, '../..');
  const web = await import(pathToFileURL(path.join(root, 'web/react-app/src/services/firestoreSchema.js')).href);
  const presentation = await import(pathToFileURL(path.join(root, 'web/react-app/src/utils/pricePresentation.js')).href);
  const mobileSource = fs.readFileSync(path.join(root, 'mobile/src/data/firestoreSchema.js'), 'utf8');
  const start = mobileSource.indexOf('export function toPriceDocument');
  const end = mobileSource.indexOf('export function toSupportTicketDocument', start);
  const context = vm.createContext({});
  vm.runInContext(mobileSource.slice(start, end).replace(/export /g, ''), context);
  for (const row of decoratePriceHistory(entries, '2026-11-15')) {
    const mapped = web.fromPrice(row.id, row);
    assert.deepEqual(JSON.parse(JSON.stringify(context.fromPriceDocument(row.id, row))), mapped);
    assert.equal(mapped.sugarPriceChange, row.sugarPriceChange);
    assert.equal(mapped.molassesPriceChange, row.molassesPriceChange);
  }
  vm.runInContext(fs.readFileSync(path.join(root, 'mobile/src/utils/pricePresentation.js'), 'utf8').replace(/export /g, ''), context);
  for (const row of [entries[2], { periodType: 'WEEK_ENDING' }]) {
    context.row = row;
    assert.equal(vm.runInContext('comparisonSuffix(row)', context), presentation.comparisonSuffix(row));
  }
  assert.equal(presentation.comparisonSuffix(entries[2]), ' vs previous dated publication');
  assert.equal(presentation.comparisonSuffix({ periodType: 'WEEK_ENDING' }), ' vs prior week');
});
