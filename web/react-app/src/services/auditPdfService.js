import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import QRCode from 'qrcode';
import { auditReportLayout, operationMonth, reportingMonthLabel } from '../utils/auditReportLayout.js';
import { auditCropYearCycles } from '../domain/auditWorkflow.js';

const number = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const filePart = value => String(value || 'Report').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 100);
const accountId = user => String(user?.employeeId || user?.userId || user?.id || '');
const accountName = user => String(user?.displayName || user?.name || '');
const actorName = (name, id, user, fallback) => String(name || (id && String(id) === accountId(user) ? accountName(user) : '') || fallback);
const milling = operation => Number(operation.stageNumber) === 6
  || /milling|harvest|cutting|loading|hauling|trucking|bull cart/i.test(`${operation.category || ''} ${operation.operationName || operation.name || ''}`);

function drawQr(doc, value, x, y, size = 25) {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'H' });
  const count = qr.modules.size;
  const cell = size / (count + 8);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, size, size, 'F');
  doc.setFillColor(0, 0, 0);
  for (let row = 0; row < count; row++) for (let column = 0; column < count; column++) {
    if (qr.modules.data[row * count + column]) doc.rect(x + (column + 4) * cell, y + (row + 4) * cell, cell, cell, 'F');
  }
}

export function createAuditReportPdf(report, { blockFarms = [], currentUser = null, verificationLabel = '' } = {}) {
  if (!report) throw new Error('An audit report is required.');
  const operations = report.operationSnapshots || report.operations || report.logs || [];
  const layout = auditReportLayout(report, operations);
  const cycles = auditCropYearCycles(report, operations, report.fieldSnapshots || []);
  const hash = String(report.qrHash || report.qrSignature || report.integrityHash || '').trim();
  if (!hash) throw new Error('This report has no QR integrity code.');
  const farm = blockFarms.find(item => item.id === report.blockFarmId) || {};
  const farmName = String(farm.name || report.blockFarmName || report.blockFarmId || 'Block farm not provided');
  const farmAddress = String(farm.address || farm.location || report.blockFarmAddress || report.blockFarmLocation || 'Address not provided');
  const fieldAreas = new Map();
  operations.forEach(operation => {
    if (operation.fieldId) fieldAreas.set(operation.fieldId, Math.max(fieldAreas.get(operation.fieldId) || 0, Number(operation.areaHa || 0)));
  });
  const auditedArea = [...fieldAreas.values()].reduce((sum, area) => sum + area, 0) || Number(report.hectaresAudited || 0);
  const totalArea = Number(farm.totalAreaHa || farm.declaredAreaHa || auditedArea);
  const wide = layout.columns.length > 24;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: wide ? 'a3' : 'a4', compress: true });
  doc.setProperties({ title: `HUGPONG Audit Report ${report.reportId || report.id || ''}`, subject: 'Recorded field operations', author: accountName(currentUser) || 'HUGPONG' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 8;
  let y = 10;
  doc.setTextColor(0);
  if (verificationLabel) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(verificationLabel, margin, y); y += 6;
  }
  if (report.supersededByCorrectionId) {
    doc.setFontSize(8); doc.text(`SUPERSEDED: use ${report.supersededByCorrectionId}. Original snapshot retained for history.`, margin, y); y += 6;
  }
  const meta = [
    ['REPORT ID', report.reportId || report.id || ''],
    ['REPORTING MONTH', reportingMonthLabel(layout.period)],
    ['CROP YEAR CYCLE', cycles.join(' / ') || 'Not recorded'],
    ['NAME OF BLOCK FARM', farmName], ['ADDRESS', farmAddress],
    ['TOTAL AREA OF BLOCK FARM (HA)', totalArea.toFixed(4)],
    ['TOTAL AUDITED AREA (HA)', auditedArea.toFixed(4)]
  ];
  const qrY = y - 2;
  for (const [label, value] of meta) {
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text(label, margin, y);
    const lines = doc.splitTextToSize(String(value), width - margin * 2 - 64 - 36);
    doc.text(lines, margin + 64, y); y += Math.max(4.3, lines.length * 3.8);
  }
  drawQr(doc, hash, width - margin - 28, qrY, 25);
  doc.setFont('courier', 'normal'); doc.setFontSize(5.5);
  doc.text(doc.splitTextToSize(hash, 29), width - margin - 29, qrY + 27);
  y = Math.max(y, qrY + 36) + 2;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text('Coverage: recorded operations only. Plots without records are not counted as audited.', margin, y); y += 4;
  const noteLines = doc.splitTextToSize(layout.timelineNote, width - margin * 2);
  doc.text(noteLines, margin, y); y += noteLines.length * 3 + 2;

  const fixed = [6, 46, 12, 10, 14, 18, 22];
  const available = width - margin * 2 - fixed.reduce((sum, value) => sum + value, 0);
  const monthWidth = layout.columns.length ? Math.min(10, available / layout.columns.length) : 0;
  const operationWidth = fixed[1] + Math.max(0, available - monthWidth * layout.columns.length);
  const columnStyles = { 0: { cellWidth: fixed[0], halign: 'center' }, 1: { cellWidth: operationWidth } };
  layout.columns.forEach((_column, index) => { columnStyles[index + 2] = { cellWidth: monthWidth, halign: 'right' }; });
  fixed.slice(2).forEach((value, index) => { columnStyles[index + layout.columns.length + 2] = { cellWidth: value, halign: index === 1 || index === 2 ? 'center' : 'right' }; });
  const head = [[{ content: 'NO', rowSpan: 2 }, { content: 'OPERATION', rowSpan: 2 },
    ...layout.groups.map(group => ({ content: group.label.toUpperCase(), colSpan: group.columns.length })),
    ...['TOTAL', 'QTY', 'UNIT', 'UNIT COST', 'COST PER HECTARE'].map(content => ({ content, rowSpan: 2 }))],
  layout.columns.map(column => ({ content: String(layout.columnLabels[column]) }))];
  const rows = [];
  let operationNumber = 0;
  const totalRow = (label, amount) => [
    { content: label, colSpan: layout.columnCount - 1, styles: { fontStyle: 'bold', lineWidth: 0.3 } },
    { content: number(auditedArea > 0 ? amount / auditedArea : amount), styles: { fontStyle: 'bold', halign: 'right', lineWidth: 0.3 } }
  ];
  const addOperation = operation => {
    operationNumber++;
    const area = Number(operation.areaHa || auditedArea);
    const placement = operationMonth(operation, layout.period);
    const months = layout.columns.map(column => column === placement ? number(area) : '');
    const name = `${operation.operationName || operation.name || `Operation ${operationNumber}`}${operation.childOperationName ? `\nChild operation: ${operation.childOperationName}` : ''}`;
    const cost = Number(operation.totalCost || operation.cost || 0);
    const items = operation.lineItems || [];
    if (items.length) {
      rows.push([{ content: String(operationNumber), styles: { fontStyle: 'bold' } },
        { content: name, colSpan: layout.columnCount - 1, styles: { fontStyle: 'bold', fillColor: [247, 247, 247] } }]);
      for (const item of items) {
        const quantity = Number(item.quantity ?? 1);
        const rate = Number(item.unitCost ?? 0);
        const subtotal = Number(item.subtotal ?? quantity * rate);
        rows.push(['', item.description || item.name || 'Expense', ...months, number(area), String(quantity), item.unit || 'bag', number(rate), number(area > 0 ? subtotal / area : subtotal)]);
      }
    } else {
      const quantity = Number(operation.quantity?.value ?? 1);
      const unitCost = Number(operation.unitCost || cost / Math.max(quantity || 1, 0.1));
      rows.push([String(operationNumber), name, ...months, number(area), String(quantity), operation.quantity?.unit || operation.unit || (milling(operation) ? 'ton' : 'HA'), number(unitCost), number(area > 0 ? cost / area : cost)]);
    }
  };
  const direct = operations.filter(operation => !milling(operation));
  const harvest = operations.filter(milling);
  const directCost = direct.reduce((sum, operation) => sum + Number(operation.totalCost || operation.cost || 0), 0);
  const harvestCost = harvest.reduce((sum, operation) => sum + Number(operation.totalCost || operation.cost || 0), 0);
  direct.forEach(addOperation); rows.push(totalRow('TOTAL DIRECT COST', directCost));
  if (harvest.length) {
    rows.push([{ content: 'MILLING EXPENSES', colSpan: layout.columnCount, styles: { fontStyle: 'bold' } }]);
    harvest.forEach(addOperation); rows.push(totalRow('TOTAL MILLING EXPENSES', harvestCost));
  }
  rows.push(totalRow('TOTAL COST OF PRODUCTION', directCost + harvestCost));
  autoTable(doc, { startY: y, margin: { left: margin, right: margin, top: 10, bottom: 12 }, head, body: rows,
    theme: 'grid', styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.1, lineWidth: 0.16, lineColor: [0, 0, 0], textColor: [0, 0, 0], overflow: 'linebreak' },
    headStyles: { fillColor: [237, 212, 70], textColor: [0, 0, 0], halign: 'center', valign: 'middle', fontStyle: 'bold' },
    columnStyles, rowPageBreak: 'avoid', showHead: 'everyPage' });
  y = doc.lastAutoTable.finalY + 5;
  const footnote = `Total recorded expenditure for ${auditedArea.toFixed(4)} HA included in this report: PHP ${number(directCost + harvestCost)}.`;
  const footnoteLines = doc.splitTextToSize(footnote, width - margin * 2);
  if (y + footnoteLines.length * 3 + 32 > height - 12) { doc.addPage(); y = 14; }
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.text(footnoteLines, margin, y); y += footnoteLines.length * 3 + 14;
  const manager = actorName(report.compiledByName, report.compiledByUserId, currentUser, 'Farm Manager');
  const inspector = report.status === 'CERTIFIED' ? actorName(report.certifiedByName || report.verifiedBy, report.certifiedByUserId, currentUser, 'SRA Inspector') : 'Awaiting Review';
  const signatures = [[manager, 'Farm Manager / President', farmName], [inspector, 'SRA Agricultural Inspector', 'Field Operations Audit Division'], [accountName(currentUser) || 'Authorized HUGPONG User', `Exported by ${String(currentUser?.role || currentUser?.canonicalRole || '').replace(/_/g, ' ')}`, '']];
  const cellWidth = (width - margin * 2 - 24) / 3;
  signatures.forEach(([name, role, detail], index) => {
    const x = margin + index * (cellWidth + 12);
    doc.setLineWidth(0.25); doc.line(x, y, x + cellWidth, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text(doc.splitTextToSize(name.toUpperCase(), cellWidth), x + cellWidth / 2, y + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text(doc.splitTextToSize(`${role}\n${detail}`, cellWidth), x + cellWidth / 2, y + 13, { align: 'center' });
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
    doc.text(String(report.reportId || report.id || ''), margin, height - 5);
    doc.text(`Page ${page} of ${pages}`, width - margin, height - 5, { align: 'right' });
  }
  return { doc, filename: `HUGPONG_${filePart(report.reportId || report.id || layout.period)}_Audit_Report.pdf`, layout };
}

export function downloadAuditReportPdf(report, options) {
  const { doc, filename } = createAuditReportPdf(report, options);
  doc.save(filename);
  return { filename };
}

export function downloadCropYearCompilationPdf(report) {
  if (!report?.id) throw new Error('Save or select a compilation before downloading its PDF.');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('HUGPONG Crop Year Compilation', 14, 18);
  doc.setFontSize(12); doc.text(`${report.cropYearCycle} / ${report.blockFarmId || 'All Block Farms'}`, 14, 26);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Certified monthly reports to date. This does not declare that the crop year is complete.', 14, 34);
  doc.text(`${report.sourceReportCount} certified reports / ${report.monthCount} reporting months / ${report.operationCount} operations`, 14, 41);
  doc.text(`Audited area: ${report.hectaresAudited} HA / Total cost: PHP ${number(report.totalCost)}`, 14, 47);
  let y = 54;
  const table = (title, head, body) => {
    if (y > 245) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(title, 14, y);
    autoTable(doc, { startY: y + 3, margin: 14, head: [head], body, theme: 'grid', styles: { fontSize: 8 }, headStyles: { fillColor: [31, 76, 56] }, rowPageBreak: 'avoid' });
    y = doc.lastAutoTable.finalY + 10;
  };
  table('Monthly breakdown', ['Month', 'Farms', 'Operations', 'Cost (PHP)'], (report.monthlySummaries || []).map(row => [reportingMonthLabel(row.periodKey), row.blockFarmCount, row.operationCount, number(row.totalCost)]));
  table('Block Farm breakdown', ['Block Farm', 'Fields', 'Area (HA)', 'Operations', 'Cost (PHP)'], (report.farmSummaries || []).map(row => [row.blockFarmName, row.fieldCount, row.hectaresAudited, row.operationCount, number(row.totalCost)]));
  table('Certified source reports', ['Report', 'Month', 'Certified at'], (report.sourceReports || []).map(row => [row.reportId, reportingMonthLabel(row.periodKey), row.certifiedAt]));
  if (y > 265) { doc.addPage(); y = 18; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(doc.splitTextToSize(`Compilation: ${report.id}\nCompiled by ${report.compiledByName || 'Authorized SRA Admin'} at ${report.compiledAt || ''}\nArea counts each field once using its latest included monthly snapshot.`, 182), 14, y);
  const filename = `HUGPONG_${filePart(report.id)}_Crop_Year_Compilation.pdf`;
  doc.save(filename);
  return { filename };
}
