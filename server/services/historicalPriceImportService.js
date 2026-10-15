'use strict';
const crypto = require('node:crypto');
const { buildSraPrice } = require('../schema/firestoreSchema');
const { comparableChange } = require('./priceAnalyticsService');
const { queueAuditEvent } = require('./auditWriter');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (ch === ',' || ch === '\n')) {
      row.push(cell.replace(/\r$/, '')); cell = '';
      if (ch === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field.');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); }
  return rows;
}

function prepareHistoricalPrices(text, publishedAt = new Date().toISOString()) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  const headers = rows.shift();
  const expected = ['month', 'week_of_month', 'week_ending', 'raw_sugar_php_per_lkg', 'negros_molasses_php_per_mt', 'raw_sugar_status', 'negros_molasses_status', 'source_url'];
  if (JSON.stringify(headers) !== JSON.stringify(expected)) throw new Error('CSV headers do not match the SRA weekly price contract.');
  if (!rows.length || rows.length > 100) throw new Error('Import requires 1–100 weekly rows.');
  const sourceFileSha256 = digest(text), importBatchId = `SRA-HISTORY-${sourceFileSha256.slice(0, 16).toUpperCase()}`;
  const statuses = { Reported: 'REPORTED', 'No bidding': 'NO_BIDDING', 'Ended milling': 'MILLING_ENDED', 'Not reported': 'NOT_REPORTED' };
  const dates = new Set();
  const records = rows.map((values, index) => {
    if (values.length !== expected.length) throw new Error(`CSV row ${index + 2} has an invalid column count.`);
    const row = Object.fromEntries(headers.map((key, i) => [key, values[i].trim()]));
    if (dates.has(row.week_ending)) throw new Error(`Duplicate week ending ${row.week_ending}.`);
    dates.add(row.week_ending);
    if (!statuses[row.raw_sugar_status] || !statuses[row.negros_molasses_status]) throw new Error(`Unsupported CSV status in ${row.week_ending}.`);
    const value = (field, status) => {
      if (status !== 'REPORTED' && row[field] !== '') throw new Error(`Non-reported value must be blank at ${row.week_ending}.`);
      if (status === 'REPORTED' && !/^\d+(\.\d{1,2})?$/.test(row[field])) throw new Error(`Invalid reported amount at ${row.week_ending}.`);
      return row[field] === '' ? null : Number(row[field]);
    };
    const data = buildSraPrice({
      effectiveDate: row.week_ending, weekLabel: `${row.week_of_month}, ${row.month} ${row.week_ending.slice(0, 4)}`,
      sugarPriceStatus: statuses[row.raw_sugar_status], molassesPriceStatus: statuses[row.negros_molasses_status],
      sugarPricePerLkg: value('raw_sugar_php_per_lkg', statuses[row.raw_sugar_status]),
      molassesPricePerMetricTon: value('negros_molasses_php_per_mt', statuses[row.negros_molasses_status]),
      sugarPriceChange: null, molassesPriceChange: null,
      circularNumber: `SRA weekly millsite ${row.week_ending}`, source: 'SRA weekly millsite prices — supplied historical CSV',
      sourceUrl: row.source_url, molassesMarket: 'Negros', periodType: 'WEEK_ENDING', importBatchId, sourceFileSha256,
      publishedByUserId: 'SYSTEM_HISTORICAL_IMPORT', publishedAt
    });
    const date = new Date(`${data.effectiveDate}T00:00:00Z`);
    if (date.getUTCDay() !== 0 || date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) !== row.month
      || row.week_of_month !== `Week ${Math.ceil(date.getUTCDate() / 7)}`) throw new Error(`CSV period labels do not match ${row.week_ending}.`);
    if (!/^https:\/\/(www\.)?sra\.gov\.ph\//.test(data.sourceUrl)) throw new Error('Historical CSV must reference an HTTPS SRA source.');
    return { id: `PRC-${digest(`SRA-WEEKLY-MILLSITE:${data.effectiveDate}`).slice(0, 20).toUpperCase()}`, ...data };
  }).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  records.forEach((row, i) => {
    row.sugarPriceChange = comparableChange(row, records[i - 1], 'sugar');
    row.molassesPriceChange = comparableChange(row, records[i - 1], 'molasses');
  });
  return { importBatchId, sourceFileSha256, records };
}

async function applyHistoricalPrices(database, prepared, replacements) {
  return database.runTransaction(async transaction => {
    const targets = await Promise.all(replacements.map(item => transaction.get(database.collection('sra_prices').doc(item.id))));
    const existing = await Promise.all(prepared.records.map(row => transaction.get(database.collection('sra_prices').doc(row.id))));
    targets.forEach((snap, index) => {
      if (!snap.exists || digest(JSON.stringify(snap.data())) !== replacements[index].fingerprint) throw new Error('A selected replacement record changed. Generate a fresh import plan.');
    });
    existing.forEach((snap, index) => {
      if (snap.exists && snap.data().sourceFileSha256 !== prepared.sourceFileSha256) throw new Error(`Historical record conflict at ${prepared.records[index].effectiveDate}.`);
    });
    let created = 0;
    prepared.records.forEach(({ id, ...data }, index) => {
      if (!existing[index].exists) { transaction.create(database.collection('sra_prices').doc(id), data); created++; }
    });
    replacements.forEach(item => transaction.delete(database.collection('sra_prices').doc(item.id)));
    if (created || replacements.length) queueAuditEvent(transaction, database, {
      eventType: 'SRA_PRICE_HISTORY_IMPORTED', actorUserId: 'SYSTEM_HISTORICAL_IMPORT', entityType: 'SRA_PRICE_IMPORT',
      entityId: prepared.importBatchId, details: `Imported ${created} weekly records and replaced ${replacements.length} selected test record(s). Source SHA-256 ${prepared.sourceFileSha256}.`
    });
    return { created, removed: replacements.length, totalRows: prepared.records.length, importBatchId: prepared.importBatchId };
  });
}

module.exports = { parseCsv, prepareHistoricalPrices, applyHistoricalPrices, digest };
