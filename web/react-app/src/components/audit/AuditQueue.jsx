import React from 'react';
import { Inbox, AlertCircle, RefreshCw } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { auditStatusLabel, canonicalAuditStatus } from '../../domain/auditWorkflow';

export default function AuditQueue({ reports = [], selectedReportId = null, onSelectReport, isLoading = false, error = null, onRetry, blockFarms = [], className = '', title = 'Audit Inbox' }) {
  const farmName = report => report.blockFarmName || blockFarms.find(farm => farm.id === report.blockFarmId)?.name || report.blockFarmId || 'Block Farm';
  return (
    <div className={`bg-white dark:bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-xs flex flex-col gap-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-hug-text">{title}</h3>
        </div>
        <span className="text-[11px] font-bold px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">{reports.length} {title === 'Audit Inbox' ? 'Awaiting Review' : 'Reports'}</span>
      </div>
      <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">
        {isLoading && reports.length === 0 ? [1, 2, 3].map(key => <div key={key} className="h-20 rounded-xl bg-bg animate-pulse" />) : error ? (
          <div className="p-4 rounded-xl bg-danger-bg border border-danger/30 text-xs text-danger text-center">
            <AlertCircle className="w-5 h-5 mx-auto mb-2" /><p>{error}</p>
            {onRetry && <Button variant="secondary" size="sm" onClick={onRetry} icon={RefreshCw}>Retry</Button>}
          </div>
        ) : reports.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-border rounded-xl">
            <Inbox className="w-8 h-8 mx-auto text-hug-muted opacity-50" />
            <p className="text-xs font-semibold text-hug-text mt-2">Inbox is clear</p>
            <p className="text-[11px] text-hug-muted mt-1">No audits currently require SRA review.</p>
          </div>
        ) : reports.map(report => {
          const selected = selectedReportId === report.id || selectedReportId === report.reportId;
          const status = canonicalAuditStatus(report.status);
          return (
            <button key={report.id || report.reportId} type="button" onClick={() => onSelectReport?.(report)}
              className={`p-3.5 rounded-xl border text-left transition-all ${selected ? 'border-primary bg-primary-bg/30 ring-1 ring-primary' : 'border-border hover:border-primary/50 bg-white dark:bg-surface'}`}>
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-hug-text truncate">{farmName(report)}</p>
                  <p className="text-[11px] text-hug-muted mt-0.5">{new Date(`${report.periodKey || report.period}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                </div>
                <Badge variant={status === 'RETURNED' ? 'danger' : 'warning'} size="sm">{auditStatusLabel(status)}</Badge>
              </div>
              <p className="text-[10px] text-hug-muted mt-2">{report.operationCount || report.operationSnapshots?.length || 0} Operations · {Number(report.hectaresAudited || 0).toFixed(2)} Ha · Submitted {report.submittedAt ? new Date(report.submittedAt).toLocaleDateString() : '—'}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
