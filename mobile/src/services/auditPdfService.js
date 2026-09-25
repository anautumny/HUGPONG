import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import QRCode from 'qrcode';
import { formatCropYearDisplay } from '../utils/dataHelpers';

const CURRENT_CYCLE_MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const FOLLOWING_PERIOD_MONTHS = [1, 2, 3];

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatNumber = value => Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const safeFilePart = value => String(value || 'Report')
  .trim()
  .replace(/[^a-z0-9_-]+/gi, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 80) || 'Report';

const accountId = user => String(user?.employeeId || user?.userId || user?.id || '').trim();

const accountName = user => String(
  user?.displayName || user?.name || accountId(user) || 'Authenticated User'
).trim();

const accountRole = user => String(
  user?.role || user?.roleLabel || user?.canonicalRole || 'HUGPONG Account'
).trim().replace(/_/g, ' ');

const reportActorName = (storedName, storedId, currentUser, fallback) => {
  if (String(storedName || '').trim()) return String(storedName).trim();
  if (String(storedId || '').trim() && String(storedId).trim() === accountId(currentUser)) {
    return accountName(currentUser);
  }
  return String(storedId || fallback).trim();
};

function isMillingOperation(log = {}) {
  const name = String(log.operationName || log.name || '').toLowerCase();
  const category = String(log.category || '').toLowerCase();
  const stage = Number(log.stageNumber || 0);
  return stage === 6
    || category.includes('milling')
    || category.includes('harvest')
    || name.includes('cutting')
    || name.includes('loading')
    || name.includes('hauling')
    || name.includes('trucking')
    || name.includes('bull cart')
    || name.includes('milling');
}

function createQrSvg(value) {
  try {
    const qr = QRCode.create(String(value || 'HUG-SRA-AUDIT'), { errorCorrectionLevel: 'H' });
    const count = qr.modules.size;
    const quietZone = 4;
    let path = '';
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (qr.modules.data[row * count + column]) {
          path += `M${column},${row}h1v1h-1z `;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-${quietZone} -${quietZone} ${count + quietZone * 2} ${count + quietZone * 2}" width="96" height="96" role="img" aria-label="Digital audit seal"><rect x="-${quietZone}" y="-${quietZone}" width="${count + quietZone * 2}" height="${count + quietZone * 2}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  } catch {
    return '<div class="qr-fallback">QR</div>';
  }
}

function getMonthPlacement(performedOn, isMilling, reportMonth, cycleStartYear) {
  if (!performedOn) {
    return isMilling
      ? { isNextCycle: true, month: 1 }
      : { isNextCycle: false, month: reportMonth };
  }
  const parts = String(performedOn).split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return { isNextCycle: Boolean(isMilling), month: isMilling ? 1 : reportMonth };
  }
  if (isMilling || year > cycleStartYear + 1 || (year === cycleStartYear + 1 && month >= 9)) {
    return { isNextCycle: true, month: Math.min(Math.max(month - 8, 1), 3) };
  }
  return { isNextCycle: false, month };
}

function monthCells(placement, area) {
  const current = CURRENT_CYCLE_MONTHS.map(month => (
    `<td class="number month">${!placement.isNextCycle && placement.month === month ? escapeHtml(area) : ''}</td>`
  )).join('');
  const next = FOLLOWING_PERIOD_MONTHS.map(month => (
    `<td class="number month">${placement.isNextCycle && placement.month === month ? escapeHtml(area) : ''}</td>`
  )).join('');
  return current + next;
}

function operationRow(log, operationNumber, placement, totalAuditedHa) {
  const operationName = log.operationName || log.name || `Operation ${operationNumber}`;
  const area = Number(log.areaHa || totalAuditedHa).toFixed(2);
  const totalCost = Number(log.totalCost || log.cost || 0);
  const quantity = log.quantity?.value != null ? log.quantity.value : (log.quantity != null ? log.quantity : 1);
  const unit = log.quantity?.unit || log.unit || 'ha';
  const unitCost = Number(log.unitCost || (totalCost / Math.max(Number(quantity) || 1, 0.1)));
  const costPerHa = Number(log.areaHa) > 0 ? totalCost / Number(log.areaHa) : totalCost;

  if (Array.isArray(log.lineItems) && log.lineItems.length > 0) {
    const group = `<tr class="group-row"><td class="center bold">${operationNumber}</td><td colspan="21" class="bold">${escapeHtml(operationName)}</td></tr>`;
    const children = log.lineItems.map((item, childIndex) => {
      const childQuantity = item.quantity != null ? item.quantity : 1;
      const childUnit = item.unit || 'bag';
      const childUnitCost = Number(item.unitCost || (Number(item.subtotal || 0) / Math.max(Number(childQuantity) || 1, 0.1)));
      const childSubtotal = Number(item.subtotal != null ? item.subtotal : Number(childQuantity) * childUnitCost);
      const childCostPerHa = Number(log.areaHa) > 0 ? childSubtotal / Number(log.areaHa) : childSubtotal;
      return `<tr>
        <td></td>
        <td class="indent">${escapeHtml(item.description || item.name || `Item ${childIndex + 1}`)}</td>
        ${monthCells(placement, area)}
        <td class="number bold">${area}</td>
        <td class="center">${escapeHtml(childQuantity)}</td>
        <td class="center">${escapeHtml(childUnit)}</td>
        <td class="number">${formatNumber(childUnitCost)}</td>
        <td class="number bold">${formatNumber(childCostPerHa)}</td>
      </tr>`;
    }).join('');
    return group + children;
  }

  return `<tr>
    <td class="center bold">${operationNumber}</td>
    <td class="bold">${escapeHtml(operationName)}</td>
    ${monthCells(placement, area)}
    <td class="number bold">${area}</td>
    <td class="center">${escapeHtml(quantity)}</td>
    <td class="center">${escapeHtml(unit)}</td>
    <td class="number">${formatNumber(unitCost)}</td>
    <td class="number bold">${formatNumber(costPerHa)}</td>
  </tr>`;
}

export function buildAuditReportHtml(report, { blockFarms = [], currentUser = null } = {}) {
  if (!report) throw new Error('An audit report is required to generate a PDF.');

  const farm = blockFarms.find(item => item.id === report.blockFarmId) || {};
  const farmName = farm.name || report.blockFarmName || report.blockFarm || report.blockFarmId || 'District Block Farm';
  const farmLocation = farm.location || farm.address || report.blockFarmLocation || 'HDA. SILAY DISTRICT, SILAY CITY, NEGROS OCCIDENTAL';
  const operations = Array.isArray(report.operationSnapshots)
    ? report.operationSnapshots
    : (Array.isArray(report.operations) ? report.operations : (Array.isArray(report.logs) ? report.logs : []));

  const fieldAreas = new Map();
  operations.forEach(log => {
    if (log.fieldId) {
      fieldAreas.set(log.fieldId, Math.max(fieldAreas.get(log.fieldId) || 0, Number(log.areaHa || 0)));
    }
  });
  const operationArea = Array.from(fieldAreas.values()).reduce((sum, area) => sum + area, 0);
  const snapshotArea = Array.isArray(report.fieldSnapshots)
    ? report.fieldSnapshots.reduce((sum, field) => sum + Number(field.ha || field.areaHa || field.area || 0), 0)
    : 0;
  const totalAuditedHa = operationArea > 0
    ? operationArea
    : (Number(report.hectaresAudited || report.totalHectares || snapshotArea || operations[0]?.areaHa || farm.totalAreaHa) || 1);
  const totalFarmArea = Number(farm.totalAreaHa || farm.declaredAreaHa || farm.declaredHa || totalAuditedHa).toFixed(4);
  const auditedArea = totalAuditedHa.toFixed(4);

  const period = String(report.periodKey || report.period || report.month || '');
  const periodMatch = period.match(/^(\d{4})-(\d{2})$/);
  const operationDateMatch = String(operations.find(log => log.performedOn)?.performedOn || '').match(/^(\d{4})-(\d{2})/);
  const reportYear = periodMatch ? Number(periodMatch[1]) : (operationDateMatch ? Number(operationDateMatch[1]) : new Date().getFullYear());
  const reportMonth = periodMatch ? Number(periodMatch[2]) : (operationDateMatch ? Number(operationDateMatch[2]) : 1);
  const storedCropYear = report.cropYear || operations.find(log => log.cropYear)?.cropYear || '';
  const storedStartYear = Number(String(storedCropYear).match(/\d{4}/)?.[0]);
  const cycleStartYear = Number.isInteger(storedStartYear) ? storedStartYear : reportYear;
  const currentCycle = `Crop Year Cycle ${formatCropYearDisplay(storedCropYear)}`.replace(/[–—]/g, '-');

  const directOperations = operations.filter(log => !isMillingOperation(log));
  const millingOperations = operations.filter(isMillingOperation);
  const directCost = directOperations.reduce((sum, log) => sum + Number(log.totalCost || log.cost || 0), 0);
  const millingCost = millingOperations.reduce((sum, log) => sum + Number(log.totalCost || log.cost || 0), 0);
  const directCostPerHa = totalAuditedHa > 0 ? directCost / totalAuditedHa : directCost;
  const millingCostPerHa = totalAuditedHa > 0 ? millingCost / totalAuditedHa : millingCost;
  const grandTotal = directCost + millingCost;
  const grandTotalPerHa = totalAuditedHa > 0 ? grandTotal / totalAuditedHa : grandTotal;
  const hash = report.qrHash || report.qrSignature || report.integrityHash || report.reportId || report.id || 'HUG-SRA-AUDIT';
  const isCertified = String(report.status || '').toUpperCase() === 'CERTIFIED';

  const directRows = directOperations.map((log, index) => operationRow(
    log,
    index + 1,
    getMonthPlacement(log.performedOn || log.date, false, reportMonth, cycleStartYear),
    totalAuditedHa
  )).join('');
  const millingRows = millingOperations.map((log, index) => operationRow(
    log,
    directOperations.length + index + 1,
    getMonthPlacement(log.performedOn || log.date, true, reportMonth, cycleStartYear),
    totalAuditedHa
  )).join('');

  const rows = operations.length === 0
    ? '<tr><td colspan="22" class="empty">No operational records compiled in this audit dossier.</td></tr>'
    : `${directRows}
      <tr class="total-row"><td colspan="21">TOTAL DIRECT COST</td><td class="number">${formatNumber(directCostPerHa)}</td></tr>
      ${millingOperations.length > 0 ? `<tr class="section-row"><td colspan="22">Milling Expenses</td></tr>${millingRows}<tr class="total-row"><td colspan="21">TOTAL MILLING EXPENSES</td><td class="number">${formatNumber(millingCostPerHa)}</td></tr>` : ''}
      <tr class="grand-row"><td colspan="21">TOTAL COST OF PRODUCTION</td><td class="number">${formatNumber(grandTotalPerHa)}</td></tr>`;

  const currentMonthHeaders = CURRENT_CYCLE_MONTHS.map(month => `<th>${month}</th>`).join('');
  const nextMonthHeaders = FOLLOWING_PERIOD_MONTHS.map(month => `<th>${month}</th>`).join('');
  const managerName = reportActorName(report.compiledByName, report.compiledByUserId, currentUser, 'Farm Manager');
  const inspectorName = isCertified
    ? reportActorName(report.certifiedByName || report.verifiedBy, report.certifiedByUserId, currentUser, 'SRA Admin')
    : 'Awaiting Review';
  const printedByName = accountName(currentUser);
  const printedByRole = accountRole(currentUser);

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        @page { size: A4 landscape; margin: 8mm; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #000; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 8.5px; line-height: 1.2; }
        .sheet { width: 100%; }
        .meta { display: grid; grid-template-columns: 54mm 1fr; gap: 1.5px 4mm; margin-bottom: 3mm; font-size: 9px; font-weight: 700; text-transform: uppercase; }
        .meta .value { font-weight: 800; letter-spacing: .15px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { border: .5px solid #000; padding: 1.25px 2px; vertical-align: middle; overflow-wrap: anywhere; }
        th { background: #edd446; text-align: center; font-weight: 800; text-transform: uppercase; }
        th.no { width: 6mm; }
        th.operation { width: 42mm; text-align: left; }
        th.month, td.month { width: 5mm; }
        th.total { width: 12mm; }
        th.qty { width: 9mm; }
        th.unit { width: 9mm; }
        th.unit-cost { width: 15mm; }
        th.cost-ha { width: 18mm; }
        .center { text-align: center; }
        .number { text-align: right; font-family: 'Courier New', monospace; }
        .bold { font-weight: 800; }
        .indent { padding-left: 7px; }
        .group-row, .section-row { background: #f7f7f7; }
        .total-row td { border-top-width: 1px; font-weight: 800; }
        .grand-row td { border-top-width: 1.5px; font-size: 9px; font-weight: 900; letter-spacing: .15px; }
        .empty { padding: 12px; text-align: center; color: #666; font-style: italic; }
        .footnote { margin-top: 2mm; color: #444; font-size: 8px; font-style: italic; }
        .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12mm; margin-top: 8mm; text-align: center; page-break-inside: avoid; }
        .signature { border-top: .5px solid #000; padding-top: 2mm; min-height: 16mm; }
        .signature .name { font-size: 9px; font-weight: 800; text-transform: uppercase; }
        .signature .role { margin-top: 6mm; color: #555; font-size: 7.5px; line-height: 1.3; }
        .seal { border-top: .5px dashed #bbb; margin-top: 3mm; padding-top: 2mm; display: flex; align-items: center; justify-content: center; gap: 3mm; page-break-inside: avoid; }
        .qr { border: .5px solid #000; padding: 1mm; width: 27mm; height: 27mm; display: flex; align-items: center; justify-content: center; }
        .qr svg { width: 25mm; height: 25mm; }
        .qr-fallback { font-weight: 900; font-size: 16px; }
        .seal-copy { font-family: 'Courier New', monospace; font-size: 7.5px; line-height: 1.35; }
        .seal-copy .hash { font-weight: 800; }
        .muted { color: #666; }
      </style>
    </head>
    <body>
      <main class="sheet">
        <section class="meta">
          <div>NAME OF BLOCK FARM</div><div class="value">${escapeHtml(farmName)}</div>
          <div>LOCATION</div><div class="value">${escapeHtml(farmLocation)}</div>
          <div>TOTAL AREA OF BLOCK FARM (HA)</div><div class="value">${totalFarmArea}</div>
          <div>TOTAL AREA FOR NEW PLANT (HA)</div><div class="value">${auditedArea}</div>
        </section>

        <table>
          <thead>
            <tr>
              <th class="no" rowspan="2">NO</th>
              <th class="operation" rowspan="2">OPERATION</th>
              <th colspan="12">${escapeHtml(currentCycle)}</th>
              <th colspan="3">FOLLOWING PERIOD</th>
              <th class="total" rowspan="2">TOTAL</th>
              <th class="qty" rowspan="2">QTY</th>
              <th class="unit" rowspan="2">UNIT</th>
              <th class="unit-cost" rowspan="2">UNIT COST</th>
              <th class="cost-ha" rowspan="2">COST PER HECTARE</th>
            </tr>
            <tr>${currentMonthHeaders}${nextMonthHeaders}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <p class="footnote">* Total Cumulative Farm Expenditure for ${auditedArea} Ha Audited = <strong>PHP ${formatNumber(grandTotal)}</strong> (Philippine Pesos). Certified compliant under SRA Silay Mill District standard schedule.</p>

        <section class="signatures">
          <div class="signature"><div class="name">${escapeHtml(managerName)}</div><div class="role">Farm Manager / President<br><strong>${escapeHtml(farmName)}</strong></div></div>
          <div class="signature"><div class="name">${escapeHtml(inspectorName)}</div><div class="role">SRA Agricultural Inspector<br><strong>Field Operations Audit Division</strong></div></div>
          <div class="signature"><div class="name">${escapeHtml(printedByName)}</div><div class="role">Printed by ${escapeHtml(printedByRole)}<br><strong>Authenticated HUGPONG Account</strong></div></div>
        </section>

        <section class="seal">
          <div class="qr">${createQrSvg(hash)}</div>
          <div class="seal-copy">
            <div class="hash">DIGITAL AUDIT SEAL: [HASH: ${escapeHtml(hash)}]</div>
            <div class="muted">VERIFIED VIA HUGPONG ENTERPRISE SUITE - SRA SILAY MILL DISTRICT</div>
            <div class="muted">TAMPER-PROOF CRYPTOGRAPHIC AUDIT RECORD - R.A. 10659 COMPLIANT</div>
          </div>
        </section>
      </main>
    </body>
  </html>`;
}

export async function exportAuditReportPdf(report, options = {}) {
  const html = buildAuditReportHtml(report, options);
  const period = report?.periodKey || report?.period || report?.month || report?.reportId || report?.id || 'Report';
  const filename = `HUGPONG_${safeFilePart(period)}_Audit_Report.pdf`;
  const result = await Print.printToFileAsync({ html, base64: true });
  let destination = result.uri;

  // Expo Go can render a PDF into its protected Print cache but Android may
  // reject FileSystem.copyAsync reads from that location. Writing the Base64
  // result into the app cache produces a shareable file with a stable name.
  if (result.base64 && FileSystem.cacheDirectory) {
    destination = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.deleteAsync(destination, { idempotent: true });
    await FileSystem.writeAsStringAsync(destination, result.base64, {
      encoding: FileSystem.EncodingType.Base64
    });
  }

  if (!destination) throw new Error('The generated PDF file is unavailable.');

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(destination, {
      mimeType: 'application/pdf',
      dialogTitle: `Save or share ${filename}`,
      UTI: 'com.adobe.pdf'
    });
  } else {
    await Print.printAsync({ html });
  }

  return { uri: destination, filename };
}
