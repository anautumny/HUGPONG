export const AUDIT_STATUS = Object.freeze({
  COMPILED: 'COMPILED', PENDING_SUBMISSION: 'PENDING_SUBMISSION',
  PENDING_REVIEW: 'PENDING_REVIEW', RETURNED: 'RETURNED', CERTIFIED: 'CERTIFIED'
});

export const canonicalAuditStatus = value => {
  const status = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (['PENDING', 'SUBMITTED', 'VERIFIED'].includes(status)) return AUDIT_STATUS.PENDING_REVIEW;
  return Object.values(AUDIT_STATUS).includes(status) ? status : AUDIT_STATUS.COMPILED;
};

export const auditStatusLabel = value => ({
  COMPILED: 'Compiled', PENDING_SUBMISSION: 'Pending Submission',
  PENDING_REVIEW: 'Awaiting Review', RETURNED: 'Returned for Correction', CERTIFIED: 'Certified'
}[canonicalAuditStatus(value)]);

const reportTime = report => Date.parse(report?.updatedAt || report?.compiledAt || report?.createdAt || '') || 0;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function auditReportPeriod(report) {
  const value = String(report?.periodKey || report?.period || report?.month || '').trim();
  const iso = value.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-|$)/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const named = value.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').match(/^([a-z]+)\s+(\d{4})$/);
  if (!named) return '';
  const monthIndex = MONTHS.findIndex(month => month === named[1] || month.startsWith(named[1]));
  return monthIndex >= 0 ? `${named[2]}-${String(monthIndex + 1).padStart(2, '0')}` : '';
}

export function sortAuditReportsNewest(reports = []) {
  return [...reports].sort((left, right) => {
    const versionDifference = Number(right?.reportVersion || 1) - Number(left?.reportVersion || 1);
    return versionDifference || reportTime(right) - reportTime(left);
  });
}

export function auditReportsForFarmPeriod(reports = [], blockFarmId, periodKey) {
  return sortAuditReportsNewest(reports.filter(report =>
    String(report?.blockFarmId || '').trim() === String(blockFarmId || '').trim()
      && auditReportPeriod(report) === periodKey
  ));
}

export function reportedOperationIds(reports = []) {
  return new Set(reports
    .filter(report => canonicalAuditStatus(report?.status) !== AUDIT_STATUS.RETURNED)
    .flatMap(report => report?.operationSnapshots || report?.operations || [])
    .map(operation => String(operation?.operationLogId || operation?.id || '').trim())
    .filter(Boolean));
}

export function certifiedOperationIds(reports = []) {
  return reportedOperationIds(reports.filter(report => canonicalAuditStatus(report?.status) === AUDIT_STATUS.CERTIFIED));
}

export function businessPeriodKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).formatToParts(date);
  return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}`;
}

export function displayPeriod(periodKey) {
  return new Date(`${periodKey}-01T00:00:00+08:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' });
}

export function createAuditQrPayload(report) {
  return JSON.stringify({
    type: 'HUGPONG_AUDIT', schemaVersion: Number(report.qrSchemaVersion || 1),
    reportId: report.id || report.reportId, rootReportId: report.rootReportId,
    blockFarmId: report.blockFarmId, periodKey: report.periodKey || report.period,
    reportVersion: Number(report.reportVersion || 1), operationCount: Number(report.operationCount || report.operationSnapshots?.length || 0),
    fieldCount: Number(report.fieldCount || 0), hectaresAudited: Number(report.hectaresAudited || 0),
    totalCost: Number(report.totalCost || 0), compiledByUserId: report.compiledByUserId,
    compiledAt: report.compiledAt, integrityHash: report.integrityHash || report.qrHash
  });
}

export function decodeAuditQrPayload(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw.trim()) : raw;
  if (!value || value.type !== 'HUGPONG_AUDIT' || Number(value.schemaVersion) !== 1) throw new Error('This is not a supported HUGPONG audit QR package.');
  if (!value.reportId || !value.blockFarmId || !value.periodKey || !value.integrityHash) throw new Error('The audit QR package is incomplete.');
  return value;
}
