import React from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Minus, Calendar, FileText } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function CurrentPriceCard({
  price,
  previousPrice,
  isLoading = false,
  showPublishAction = false,
  onPublishClick
}) {
  if (isLoading) {
    return (
      <div className="bg-surface rounded-2xl p-5 sm:p-6 border border-border shadow-xs animate-pulse h-full flex flex-col justify-between">
        <div>
          <div className="h-4 w-36 bg-surface-subtle rounded mb-4" />
          <div className="h-10 w-48 bg-surface-subtle rounded mb-3" />
          <div className="h-4 w-32 bg-surface-subtle rounded" />
        </div>
      </div>
    );
  }

  if (!price) {
    return (
      <div className="bg-surface rounded-2xl p-5 sm:p-6 border border-border shadow-xs flex flex-col justify-between h-full">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-hug-muted uppercase tracking-wider">
              Current Official SRA Price
            </span>
            <div className="w-8 h-8 rounded-xl bg-surface-subtle text-hug-muted flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-base font-bold text-hug-muted mt-2">
            No published SRA price available.
          </p>
          <p className="text-xs text-hug-text2 mt-1">
            Official price records will appear here once published by the Sugar Regulatory Administration.
          </p>
        </div>

        {showPublishAction && (
          <div className="pt-3 mt-4 border-t border-border/60 flex items-center justify-between gap-2">
            <span className="text-[11px] text-hug-muted font-medium">SRA Authority</span>
            <div className="flex items-center gap-3">
              {onPublishClick && (
                <button
                  type="button"
                  onClick={onPublishClick}
                  className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Post Official SRA Price</span>
                </button>
              )}
              <Link
                to="/prices"
                className="text-xs font-semibold text-hug-muted hover:text-hug-text inline-flex items-center gap-1"
              >
                <span>Price Ledger &rarr;</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Derive Sugar change
  const currentSugar = Number(price.sugarPricePerLkg ?? price.sugarPricePerLkgBag ?? 0);
  const prevSugar = previousPrice
    ? Number(previousPrice.sugarPricePerLkg ?? previousPrice.sugarPricePerLkgBag ?? 0)
    : currentSugar;
  const sugarChange = price.sugarPriceChange != null ? Number(price.sugarPriceChange) : (currentSugar - prevSugar);

  // Derive Molasses change
  const currentMol = Number(price.molassesPricePerMetricTon ?? price.molassesPrice ?? 0);
  const prevMol = previousPrice
    ? Number(previousPrice.molassesPricePerMetricTon ?? previousPrice.molassesPrice ?? 0)
    : currentMol;
  const molChange = price.molassesPriceChange != null ? Number(price.molassesPriceChange) : (currentMol - prevMol);

  return (
    <div className="bg-surface rounded-2xl p-5 sm:p-6 border border-border shadow-xs flex flex-col justify-between h-full">
      <div>
        {/* Card Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-hug-muted uppercase tracking-wider">
              Current Official SRA Price
            </span>
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" title="Official Published Data" />
          </div>

          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>

        {/* Dominant Raw Sugar Price */}
        <div className="pb-3 border-b border-border/60">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-3xl sm:text-4xl font-black text-primary tracking-tight">
              {formatCurrency(currentSugar)}
            </span>
            <span className="text-xs font-bold text-hug-muted uppercase">
              per 50kg Lkg
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs font-semibold text-hug-text2">
              Raw Sugar
            </span>
            {sugarChange > 0 ? (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-success-bg text-success">
                <ArrowUpRight className="w-3 h-3" />
                +₱{sugarChange.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            ) : sugarChange < 0 ? (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-danger-bg text-danger">
                <ArrowDownRight className="w-3 h-3" />
                -₱{Math.abs(sugarChange).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-subtle text-hug-muted">
                <Minus className="w-3 h-3" />
                Steady (₱0.00)
              </span>
            )}
          </div>
        </div>

        {/* Supporting Molasses Price */}
        <div className="py-3 flex items-center justify-between border-b border-border/60">
          <div>
            <span className="block text-xs font-semibold text-hug-text2">
              Industrial Molasses
            </span>
            <span className="text-lg font-bold text-hug-text tracking-tight mt-0.5 block">
              {formatCurrency(currentMol)} <span className="text-xs font-normal text-hug-muted">/ MT</span>
            </span>
          </div>

          {molChange > 0 ? (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-success-bg text-success">
              <ArrowUpRight className="w-3 h-3" />
              +₱{molChange.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          ) : molChange < 0 ? (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-danger-bg text-danger">
              <ArrowDownRight className="w-3 h-3" />
              -₱{Math.abs(molChange).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-subtle text-hug-muted">
              Steady
            </span>
          )}
        </div>

        {/* Effective Date & Circular Metadata */}
        <div className="pt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-hug-muted">
          {price.effectiveDate && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-hug-muted" />
              <span>Effective: <strong>{formatDate(price.effectiveDate)}</strong></span>
            </span>
          )}

          {(price.circularNumber || price.referenceCircular) && (
            <span className="inline-flex items-center gap-1.5 font-mono">
              <FileText className="w-3.5 h-3.5 text-hug-muted" />
              <span>{price.circularNumber || price.referenceCircular}</span>
            </span>
          )}
        </div>
      </div>

      {/* SRA Admin Action Link */}
      {showPublishAction && (
        <div className="pt-3 mt-4 border-t border-border/60 flex items-center justify-between gap-2">
          <span className="text-[11px] text-hug-muted font-medium">SRA Authority</span>
          <div className="flex items-center gap-3">
            {onPublishClick && (
              <button
                type="button"
                onClick={onPublishClick}
                className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Post Official SRA Price</span>
              </button>
            )}
            <Link
              to="/prices"
              className="text-xs font-semibold text-hug-muted hover:text-hug-text inline-flex items-center gap-1"
            >
              <span>Price Ledger &rarr;</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
