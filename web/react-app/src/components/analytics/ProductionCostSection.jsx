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
          <span className="text-[11px] font-bold uppercase tracking-wider text-hug-muted block">
            Financial Exposure
          </span>
          <h2 className="text-lg sm:text-xl font-black text-hug-text mt-0.5">
            Production Cost & Unit Investment
          </h2>
          <p className="text-xs text-hug-muted mt-0.5">
            Actual logged expenditures across {isFarmManager ? 'member parcels' : 'Block Farms'} and real cost per hectare.
          </p>
        </div>

        <div className="text-xs text-hug-muted flex items-center gap-1.5 self-start sm:self-auto bg-bg px-3 py-1.5 rounded-xl border border-border">
          <Info className="w-3.5 h-3.5 text-primary dark:text-primary-light shrink-0" />
          <span>Strictly recorded operational expenses</span>
        </div>
      </div>

      {/* KPI Trio */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-5">
        <div className="bg-bg/60 dark:bg-gray-800/40 rounded-xl p-4 border border-border">
          <span className="text-[10px] uppercase font-bold text-hug-muted tracking-wider block mb-1">
            Total Logged Expenditure
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black text-primary dark:text-primary-light">
              ₱{totalExpenditure.toLocaleString()}
            </span>
          </div>
          <span className="text-[11px] text-hug-muted mt-1 block">
            Across {operationsCount} active field operations
          </span>
        </div>

        <div className="bg-bg/60 dark:bg-gray-800/40 rounded-xl p-4 border border-border">
          <span className="text-[10px] uppercase font-bold text-hug-muted tracking-wider block mb-1">
            Tracked Operational Acreage
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black text-hug-text">
              {totalAuditedHa.toFixed(2)}
            </span>
            <span className="text-xs text-hug-muted font-bold">hectares</span>
          </div>
          <span className="text-[11px] text-hug-muted mt-1 block">
            Acreage with recorded farm activities
          </span>
        </div>

        <div className="bg-bg/60 dark:bg-gray-800/40 rounded-xl p-4 border border-border">
          <span className="text-[10px] uppercase font-bold text-hug-muted tracking-wider block mb-1">
            Average Cost per Hectare
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black text-hug-text">
              ₱{averageCostPerHa.toLocaleString()}
            </span>
            <span className="text-xs text-hug-muted font-bold">/ ha</span>
          </div>
          <span className="text-[11px] text-hug-muted mt-1 block">
            {totalAuditedHa > 0 ? 'Weighted across active acreage' : 'No active acreage recorded'}
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
            Comparative Expenditure by {isFarmManager ? 'Member Parcel' : 'Block Farm'}
          </h4>

          {breakdownByEntity.map((entity) => {
            const widthPercent = totalExpenditure > 0
              ? Math.max(2, Math.round((entity.totalCost / maxEntityCost) * 100))
              : 0;

            return (
              <div
                key={entity.id}
                className="p-3.5 rounded-xl border border-border bg-bg/30 hover:bg-bg/60 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-hug-text">
                      {entity.name}
                    </span>
                    <span className="text-[10px] font-mono text-hug-muted px-1.5 py-0.5 rounded bg-bg dark:bg-gray-800 border border-border">
                      {entity.opsCount} ops
                    </span>
                  </div>

                  <div className="flex items-baseline gap-3 text-xs">
                    <div className="text-right">
                      <span className="font-black text-primary dark:text-primary-light">
                        ₱{entity.totalCost.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-hug-muted ml-1 font-medium">total</span>
                    </div>

                    <div className="text-right border-l border-border pl-3">
                      <span className="font-bold text-hug-text">
                        ₱{entity.costPerHa.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-hug-muted ml-1">/ ha</span>
                    </div>

                    <div className="text-right border-l border-border pl-3">
                      <span className="font-semibold text-hug-muted">
                        {entity.areaHa > 0 ? `${entity.areaHa.toFixed(2)} ha` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Comparative Horizontal Bar Meter */}
                <div className="w-full bg-gray-200 dark:bg-gray-700/60 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-primary dark:bg-primary-light h-full rounded-full transition-all duration-300"
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
