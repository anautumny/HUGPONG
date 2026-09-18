import React, { useState } from 'react';
import { Layers, AlertCircle, RefreshCw } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';

export default function AuditQueue({
  reports = [],
  selectedReportId = null,
  onSelectReport,
  isLoading = false,
  error = null,
  onRetry,
  blockFarms = [],
  className = ''
}) {
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'PENDING' | 'CERTIFIED'

  const pendingCount = reports.filter(r => r.status === 'PENDING').length;
  const certifiedCount = reports.filter(r => r.status === 'CERTIFIED').length;

  const filteredReports = reports.filter(r => {
    if (filterStatus === 'PENDING') return r.status === 'PENDING';
    if (filterStatus === 'CERTIFIED') return r.status === 'CERTIFIED';
    return true;
  });

  const getFarmName = (farmId) => {
    if (!farmId) return 'Unassigned Block Farm';
    const found = blockFarms.find(f => f.id === farmId);
    return found?.name || farmId;
  };

  return (
    <div className={`bg-white dark:bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-xs flex flex-col gap-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-hug-text">
            Cloud Audit Queue
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
            {pendingCount} Pending
          </span>
          <span className="text-[11px] font-mono text-hug-muted">
            / {reports.length} Total
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-bg dark:bg-[#0C1015] p-1 rounded-xl border border-border/80 text-xs">
        <button
          type="button"
          onClick={() => setFilterStatus('ALL')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-semibold transition-all cursor-pointer text-center ${
            filterStatus === 'ALL'
              ? 'bg-white dark:bg-surface text-hug-text shadow-2xs'
              : 'text-hug-muted hover:text-hug-text'
          }`}
        >
          All ({reports.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterStatus('PENDING')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-semibold transition-all cursor-pointer text-center ${
            filterStatus === 'PENDING'
              ? 'bg-white dark:bg-surface text-amber-700 dark:text-amber-400 shadow-2xs'
              : 'text-hug-muted hover:text-hug-text'
          }`}
        >
          Pending ({pendingCount})
        </button>
        <button
          type="button"
          onClick={() => setFilterStatus('CERTIFIED')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-semibold transition-all cursor-pointer text-center ${
            filterStatus === 'CERTIFIED'
              ? 'bg-white dark:bg-surface text-emerald-700 dark:text-emerald-400 shadow-2xs'
              : 'text-hug-muted hover:text-hug-text'
          }`}
        >
          Certified ({certifiedCount})
        </button>
      </div>

      {/* Queue List Container */}
      <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex flex-col gap-2 py-4">
            {[1, 2, 3].map(n => (
              <div key={n} className="p-3 rounded-xl border border-border/60 bg-bg/40 animate-pulse flex flex-col gap-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-2/3"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-danger-bg dark:bg-danger/10 border border-danger/30 text-xs text-danger flex flex-col items-center gap-2 text-center">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="font-semibold">Unable to load audit reports.</p>
            <p className="text-[11px] text-hug-muted">{error}</p>
            {onRetry && (
              <Button variant="secondary" size="sm" onClick={onRetry} icon={RefreshCw}>
                Retry
              </Button>
            )}
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="py-8 px-4 text-center text-hug-muted flex flex-col items-center gap-2 border border-dashed border-border rounded-xl">
            <Layers className="w-8 h-8 opacity-40 text-hug-muted" />
            <p className="text-xs font-semibold text-hug-text">No audit reports available</p>
            <p className="text-[11px] max-w-[200px]">
              {filterStatus === 'PENDING'
                ? 'All compiled reports have received SRA certification.'
                : filterStatus === 'CERTIFIED'
                ? 'No certified reports in this view yet.'
                : 'No monthly audit packages have been compiled yet.'}
            </p>
          </div>
        ) : (
          filteredReports.map(report => {
            const isCert = report.status === 'CERTIFIED';
            const isSelected = selectedReportId === report.id || selectedReportId === report.reportId;
            const farmName = getFarmName(report.blockFarmId);
            const totalCost = Number(report.totalCost || 0);
            const logsCount = Array.isArray(report.operationSnapshots)
              ? report.operationSnapshots.length
              : Number(report.totalLogs || report.logsCount || 0);

            return (
              <div
                key={report.id || report.reportId}
                onClick={() => onSelectReport && onSelectReport(report)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 text-left ${
                  isSelected
                    ? 'border-primary bg-primary-bg/20 dark:bg-primary/10 shadow-xs ring-1 ring-primary'
                    : isCert
                    ? 'border-border bg-white dark:bg-surface hover:border-primary/50 hover:bg-bg/40'
                    : 'border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 hover:border-amber-400 hover:bg-amber-50/80'
                }`}
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isCert ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                    />
                    <span className="text-xs font-bold text-hug-text truncate">
                      {report.period || report.month} · {farmName}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1 text-[10px] text-hug-muted font-mono flex-wrap">
                    <span className="truncate max-w-[140px]">
                      {report.qrHash || report.id}
                    </span>
                    <span>•</span>
                    <span className="font-semibold text-hug-text">
                      ₱{totalCost.toLocaleString()}
                    </span>
                    <span>•</span>
                    <span>{logsCount} {logsCount === 1 ? 'log' : 'logs'}</span>
                  </div>
                </div>

                <div className="shrink-0">
                  <Badge variant={isCert ? 'success' : 'warning'} size="sm">
                    {isCert ? 'Certified' : 'Pending'}
                  </Badge>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
