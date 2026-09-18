import React from 'react';
import { Printer, X, ShieldCheck, Download } from 'lucide-react';
import Button from '../ui/Button';
import QRCodeView from './QRCodeView';

export default function PrintableAuditReport({
  report = null,
  blockFarms = [],
  currentUser = null,
  onClose
}) {
  if (!report) return null;

  const farm = blockFarms.find(f => f.id === report.blockFarmId);
  const farmName = farm?.name || report.blockFarmName || report.blockFarmId || 'District Block Farm';

  const operationLogs = Array.isArray(report.operationSnapshots)
    ? report.operationSnapshots
    : (Array.isArray(report.operations) ? report.operations : []);

  const totalCost = operationLogs.reduce((sum, item) => sum + Number(item.totalCost || item.cost || 0), 0);

  const fieldAreas = new Map();
  operationLogs.forEach(log => {
    if (log.fieldId) {
      fieldAreas.set(log.fieldId, Math.max(fieldAreas.get(log.fieldId) || 0, Number(log.areaHa || 0)));
    }
  });
  const totalAreaHa = Array.from(fieldAreas.values()).reduce((sum, ha) => sum + ha, 0);

  const isCertified = report.status === 'CERTIFIED';
  const costPerHa = totalAreaHa > 0 ? totalCost / totalAreaHa : 0;

  const formatCurrency = (amt) => `₱${Number(amt || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 print:p-0 print:static print:bg-white">
      {/* Floating Action Controls (Hidden when printing) */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 no-print bg-white dark:bg-surface p-2 rounded-2xl shadow-lg border border-border">
        <Button
          variant="primary"
          size="md"
          onClick={handlePrint}
          icon={Printer}
        >
          Print to A4
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

      {/* Printable Sheet Container */}
      <div
        id="printable-audit-container"
        className="w-full max-w-[210mm] min-h-[297mm] bg-white text-black p-8 sm:p-12 rounded-xl shadow-2xl print:shadow-none print:rounded-none print:p-0 print:m-0 mx-auto text-[11px] leading-normal font-sans"
        style={{ color: '#000000', backgroundColor: '#ffffff' }}
      >
        {/* SRA Official Header */}
        <div className="text-center border-b-2 border-black pb-3 mb-4">
          <p className="m-0 text-[10px] uppercase font-bold tracking-wider text-gray-700">
            Republic of the Philippines · Department of Agriculture
          </p>
          <h1 className="m-1 text-lg sm:text-xl font-black uppercase tracking-wide text-black">
            Sugar Regulatory Administration
          </h1>
          <p className="m-0 text-[10px] uppercase font-semibold text-gray-700">
            Silay Agricultural District · Block Farm Program Oversight
          </p>
          <div className="inline-block mt-2 px-3 py-1 bg-gray-200 border border-gray-400 font-extrabold text-xs uppercase tracking-wider text-black">
            Monthly Field Operations & Cost Audit Report
          </div>
        </div>

        {/* Metadata Table */}
        <table className="w-full border-collapse border border-black text-[11px] mb-4">
          <tbody>
            <tr>
              <td className="bg-gray-100 font-bold p-2 border border-gray-400 w-[28%]">
                NAME OF BLOCK FARM:
              </td>
              <td className="p-2 border border-gray-400 font-semibold uppercase">
                {farmName}
              </td>
              <td className="bg-gray-100 font-bold p-2 border border-gray-400 w-[25%]">
                REPORT PERIOD:
              </td>
              <td className="p-2 border border-gray-400 font-semibold font-mono">
                {report.period || report.month}
              </td>
            </tr>
            <tr>
              <td className="bg-gray-100 font-bold p-2 border border-gray-400">
                AUDIT HASH / ID:
              </td>
              <td className="p-2 border border-gray-400 font-mono font-bold">
                {report.qrHash || report.id}
              </td>
              <td className="bg-gray-100 font-bold p-2 border border-gray-400">
                TOTAL AREA AUDITED:
              </td>
              <td className="p-2 border border-gray-400 font-bold text-black font-mono">
                {totalAreaHa.toFixed(4)} Ha
              </td>
            </tr>
          </tbody>
        </table>

        {/* Operations Table */}
        <table className="w-full border-collapse border border-gray-600 text-[10.5px] mb-4">
          <thead>
            <tr className="bg-gray-200 text-black uppercase font-bold text-[9.5px]">
              <th className="border border-gray-600 p-1.5 text-center w-8">No.</th>
              <th className="border border-gray-600 p-1.5 text-left">Operation</th>
              <th className="border border-gray-600 p-1.5 text-right w-16">Plot Area</th>
              <th className="border border-gray-600 p-1.5 text-right w-12">Qty</th>
              <th className="border border-gray-600 p-1.5 text-center w-12">Unit</th>
              <th className="border border-gray-600 p-1.5 text-right w-20">Unit Cost</th>
              <th className="border border-gray-600 p-1.5 text-right w-24">Cost / Ha</th>
            </tr>
          </thead>
          <tbody>
            {operationLogs.length === 0 ? (
              <tr>
                <td colSpan={7} className="border border-gray-600 p-4 text-center text-gray-500 italic">
                  No recorded operations in this active batch.
                </td>
              </tr>
            ) : (
              operationLogs.map((l, idx) => {
                const logCost = Number(l.totalCost != null ? l.totalCost : (l.cost || 0));
                const opName = l.operationName || `Operation ${idx + 1}`;
                const itemHa = l.areaHa ? `${Number(l.areaHa).toFixed(2)} ha` : `${totalAreaHa.toFixed(2)} ha`;
                const hasChildren = Array.isArray(l.lineItems) && l.lineItems.length > 0;

                if (hasChildren) {
                  return (
                    <React.Fragment key={l.operationLogId || l.id || idx}>
                      <tr className="bg-gray-100 font-bold border border-gray-600">
                        <td className="border border-gray-600 p-1.5 text-center">{idx + 1}</td>
                        <td className="border border-gray-600 p-1.5 uppercase font-bold" colSpan={5}>
                          {opName} (Group — {formatCurrency(logCost)})
                        </td>
                        <td className="border border-gray-600 p-1.5 text-right font-mono font-bold">
                          {formatCurrency(logCost)}
                        </td>
                      </tr>
                      {l.lineItems.map((si, cIdx) => {
                        const childQty = si.quantity != null ? si.quantity : '1';
                        const childUnit = si.unit || 'ha';
                        const childUnitCost = Number(si.unitCost || (Number(si.subtotal || 0) / Math.max(parseFloat(childQty) || 1, 0.1)) || 0);
                        const childSubTotal = Number(si.subtotal != null ? si.subtotal : (Number(childQty) * childUnitCost));
                        return (
                          <tr key={`${idx}-${cIdx}`} className="border border-gray-600">
                            <td className="border border-gray-600 p-1 text-center font-mono text-[9px]">
                              {idx + 1}.{cIdx + 1}
                            </td>
                            <td className="border border-gray-600 p-1 pl-4">
                              ↳ {si.description || si.name || `Sub-item ${cIdx + 1}`}
                            </td>
                            <td className="border border-gray-600 p-1 text-right font-mono">{itemHa}</td>
                            <td className="border border-gray-600 p-1 text-right font-mono">{childQty}</td>
                            <td className="border border-gray-600 p-1 text-center">{childUnit}</td>
                            <td className="border border-gray-600 p-1 text-right font-mono">
                              {formatCurrency(childUnitCost)}
                            </td>
                            <td className="border border-gray-600 p-1 text-right font-mono font-bold">
                              {formatCurrency(childSubTotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                }

                // Direct operation row
                const logQty = l.quantity?.value || '1';
                const logUnit = l.quantity?.unit || 'ha';
                const logUnitCost = Number(l.unitCost || (logCost / Math.max(parseFloat(logQty) || 1, 0.1)));

                return (
                  <tr key={l.operationLogId || l.id || idx} className="border border-gray-600">
                    <td className="border border-gray-600 p-1.5 text-center font-bold">{idx + 1}</td>
                    <td className="border border-gray-600 p-1.5 font-bold">{opName}</td>
                    <td className="border border-gray-600 p-1.5 text-right font-mono">{itemHa}</td>
                    <td className="border border-gray-600 p-1.5 text-right font-mono">{logQty}</td>
                    <td className="border border-gray-600 p-1.5 text-center">{logUnit}</td>
                    <td className="border border-gray-600 p-1.5 text-right font-mono">
                      {formatCurrency(logUnitCost)}
                    </td>
                    <td className="border border-gray-600 p-1.5 text-right font-mono font-bold">
                      {formatCurrency(logCost)}
                    </td>
                  </tr>
                );
              })
            )}

            {/* Direct Subtotal Row */}
            <tr className="bg-gray-100 font-bold border-t-2 border-black">
              <td colSpan={6} className="border border-gray-600 p-1.5 text-right uppercase">
                TOTAL MONTHLY DIRECT EXPENDITURE ({report.period || report.month}):
              </td>
              <td className="border border-gray-600 p-1.5 text-right font-mono font-bold text-black">
                {formatCurrency(totalCost)}
              </td>
            </tr>
            {/* Grand Total Row */}
            <tr className="bg-gray-200 font-black border-t-2 border-black text-xs">
              <td colSpan={6} className="border border-gray-600 p-2 text-right uppercase">
                TOTAL COST OF PRODUCTION (PER HA AUDITED):
              </td>
              <td className="border border-gray-600 p-2 text-right font-mono font-black text-black">
                {formatCurrency(costPerHa)} / Ha
              </td>
            </tr>
          </tbody>
        </table>

        {/* Regulatory Statement */}
        <p className="text-[9.5px] text-gray-700 m-0 mb-6 italic">
          * Total Cumulative Farm Expenditure for {totalAreaHa.toFixed(4)} Ha Audited = <strong>{formatCurrency(totalCost)}</strong> (Philippine Pesos). Certified compliant under SRA Silay Mill District standard schedule.
        </p>

        {/* Signatures Section */}
        <div className="mt-8 break-inside-avoid">
          <div className="grid grid-cols-3 gap-6 text-center mb-6">
            <div className="border-t border-black pt-2">
              <p className="font-bold text-[10.5px] uppercase m-0">
                {report.compiledByUserId || currentUser?.name || 'Farm Manager'}
              </p>
              <p className="text-[9px] text-gray-600 m-0 mt-0.5">
                Farm Manager / President<br />{farmName}
              </p>
            </div>

            <div className="border-t border-black pt-2">
              <p className="font-bold text-[10.5px] uppercase m-0">
                {isCertified ? (report.certifiedByUserId || 'SRA Agricultural Inspector') : 'Awaiting Review'}
              </p>
              <p className="text-[9px] text-gray-600 m-0 mt-0.5">
                SRA Agricultural Inspector<br />Field Operations Audit Division
              </p>
            </div>

            <div className="border-t border-black pt-2">
              <p className="font-bold text-[10.5px] uppercase m-0">
                Engr. Ramon Lacson
              </p>
              <p className="text-[9px] text-gray-600 m-0 mt-0.5">
                SRA District Officer<br />Silay Sugar Regulatory Administration
              </p>
            </div>
          </div>

          {/* Digital Seal Presentation with Monochrome QR */}
          <div className="text-center pt-2 flex flex-col items-center">
            <div className="p-1.5 bg-white border border-black rounded mb-2">
              <QRCodeView
                value={report.qrHash || report.id || 'HUGPONG-SRA-AUDIT'}
                size={88}
                color="#000000"
                bgColor="#ffffff"
              />
            </div>
            {isCertified ? (
              <div className="inline-block border border-dashed border-black p-2 px-4 bg-gray-100 font-mono text-[9px] text-black font-bold uppercase">
                DIGITAL AUDIT SEAL: [HASH: {report.qrHash || report.id}] · VERIFIED VIA HUGPONG ENTERPRISE SUITE
              </div>
            ) : (
              <div className="inline-block border border-dashed border-gray-600 p-2 px-4 bg-gray-100 font-mono text-[9px] text-gray-800 font-bold uppercase">
                PROVISIONAL AUDIT REPORT: PENDING OFFICIAL SRA INSPECTION & CERTIFICATION
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
