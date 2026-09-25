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
