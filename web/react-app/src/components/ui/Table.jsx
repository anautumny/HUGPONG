import React from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import Button from './Button';

export default function Table({
  columns = [],
  data = [],
  keyField = 'id',
  isLoading = false,
  loadingRows = 5,
  emptyMessage = 'No records found.',
  emptySubtext,
  emptyAction,
  error,
  onRetry,
  onRowClick,
  className = '',
  // Integrated pagination props
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
}) {
  const hasPagination = typeof onPageChange === 'function';

  return (
    <div className={`w-full max-w-full min-w-0 rounded-2xl border border-border bg-surface shadow-xs overflow-hidden ${className}`}>
      {/* Scrollable table area */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-bg/60 border-b border-border/80 text-hug-muted font-bold text-xs uppercase tracking-wider">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  style={{ width: col.width }}
                  className={`px-4 sm:px-5 py-3.5 whitespace-nowrap ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                  } ${col.headerClassName || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-border/50 text-hug-text">
            {isLoading ? (
              Array.from({ length: loadingRows }).map((_, rIdx) => (
                <tr key={rIdx} className="animate-pulse">
                  {columns.map((col, cIdx) => (
                    <td key={cIdx} className="px-4 sm:px-5 py-4">
                      <div
                        className={`h-4 bg-gray-200 dark:bg-gray-800 rounded ${
                          cIdx === 0 ? 'w-24' : cIdx === 1 ? 'w-36' : 'w-20'
                        }`}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-hug-muted"
                >
                  <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                    <div className="w-10 h-10 rounded-2xl bg-danger-bg dark:bg-danger/20 text-danger flex items-center justify-center mb-1">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-bold text-hug-text">
                      {typeof error === 'string' ? error : 'Unable to load table data.'}
                    </p>
                    {onRetry && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={onRetry}
                        className="mt-2"
                      >
                        Retry Loading
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : !data || data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-hug-muted"
                >
                  <div className="flex flex-col items-center justify-center gap-1.5 max-w-sm mx-auto">
                    <div className="w-10 h-10 rounded-2xl bg-bg text-hug-muted flex items-center justify-center mb-1">
                      <Inbox className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-bold text-hug-text">
                      {emptyMessage}
                    </p>
                    {emptySubtext && (
                      <p className="text-xs text-hug-muted leading-relaxed">
                        {emptySubtext}
                      </p>
                    )}
                    {emptyAction && <div className="mt-3">{emptyAction}</div>}
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, rowIdx) => {
                const rowKey = row[keyField] || rowIdx;
                const isClickable = Boolean(onRowClick);

                return (
                  <tr
                    key={rowKey}
                    onClick={() => isClickable && onRowClick(row)}
                    className={`
                      transition-colors
                      ${isClickable ? 'cursor-pointer hover:bg-bg/50 dark:hover:bg-white/[0.02]' : 'hover:bg-bg/30 dark:hover:bg-white/[0.01]'}
                    `}
                  >
                    {columns.map((col) => {
                      const value = row[col.key];
                      const content = col.render ? col.render(value, row, rowIdx) : value;

                      return (
                        <td
                          key={col.key}
                          className={`px-4 sm:px-5 py-3.5 whitespace-nowrap text-sm ${
                            col.align === 'right'
                              ? 'text-right'
                              : col.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                          } ${col.cellClassName || ''}`}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Integrated pagination footer — renders inside the card border */}
      {hasPagination && (
        <PaginationFooter
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}

/** Internal pagination footer — rendered inside the Table card */
function PaginationFooter({ currentPage = 1, totalPages = 1, totalItems, onPageChange }) {
  // Always render so the card footer is always present when pagination is requested
  return (
    <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-border/60 bg-bg/30 dark:bg-black/10 text-xs">
      <div className="text-hug-muted font-medium">
        {totalItems != null ? (
          <span>
            Showing page <strong className="text-hug-text">{currentPage}</strong> of{' '}
            <strong className="text-hug-text">{totalPages}</strong>{' '}
            <span className="text-hug-muted">({totalItems} total records)</span>
          </span>
        ) : (
          <span>
            Page <strong className="text-hug-text">{currentPage}</strong> of{' '}
            <strong className="text-hug-text">{totalPages}</strong>
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange && onPageChange(currentPage - 1)}
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
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange && onPageChange(currentPage + 1)}
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
  );
}

/**
 * Standalone TablePagination — kept for backward compatibility.
 * Prefer using the Table's built-in pagination props instead.
 */
export function TablePagination({
  currentPage = 1,
  totalPages = 1,
  totalItems,
  pageSize,
  onPageChange
}) {
  if (totalPages <= 1 && !totalItems) return null;

  return (
    <div className="w-full rounded-2xl border border-border bg-surface shadow-xs overflow-hidden">
      <PaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={onPageChange}
      />
    </div>
  );
}
