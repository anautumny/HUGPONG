'use strict';

const crypto = require('crypto');
const { COLLECTIONS, ROLES, canonicalRole, createAuditHash } = require('../schema/firestoreSchema');
const { validateCanonicalAuditReport } = require('../domain/auditWorkflow');
const { queueAuditEvent } = require('./auditWriter');

const MAX_REPORTS = 2000;
const MAX_DOCUMENT_BYTES = 800 * 1024;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const round = value => Math.round((value + Number.EPSILON) * 10000) / 10000;

function selection(input = {}) {
  const cropYearCycle = String(input.cropYearCycle || '').trim();
  const match = /^(\d{4})-(\d{4})$/.exec(cropYearCycle);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) throw fail('Select a Crop Year Cycle in YYYY-YYYY format.');
  const blockFarmId = String(input.blockFarmId || '').trim().toUpperCase();
  if (blockFarmId && !/^[A-Z0-9_-]{1,80}$/.test(blockFarmId)) throw fail('Block Farm selection is invalid.');
  return { cropYearCycle, blockFarmId: blockFarmId || null };
}

function assertSra(user) {
  if (canonicalRole(user?.canonicalRole || user?.role || user?.roleKey) !== ROLES.SRA_ADMIN) {
    throw fail('Only an SRA Admin may compile Crop Year reports.', 403);
  }
}

function operationCropYear(operation, report) {
  // Older reports can omit per-operation identity only when the report itself
  // identifies one unambiguous crop year. Never infer crop year from its month.
  const years = [...new Set([report.cropYearCycle, ...(report.cropYearCycles || [])].filter(Boolean))];
  return operation.cropYearCycle || (years.length === 1 ? years[0] : '');
}

async function certifiedReports(database, blockFarmId = null, transaction = null) {
  let query = database.collection(COLLECTIONS.AUDIT_REPORTS).where('status', '==', 'CERTIFIED');
  if (blockFarmId) query = query.where('blockFarmId', '==', blockFarmId);
  query = query.limit(MAX_REPORTS + 1);
  const snapshot = transaction ? await transaction.get(query) : await query.get();
  if (snapshot.docs.length > MAX_REPORTS) throw fail('This selection exceeds the supported report limit. Select one Block Farm or contact support.', 413);
  return snapshot.docs.map(document => ({ ...document.data(), id: document.id }));
}

// Month/version reports are incremental. Include every certified version, then
// deduplicate operations; never discard earlier versions by selecting only the latest.
function buildCompilation(reports, input) {
  const scope = selection(input);
  const operations = new Map();
  const sources = [];
  const fields = new Map();
  const members = new Set();
  const farms = new Map();
  const months = new Map();
  let duplicateOperationCount = 0;
  for (const report of [...reports].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    if (report.status !== 'CERTIFIED' || (scope.blockFarmId && report.blockFarmId !== scope.blockFarmId)) continue;
    if ([report.cropYearCycle, ...(report.cropYearCycles || [])].includes(scope.cropYearCycle)
      && (report.operationSnapshots || []).some(operation => !operationCropYear(operation, report))) {
      throw fail(`Certified report ${report.id} has operations without an unambiguous Crop Year Cycle. Correct its source identity before compiling.`, 409);
    }
    const selected = (report.operationSnapshots || []).filter(operation => operationCropYear(operation, report) === scope.cropYearCycle);
    if (!selected.length) continue;
    if (!report.certifiedAt || !report.certifiedByUserId) throw fail(`Certified report ${report.id} is missing certification attribution.`, 409);
    validateCanonicalAuditReport(report);
    if (createAuditHash(report.id, report.blockFarmId, report.periodKey, report.operationSnapshots) !== report.integrityHash) {
      throw fail(`Certified report ${report.id} failed its integrity check.`, 409);
    }
    const sourceFields = new Map(report.fieldSnapshots.map(field => [field.fieldId, field]));
    const farmName = report.blockFarmName || report.blockFarmId;
    sources.push({ reportId: report.id, blockFarmId: report.blockFarmId, periodKey: report.periodKey,
      reportVersion: report.reportVersion || 1, certifiedAt: report.certifiedAt, certifiedByUserId: report.certifiedByUserId,
      operationCount: selected.length, fingerprint: digest(report) });
    for (const operation of selected) {
      const operationId = String(operation.operationLogId || operation.id || '').trim();
      const field = sourceFields.get(operation.fieldId);
      const amount = Number(operation.totalCost);
      if (!field || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(Number(field.areaHa)) || Number(field.areaHa) < 0) {
        throw fail(`Certified report ${report.id} contains invalid field or cost data.`, 409);
      }
      const entry = { blockFarmId: report.blockFarmId, periodKey: report.periodKey, operation };
      const fieldKey = `${report.blockFarmId}/${operation.fieldId}`;
      const previous = fields.get(fieldKey);
      const snapshotOrder = `${report.periodKey}|${report.certifiedAt}|${report.id}`;
      if (!previous || snapshotOrder > previous.snapshotOrder) fields.set(fieldKey, { ...field, blockFarmId: report.blockFarmId, snapshotOrder });
      if (operations.has(operationId)) {
        if (digest(operations.get(operationId)) !== digest(entry)) throw fail(`Operation ${operationId} has conflicting certified snapshots. Resolve the source reports before compiling.`, 409);
        duplicateOperationCount += 1;
        continue;
      }
      operations.set(operationId, entry);
      // A field may change area during the crop year. Use its latest certified
      // monthly snapshot for unique land area rather than adding monthly acreage.
      if (field.memberId) members.add(field.memberId);
      const farm = farms.get(report.blockFarmId) || { blockFarmId: report.blockFarmId, blockFarmName: farmName, operationCount: 0, totalCost: 0, periods: new Set(), members: new Set() };
      if (field.memberId) farm.members.add(field.memberId);
      farm.operationCount += 1; farm.totalCost += amount; farm.periods.add(report.periodKey); farms.set(report.blockFarmId, farm);
      const month = months.get(report.periodKey) || { periodKey: report.periodKey, operationCount: 0, totalCost: 0, farms: new Set() };
      month.operationCount += 1; month.totalCost += amount; month.farms.add(report.blockFarmId); months.set(report.periodKey, month);
    }
  }
  const farmSummaries = [...farms.values()].sort((a, b) => a.blockFarmId.localeCompare(b.blockFarmId)).map(farm => {
    const farmFields = [...fields.values()].filter(field => field.blockFarmId === farm.blockFarmId);
    const { members: farmMembers, ...summary } = farm;
    return { ...summary, totalCost: round(farm.totalCost), periods: [...farm.periods].sort(), fieldCount: farmFields.length,
      memberCount: farmMembers.size,
      hectaresAudited: round(farmFields.reduce((sum, field) => sum + Number(field.areaHa), 0)) };
  });
  const monthlySummaries = [...months.values()].sort((a, b) => a.periodKey.localeCompare(b.periodKey)).map(month => ({
    periodKey: month.periodKey, operationCount: month.operationCount, totalCost: round(month.totalCost), blockFarmCount: month.farms.size
  }));
  const result = { ...scope, status: 'COMPILED', coverage: 'CERTIFIED_REPORTS_TO_DATE', sourceReports: sources,
    sourceReportCount: sources.length, duplicateOperationCount, operationCount: operations.size, fieldCount: fields.size,
    memberCount: members.size, blockFarmCount: farms.size, monthCount: months.size,
    periods: monthlySummaries.map(month => month.periodKey), totalCost: round([...operations.values()].reduce((sum, entry) => sum + Number(entry.operation.totalCost), 0)),
    hectaresAudited: round([...fields.values()].reduce((sum, field) => sum + Number(field.areaHa), 0)), farmSummaries, monthlySummaries };
  return { ...result, contentHash: digest(result) };
}

async function compilationOptions(database, user) {
  assertSra(user);
  const reports = await certifiedReports(database);
  const years = new Set();
  const farms = new Map();
  reports.forEach(report => {
    (report.operationSnapshots || []).forEach(operation => {
      const value = String(operationCropYear(operation, report) || '');
      if (/^(\d{4})-\d{4}$/.test(value) && Number(value.slice(5)) === Number(value.slice(0, 4)) + 1) years.add(value);
    });
    farms.set(report.blockFarmId, { id: report.blockFarmId, name: report.blockFarmName || report.blockFarmId });
  });
  return { cropYearCycles: [...years].sort().reverse(), blockFarms: [...farms.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

async function compileCropYear(database, user, input, { preview = false, now = new Date().toISOString() } = {}) {
  assertSra(user);
  const scope = selection(input);
  if (preview) return buildCompilation(await certifiedReports(database, scope.blockFarmId), scope);
  return database.runTransaction(async transaction => {
    const summary = buildCompilation(await certifiedReports(database, scope.blockFarmId, transaction), scope);
    if (!summary.operationCount) throw fail('No certified monthly operations match this Crop Year Cycle and Block Farm.', 409);
    const id = `CYA-${scope.cropYearCycle}-${summary.contentHash.slice(0, 24).toUpperCase()}`;
    const ref = database.collection(COLLECTIONS.CROP_YEAR_COMPILATIONS).doc(id);
    const prior = await transaction.get(ref);
    if (prior.exists) return { ...prior.data(), id, replayed: true };
    const compiledByUserId = String(user.employeeId || user.userId || '').trim();
    const record = { ...summary, compiledAt: now, compiledByUserId, compiledByName: user.name || compiledByUserId, schemaVersion: 1 };
    if (Buffer.byteLength(JSON.stringify(record), 'utf8') > MAX_DOCUMENT_BYTES) throw fail('Compilation is too large. Select one Block Farm.', 413);
    transaction.create(ref, record);
    queueAuditEvent(transaction, database, { eventType: 'CROP_YEAR_AUDIT_COMPILED', actorUserId: compiledByUserId,
      entityType: 'CROP_YEAR_COMPILATION', entityId: id, blockFarmId: scope.blockFarmId,
      details: `Compiled ${scope.cropYearCycle} from ${summary.sourceReportCount} certified monthly reports and ${summary.operationCount} unique operations.`, createdAt: now });
    return { ...record, id, replayed: false };
  });
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
function compilationHtml(report) {
  const money = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const table = (headings, rows) => `<table><thead><tr>${headings.map(item => `<th>${escape(item)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(item => `<td>${escape(item)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Crop Year ${escape(report.cropYearCycle)}</title><style>@page{size:A4;margin:16mm}body{font:12px Arial,sans-serif;color:#172b20}h1{font-size:23px}h2{margin-top:24px;font-size:16px}p{line-height:1.6}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{text-align:left;border:1px solid #ccd6cc;padding:7px;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}.muted{color:#526358}</style></head><body><h1>HUGPONG Crop Year Compilation</h1><h2>${escape(report.cropYearCycle)} · ${escape(report.blockFarmId || 'All Block Farms')}</h2><p>Certified monthly reports to date. This compilation does not declare that the crop year is complete.</p><p>${escape(report.sourceReportCount)} certified reports · ${escape(report.monthCount)} reporting months · ${escape(report.blockFarmCount)} Block Farms<br>${escape(report.operationCount)} unique operations · ${escape(report.fieldCount)} fields · ${escape(report.memberCount)} members<br>Unique audited area: ${escape(report.hectaresAudited)} ha · Total cost: PHP ${money(report.totalCost)}</p><h2>Monthly breakdown</h2>${table(['Month', 'Farms', 'Operations', 'Cost (PHP)'], report.monthlySummaries.map(row => [row.periodKey, row.blockFarmCount, row.operationCount, money(row.totalCost)]))}<h2>Block Farm breakdown</h2>${table(['Block Farm', 'Fields', 'Area (ha)', 'Operations', 'Cost (PHP)'], report.farmSummaries.map(row => [row.blockFarmName, row.fieldCount, row.hectaresAudited, row.operationCount, money(row.totalCost)]))}<h2>Certified source reports</h2>${table(['Report', 'Month', 'Certified at', 'Certified by'], report.sourceReports.map(row => [row.reportId, row.periodKey, row.certifiedAt, row.certifiedByUserId]))}<p class="muted">Compilation: ${escape(report.id)}<br>Compiled by ${escape(report.compiledByName)} (${escape(report.compiledByUserId)}) at ${escape(report.compiledAt)}<br>Area counts each field once using its latest included monthly snapshot. New monthly certifications require a new compilation; saved snapshots remain unchanged.</p></body></html>`;
}

module.exports = { selection, assertSra, buildCompilation, compilationOptions, compileCropYear, compilationHtml };
