import React, { useEffect, useState, useMemo } from 'react';
import { BookOpen, History, Search, Calendar, FileText, CheckCircle2, Clock } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import { PaginationFooter } from '../ui/Table';
import { canonicalAuditStatus, auditStatusLabel, AUDIT_STATUS } from '../../domain/auditWorkflow';

const PAGE_SIZE = 10;

export default function AuditHistoryModal({
  isOpen = false,
  onClose,
  reports = [],
  blockFarms = [],
  onSelectReport,
  onLoadMore,
  hasMore = false,
  isLoading = false
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // Extract unique periods
  const periods = useMemo(() => {
    const set = new Set(reports.map(r => r.periodKey || r.period || r.month).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      const statusCanonical = canonicalAuditStatus(r.status);
      if (selectedStatus === 'AWAITING_REVIEW' && statusCanonical !== AUDIT_STATUS.PENDING_REVIEW) {
        return false;
      }
      if (selectedStatus === 'CERTIFIED' && statusCanonical !== AUDIT_STATUS.CERTIFIED) {
        return false;
      }

      const p = r.periodKey || r.period || r.month || '';
      if (selectedPeriod !== 'ALL' && p !== selectedPeriod) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const hash = (r.qrHash || r.id || '').toLowerCase();
      const farm = (blockFarms.find(f => f.id === r.blockFarmId)?.name || r.blockFarmId || '').toLowerCase();
      const statusStr = (auditStatusLabel(r.status) || '').toLowerCase();
      return hash.includes(term) || farm.includes(term) || p.toLowerCase().includes(term) || statusStr.includes(term);
    });
  }, [reports, selectedPeriod, selectedStatus, searchTerm, blockFarms]);
  const totalPages = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE));
  const validPage = Math.min(currentPage, totalPages);
  const pagedReports = useMemo(() => {
    const start = (validPage - 1) * PAGE_SIZE;
    return filteredReports.slice(start, start + PAGE_SIZE);
  }, [filteredReports, validPage]);

  useEffect(() => {
    if (!isOpen) setCurrentPage(1);
  }, [isOpen]);

  const summaryMetrics = useMemo(() => {
    let totalLogs = 0;
    let totalAreaHa = 0;
    let totalCost = 0;

    for (const report of filteredReports) {
      const logs = Array.isArray(report.operationSnapshots)
        ? report.operationSnapshots.length
        : (report.totalLogs || report.operationCount || 0);
      totalLogs += Number(logs || 0);

      const ha = Number(
        report.hectaresAudited != null
          ? report.hectaresAudited
          : (report.totalHectares != null
            ? report.totalHectares
            : report.areaHa || 0)
      );
      totalAreaHa += ha;

      totalCost += Number(report.totalCost || report.cost || 0);
    }

    return { totalLogs, totalAreaHa, totalCost };
  }, [filteredReports]);

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
      title="Audit History"
      subtitle="Monthly audit records and review statuses. The newest load first, load more only when needed."
      size="xl"
      footer={
        <Button variant="secondary" size="md" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-xs">

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-wrap">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter Pills */}
            <div className="flex items-center gap-1 bg-surface border border-border p-1 rounded-xl shrink-0">
              {[
                { id: 'ALL', label: 'All Status' },
                { id: 'AWAITING_REVIEW', label: 'Awaiting Review' },
                { id: 'CERTIFIED', label: 'Certified' }
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    setSelectedStatus(st.id);
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    selectedStatus === st.id
                      ? 'bg-primary text-white shadow-2xs'
                      : 'text-hug-muted hover:text-hug-text'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Period Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
              <button
                type="button"
                onClick={() => {
                  setSelectedPeriod('ALL');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedPeriod === 'ALL'
                    ? 'bg-primary text-white shadow-2xs'
                    : 'bg-bg dark:bg-surface-subtle text-hug-muted hover:text-hug-text border border-border'
                }`}
              >
                All Periods
              </button>
              {periods.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setSelectedPeriod(p);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    selectedPeriod === p
                      ? 'bg-primary text-white shadow-2xs'
                      : 'bg-bg dark:bg-surface-subtle text-hug-muted hover:text-hug-text border border-border'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Search box */}
          <div className="w-full sm:w-64">
            <Input
              type="search"
              placeholder="Search farm, hash, status..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="text-xs"
            />
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-surface border border-border rounded-xl p-3.5 shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-hug-muted truncate block">
              Compiled Logs
            </span>
            <span className="text-lg sm:text-xl font-black text-hug-text font-mono mt-1 truncate block">
              {summaryMetrics.totalLogs.toLocaleString()} {summaryMetrics.totalLogs === 1 ? 'log' : 'logs'}
            </span>
          </div>

          <div className="bg-surface border border-border rounded-xl p-3.5 shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-hug-muted truncate block">
              Active Area
            </span>
            <span className="text-lg sm:text-xl font-black text-hug-text font-mono mt-1 truncate block">
              {summaryMetrics.totalAreaHa > 0 ? `${summaryMetrics.totalAreaHa.toFixed(2)} Ha` : '0.00 Ha'}
            </span>
          </div>

          <div className="bg-surface border border-border rounded-xl p-3.5 shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-hug-muted truncate block">
              Total Cost
            </span>
            <span className="text-lg sm:text-xl font-black text-primary dark:text-primary-light font-mono mt-1 truncate block">
              ₱{summaryMetrics.totalCost.toLocaleString()}
            </span>
          </div>
        </div>

        {/* History List */}
        <div className="border border-border rounded-xl overflow-x-auto overflow-y-auto max-h-[420px]">
          {filteredReports.length === 0 ? (
            <div className="py-12 px-4 text-center text-hug-muted flex flex-col items-center gap-2">
              <History className="w-8 h-8 opacity-30" />
              <p className="font-semibold text-hug-text">No matching audit reports found</p>
              <p className="text-[11px]">Adjust your filter or search query.</p>
            </div>
          ) : (
            <table className="w-full min-w-[700px] text-left text-xs border-collapse">
              <thead className="bg-bg dark:bg-surface-subtle text-hug-muted uppercase text-[10px] font-bold border-b border-border sticky top-0 z-10 whitespace-nowrap">
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
                {pagedReports.map(report => {
                  const statusCanonical = canonicalAuditStatus(report.status);
                  const isCert = statusCanonical === AUDIT_STATUS.CERTIFIED;
                  const isAwaiting = statusCanonical === AUDIT_STATUS.PENDING_REVIEW;
                  const statusLabel = isCert
                    ? 'Certified'
                    : isAwaiting
                    ? 'Awaiting Review'
                    : auditStatusLabel(report.status) || 'Compiled';
                  const badgeVariant = isCert ? 'success' : isAwaiting ? 'warning' : 'neutral';
                  const logs = Array.isArray(report.operationSnapshots) ? report.operationSnapshots : [];
                  const cost = Number(report.totalCost || 0);

                  return (
                    <tr key={report.id || report.reportId} className="hover:bg-bg/40">
                      <td className="px-3.5 py-2.5 font-bold font-mono whitespace-nowrap">
                        {report.periodKey || report.period || report.month}
                      </td>
                      <td className="px-3.5 py-2.5 font-semibold whitespace-nowrap">
                        {getFarmName(report.blockFarmId)}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-hug-muted whitespace-nowrap">
                        {report.qrHash || report.id}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono whitespace-nowrap">
                        {logs.length || report.totalLogs || 0}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold whitespace-nowrap">
                        ₱{cost.toLocaleString()}
                      </td>
                      <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                        <Badge variant={badgeVariant} size="sm">
                          {statusLabel}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
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
        {filteredReports.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border">
            <PaginationFooter
              currentPage={validPage}
              totalPages={totalPages}
              totalItems={filteredReports.length}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
        {hasMore && <Button variant="secondary" size="md" onClick={onLoadMore} isLoading={isLoading} loadingText="Loading...">Load More</Button>}
      </div>
    </Modal>
  );
}
