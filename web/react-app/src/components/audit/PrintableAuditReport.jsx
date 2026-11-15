import React from 'react';
import { Download, Printer, X } from 'lucide-react';
import Button from '../ui/Button';
import QRCodeView from './QRCodeView';
import { auditReportLayout, reportingMonthLabel, auditOperationGroups } from '../../utils/auditReportLayout';
import { formatCropYearDisplay } from '../../utils/formatters';
import { auditCropYearCycles } from '../../domain/auditWorkflow';

/**
 * Format currency / numeric value with 2 decimals
 */
function formatNumber(num) {
  const val = Number(num || 0);
  return val.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Detect whether an operation belongs to Stage 6 (Harvesting & Milling)
 */
function isMillingOperation(log) {
  const name = String(log.operationName || log.name || '').toLowerCase();
  const cat = String(log.category || '').toLowerCase();
  const stage = Number(log.stageNumber || 0);
  return (
    stage === 6 ||
    cat.includes('milling') ||
    cat.includes('harvest') ||
    name.includes('cutting') ||
    name.includes('loading') ||
    name.includes('hauling') ||
    name.includes('trucking') ||
    name.includes('bull cart') ||
    name.includes('milling')
  );
}

function accountId(user) {
  return String(user?.employeeId || user?.userId || user?.id || '').trim();
}

function accountName(user) {
  return String(user?.displayName || user?.name || '').trim();
}

function accountRole(user) {
  return String(user?.role || user?.roleLabel || user?.canonicalRole || '')
    .trim()
    .replace(/_/g, ' ');
}

function reportActorName(storedName, storedId, currentUser, fallback) {
  if (String(storedName || '').trim()) return String(storedName).trim();
  if (String(storedId || '').trim() && String(storedId).trim() === accountId(currentUser)) {
    const currentName = accountName(currentUser);
    if (currentName) return currentName;
  }
  return String(fallback || '').trim();
}

export default function PrintableAuditReport({
  report = null,
  blockFarms = [],
  currentUser = null,
  isOpenModal = true,
  onClose = () => {}
}) {
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState('');
  if (!report) return null;

  // ── 1. Resolve Dynamic Farm & Report Metadata from System ─────────
  const farm = blockFarms.find(f => f.id === report.blockFarmId);
  const farmName = farm?.name || report.blockFarmName || report.blockFarmId || 'Block farm not provided';
  const farmAddress = farm?.address || farm?.location || report?.blockFarmAddress || report?.blockFarmLocation || 'Address not provided';

  // Extract actual operation logs from report
  const operationLogs = Array.isArray(report.operationSnapshots)
    ? report.operationSnapshots
    : (Array.isArray(report.operations) ? report.operations : []);

  // Compute total audited area across unique plots/fields
  const fieldAreas = new Map();
  operationLogs.forEach(log => {
    if (log.fieldId) {
      fieldAreas.set(log.fieldId, Math.max(fieldAreas.get(log.fieldId) || 0, Number(log.areaHa || 0)));
    }
  });

  const parsedAuditedHa = Array.from(fieldAreas.values()).reduce((sum, ha) => sum + ha, 0);
  const totalAuditedHa = parsedAuditedHa > 0
    ? parsedAuditedHa
    : (operationLogs[0]?.areaHa ? Number(operationLogs[0].areaHa) : (farm?.totalAreaHa ? Number(farm.totalAreaHa) : 0));

  const totalFarmArea = farm?.totalAreaHa ? Number(farm.totalAreaHa).toFixed(4) : totalAuditedHa.toFixed(4);
  const auditedAreaStr = totalAuditedHa.toFixed(4);

  // Use stored cycle context only; never relabel historical reports from today's year.
  const periodStr = String(report.periodKey || report.period || report.month || '');
  const fieldSnapshots = Array.isArray(report.fieldSnapshots) ? report.fieldSnapshots : [];
  const cropYearCycles = auditCropYearCycles(report, operationLogs, fieldSnapshots);
  const cropYearDisplay = cropYearCycles.map(formatCropYearDisplay).join(' / ');
  const layout = auditReportLayout(report, operationLogs);

  // ── 3. Categorize System Operations: Direct vs Milling ────────────
  const directOps = [];
  const millingOps = [];

  auditOperationGroups(report, operationLogs).forEach(log => {
    if (isMillingOperation(log)) {
      millingOps.push(log);
    } else {
      directOps.push(log);
    }
  });

  // Calculate Subtotals & Totals from real system data
  const totalDirectCost = directOps.reduce((sum, log) => sum + Number(log.totalCost ?? log.cost ?? 0), 0);

  const totalMillingCost = millingOps.reduce((sum, log) => sum + Number(log.totalCost ?? log.cost ?? 0), 0);

  const grandTotalCost = totalDirectCost + totalMillingCost;

  const hash = String(report.qrHash || report.qrSignature || report.integrityHash || '').trim();
  const isCertified = report.status === 'CERTIFIED';
  const managerId = String(report.compiledByUserId || '').trim();
  const managerName = reportActorName(report.compiledByName, managerId, currentUser, 'Farm Manager');
  const inspectorId = isCertified ? String(report.certifiedByUserId || '').trim() : '';
  const inspectorName = isCertified
    ? reportActorName(report.certifiedByName || report.verifiedBy, inspectorId, currentUser, 'SRA Inspector')
    : 'Awaiting Review';
  const printedByName = accountName(currentUser) || 'Authorized HUGPONG User';
  const printedByRole = accountRole(currentUser);
  const reportId = String(report.reportId || report.id || '').trim();

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true); setDownloadError('');
    try {
      const { downloadAuditReportPdf } = await import('../../services/auditPdfService');
      downloadAuditReportPdf(report, { blockFarms, currentUser });
    } catch (error) { setDownloadError(error.message || 'The PDF could not be downloaded.'); }
    finally { setIsDownloading(false); }
  };

  const renderOperation = (log, idx, offset = 0) => {
    const opNum = offset + idx + 1;
    const opName = log.operationName || log.name || `Operation ${opNum}`;
    const operationLabel = <>
            <span>{opName}</span>
            {log.childOperationName && <span className="block text-[8px] font-semibold">Child operation: {log.childOperationName}</span>}
          </>;
    const logArea = Number(log.areaHa || totalAuditedHa).toFixed(2);
    const logCost = Number(log.totalCost || 0);
    const logQty = log.quantity?.value != null ? log.quantity.value : log.quantity != null ? log.quantity : 1;
    const logUnit = log.quantity?.unit || log.unit || 'ha';
    const logUnitCost = Number(log.unitCost ?? logCost / Math.max(parseFloat(logQty) || 1, 0.1));
    const hasChildren = Array.isArray(log.lineItems) && log.lineItems.length > 0;
    if (hasChildren) {
      return <React.Fragment key={log.operationLogId || log.id || idx}>
              {/* Group Header Row */}
              <tr className="border-t border-black bg-gray-50">
                <td className="border border-black p-0.5 text-center font-bold">{opNum}</td>
                <td className="border border-black p-0.5 text-left font-bold">
                  {operationLabel}
                </td>
                {Array.from({
            length: layout.columnCount - 2
          }, (_, index) => <td key={index} className="border border-black" />)}
              </tr>
              {/* Child Sub-items */}
              {log.lineItems.map((si, cIdx) => {
          const childQty = si.quantity != null ? si.quantity : 1;
          const childUnit = si.unit || 'bag';
          const childUnitCost = Number(si.unitCost ?? Number(si.subtotal || 0) / Math.max(parseFloat(childQty) || 1, 0.1));
          const childSubtotal = Number(si.subtotal != null ? si.subtotal : Number(childQty) * childUnitCost);
          const childArea = Number(si.areaHa ?? log.areaHa ?? totalAuditedHa);
          return <tr key={`${idx}-${cIdx}`} className="border-t border-gray-300">
      <td className="border border-black p-0.5 text-center"></td>
      <td className="border border-black p-0.5 text-left pl-3">{si.description || si.name || `Item ${cIdx + 1}`}</td>
      {layout.columns.map(month => <td key={month} className="border border-black p-0.5 text-right font-mono">{si.monthlyAreas?.[month] != null ? formatNumber(si.monthlyAreas[month]) : ''}</td>)}
      <td className="border border-black p-0.5 text-right font-mono font-bold">{formatNumber(childArea)}</td>
      <td className="border border-black p-0.5 text-center font-mono whitespace-pre-line">{si.priceCells?.quantityLabel ?? childQty}</td>
      <td className="border border-black p-0.5 text-center whitespace-pre-line">{si.priceCells?.unitLabel ?? childUnit}</td>
      <td className="border border-black p-0.5 text-right font-mono whitespace-pre-line">{si.priceCells?.unitCostLabel ?? formatNumber(childUnitCost)}</td>
      <td className="border border-black p-0.5 text-right font-mono font-bold">{formatNumber(childSubtotal)}</td>
                  </tr>;
        })}
            </React.Fragment>;
    }

    // Single operation row
    return <tr key={log.operationLogId || log.id || idx} className="border-t border-black">
            <td className="border border-black p-0.5 text-center font-bold">{opNum}</td>
            <td className="border border-black p-0.5 text-left font-bold">{operationLabel}</td>
            {layout.columns.map(month => <td key={month} className="border border-black p-0.5 text-right font-mono">{log.monthlyAreas?.[month] != null ? formatNumber(log.monthlyAreas[month]) : ''}</td>)}
            <td className="border border-black p-0.5 text-right font-mono font-bold">{logArea}</td>
            <td className="border border-black p-0.5 text-center font-mono whitespace-pre-line">{log.priceCells?.quantityLabel ?? logQty}</td>
            <td className="border border-black p-0.5 text-center whitespace-pre-line">{log.priceCells?.unitLabel ?? logUnit}</td>
            <td className="border border-black p-0.5 text-right font-mono whitespace-pre-line">{log.priceCells?.unitCostLabel ?? formatNumber(logUnitCost)}</td>
            <td className="border border-black p-0.5 text-right font-mono font-bold">{formatNumber(logCost)}</td>
          </tr>;
  };

  const documentSheet = (
    <div
      id="printable-audit-container"
      className="w-full max-w-[297mm] min-h-[210mm] bg-white text-black p-6 sm:p-8 rounded-none shadow-none print:p-0 print:m-0 mx-auto text-[8.5px] leading-tight font-sans"
      style={{ color: '#000000', backgroundColor: '#ffffff' }}
    >
      {report.supersededByCorrectionId && <p className="mb-3 border border-black p-2 text-[9px]"><strong>Superseded report.</strong> Use corrected report {report.supersededByCorrectionId}. This original snapshot is retained for history.</p>}
      {/* ── Audit compilation header (top metadata) ───────────────────── */}
      <div className="mb-3 flex items-start justify-between gap-5 text-[9px] font-sans font-bold leading-snug uppercase text-black">
        <div className="grid flex-1 grid-cols-[220px_1fr] gap-x-3 gap-y-0.5">
          <div className="text-gray-900 font-bold">REPORT ID</div>
          <div className="font-mono font-bold normal-case">{reportId}</div>

          <div className="text-gray-900 font-bold">REPORTING MONTH</div>
          <div className="font-bold">{reportingMonthLabel(periodStr)}</div>

          <div className="text-gray-900 font-bold">CROP YEAR CYCLE</div>
          <div className="font-extrabold tracking-wide">{cropYearDisplay || 'Not recorded'}</div>

          <div className="text-gray-900 font-bold">NAME OF BLOCK FARM</div>
          <div className="font-extrabold tracking-wide">{farmName}</div>

          <div className="text-gray-900 font-bold">ADDRESS</div>
          <div className="font-semibold">{farmAddress}</div>

          <div className="text-gray-900 font-bold">TOTAL AREA OF BLOCK FARM (HA)</div>
          <div className="font-mono font-bold">{totalFarmArea}</div>

          <div className="text-gray-900 font-bold">TOTAL AREA FOR NEW PLANT (HA)</div>
          <div className="font-mono font-bold">{auditedAreaStr}</div>
        </div>
        {hash && (
          <div className="w-[108px] shrink-0 text-center normal-case">
            <div className="p-1 bg-white border border-black inline-block">
              <QRCodeView
                value={hash}
                size={96}
                color="#000000"
                bgColor="#ffffff"
                errorCorrectionLevel="H"
              />
            </div>
            <div className="mt-1 break-all font-mono text-[6.5px] leading-tight text-black">{hash}</div>
          </div>
        )}
      </div>

      {/* ── Master SRA Compilation Grid Table ───────────────────────────── */}
      <div className="w-full overflow-x-auto print:overflow-visible">
        <table className="w-full border-collapse border border-black text-[8.5px] leading-tight text-black">
          <thead>
            {/* Top-level audit report header */}
            <tr className="bg-[#edd446] text-black uppercase font-bold text-center border-b border-black">
              <th rowSpan={2} className="border border-black p-1 w-6">NO</th>
              <th rowSpan={2} className="border border-black p-1 text-left min-w-[150px] max-w-[220px]">OPERATION</th>
              {layout.groups.map(group => <th key={group.year} colSpan={group.columns.length} className="border border-black p-0.5 font-bold tracking-wider">{group.label}</th>)}
              <th rowSpan={2} className="border border-black p-1 w-12">TOTAL</th>
              <th rowSpan={2} className="border border-black p-1 w-8">QTY</th>
              <th rowSpan={2} className="border border-black p-1 w-8">UNIT</th>
              <th rowSpan={2} className="border border-black p-1 w-14">UNIT COST</th>
              <th rowSpan={2} className="border border-black p-1 w-16">OPERATION COST</th>
            </tr>
            {/* Numeric calendar months follow the first and last included records. */}
            <tr className="bg-[#edd446] text-black font-bold text-center border-b border-black text-[8px]">
              {layout.columns.map(month => <th key={month} title={reportingMonthLabel(month)} className="border border-black p-0.5 w-5 font-bold">{layout.columnLabels[month]}</th>)}
            </tr>
          </thead>
          <tbody>
            {operationLogs.length === 0 ? (
              <tr>
                <td colSpan={layout.columnCount} className="border border-black p-4 text-center text-gray-500 italic">
                  No operational records compiled in this audit dossier.
                </td>
              </tr>
            ) : (
              <>
                {/* ── SECTION 1: DIRECT CROP OPERATIONS (FROM SYSTEM) ──── */}
                {directOps.map((log, idx) => renderOperation(log, idx))}

                {/* TOTAL DIRECT COST ROW */}
                <tr className="border-t-2 border-black font-extrabold bg-white text-[9px]">
                  <td className="border border-black" />
                  <td className="border border-black p-1 text-left uppercase tracking-wide">
                    TOTAL DIRECT COST (PHP)
                  </td>
                  {Array.from({ length: layout.columnCount - 3 }, (_, index) => <td key={index} className="border border-black" />)}
                  <td className="border border-black p-1 text-right font-mono font-black text-black">
                    {formatNumber(totalDirectCost)}
                  </td>
                </tr>

                {/* ── SECTION 2: MILLING EXPENSES (IF PRESENT IN SYSTEM) ── */}
                {millingOps.length > 0 && (
                  <>
                    <tr className="border-t border-black bg-white">
                      <td className="border border-black" />
                      <td className="border border-black p-0.5 text-left font-bold pl-2">
                        Milling Expenses
                      </td>
                      {Array.from({ length: layout.columnCount - 2 }, (_, index) => <td key={index} className="border border-black" />)}
                    </tr>
                    {millingOps.map((log, idx) => renderOperation(log, idx, directOps.length))}

                    {/* TOTAL MILLING EXPENSES ROW */}
                    <tr className="border-t border-black font-extrabold bg-white text-[9px]">
                      <td className="border border-black" />
                      <td className="border border-black p-1 text-left uppercase tracking-wide">
                        TOTAL MILLING EXPENSES (PHP)
                      </td>
                      {Array.from({ length: layout.columnCount - 3 }, (_, index) => <td key={index} className="border border-black" />)}
                      <td className="border border-black p-1 text-right font-mono font-black text-black">
                        {formatNumber(totalMillingCost)}
                      </td>
                    </tr>
                  </>
                )}

                {/* ── GRAND TOTAL: TOTAL COST OF PRODUCTION ───────────── */}
                <tr className="border-t-2 border-black font-black bg-white text-[9.5px]">
                  <td className="border border-black" />
                  <td className="border border-black p-1 text-left uppercase tracking-wider">
                    TOTAL COST OF PRODUCTION (PHP)
                  </td>
                  {Array.from({ length: layout.columnCount - 3 }, (_, index) => <td key={index} className="border border-black" />)}
                  <td className="border border-black p-1 text-right font-mono font-black text-black">
                    {formatNumber(grandTotalCost)}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Tripartite Signature Block & Digital Audit Seal ─────────────── */}
      <div className="mt-4 avoid-break">
        <div className="grid grid-cols-3 gap-8 text-center mb-3">
          <div className="border-t border-black pt-1.5 flex flex-col justify-between h-16">
            <div>
              <p className="font-bold text-[9px] uppercase m-0 text-black">{managerName}</p>
            </div>
            <p className="text-[7.5px] text-gray-600 m-0 leading-tight">
              Farm Manager / President<br />
              <span className="font-semibold">{farmName}</span>
            </p>
          </div>

          <div className="border-t border-black pt-1.5 flex flex-col justify-between h-16">
            <div>
              <p className="font-bold text-[9px] uppercase m-0 text-black">{inspectorName}</p>
            </div>
            <p className="text-[7.5px] text-gray-600 m-0 leading-tight">
              SRA Agricultural Inspector<br />
              <span className="font-semibold">Field Operations Audit Division</span>
            </p>
          </div>

          <div className="border-t border-black pt-1.5 flex flex-col justify-between h-16">
            <div>
              <p className="font-bold text-[9px] uppercase m-0 text-black">{printedByName}</p>
            </div>
            <p className="text-[7.5px] text-gray-600 m-0 leading-tight">
              Printed by {printedByRole}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // If background print (e.g. triggered via Ctrl+P)
  if (!isOpenModal) {
    return documentSheet;
  }

  // Interactive Modal Preview on Screen
  return (
    <div
      id="printable-modal-overlay"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 print:p-0 print:static print:bg-transparent print:backdrop-blur-none"
    >
      {/* Floating Action Controls (Hidden completely during printing) */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 no-print print:hidden bg-white dark:bg-surface p-2 rounded-2xl shadow-2xl border border-border">
        <div className="text-xs font-bold text-hug-text px-2 hidden sm:block">
          SRA Compilation Format (A4 Landscape)
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={handleDownload}
          icon={Download}
          isLoading={isDownloading}
          loadingText="Preparing PDF..."
        >
          Download PDF
        </Button>
        {downloadError && <span role="alert" className="max-w-60 text-xs text-danger">{downloadError}</span>}
        <Button
          variant="primary"
          size="md"
          onClick={handlePrint}
          icon={Printer}
        >
          Print Document
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={onClose}
          icon={X}
        >
          Close Preview
        </Button>
      </div>

      {/* Sheet Wrapper with Landscape scroll container for smaller displays */}
      <div className="w-full max-w-[310mm] max-h-[92vh] overflow-auto bg-white rounded-xl shadow-2xl border border-border p-4 print:p-0 print:border-none print:shadow-none print:max-w-none print:max-h-none print:overflow-visible">
        {documentSheet}
      </div>
    </div>
  );
}
