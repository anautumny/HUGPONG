import React from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Minus, Calendar, FileText, PlusCircle } from 'lucide-react';
import Button from '../ui/Button';

export default function CurrentPriceBanner({
  price = null,
  previousPrice = null,
  isLoading = false,
  isSraAdmin = false,
  onPublishClick,
  className = ''
}) {
  if (isLoading) {
    return (
      <div className={`bg-white dark:bg-surface rounded-2xl border border-border p-6 shadow-xs animate-pulse ${className}`}>
        <div className="h-4 w-40 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-16 bg-gray-200 dark:bg-gray-800 rounded-xl" />
          <div className="h-16 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!price) {
    return (
      <div className={`bg-white dark:bg-surface rounded-2xl border border-border p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${className}`}>
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-hug-muted block mb-1">
            Current Official SRA Price
          </span>
          <h3 className="text-base font-bold text-hug-text">
            No official SRA price circular published yet.
          </h3>
          <p className="text-xs text-hug-muted mt-0.5">
            Official benchmark rates will appear here once published by the Sugar Regulatory Administration.
          </p>
        </div>

        {isSraAdmin && (
          <Button
            variant="primary"
            size="md"
            onClick={onPublishClick}
            icon={PlusCircle}
          >
            Post First SRA Price
          </Button>
        )}
      </div>
    );
  }

  const sugarPrice = Number(price.sugarPricePerLkg || 0);
  const molassesPrice = Number(price.molassesPricePerMetricTon || 0);
  const sugarChange = Number(price.sugarPriceChange || 0);
  const molassesChange = Number(price.molassesPriceChange || 0);

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
    <div className={`bg-white dark:bg-surface rounded-2xl border border-border p-6 shadow-xs flex flex-col gap-4 ${className}`}>
      {/* Header Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-hug-muted">
              Current Official SRA Price
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-success-bg text-success border border-success/30">
              Active Official Circular
            </span>
          </div>
          <h2 className="text-lg font-bold text-hug-text mt-1">
            {price.weekLabel || 'Current Reporting Week'}
          </h2>
          <div className="flex items-center gap-3 text-xs text-hug-muted mt-0.5 flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Effective: {formatDate(price.effectiveDate)}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 font-mono">
              <FileText className="w-3.5 h-3.5" />
              {price.circularNumber || price.source || 'SRA Circular'}
            </span>
          </div>
        </div>

        {isSraAdmin && (
          <Button
            variant="primary"
            size="md"
            onClick={onPublishClick}
            icon={PlusCircle}
            className="shrink-0"
          >
            Post Official SRA Price
          </Button>
        )}
      </div>

      {/* Dual Price Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Raw Sugar Tile */}
        <div className="bg-surface-subtle rounded-xl p-4 border border-border flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-hug-muted tracking-wider block mb-0.5">
              Raw Sugar (Domestic Millsite)
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-primary dark:text-primary-light">
                ₱{sugarPrice.toLocaleString()}
              </span>
              <span className="text-xs text-hug-muted font-medium">/ Lkg bag</span>
            </div>
          </div>

          <div className="text-right">
            {sugarChange > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-success bg-success-bg px-2 py-1 rounded-lg">
                <ArrowUpRight className="w-3.5 h-3.5" />
                +₱{sugarChange.toLocaleString()}
              </span>
            ) : sugarChange < 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-danger bg-danger-bg dark:bg-danger/20 px-2 py-1 rounded-lg">
                <ArrowDownRight className="w-3.5 h-3.5" />
                -₱{Math.abs(sugarChange).toLocaleString()}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-hug-muted bg-white dark:bg-surface px-2 py-1 rounded-lg border border-border">
                <Minus className="w-3.5 h-3.5" />
                Steady (₱0)
              </span>
            )}
            <span className="block text-[10px] text-hug-muted mt-1">vs previous circular</span>
          </div>
        </div>

        {/* Molasses Tile */}
        <div className="bg-surface-subtle rounded-xl p-4 border border-border flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-hug-muted tracking-wider block mb-0.5">
              Industrial Molasses (Millsite)
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-hug-text">
                ₱{molassesPrice.toLocaleString()}
              </span>
              <span className="text-xs text-hug-muted font-medium">/ Metric Ton</span>
            </div>
          </div>

          <div className="text-right">
            {molassesChange > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-success bg-success-bg px-2 py-1 rounded-lg">
                <ArrowUpRight className="w-3.5 h-3.5" />
                +₱{molassesChange.toLocaleString()}
              </span>
            ) : molassesChange < 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-danger bg-danger-bg dark:bg-danger/20 px-2 py-1 rounded-lg">
                <ArrowDownRight className="w-3.5 h-3.5" />
                -₱{Math.abs(molassesChange).toLocaleString()}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-hug-muted bg-white dark:bg-surface px-2 py-1 rounded-lg border border-border">
                <Minus className="w-3.5 h-3.5" />
                Steady (₱0)
              </span>
            )}
            <span className="block text-[10px] text-hug-muted mt-1">vs previous circular</span>
          </div>
        </div>
      </div>
    </div>
  );
}
