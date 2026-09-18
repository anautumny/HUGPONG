import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, ArrowRight } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { StatusBadge } from '../ui';

export default function RecentOperationsTable({
  operations = [],
  isLoading = false
}) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-surface rounded-2xl p-5 border border-border shadow-xs">
        <div className="flex items-center justify-between mb-4 animate-pulse">
          <div className="h-5 w-40 bg-gray-200 dark:bg-gray-800 rounded" />
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-surface rounded-2xl border border-border shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-5 pb-3 flex items-center justify-between border-b border-border/70">
        <div>
          <h2 className="text-sm font-bold text-hug-text uppercase tracking-wider flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary dark:text-primary-light" />
            <span>Recent Operations</span>
          </h2>
          <p className="text-xs text-hug-muted mt-0.5">
            Latest recorded field activities
          </p>
        </div>

        <Link
          to="/operations"
          className="text-xs font-bold text-primary dark:text-primary-light hover:underline inline-flex items-center gap-1 cursor-pointer"
        >
          <span>View Operations Console</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Content */}
      {(!operations || operations.length === 0) ? (
        <div className="p-8 text-center">
          <p className="text-sm font-semibold text-hug-muted">
            No field operations recorded yet.
          </p>
          <p className="text-xs text-hug-text2 mt-1 max-w-sm mx-auto">
            Operations logged for fields within your scope will appear here chronologically.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-bg/60 dark:bg-surface/60 text-hug-muted uppercase tracking-wider font-semibold border-b border-border/60">
                <th scope="col" className="px-5 py-3">Date</th>
                <th scope="col" className="px-5 py-3">Operation / Task</th>
                <th scope="col" className="px-5 py-3">Stage</th>
                <th scope="col" className="px-5 py-3 text-right">Total Cost</th>
                <th scope="col" className="px-5 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {operations.slice(0, 5).map((op) => {
                const isCompleted = (op.status || 'ACTIVE').toUpperCase() === 'ACTIVE' || (op.status || '').toUpperCase() === 'COMPLETED';
                return (
                  <tr
                    key={op.id}
                    className="hover:bg-bg/40 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-3.5 text-hug-muted whitespace-nowrap font-medium">
                      {formatDate(op.performedOn || op.date || op.createdAt)}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-hug-text whitespace-nowrap">
                      {op.operationName || op.activity || 'Field Operation'}
                      {op.fieldId && (
                        <span className="block text-[11px] font-normal text-hug-muted">
                          Field {op.fieldId}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-bg dark:bg-[#0C1015] text-hug-text border border-border/70">
                        Stage {op.stageNumber || 1}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-hug-text whitespace-nowrap">
                      {formatCurrency(op.totalCost ?? op.cost ?? 0)}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <StatusBadge status={op.status || 'ACTIVE'} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
