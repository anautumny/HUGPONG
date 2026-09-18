import React, { useState, useMemo } from 'react';
import { BookOpen, History, Search, Calendar, FileText, CheckCircle2, Clock } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';

export default function AuditHistoryModal({
  isOpen = false,
  onClose,
  reports = [],
  blockFarms = [],
  onSelectReport
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('ALL');

  // Extract unique periods
  const periods = useMemo(() => {
    const set = new Set(reports.map(r => r.period || r.month).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      const p = r.period || r.month || '';
      if (selectedPeriod !== 'ALL' && p !== selectedPeriod) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const hash = (r.qrHash || r.id || '').toLowerCase();
      const farm = (blockFarms.find(f => f.id === r.blockFarmId)?.name || r.blockFarmId || '').toLowerCase();
      return hash.includes(term) || farm.includes(term) || p.toLowerCase().includes(term);
    });
  }, [reports, selectedPeriod, searchTerm, blockFarms]);

  const getFarmName = (id) => {
    const f = blockFarms.find(farm => farm.id === id);
    return f?.name || id || 'District Farm';
  };

  const handleSelect = (report) => {
    if (onSelectReport) onSelectReport(report);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="SRA Audit History & Historical Dossiers"
      size="xl"
      footer={
        <Button variant="secondary" size="md" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-xs">
        {/* Subtitle */}
        <p className="text-xs text-hug-muted -mt-2">
          Historical log of monthly compliance packages, digital seals, and regulatory verification audits.
        </p>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Period Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <button
              type="button"
              onClick={() => setSelectedPeriod('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedPeriod === 'ALL'
                  ? 'bg-primary text-white shadow-2xs'
                  : 'bg-bg dark:bg-[#0C1015] text-hug-muted hover:text-hug-text border border-border'
              }`}
            >
              All Periods
            </button>
            {periods.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setSelectedPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedPeriod === p
                    ? 'bg-primary text-white shadow-2xs'
                    : 'bg-bg dark:bg-[#0C1015] text-hug-muted hover:text-hug-text border border-border'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="w-full sm:w-64">
            <Input
              type="search"
              placeholder="Search farm or hash..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>

        {/* History List */}
        <div className="border border-border rounded-xl overflow-hidden max-h-[420px] overflow-y-auto">
          {filteredReports.length === 0 ? (
            <div className="py-12 px-4 text-center text-hug-muted flex flex-col items-center gap-2">
              <History className="w-8 h-8 opacity-30" />
              <p className="font-semibold text-hug-text">No matching audit reports found</p>
              <p className="text-[11px]">Adjust your filter or search query.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-bg dark:bg-[#0C1015] text-hug-muted uppercase text-[10px] font-bold border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="px-3.5 py-2.5">Period</th>
                  <th className="px-3.5 py-2.5">Block Farm</th>
                  <th className="px-3.5 py-2.5">Verification ID</th>
                  <th className="px-3.5 py-2.5 text-center">Operations</th>
                  <th className="px-3.5 py-2.5 text-right">Cost</th>
                  <th className="px-3.5 py-2.5 text-center">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-hug-text">
                {filteredReports.map(report => {
                  const isCert = report.status === 'CERTIFIED';
                  const logs = Array.isArray(report.operationSnapshots) ? report.operationSnapshots : [];
                  const cost = Number(report.totalCost || 0);

                  return (
                    <tr key={report.id || report.reportId} className="hover:bg-bg/40">
                      <td className="px-3.5 py-2.5 font-bold font-mono">
                        {report.period || report.month}
                      </td>
                      <td className="px-3.5 py-2.5 font-semibold">
                        {getFarmName(report.blockFarmId)}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-hug-muted">
                        {report.qrHash || report.id}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono">
                        {logs.length || report.totalLogs || 0}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold">
                        ₱{cost.toLocaleString()}
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <Badge variant={isCert ? 'success' : 'warning'} size="sm">
                          {isCert ? 'Certified' : 'Pending'}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSelect(report)}
                          className="text-primary hover:bg-primary-bg"
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  );
}
