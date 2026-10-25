import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import QRCode from 'qrcode';
import { formatCropYearDisplay } from '../utils/dataHelpers';
import { auditCropYearCycles } from '../domain/auditWorkflow';

import { auditReportLayout, operationMonth } from '../utils/auditReportLayout';

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
  user?.displayName || user?.name || ''
).trim();

const accountRole = user => String(
  user?.role || user?.roleLabel || user?.canonicalRole || ''
).trim().replace(/_/g, ' ');

const reportActorName = (storedName, storedId, currentUser, fallback) => {
  if (String(storedName || '').trim()) return String(storedName).trim();
  if (String(storedId || '').trim() && String(storedId).trim() === accountId(currentUser)) {
    const currentName = accountName(currentUser);
    if (currentName) return currentName;
  }
  return String(fallback || '').trim();
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
    const qr = QRCode.create(String(value), { errorCorrectionLevel: 'H' });
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
    return '<div class="qr-fallback">QR unavailable</div>';
  }
}

function monthCells(placement, area, layout) {
  return layout.columns.map(month => '<td class="number month">' + (placement === month ? escapeHtml(area) : '') + '</td>').join('');
}

function operationRow(log, operationNumber, placement, totalAuditedHa, layout) {
  const operationName = log.operationName || log.name || `Operation ${operationNumber}`;
  const operationNameHtml = log.childOperationName
    ? `${escapeHtml(operationName)}<br><span style="font-size:8px;font-weight:600">Child operation: ${escapeHtml(log.childOperationName)}</span>`
    : escapeHtml(operationName);
  const area = Number(log.areaHa || totalAuditedHa).toFixed(2);
  const totalCost = Number(log.totalCost || log.cost || 0);
  const quantity = log.quantity?.value != null ? log.quantity.value : (log.quantity != null ? log.quantity : 1);
  const unit = log.quantity?.unit || log.unit || 'ha';
  const unitCost = Number(log.unitCost || (totalCost / Math.max(Number(quantity) || 1, 0.1)));
  const costPerHa = Number(log.areaHa) > 0 ? totalCost / Number(log.areaHa) : totalCost;

  if (Array.isArray(log.lineItems) && log.lineItems.length > 0) {
    const group = `<tr class="group-row"><td class="center bold">${operationNumber}</td><td colspan="${layout.columnCount - 1}" class="bold">${operationNameHtml}</td></tr>`;
    const children = log.lineItems.map((item, childIndex) => {
      const childQuantity = item.quantity != null ? item.quantity : 1;
      const childUnit = item.unit || 'bag';
      const childUnitCost = Number(item.unitCost || (Number(item.subtotal || 0) / Math.max(Number(childQuantity) || 1, 0.1)));
      const childSubtotal = Number(item.subtotal != null ? item.subtotal : Number(childQuantity) * childUnitCost);
      const childCostPerHa = Number(log.areaHa) > 0 ? childSubtotal / Number(log.areaHa) : childSubtotal;
      return `<tr>
        <td></td>
        <td class="indent">${escapeHtml(item.description || item.name || `Item ${childIndex + 1}`)}</td>
        ${monthCells(placement, area, layout)}
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
    <td class="bold">${operationNameHtml}</td>
    ${monthCells(placement, area, layout)}
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
  const farmName = farm.name || report.blockFarmName || report.blockFarm || report.blockFarmId || 'Block farm not provided';
  const farmAddress = farm.address || farm.location || report.blockFarmAddress || report.blockFarmLocation || 'Address not provided';
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
    : (Number(report.hectaresAudited || report.totalHectares || snapshotArea || operations[0]?.areaHa || farm.totalAreaHa) || 0);
  const totalFarmArea = Number(farm.totalAreaHa || farm.declaredAreaHa || farm.declaredHa || totalAuditedHa || 0).toFixed(4);
  const auditedArea = totalAuditedHa.toFixed(4);

  const period = String(report.periodKey || report.period || report.month || '');
  const fieldSnapshots = Array.isArray(report.fieldSnapshots) ? report.fieldSnapshots : [];
  const cropYearCycles = auditCropYearCycles(report, operations, fieldSnapshots);
  if (!cropYearCycles.length) {
    throw new Error('This audit report has no recorded Crop Year Cycle. Correct or recompile the report before exporting it.');
  }
  const cropYearDisplay = cropYearCycles.map(formatCropYearDisplay).join(' / ');
  const layout = auditReportLayout(report, operations);

  const directOperations = operations.filter(log => !isMillingOperation(log));
  const millingOperations = operations.filter(isMillingOperation);
  const directCost = directOperations.reduce((sum, log) => sum + Number(log.totalCost || log.cost || 0), 0);
  const millingCost = millingOperations.reduce((sum, log) => sum + Number(log.totalCost || log.cost || 0), 0);
  const directCostPerHa = totalAuditedHa > 0 ? directCost / totalAuditedHa : directCost;
  const millingCostPerHa = totalAuditedHa > 0 ? millingCost / totalAuditedHa : millingCost;
  const grandTotal = directCost + millingCost;
  const grandTotalPerHa = totalAuditedHa > 0 ? grandTotal / totalAuditedHa : grandTotal;
  const hash = String(report.qrHash || report.qrSignature || report.integrityHash || '').trim();
  if (!hash) throw new Error('This audit report has no QR integrity code and cannot be exported.');
  const isCertified = String(report.status || '').toUpperCase() === 'CERTIFIED';

  const directRows = directOperations.map((log, index) => operationRow(
    log,
    index + 1,
    operationMonth(log, period),
    totalAuditedHa, layout
  )).join('');
  const millingRows = millingOperations.map((log, index) => operationRow(
    log,
    directOperations.length + index + 1,
    operationMonth(log, period),
    totalAuditedHa, layout
  )).join('');

  const rows = operations.length === 0
    ? `<tr><td colspan="${layout.columnCount}" class="empty">No operational records compiled in this audit dossier.</td></tr>`
    : `${directRows}
      <tr class="total-row"><td colspan="${layout.columnCount - 1}">TOTAL DIRECT COST</td><td class="number">${formatNumber(directCostPerHa)}</td></tr>
      ${millingOperations.length > 0 ? `<tr class="section-row"><td colspan="${layout.columnCount}">Milling Expenses</td></tr>${millingRows}<tr class="total-row"><td colspan="${layout.columnCount - 1}">TOTAL MILLING EXPENSES</td><td class="number">${formatNumber(millingCostPerHa)}</td></tr>` : ''}
      <tr class="grand-row"><td colspan="${layout.columnCount - 1}">TOTAL COST OF PRODUCTION</td><td class="number">${formatNumber(grandTotalPerHa)}</td></tr>`;

  const yearHeaders = layout.years.map(year => '<th colspan="12">Calendar year ' + year + '</th>').join('');
  const monthHeaders = layout.columns.map(month => '<th>' + Number(month.slice(5)) + '</th>').join('');
  const managerId = String(report.compiledByUserId || '').trim();
  const managerName = reportActorName(report.compiledByName, managerId, currentUser, 'Farm Manager');
  const inspectorId = isCertified ? String(report.certifiedByUserId || '').trim() : '';
  const inspectorName = isCertified
    ? reportActorName(report.certifiedByName || report.verifiedBy, inspectorId, currentUser, 'SRA Inspector')
    : 'Awaiting Review';
  const printedByName = accountName(currentUser) || 'Authorized HUGPONG User';
  const printedByRole = accountRole(currentUser);
  const reportId = String(report.reportId || report.id || '').trim();

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
        .report-header { display: grid; grid-template-columns: minmax(0, 1fr) 30mm; gap: 5mm; align-items: start; margin-bottom: 3mm; }
        .meta { display: grid; grid-template-columns: 54mm 1fr; gap: 1.5px 4mm; font-size: 9px; font-weight: 700; text-transform: uppercase; }
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
        .signature .role { margin-top: 4mm; color: #555; font-size: 7.5px; line-height: 1.3; }
        .qr-panel { width: 30mm; text-align: center; page-break-inside: avoid; }
        .qr { border: .5px solid #000; padding: 1mm; width: 27mm; height: 27mm; display: flex; align-items: center; justify-content: center; }
        .qr svg { width: 25mm; height: 25mm; }
        .qr-fallback { font-weight: 900; font-size: 16px; }
        .qr-code { margin-top: 1mm; font-family: 'Courier New', monospace; font-size: 6.5px; line-height: 1.15; overflow-wrap: anywhere; }
      </style>
    </head>
    <body>
      <main class="sheet">
        ${report.supersededByCorrectionId ? `<p class="footnote"><strong>Superseded report.</strong> Use corrected report ${escapeHtml(report.supersededByCorrectionId)}. This original snapshot is retained for history.</p>` : ''}
        <section class="report-header">
          <div class="meta">
            <div>REPORT ID</div><div class="value">${escapeHtml(reportId)}</div>
            <div>REPORTING MONTH</div><div class="value">${escapeHtml(period)}</div>
            <div>CROP YEAR CYCLE</div><div class="value">${escapeHtml(cropYearDisplay)}</div>
            <div>NAME OF BLOCK FARM</div><div class="value">${escapeHtml(farmName)}</div>
            <div>ADDRESS</div><div class="value">${escapeHtml(farmAddress)}</div>
            <div>TOTAL AREA OF BLOCK FARM (HA)</div><div class="value">${totalFarmArea}</div>
            <div>TOTAL AREA FOR NEW PLANT (HA)</div><div class="value">${auditedArea}</div>
          </div>
          <div class="qr-panel">
            <div class="qr">${createQrSvg(hash)}</div>
            <div class="qr-code">${escapeHtml(hash)}</div>
          </div>
        </section>
        <p>Coverage: recorded operations only. Plots without monthly records are not counted as audited.</p>

        <table>
          <thead>
            <tr>
              <th class="no" rowspan="2">NO</th>
              <th class="operation" rowspan="2">OPERATION</th>
              ${yearHeaders}
              <th class="total" rowspan="2">TOTAL</th>
              <th class="qty" rowspan="2">QTY</th>
              <th class="unit" rowspan="2">UNIT</th>
              <th class="unit-cost" rowspan="2">UNIT COST</th>
              <th class="cost-ha" rowspan="2">COST PER HECTARE</th>
            </tr>
            <tr>${monthHeaders}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <p class="footnote">* Total recorded expenditure for ${auditedArea} Ha included in this report: <strong>PHP ${formatNumber(grandTotal)}</strong> (Philippine Pesos).</p>

        <section class="signatures">
          <div class="signature"><div class="name">${escapeHtml(managerName)}</div><div class="role">Farm Manager / President<br><strong>${escapeHtml(farmName)}</strong></div></div>
          <div class="signature"><div class="name">${escapeHtml(inspectorName)}</div><div class="role">SRA Agricultural Inspector<br><strong>Field Operations Audit Division</strong></div></div>
          <div class="signature"><div class="name">${escapeHtml(printedByName)}</div><div class="role">Printed by ${escapeHtml(printedByRole)}</div></div>
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
