import React from 'react';
import { Activity, Users, Layers, Calendar, ArrowUpRight, TrendingUp } from 'lucide-react';

export default function FarmOperationsSection({
  operationsData = null,
  isLoading = false,
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
      </div>
    );
  }

  const {
    totalOps = 0,
    totalPeopleCount = 0,
    totalGroupOps = 0,
    frequencyRanking = [],
    chronologicalActivity = []
  } = operationsData || {};

  return (
    <div className={`bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-xs ${className}`}>
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block mb-1">
            Agronomic Activity
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-hug-text">
            Farm Operations & Activity Log
          </h2>
          <p className="text-xs sm:text-sm text-hug-muted mt-0.5">
            Recorded field activities and labor for the selected period.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs sm:text-sm text-hug-muted bg-surface-subtle px-3.5 py-1.5 rounded-xl border border-border">
          <Activity className="w-4 h-4 text-primary dark:text-primary-light shrink-0" />
          <span>{frequencyRanking.length} distinct activities logged</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-5">
        <div className="bg-surface rounded-2xl p-5 border border-border shadow-xs">
          <span className="text-xs uppercase font-bold text-hug-muted tracking-wider block mb-1">
            Total Logged Operations
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-hug-text">
              {totalOps}
            </span>
            <span className="text-sm text-hug-muted font-bold">activities</span>
          </div>
          <span className="text-xs text-hug-muted mt-1.5 block font-medium">
            {totalGroupOps} multi-plot group operations
          </span>
        </div>

        <div className="bg-primary-bg/25 dark:bg-primary/10 rounded-2xl p-5 border border-primary/20 shadow-xs">
          <span className="text-xs uppercase font-bold text-primary dark:text-primary-light tracking-wider block mb-1">
            Total Labor Days / Workers
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-primary dark:text-primary-light">
              {totalPeopleCount}
            </span>
            <span className="text-sm text-primary/80 dark:text-primary-light/80 font-bold">person-days</span>
          </div>
          <span className="text-xs text-hug-muted mt-1.5 block font-medium">
            Recorded manual & mechanized labor
          </span>
        </div>

        <div className="bg-amber-500/10 dark:bg-amber-500/15 rounded-2xl p-5 border border-amber-500/30 shadow-xs">
          <span className="text-xs uppercase font-bold text-amber-800 dark:text-amber-300 tracking-wider block mb-1">
            Most Frequent Activity
          </span>
          <div className="truncate">
            <span className="text-lg sm:text-xl font-black text-amber-900 dark:text-amber-200 truncate block">
              {frequencyRanking[0]?.name || '—'}
            </span>
          </div>
          <span className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1.5 block font-medium">
            {frequencyRanking[0] ? `${frequencyRanking[0].count} executions logged` : 'No activities logged'}
          </span>
        </div>
      </div>

      {totalOps === 0 ? (
        <div className="py-8 text-center text-hug-muted text-xs">
          <Activity className="w-8 h-8 mx-auto text-hug-muted/50 mb-2" />
          <p className="font-semibold text-hug-text text-sm">No operations recorded</p>
          <p className="text-xs text-hug-muted mt-0.5">
            Operational activity rankings will appear once field activities are submitted.
          </p>
        </div>
      ) : (
        <div className="space-y-6 mt-5">
          {/* 1. Activity Frequency Ranking */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-hug-muted">
                Activity Frequency Ranking
              </h4>
              <span className="text-xs text-hug-muted font-medium">
                {frequencyRanking.length} distinct {frequencyRanking.length === 1 ? 'activity' : 'activities'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {frequencyRanking.map((act, idx) => {
                const sharePct = totalOps > 0 ? Math.round((act.count / totalOps) * 100) : 0;

                return (
                  <div
                    key={act.name}
                    className="p-4 rounded-2xl border border-amber-500/35 hover:border-amber-500/60 bg-surface transition-all flex flex-col justify-between shadow-xs hover:shadow-sm"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2.5 mb-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-full text-xs font-black flex items-center justify-center shrink-0 bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-black text-hug-text truncate" title={act.name}>
                            {act.name}
                          </span>
                        </div>

                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black shrink-0 whitespace-nowrap bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/30">
                          {act.count} <span className="text-[11px] font-semibold text-amber-800/80 dark:text-amber-300/80">{act.count === 1 ? 'pass' : 'passes'}</span>
                          {sharePct > 0 && <span className="opacity-80 font-bold">· {sharePct}%</span>}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-hug-muted pt-3 border-t border-border/60 font-medium mt-1">
                      <span>Total: <strong className="text-sm font-black text-hug-text">₱{act.totalCost.toLocaleString()}</strong></span>
                      <span>Avg: <strong className="text-xs sm:text-sm font-black text-amber-800 dark:text-amber-300">₱{act.avgCost.toLocaleString()}</strong> / op</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Monthly Operational Cadence */}
          {chronologicalActivity.length > 0 && (
            <div className="pt-5 border-t border-border/70">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-hug-muted">
                  Monthly Operational Cadence &amp; Timeline
                </h4>
                <span className="text-xs text-hug-muted font-medium">
                  {chronologicalActivity.length} reporting {chronologicalActivity.length === 1 ? 'period' : 'periods'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                {chronologicalActivity.map((month) => {
                  const [y, m] = month.period.split('-').map(Number);
                  const d = new Date(y, m - 1, 1);
                  const label = isNaN(d.getTime()) ? month.period : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

                  return (
                    <div
                      key={month.period}
                      className="p-4 rounded-2xl border border-border bg-surface hover:border-amber-500/40 shadow-xs flex items-center justify-between gap-3 transition-all"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                          <span className="text-sm sm:text-base font-black text-hug-text truncate">
                            {label}
                          </span>
                        </div>
                        <span className="text-xs text-hug-muted block font-medium">
                          {month.count} operation{month.count === 1 ? '' : 's'} performed
                        </span>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-base sm:text-lg font-black text-amber-900 dark:text-amber-200 block">
                          ₱{month.cost.toLocaleString()}
                        </span>
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                          logged expense
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
