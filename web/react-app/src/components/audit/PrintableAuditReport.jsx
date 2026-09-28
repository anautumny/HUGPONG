import React from 'react';
import { Printer, X } from 'lucide-react';
import Button from '../ui/Button';
import QRCodeView from './QRCodeView';
import { formatCropYearDisplay } from '../../utils/formatters';
import { auditCropYearCycles, nextCropYearCycle } from '../../domain/auditWorkflow';

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
  return String(user?.displayName || user?.name || accountId(user) || '').trim();
}

function accountRole(user) {
  return String(user?.role || user?.roleLabel || user?.canonicalRole || '')
    .trim()
    .replace(/_/g, ' ');
}

function reportActorName(storedName, storedId, currentUser, fallback) {
  if (String(storedName || '').trim()) return String(storedName).trim();
  if (String(storedId || '').trim() && String(storedId).trim() === accountId(currentUser)) {
    return accountName(currentUser);
  }
  return String(storedId || fallback).trim();
}

export default function PrintableAuditReport({
  report = null,
  blockFarms = [],
  currentUser = null,
  isOpenModal = true,
  onClose = () => {}
}) {
  if (!report) return null;

  // ── 1. Resolve Dynamic Farm & Report Metadata from System ─────────
  const farm = blockFarms.find(f => f.id === report.blockFarmId);
  const farmName = farm?.name || report.blockFarmName || report.blockFarmId || 'Block farm not provided';
  const farmLocation = farm?.location || farm?.address || report?.blockFarmLocation || 'Location not provided';

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
  const periodStr = String(report.period || report.month || '');
  const match = periodStr.match(/^(\d{4})-(\d{2})$/);
  const firstOperationDate = String(operationLogs.find(log => log.performedOn)?.performedOn || '');
  const operationDateMatch = firstOperationDate.match(/^(\d{4})-(\d{2})/);
  const reportYear = match
    ? parseInt(match[1], 10)
    : (operationDateMatch ? parseInt(operationDateMatch[1], 10) : 0);
  const reportMonth = match
    ? parseInt(match[2], 10)
    : (operationDateMatch ? parseInt(operationDateMatch[2], 10) : 1);
  const fieldSnapshots = Array.isArray(report.fieldSnapshots) ? report.fieldSnapshots : [];
  const cropYearCycles = auditCropYearCycles(report, operationLogs, fieldSnapshots);
  const cropYearDisplay = cropYearCycles.map(formatCropYearDisplay).join(' / ');
  const storedStartYear = Number(cropYearCycles[0]?.slice(0, 4));
  const cycleStartYear = Number.isInteger(storedStartYear) ? storedStartYear : reportYear;
  const currentCY = cropYearCycles.length
    ? `${cropYearCycles.length === 1 ? 'Crop Year Cycle' : 'Crop Year Cycles'} ${cropYearDisplay}`
    : 'Crop Year Cycle not recorded';
  const continuationCropYear = nextCropYearCycle(cropYearCycles[cropYearCycles.length - 1]);
  const continuationCY = continuationCropYear
    ? `Crop Year Cycle ${formatCropYearDisplay(continuationCropYear)}`
    : 'Crop Year Cycle not recorded';

  // Helper to determine which month column to activate for a log
  const getMonthCol = (performedOn, isMilling = false) => {
    if (!performedOn) {
      return isMilling ? { isNextCY: true, monthNum: 1 } : { isNextCY: false, monthNum: reportMonth };
    }
    try {
      const parts = String(performedOn).split('-');
      if (parts.length >= 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        if (isMilling || year > cycleStartYear + 1 || (year === cycleStartYear + 1 && month >= 9)) {
          return { isNextCY: true, monthNum: Math.min(Math.max(month - 8, 1), 3) };
        }
        return { isNextCY: false, monthNum: month };
      }
    } catch {}
    return isMilling ? { isNextCY: true, monthNum: 1 } : { isNextCY: false, monthNum: reportMonth };
  };

  // ── 3. Categorize System Operations: Direct vs Milling ────────────
  const directOps = [];
  const millingOps = [];

  operationLogs.forEach(log => {
    if (isMillingOperation(log)) {
      millingOps.push(log);
    } else {
      directOps.push(log);
    }
  });

  // Calculate Subtotals & Totals from real system data
  const totalDirectCost = directOps.reduce((sum, log) => sum + Number(log.totalCost || 0), 0);
  const directCostPerHa = totalAuditedHa > 0 ? totalDirectCost / totalAuditedHa : totalDirectCost;

  const totalMillingCost = millingOps.reduce((sum, log) => sum + Number(log.totalCost || 0), 0);
  const millingCostPerHa = totalAuditedHa > 0 ? totalMillingCost / totalAuditedHa : totalMillingCost;

  const grandTotalCost = totalDirectCost + totalMillingCost;
  const grandTotalCostPerHa = totalAuditedHa > 0 ? grandTotalCost / totalAuditedHa : grandTotalCost;

  const hash = String(report.qrHash || report.qrSignature || report.integrityHash || '').trim();
  const isCertified = report.status === 'CERTIFIED';
  const managerId = String(report.compiledByUserId || '').trim();
  const managerName = reportActorName(report.compiledByName, managerId, currentUser, managerId);
  const inspectorId = isCertified ? String(report.certifiedByUserId || '').trim() : '';
  const inspectorName = isCertified
    ? reportActorName(report.certifiedByName || report.verifiedBy, inspectorId, currentUser, inspectorId)
    : 'Awaiting Review';
  const printedById = accountId(currentUser);
  const printedByName = accountName(currentUser) || printedById;
  const printedByRole = accountRole(currentUser);
  const reportId = String(report.reportId || report.id || '').trim();

  const handlePrint = () => {
    window.print();
  };

  const documentSheet = (
    <div
      id="printable-audit-container"
      className="w-full max-w-[297mm] min-h-[210mm] bg-white text-black p-6 sm:p-8 rounded-none shadow-none print:p-0 print:m-0 mx-auto text-[8.5px] leading-tight font-sans"
      style={{ color: '#000000', backgroundColor: '#ffffff' }}
    >
      {/* ── Audit compilation header (top metadata) ───────────────────── */}
      <div className="mb-3 flex items-start justify-between gap-5 text-[9px] font-sans font-bold leading-snug uppercase text-black">
        <div className="grid flex-1 grid-cols-[220px_1fr] gap-x-3 gap-y-0.5">
          <div className="text-gray-900 font-bold">REPORT ID</div>
          <div className="font-mono font-bold normal-case">{reportId}</div>

          <div className="text-gray-900 font-bold">REPORTING MONTH</div>
          <div className="font-bold">{periodStr}</div>

          <div className="text-gray-900 font-bold">CROP YEAR CYCLE</div>
          <div className="font-extrabold tracking-wide">{cropYearDisplay || 'Not recorded'}</div>

          <div className="text-gray-900 font-bold">NAME OF BLOCK FARM</div>
          <div className="font-extrabold tracking-wide">{farmName}</div>

          <div className="text-gray-900 font-bold">LOCATION</div>
          <div className="font-semibold">{farmLocation}</div>

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
              <th colSpan={12} className="border border-black p-0.5 font-bold tracking-wider">{currentCY}</th>
              <th colSpan={3} className="border border-black p-0.5 font-bold tracking-wider">{continuationCY}</th>
              <th rowSpan={2} className="border border-black p-1 w-12">TOTAL</th>
              <th rowSpan={2} className="border border-black p-1 w-8">QTY</th>
              <th rowSpan={2} className="border border-black p-1 w-8">UNIT</th>
              <th rowSpan={2} className="border border-black p-1 w-14">UNIT COST</th>
              <th rowSpan={2} className="border border-black p-1 w-16">COST PER HECTARE</th>
            </tr>
            {/* Monthly Timeline Sub-headers (1-12 for Current CY, 1-3 for Next CY) */}
            <tr className="bg-[#edd446] text-black font-bold text-center border-b border-black text-[8px]">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                <th key={`cy1-m${m}`} className="border border-black p-0.5 w-5 font-bold">{m}</th>
              ))}
              {[1, 2, 3].map(m => (
                <th key={`cy2-m${m}`} className="border border-black p-0.5 w-5 font-bold">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {operationLogs.length === 0 ? (
              <tr>
                <td colSpan={22} className="border border-black p-4 text-center text-gray-500 italic">
                  No operational records compiled in this audit dossier.
                </td>
              </tr>
            ) : (
              <>
                {/* ── SECTION 1: DIRECT CROP OPERATIONS (FROM SYSTEM) ──── */}
                {directOps.map((log, idx) => {
                  const opNum = idx + 1;
                  const opName = log.operationName || log.name || `Operation ${opNum}`;
                  const operationLabel = (
                    <>
                      <span>{opName}</span>
                      {log.childOperationName && <span className="block text-[8px] font-semibold">Child operation: {log.childOperationName}</span>}
                    </>
                  );
                  const logArea = Number(log.areaHa || totalAuditedHa).toFixed(2);
                  const logCost = Number(log.totalCost || 0);
                  const logQty = log.quantity?.value != null ? log.quantity.value : (log.quantity != null ? log.quantity : 1);
                  const logUnit = log.quantity?.unit || log.unit || 'ha';
                  const logUnitCost = Number(log.unitCost || (logCost / Math.max(parseFloat(logQty) || 1, 0.1)));
                  const logCostPerHa = Number(log.areaHa) > 0 ? (logCost / Number(log.areaHa)) : logCost;

                  const colPlacement = getMonthCol(log.performedOn, false);
                  const hasChildren = Array.isArray(log.lineItems) && log.lineItems.length > 0;

                  if (hasChildren) {
                    return (
                      <React.Fragment key={log.operationLogId || log.id || idx}>
                        {/* Group Header Row */}
                        <tr className="border-t border-black bg-gray-50">
                          <td className="border border-black p-0.5 text-center font-bold">{opNum}</td>
                          <td className="border border-black p-0.5 text-left font-bold" colSpan={21}>
                            {operationLabel}
                          </td>
                        </tr>
                        {/* Child Sub-items */}
                        {log.lineItems.map((si, cIdx) => {
                          const childQty = si.quantity != null ? si.quantity : 1;
                          const childUnit = si.unit || 'bag';
                          const childUnitCost = Number(si.unitCost || (Number(si.subtotal || 0) / Math.max(parseFloat(childQty) || 1, 0.1)));
                          const childSubtotal = Number(si.subtotal != null ? si.subtotal : (Number(childQty) * childUnitCost));
                          const childCostPerHa = Number(log.areaHa) > 0 ? (childSubtotal / Number(log.areaHa)) : childSubtotal;

                          return (
                            <tr key={`${idx}-${cIdx}`} className="border-t border-gray-300">
                              <td className="border border-black p-0.5 text-center"></td>
                              <td className="border border-black p-0.5 text-left pl-3">{si.description || si.name || `Item ${cIdx + 1}`}</td>
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                                <td key={`cy1-${m}`} className="border border-black p-0.5 text-right font-mono">
                                  {!colPlacement.isNextCY && colPlacement.monthNum === m ? logArea : ''}
                                </td>
                              ))}
                              {[1, 2, 3].map(m => (
                                <td key={`cy2-${m}`} className="border border-black p-0.5 text-right font-mono">
                                  {colPlacement.isNextCY && colPlacement.monthNum === m ? logArea : ''}
                                </td>
                              ))}
                              <td className="border border-black p-0.5 text-right font-mono font-bold">{logArea}</td>
                              <td className="border border-black p-0.5 text-center font-mono">{childQty}</td>
                              <td className="border border-black p-0.5 text-center">{childUnit}</td>
                              <td className="border border-black p-0.5 text-right font-mono">{formatNumber(childUnitCost)}</td>
                              <td className="border border-black p-0.5 text-right font-mono font-bold">{formatNumber(childCostPerHa)}</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  }

                  // Single Direct Operation Row
                  return (
                    <tr key={log.operationLogId || log.id || idx} className="border-t border-black">
                      <td className="border border-black p-0.5 text-center font-bold">{opNum}</td>
                      <td className="border border-black p-0.5 text-left font-bold">{operationLabel}</td>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                        <td key={`cy1-${m}`} className="border border-black p-0.5 text-right font-mono">
                          {!colPlacement.isNextCY && colPlacement.monthNum === m ? logArea : ''}
                        </td>
                      ))}
                      {[1, 2, 3].map(m => (
                        <td key={`cy2-${m}`} className="border border-black p-0.5 text-right font-mono">
                          {colPlacement.isNextCY && colPlacement.monthNum === m ? logArea : ''}
                        </td>
                      ))}
                      <td className="border border-black p-0.5 text-right font-mono font-bold">{logArea}</td>
                      <td className="border border-black p-0.5 text-center font-mono">{logQty}</td>
                      <td className="border border-black p-0.5 text-center">{logUnit}</td>
                      <td className="border border-black p-0.5 text-right font-mono">{formatNumber(logUnitCost)}</td>
                      <td className="border border-black p-0.5 text-right font-mono font-bold">{formatNumber(logCostPerHa)}</td>
                    </tr>
                  );
                })}

                {/* TOTAL DIRECT COST ROW */}
                <tr className="border-t-2 border-black font-extrabold bg-white text-[9px]">
                  <td colSpan={21} className="border border-black p-1 text-left uppercase tracking-wide">
                    TOTAL DIRECT COST
                  </td>
                  <td className="border border-black p-1 text-right font-mono font-black text-black">
                    {formatNumber(directCostPerHa)}
                  </td>
                </tr>

                {/* ── SECTION 2: MILLING EXPENSES (IF PRESENT IN SYSTEM) ── */}
                {millingOps.length > 0 && (
                  <>
                    <tr className="border-t border-black bg-white">
                      <td colSpan={22} className="border border-black p-0.5 text-left font-bold pl-2">
                        Milling Expenses
                      </td>
                    </tr>
                    {millingOps.map((log, idx) => {
                      const opNum = directOps.length + idx + 1;
                      const opName = log.operationName || log.name || `Milling Operation ${idx + 1}`;
                      const logArea = Number(log.areaHa || totalAuditedHa).toFixed(2);
                      const logCost = Number(log.totalCost || 0);
                      const logQty = log.quantity?.value != null ? log.quantity.value : (log.quantity != null ? log.quantity : 1);
                      const logUnit = log.quantity?.unit || log.unit || 'ton';
                      const logUnitCost = Number(log.unitCost || (logCost / Math.max(parseFloat(logQty) || 1, 0.1)));
                      const logCostPerHa = Number(log.areaHa) > 0 ? (logCost / Number(log.areaHa)) : logCost;

                      const colPlacement = getMonthCol(log.performedOn, true);

                      return (
                        <tr key={log.operationLogId || log.id || idx} className="border-t border-black">
                          <td className="border border-black p-0.5 text-center font-bold">{opNum}</td>
                          <td className="border border-black p-0.5 text-left font-bold">{opName}</td>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                            <td key={`cy1-${m}`} className="border border-black p-0.5 text-right font-mono">
                              {!colPlacement.isNextCY && colPlacement.monthNum === m ? logArea : ''}
                            </td>
                          ))}
                          {[1, 2, 3].map(m => (
                            <td key={`cy2-${m}`} className="border border-black p-0.5 text-right font-mono">
                              {colPlacement.isNextCY && colPlacement.monthNum === m ? logArea : ''}
                            </td>
                          ))}
                          <td className="border border-black p-0.5 text-right font-mono font-bold">{logArea}</td>
                          <td className="border border-black p-0.5 text-center font-mono">{logQty}</td>
                          <td className="border border-black p-0.5 text-center">{logUnit}</td>
                          <td className="border border-black p-0.5 text-right font-mono">{formatNumber(logUnitCost)}</td>
                          <td className="border border-black p-0.5 text-right font-mono font-bold">{formatNumber(logCostPerHa)}</td>
                        </tr>
                      );
                    })}

                    {/* TOTAL MILLING EXPENSES ROW */}
                    <tr className="border-t border-black font-extrabold bg-white text-[9px]">
                      <td colSpan={21} className="border border-black p-1 text-left uppercase tracking-wide">
                        TOTAL MILLING EXPENSES
                      </td>
                      <td className="border border-black p-1 text-right font-mono font-black text-black">
                        {formatNumber(millingCostPerHa)}
                      </td>
                    </tr>
                  </>
                )}

                {/* ── GRAND TOTAL: TOTAL COST OF PRODUCTION ───────────── */}
                <tr className="border-t-2 border-black font-black bg-white text-[9.5px]">
                  <td colSpan={21} className="border border-black p-1 text-left uppercase tracking-wider">
                    TOTAL COST OF PRODUCTION
                  </td>
                  <td className="border border-black p-1 text-right font-mono font-black text-black">
                    {formatNumber(grandTotalCostPerHa)}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Statutory Cumulative Footnote (Real System Data) ─────────────── */}
      <div className="mt-2 text-[8px] text-gray-700 italic">
        * Total recorded expenditure for {auditedAreaStr} Ha included in this report: <strong>₱{formatNumber(grandTotalCost)}</strong> (Philippine Pesos).
      </div>

      {/* ── Tripartite Signature Block & Digital Audit Seal ─────────────── */}
      <div className="mt-4 avoid-break">
        <div className="grid grid-cols-3 gap-8 text-center mb-3">
          <div className="border-t border-black pt-1.5 flex flex-col justify-between h-16">
            <div>
              <p className="font-bold text-[9px] uppercase m-0 text-black">{managerName}</p>
              {managerId && <p className="font-mono text-[7px] m-0 mt-0.5 text-gray-700">ID: {managerId}</p>}
            </div>
            <p className="text-[7.5px] text-gray-600 m-0 leading-tight">
              Farm Manager / President<br />
              <span className="font-semibold">{farmName}</span>
            </p>
          </div>

          <div className="border-t border-black pt-1.5 flex flex-col justify-between h-16">
            <div>
              <p className="font-bold text-[9px] uppercase m-0 text-black">{inspectorName}</p>
              {inspectorId && <p className="font-mono text-[7px] m-0 mt-0.5 text-gray-700">ID: {inspectorId}</p>}
            </div>
            <p className="text-[7.5px] text-gray-600 m-0 leading-tight">
              SRA Agricultural Inspector<br />
              <span className="font-semibold">Field Operations Audit Division</span>
            </p>
          </div>

          <div className="border-t border-black pt-1.5 flex flex-col justify-between h-16">
            <div>
              <p className="font-bold text-[9px] uppercase m-0 text-black">{printedByName}</p>
              {printedById && <p className="font-mono text-[7px] m-0 mt-0.5 text-gray-700">ID: {printedById}</p>}
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
