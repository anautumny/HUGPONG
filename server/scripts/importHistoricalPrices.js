'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { prepareHistoricalPrices, applyHistoricalPrices, digest } = require('../services/historicalPriceImportService');
const arg = key => process.argv.find(item => item.startsWith(`--${key}=`))?.slice(key.length + 3);
async function main() {
  const csvPath = path.resolve(arg('csv') || path.join(__dirname, '../data/SRA_Weekly_Prices_2026_By_Month_Week.csv'));
  const prepared = prepareHistoricalPrices(fs.readFileSync(csvPath, 'utf8'));
  const { db, admin } = require('../firebase-admin');
  if (!db) throw new Error('Firestore is unavailable.');
  const projectId = admin.app().options.projectId;
  const current = await db.collection('sra_prices').get();
  const selected = new Set((arg('replace-ids') || '').split(',').filter(Boolean));
  const replacements = current.docs.filter(doc => selected.has(doc.id)).map(doc => ({ id: doc.id, fingerprint: digest(JSON.stringify(doc.data())), data: doc.data() }));
  if (replacements.length !== selected.size) throw new Error('A selected replacement ID was not found.');
  const dateConflicts = current.docs.filter(doc => !selected.has(doc.id) && !prepared.records.some(row => row.id === doc.id)
    && prepared.records.some(row => row.effectiveDate === doc.data().effectiveDate));
  if (dateConflicts.length) throw new Error('Existing non-selected records overlap imported weeks; review them before import.');
  const plan = { projectId, sourceFileSha256: prepared.sourceFileSha256, importBatchId: prepared.importBatchId,
    rowCount: prepared.records.length, firstWeek: prepared.records[0].effectiveDate, lastWeek: prepared.records.at(-1).effectiveDate,
    replacements, originalRecords: current.docs.map(doc => ({ id: doc.id, data: doc.data() })) };
  const planPath = path.resolve(arg('plan') || path.join(__dirname, '../../.tmp/beta-audit/historical-price-plan.json'));
  if (!process.argv.includes('--execute')) {
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
    console.log({ mode: 'PLAN_ONLY', ...plan, originalRecords: plan.originalRecords.length, replacements: replacements.map(row => ({ id: row.id, date: row.data.effectiveDate, reference: row.data.circularNumber })), planPath });
    return;
  }
  if (arg('project') !== projectId) throw new Error('Execution requires --project matching the active Firebase project.');
  const approved = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  if (approved.projectId !== projectId || approved.sourceFileSha256 !== prepared.sourceFileSha256
    || JSON.stringify(approved.replacements) !== JSON.stringify(replacements)) throw new Error('Import plan no longer matches the input or replacement records.');
  const result = await applyHistoricalPrices(db, prepared, approved.replacements);
  console.log({ mode: 'EXECUTED', projectId, ...result, backupPlan: planPath });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
