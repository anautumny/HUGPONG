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
          <span className="text-[11px] font-bold uppercase tracking-wider text-hug-muted block">
            Operational Expenses
          </span>
          <h2 className="text-lg sm:text-xl font-black text-hug-text mt-0.5">
            Operational Cost Breakdown
          </h2>
          <p className="text-xs text-hug-muted mt-0.5">
            Distribution of logged expenditures across canonical sugarcane operational stages.
          </p>
        </div>

        {topCategory && (
          <div className="flex items-center gap-2 bg-bg px-3 py-1.5 rounded-xl border border-border text-xs">
            <span className="text-hug-muted font-medium">Primary Driver:</span>
            <span className="font-bold text-hug-text">
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
            <div className="flex items-center justify-between text-xs text-hug-muted mb-1.5">
              <span className="font-bold uppercase tracking-wider text-[10px]">
                Expenditure Share Progression
              </span>
              <span className="font-semibold text-hug-text">
                ₱{grandTotalCost.toLocaleString()} total logged
              </span>
            </div>

            <div className="w-full h-4 rounded-full overflow-hidden flex bg-gray-200 dark:bg-gray-800 p-0.5 gap-0.5">
              {categories.map((cat) => {
                if (cat.percentOfTotal <= 0) return null;
                return (
                  <div
                    key={cat.key}
                    style={{
                      width: `${cat.percentOfTotal}%`,
                      backgroundColor: cat.color
                    }}
                    className="h-full rounded-sm transition-all duration-300 relative group"
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
                  className={`p-3.5 rounded-xl border border-border transition-colors flex flex-col justify-between ${
                    isZero
                      ? 'bg-bg/20 opacity-60'
                      : 'bg-bg/40 hover:bg-bg/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <h4 className="text-xs font-bold text-hug-text">
                        {cat.label}
                      </h4>
                    </div>

                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-bg border border-border text-hug-muted">
                      {cat.opsCount} ops
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-border/50">
                    <div>
                      <span className="text-sm font-bold text-hug-text">
                        ₱{cat.totalCost.toLocaleString()}
                      </span>
                      <span className="block text-[10px] text-hug-muted">
                        {cat.opsCount > 0 ? `avg ₱${avgCost.toLocaleString()} / op` : 'No logs'}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className={`text-xs font-bold ${isZero ? 'text-hug-muted' : 'text-primary dark:text-primary-light'}`}>
                        {cat.percentOfTotal}%
                      </span>
                      <span className="block text-[9px] text-hug-muted uppercase tracking-wider">
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
