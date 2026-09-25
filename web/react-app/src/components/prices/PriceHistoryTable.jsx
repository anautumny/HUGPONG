import React, { useState, useMemo } from 'react';
import { Search, ArrowUpDown, ArrowUpRight, ArrowDownRight, Minus, FileText, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import Input from '../ui/Input';
import Button from '../ui/Button';

export default function PriceHistoryTable({
  prices = [],
  isLoading = false,
  className = ''
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('effectiveDate'); // 'effectiveDate' | 'sugarPricePerLkg' | 'molassesPricePerMetricTon'
  const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Filtered & Sorted Prices
  const filteredPrices = useMemo(() => {
    let result = [...prices];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(p =>
        (p.circularNumber && p.circularNumber.toLowerCase().includes(q)) ||
        (p.source && p.source.toLowerCase().includes(q)) ||
        (p.weekLabel && p.weekLabel.toLowerCase().includes(q)) ||
        (p.effectiveDate && p.effectiveDate.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'effectiveDate') {
        const cmp = String(valA || '').localeCompare(String(valB || ''));
        return sortDirection === 'asc' ? cmp : -cmp;
      }

      valA = Number(valA || 0);
      valB = Number(valB || 0);
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });

    return result;
  }, [prices, searchTerm, sortField, sortDirection]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredPrices.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const pagedPrices = useMemo(() => {
    const start = (validCurrentPage - 1) * pageSize;
    return filteredPrices.slice(start, start + pageSize);
  }, [filteredPrices, validCurrentPage, pageSize]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString.includes('T') ? isoString : `${isoString}T00:00:00Z`);
      return isNaN(d.getTime()) ? isoString : d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className={`bg-white dark:bg-surface rounded-2xl border border-border shadow-xs overflow-hidden ${className}`}>
      {/* Header & Search Bar */}
      <div className="p-4 sm:p-5 border-b border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hug-text flex items-center gap-2">
            <span>Historical SRA Price Records</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-bg dark:bg-gray-800 text-hug-muted border border-border">
              {filteredPrices.length} circulars
            </span>
          </h3>
          <p className="text-xs text-hug-muted mt-0.5">
            Audit-grade millsite pricing ledger published by the Sugar Regulatory Administration.
          </p>
        </div>

        <div className="w-full sm:w-64">
          <Input
            type="text"
            placeholder="Search circulars, weeks, dates..."
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
              <th
                scope="col"
                className="px-4 py-3.5 cursor-pointer hover:text-hug-text transition-colors select-none"
                onClick={() => handleSort('effectiveDate')}
              >
                <div className="flex items-center gap-1.5">
                  <span>Effective Date</span>
                  <ArrowUpDown className="w-3.5 h-3.5 text-hug-muted" />
                </div>
              </th>

              <th scope="col" className="px-4 py-3.5 select-none">
                SRA Week
              </th>

              <th
                scope="col"
                className="px-4 py-3.5 cursor-pointer hover:text-hug-text transition-colors select-none"
                onClick={() => handleSort('sugarPricePerLkg')}
              >
                <div className="flex items-center gap-1.5">
                  <span>Raw Sugar (â‚±/Lkg)</span>
                  <ArrowUpDown className="w-3.5 h-3.5 text-hug-muted" />
                </div>
              </th>

              <th
                scope="col"
                className="px-4 py-3.5 cursor-pointer hover:text-hug-text transition-colors select-none"
                onClick={() => handleSort('molassesPricePerMetricTon')}
              >
                <div className="flex items-center gap-1.5">
                  <span>Molasses (â‚±/MT)</span>
                  <ArrowUpDown className="w-3.5 h-3.5 text-hug-muted" />
                </div>
              </th>

              <th scope="col" className="px-4 py-3.5 select-none">
                Weekly Variance
              </th>

              <th scope="col" className="px-4 py-3.5 select-none">
                Circular / Source
              </th>

              <th scope="col" className="px-4 py-3.5 text-right select-none">
                Authority
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/50 text-hug-text">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="px-4 py-4"><div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-28 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-36 bg-gray-200 dark:bg-gray-800 rounded" /></td>
                  <td className="px-4 py-4 text-right"><div className="h-4 w-16 bg-gray-200 dark:bg-gray-800 rounded ml-auto" /></td>
                </tr>
              ))
            ) : pagedPrices.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 px-4 text-hug-muted text-xs">
                  <FileText className="w-8 h-8 mx-auto text-hug-muted/50 mb-2" />
                  <p className="font-semibold text-hug-text text-sm">No price circulars found</p>
                  <p className="text-xs text-hug-muted mt-0.5">
                    {searchTerm ? 'Try adjusting your search terms.' : 'Official SRA pricing records will appear here once published.'}
                  </p>
                </td>
              </tr>
            ) : (
              pagedPrices.map((p) => {
                const sugarPrice = Number(p.sugarPricePerLkg || 0);
                const molassesPrice = Number(p.molassesPricePerMetricTon || 0);
                const sugarChange = Number(p.sugarPriceChange || 0);
                const molassesChange = Number(p.molassesPriceChange || 0);

                return (
                  <tr key={p.id} className="hover:bg-bg/40 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3.5 text-xs text-hug-muted whitespace-nowrap font-medium">
                      {formatDate(p.effectiveDate)}
                    </td>

                    <td className="px-4 py-3.5 text-xs font-bold text-hug-text whitespace-nowrap">
                      {p.weekLabel || '—'}
                    </td>

                    <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                      <span className="font-extrabold text-primary dark:text-primary-light">
                        ₱{sugarPrice.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-hug-muted ml-1">/Lkg</span>
                    </td>

                    <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                      <span className="font-bold text-hug-text">
                        ₱{molassesPrice.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-hug-muted ml-1">/MT</span>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex flex-col gap-1 text-[11px]">
                        {/* Sugar diff */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-hug-muted uppercase tracking-wider">Sugar:</span>
                          {sugarChange > 0 ? (
                            <span className="inline-flex items-center font-bold text-success">
                              <ArrowUpRight className="w-3 h-3" />
                              +₱{sugarChange.toLocaleString()}
                            </span>
                          ) : sugarChange < 0 ? (
                            <span className="inline-flex items-center font-bold text-danger">
                              <ArrowDownRight className="w-3 h-3" />
                              -₱{Math.abs(sugarChange).toLocaleString()}
                            </span>
                          ) : (
                            <span className="inline-flex items-center font-medium text-hug-muted">
                              <Minus className="w-3 h-3" />
                              ₱0
                            </span>
                          )}
                        </div>

                        {/* Molasses diff */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-hug-muted uppercase tracking-wider">Molasses:</span>
                          {molassesChange > 0 ? (
                            <span className="inline-flex items-center font-bold text-success">
                              <ArrowUpRight className="w-3 h-3" />
                              +₱{molassesChange.toLocaleString()}
                            </span>
                          ) : molassesChange < 0 ? (
                            <span className="inline-flex items-center font-bold text-danger">
                              <ArrowDownRight className="w-3 h-3" />
                              -₱{Math.abs(molassesChange).toLocaleString()}
                            </span>
                          ) : (
                            <span className="inline-flex items-center font-medium text-hug-muted">
                              <Minus className="w-3 h-3" />
                              ₱0
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-hug-muted max-w-[200px] truncate" title={p.source}>
                      <span className="font-mono font-semibold text-hug-text block truncate">
                        {p.circularNumber || 'Official Circular'}
                      </span>
                      <span className="text-[10px] text-hug-muted block truncate">
                        {p.source || 'Sugar Regulatory Administration'}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-success-bg text-success border border-success/30">
                        <CheckCircle2 className="w-3 h-3" />
                        Official SRA
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer — always rendered, matches Table card footer */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-border/60 bg-bg/30 dark:bg-black/10 text-xs">
        <div className="text-hug-muted font-medium">
          <span>
            Showing page <strong className="text-hug-text">{validCurrentPage}</strong> of{' '}
            <strong className="text-hug-text">{totalPages}</strong>{' '}
            <span className="text-hug-muted">({filteredPrices.length} records)</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={validCurrentPage === 1}
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
            disabled={validCurrentPage === totalPages}
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
