import React from 'react';
import { DollarSign, MapPin, Layers, TrendingUp, Info } from 'lucide-react';

export default function ProductionCostSection({
  costData = null,
  isLoading = false,
  isFarmManager = false,
  className = ''
}) {
  if (isLoading) {
    return (
      <div className={`bg-surface rounded-2xl border border-border p-6 shadow-xs animate-pulse ${className}`}>
        <div className="h-5 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded-xl" />
          <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded-xl" />
          <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        </div>
        <div className="space-y-3">
          <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg" />
          <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg" />
        </div>
      </div>
    );
  }

  const {
    totalExpenditure = 0,
    totalAuditedHa = 0,
    averageCostPerHa = 0,
    breakdownByEntity = [],
    operationsCount = 0
  } = costData || {};

  const maxEntityCost = breakdownByEntity.length > 0
    ? Math.max(...breakdownByEntity.map(e => e.totalCost), 1)
    : 1;

  return (
    <div className={`bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-xs ${className}`}>
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block mb-1">
            Financial Exposure
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-hug-text">
            Production Cost & Unit Investment
          </h2>
          <p className="text-xs sm:text-sm text-hug-muted mt-0.5">
            Actual logged expenditures across {isFarmManager ? 'member plots' : 'Block Farms'} and real cost per hectare.
          </p>
        </div>

        <div className="text-xs sm:text-sm text-hug-muted flex items-center gap-1.5 self-start sm:self-auto bg-surface-subtle px-3.5 py-1.5 rounded-xl border border-border">
          <Info className="w-4 h-4 text-primary dark:text-primary-light shrink-0" />
          <span>Strictly recorded operational expenses</span>
        </div>
      </div>

      {/* KPI Trio */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-5">
        <div className="bg-amber-500/10 dark:bg-amber-500/15 rounded-2xl p-5 border border-amber-500/30 shadow-xs">
          <span className="text-xs uppercase font-bold text-amber-800 dark:text-amber-300 tracking-wider block mb-1">
            Total Logged Expenditure
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black text-amber-900 dark:text-amber-200">
              ₱{totalExpenditure.toLocaleString()}
            </span>
          </div>
          <span className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1.5 block font-medium">
            Across {operationsCount} active field operations
          </span>
        </div>

        <div className="bg-surface rounded-2xl p-5 border border-border shadow-xs">
          <span className="text-xs uppercase font-bold text-hug-muted tracking-wider block mb-1">
            Tracked Operational Hectares
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-hug-text">
              {totalAuditedHa.toFixed(2)}
            </span>
            <span className="text-sm text-hug-muted font-bold">hectares</span>
          </div>
          <span className="text-xs text-hug-muted mt-1.5 block font-medium">
            Hectares with recorded farm activities
          </span>
        </div>

        <div className="bg-primary-bg/25 dark:bg-primary/10 rounded-2xl p-5 border border-primary/20 shadow-xs">
          <span className="text-xs uppercase font-bold text-primary dark:text-primary-light tracking-wider block mb-1">
            Average Cost per Hectare
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-primary dark:text-primary-light">
              ₱{averageCostPerHa.toLocaleString()}
            </span>
            <span className="text-sm text-primary/80 dark:text-primary-light/80 font-bold">/ ha</span>
          </div>
          <span className="text-xs text-hug-muted mt-1.5 block font-medium">
            {totalAuditedHa > 0 ? 'Weighted across active hectares' : 'No active hectares recorded'}
          </span>
        </div>
      </div>

      {/* Comparative Horizontal Meters */}
      {breakdownByEntity.length === 0 ? (
        <div className="py-8 text-center text-hug-muted text-xs">
          <DollarSign className="w-8 h-8 mx-auto text-hug-muted/50 mb-2" />
          <p className="font-semibold text-hug-text text-sm">No production costs recorded</p>
          <p className="text-xs text-hug-muted mt-0.5">
            No operation expenses have been logged for the selected scope.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-hug-muted mb-2">
            Comparative Expenditure by {isFarmManager ? 'Farm Member Field' : 'Block Farm'}
          </h4>

          {breakdownByEntity.map((entity) => {
            const widthPercent = totalExpenditure > 0
              ? Math.max(2, Math.round((entity.totalCost / maxEntityCost) * 100))
              : 0;

            return (
              <div
                key={entity.id}
                className="p-4 rounded-2xl border border-border bg-surface hover:border-amber-500/40 shadow-xs transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm sm:text-base font-black text-hug-text">
                      {entity.name}
                    </span>
                    <span className="text-xs font-bold text-hug-muted px-2.5 py-0.5 rounded-lg bg-surface-subtle border border-border">
                      {entity.opsCount} ops
                    </span>
                  </div>

                  <div className="flex items-baseline gap-3 text-xs sm:text-sm">
                    <div className="text-right">
                      <span className="font-black text-amber-900 dark:text-amber-200 text-sm sm:text-base">
                        ₱{entity.totalCost.toLocaleString()}
                      </span>
                      <span className="text-xs text-amber-700 dark:text-amber-400 ml-1 font-bold uppercase tracking-wider">total</span>
                    </div>

                    <div className="text-right border-l border-border pl-3">
                      <span className="font-black text-hug-text">
                        ₱{entity.costPerHa.toLocaleString()}
                      </span>
                      <span className="text-xs text-hug-muted ml-1 font-medium">/ ha</span>
                    </div>

                    <div className="text-right border-l border-border pl-3">
                      <span className="font-bold text-hug-muted">
                        {entity.areaHa > 0 ? `${entity.areaHa.toFixed(2)} ha` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Comparative Horizontal Bar Meter */}
                <div className="w-full bg-border/60 dark:bg-gray-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-600 via-primary to-amber-500 h-full rounded-full transition-all duration-300 shadow-2xs"
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
