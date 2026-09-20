import React, { useState, useMemo } from 'react';
import { Search, Smartphone, Battery, Clock, CheckCircle2, AlertTriangle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import Input from '../ui/Input';
import { evaluateNodeStatus } from '../../services/telemetryService';

export default function SyncTelemetryTable({
  diagnostics = [],
  users = [],
  isLoading = false,
  className = ''
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const userMap = useMemo(() => {
    const map = new Map();
    users.forEach(u => {
      if (u.id) map.set(u.id, u);
      if (u.employeeId) map.set(u.employeeId, u);
    });
    return map;
  }, [users]);

  const filteredDiagnostics = useMemo(() => {
    let result = [...diagnostics];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(d =>
        d.deviceId.toLowerCase().includes(q) ||
        d.userId.toLowerCase().includes(q) ||
        d.model.toLowerCase().includes(q) ||
        d.os.toLowerCase().includes(q)
      );
    }

    return result;
  }, [diagnostics, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredDiagnostics.length / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const pagedDiagnostics = useMemo(() => {
    const start = (validPage - 1) * pageSize;
    return filteredDiagnostics.slice(start, start + pageSize);
  }, [filteredDiagnostics, validPage, pageSize]);

  const formatDate = (isoString) => {
    if (!isoString) return 'Never';
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
      {/* Header & Search */}
      <div className="p-4 sm:p-5 border-b border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hug-text flex items-center gap-2">
            <span>Terminal Diagnostics & Node Ledger</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-bg dark:bg-gray-800 text-hug-muted border border-border">
              {filteredDiagnostics.length} nodes
            </span>
          </h3>
          <p className="text-xs text-hug-muted mt-0.5">
            Empirical hardware and buffer diagnostics broadcasted by field mobile devices.
          </p>
        </div>

        <div className="w-full sm:w-64">
          <Input
            type="text"
            placeholder="Search device, user, model..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            icon={Search}
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-bg/60 dark:bg-[#0C1015]/60 border-b border-border/80 text-hug-muted font-bold text-xs uppercase tracking-wider">
              <th scope="col" className="px-4 py-3.5">Device ID</th>
              <th scope="col" className="px-4 py-3.5">Assigned User</th>
              <th scope="col" className="px-4 py-3.5">Hardware / OS</th>
              <th scope="col" className="px-4 py-3.5">App / Battery</th>
              <th scope="col" className="px-4 py-3.5">Local Buffer</th>
              <th scope="col" className="px-4 py-3.5">Last Communication</th>
              <th scope="col" className="px-4 py-3.5 text-right">Node State</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/50 text-hug-text">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="px-4 py-4"><div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-28 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-16 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4 text-right"><div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded ml-auto" /></td>
                </tr>
              ))
            ) : filteredDiagnostics.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 px-4 text-hug-muted text-xs">
                  <Smartphone className="w-8 h-8 mx-auto text-hug-muted/50 mb-2" />
                  <p className="font-semibold text-hug-text text-sm">No terminal diagnostics recorded</p>
                  <p className="text-xs text-hug-muted mt-0.5">
                    {searchTerm ? 'No terminals matched your search query.' : 'Mobile devices will appear here upon transmitting offline telemetry.'}
                  </p>
                </td>
              </tr>
            ) : (
              pagedDiagnostics.map((d) => {
                const evaluated = evaluateNodeStatus(d.updatedAt);
                const userObj = userMap.get(d.userId);
                const userName = userObj?.displayName || userObj?.name || d.userId || 'Unlinked Device';

                return (
                  <tr key={d.id} className="hover:bg-bg/40 dark:hover:bg-gray-800/30 transition-colors">
                    {/* Device ID */}
                    <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs font-bold text-primary dark:text-primary-light">
                      {d.deviceId}
                    </td>

                    {/* Personnel */}
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-hug-text text-xs block">
                        {userName}
                      </span>
                      <span className="font-mono text-[10px] text-hug-muted block">
                        {d.userId}
                      </span>
                    </td>

                    {/* Hardware / OS */}
                    <td className="px-4 py-3.5 text-xs text-hug-text2">
                      <span className="font-medium block">{d.model}</span>
                      <span className="text-[10px] text-hug-muted block">{d.os}</span>
                    </td>

                    {/* App / Battery */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs text-hug-muted">
                      <span className="font-mono font-semibold text-hug-text block">{d.appVersion}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-hug-muted">
                        <Battery className="w-3 h-3" />
                        {d.battery}
                      </span>
                    </td>

                    {/* Local Buffer */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                      <span className={`font-mono font-bold ${d.cachedLogs > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-hug-muted'}`}>
                        {d.cachedLogs} items
                      </span>
                    </td>

                    {/* Last Communication */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs text-hug-muted font-medium">
                      {formatDate(d.updatedAt)}
                    </td>

                    {/* Node State */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${evaluated.badgeClass}`}>
                        {evaluated.state === 'ACTIVE' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : evaluated.state === 'DELAYED' ? (
                          <AlertTriangle className="w-3 h-3" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {evaluated.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-border/60 bg-bg/30 dark:bg-black/10 text-xs">
        <div className="text-hug-muted font-medium">
          <span>
            Showing page <strong className="text-hug-text">{validPage}</strong> of{' '}
            <strong className="text-hug-text">{totalPages}</strong>{' '}
            <span className="text-hug-muted">({filteredDiagnostics.length} nodes)</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={validPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            aria-label="Previous page"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border
              text-hug-muted bg-surface hover:bg-bg hover:text-hug-text transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>
          <button
            type="button"
            disabled={validPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            aria-label="Next page"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border
              text-hug-muted bg-surface hover:bg-bg hover:text-hug-text transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
