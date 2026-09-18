import React, { useState, useMemo } from 'react';
import { Search, History, CheckCircle2, AlertTriangle, Shield, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';

export default function SystemAuditLedger({
  logs = [],
  isLoading = false,
  className = ''
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredLogs = useMemo(() => {
    let result = [...logs];

    if (outcomeFilter !== 'ALL') {
      result = result.filter(l => l.outcome === outcomeFilter);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(l =>
        (l.actorUserId && l.actorUserId.toLowerCase().includes(q)) ||
        (l.eventType && l.eventType.toLowerCase().includes(q)) ||
        (l.entityType && l.entityType.toLowerCase().includes(q)) ||
        (l.details && l.details.toLowerCase().includes(q))
      );
    }

    return result;
  }, [logs, outcomeFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const pagedLogs = useMemo(() => {
    const start = (validPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, validPage, pageSize]);

  const outcomeOptions = [
    { value: 'ALL', label: 'All Outcomes' },
    { value: 'SUCCESS', label: 'Success Only' },
    { value: 'FAILURE', label: 'Failure Only' }
  ];

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString.includes('T') ? isoString : `${isoString}T00:00:00Z`);
      return isNaN(d.getTime()) ? isoString : d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className={`bg-white dark:bg-surface rounded-2xl border border-border shadow-xs overflow-hidden ${className}`}>
      {/* Header & Filter Controls */}
      <div className="p-4 sm:p-5 border-b border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hug-text flex items-center gap-2">
            <span>System Audit & Security Ledger</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-bg dark:bg-gray-800 text-hug-muted border border-border">
              {filteredLogs.length} events
            </span>
          </h3>
          <p className="text-xs text-hug-muted mt-0.5">
            Immutable chronicle of administrative actions, credential verifications, and compliance milestones.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="w-full sm:w-56">
            <Input
              type="text"
              placeholder="Search actor, event, details..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              icon={Search}
            />
          </div>

          <div className="w-36">
            <Select
              value={outcomeFilter}
              onChange={(e) => {
                setOutcomeFilter(e.target.value);
                setCurrentPage(1);
              }}
              options={outcomeOptions}
            />
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-bg/60 dark:bg-[#0C1015]/60 border-b border-border/80 text-hug-muted font-bold text-xs uppercase tracking-wider">
              <th scope="col" className="px-4 py-3.5">Timestamp</th>
              <th scope="col" className="px-4 py-3.5">Actor</th>
              <th scope="col" className="px-4 py-3.5">Event Type</th>
              <th scope="col" className="px-4 py-3.5">Target Entity</th>
              <th scope="col" className="px-4 py-3.5">Event Details</th>
              <th scope="col" className="px-4 py-3.5 text-right">Outcome</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/50 text-hug-text">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="px-4 py-4"><div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-28 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-40 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4 text-right"><div className="h-4 w-16 bg-gray-200 dark:bg-gray-800 rounded ml-auto" /></td>
                </tr>
              ))
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 px-4 text-hug-muted text-xs">
                  <History className="w-8 h-8 mx-auto text-hug-muted/50 mb-2" />
                  <p className="font-semibold text-hug-text text-sm">No audit logs found</p>
                  <p className="text-xs text-hug-muted mt-0.5">
                    {searchTerm ? 'No logs matched your filter.' : 'Administrative system events will be recorded here.'}
                  </p>
                </td>
              </tr>
            ) : (
              pagedLogs.map((l) => (
                <tr key={l.id} className="hover:bg-bg/40 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3.5 whitespace-nowrap text-xs text-hug-muted font-mono">
                    {formatDate(l.createdAt)}
                  </td>

                  <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs font-bold text-hug-text">
                    {l.actorUserId}
                  </td>

                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-bg dark:bg-gray-800 text-primary dark:text-primary-light border border-border">
                      {l.eventType}
                    </span>
                  </td>

                  <td className="px-4 py-3.5 whitespace-nowrap text-xs font-mono text-hug-muted">
                    {l.entityType}: {l.entityId}
                  </td>

                  <td className="px-4 py-3.5 text-xs text-hug-text max-w-[280px] truncate" title={l.details}>
                    {l.details || '—'}
                  </td>

                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      l.outcome === 'SUCCESS'
                        ? 'bg-success-bg text-success border-success/30'
                        : 'bg-danger-bg text-danger border-danger/20'
                    }`}>
                      {l.outcome === 'SUCCESS' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      {l.outcome}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="px-4 sm:px-5 py-3 border-t border-border/80 flex items-center justify-between gap-3 text-xs">
          <span className="text-hug-muted font-medium">
            Showing {(validPage - 1) * pageSize + 1} to{' '}
            {Math.min(validPage * pageSize, filteredLogs.length)} of {filteredLogs.length} events
          </span>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={validPage === 1}
              icon={ChevronLeft}
            >
              Prev
            </Button>

            <span className="px-2 py-1 font-semibold text-hug-text">
              {validPage} / {totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={validPage === totalPages}
              icon={ChevronRight}
              iconPosition="right"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
