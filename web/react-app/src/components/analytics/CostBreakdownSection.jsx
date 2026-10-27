import React from 'react';
import { PieChart, Tag, ArrowRight, Layers, Percent } from 'lucide-react';

export default function CostBreakdownSection({
  breakdownData = null,
  isLoading = false,
  className = ''
}) {
  if (isLoading) {
    return (
      <div className={`bg-surface rounded-2xl border border-border p-6 shadow-xs animate-pulse ${className}`}>
        <div className="h-5 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-full mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 dark:bg-gray-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const {
    grandTotalCost = 0,
    totalOpsCount = 0,
    categories = [],
    sortedCategories = [],
    topCategory = null
  } = breakdownData || {};

  return (
    <div className={`bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-xs ${className}`}>
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block mb-1">
            Operational Expenses
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-hug-text">
            Operational Cost Breakdown
          </h2>
          <p className="text-xs sm:text-sm text-hug-muted mt-0.5">
            Distribution of logged expenditures across canonical sugarcane operational stages.
          </p>
        </div>

        {topCategory && (
          <div className="flex items-center gap-2 bg-amber-500/10 dark:bg-amber-500/15 px-3.5 py-2 rounded-xl border border-amber-500/30 text-xs sm:text-sm shadow-2xs">
            <span className="text-amber-800 dark:text-amber-300 font-bold">Primary Driver:</span>
            <span className="font-black text-amber-900 dark:text-amber-200">
              {topCategory.label} ({topCategory.percentOfTotal}%)
            </span>
          </div>
        )}
      </div>

      {grandTotalCost === 0 ? (
        <div className="py-10 text-center text-hug-muted text-xs">
          <PieChart className="w-8 h-8 mx-auto text-hug-muted/50 mb-2" />
          <p className="font-semibold text-hug-text text-sm">No operation expenses recorded</p>
          <p className="text-xs text-hug-muted mt-0.5">
            Category expenditures will appear here once operations with costs are logged.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {/* Stacked Proportional Bar Track */}
          <div>
            <div className="flex items-center justify-between text-xs text-hug-muted mb-2">
              <span className="font-bold uppercase tracking-wider text-xs">
                Expenditure Share Progression
              </span>
              <span className="font-black text-amber-900 dark:text-amber-200 text-sm sm:text-base">
                ₱{grandTotalCost.toLocaleString()} <span className="text-xs font-semibold text-hug-muted">total logged</span>
              </span>
            </div>

            <div className="w-full h-4.5 rounded-xl overflow-hidden flex bg-border/40 dark:bg-gray-800 p-0.5 gap-1 border border-border/70 shadow-2xs">
              {categories.map((cat) => {
                if (cat.percentOfTotal <= 0) return null;
                return (
                  <div
                    key={cat.key}
                    style={{
                      width: `${cat.percentOfTotal}%`,
                      backgroundColor: cat.color
                    }}
                    className="h-full rounded-md transition-all duration-300 relative group shadow-2xs hover:brightness-110"
                    title={`${cat.label}: ₱${cat.totalCost.toLocaleString()} (${cat.percentOfTotal}%)`}
                  />
                );
              })}
            </div>
          </div>

          {/* 6 Canonical Category Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categories.map((cat) => {
              const avgCost = cat.opsCount > 0 ? Math.round(cat.totalCost / cat.opsCount) : 0;
              const isZero = cat.totalCost === 0;

              return (
                <div
                  key={cat.key}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                    isZero
                      ? 'border-border/60 bg-surface-subtle/30 opacity-70'
                      : 'border-border bg-surface shadow-xs hover:border-amber-500/60 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs ring-2 ring-surface"
                        style={{ backgroundColor: cat.color }}
                      />
                      <h4 className="text-sm sm:text-base font-black text-hug-text">
                        {cat.label}
                      </h4>
                    </div>

                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-surface-subtle border border-border text-hug-muted">
                      {cat.opsCount} ops
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-3 pt-2.5 border-t border-border/60">
                    <div>
                      <span className="text-lg sm:text-xl font-black text-hug-text">
                        ₱{cat.totalCost.toLocaleString()}
                      </span>
                      <span className="block text-xs sm:text-sm text-hug-muted mt-0.5 font-medium">
                        {cat.opsCount > 0 ? `avg ₱${avgCost.toLocaleString()} / op` : 'No logs'}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className={`text-base sm:text-lg font-black ${isZero ? 'text-hug-muted' : 'text-amber-800 dark:text-amber-300'}`}>
                        {cat.percentOfTotal}%
                      </span>
                      <span className="block text-xs text-hug-muted uppercase font-bold tracking-wider">
                        of total
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
