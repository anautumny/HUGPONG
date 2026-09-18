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

  const maxFrequency = frequencyRanking.length > 0 ? frequencyRanking[0].count : 1;

  return (
    <div className={`bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-xs ${className}`}>
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-hug-muted block">
            Agronomic Activity
          </span>
          <h2 className="text-lg sm:text-xl font-black text-hug-text mt-0.5">
            Farm Operations & Activity Log
          </h2>
          <p className="text-xs text-hug-muted mt-0.5">
            Recorded field activities and labor for the selected period.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-hug-muted bg-bg px-3 py-1.5 rounded-xl border border-border">
          <Activity className="w-3.5 h-3.5 text-primary dark:text-primary-light shrink-0" />
          <span>{frequencyRanking.length} distinct activities logged</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-5">
        <div className="bg-bg/60 dark:bg-gray-800/40 rounded-xl p-4 border border-border">
          <span className="text-[10px] uppercase font-bold text-hug-muted tracking-wider block mb-1">
            Total Logged Operations
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black text-hug-text">
              {totalOps}
            </span>
            <span className="text-xs text-hug-muted font-semibold">activities</span>
          </div>
          <span className="text-[11px] text-hug-muted mt-1 block">
            {totalGroupOps} multi-parcel group operations
          </span>
        </div>

        <div className="bg-bg/60 dark:bg-gray-800/40 rounded-xl p-4 border border-border">
          <span className="text-[10px] uppercase font-bold text-hug-muted tracking-wider block mb-1">
            Total Labor Days / Workers
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black text-primary dark:text-primary-light">
              {totalPeopleCount}
            </span>
            <span className="text-xs text-hug-muted font-semibold">person-days</span>
          </div>
          <span className="text-[11px] text-hug-muted mt-1 block">
            Recorded manual & mechanized labor
          </span>
        </div>

        <div className="bg-bg/60 dark:bg-gray-800/40 rounded-xl p-4 border border-border">
          <span className="text-[10px] uppercase font-bold text-hug-muted tracking-wider block mb-1">
            Most Frequent Activity
          </span>
          <div className="truncate">
            <span className="text-lg sm:text-xl font-extrabold text-hug-text truncate block">
              {frequencyRanking[0]?.name || '—'}
            </span>
          </div>
          <span className="text-[11px] text-hug-muted mt-1 block">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          {/* Frequency Leaderboard */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-hug-muted mb-3">
              Activity Frequency Ranking
            </h4>
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {frequencyRanking.map((act, idx) => {
                const widthPercent = Math.max(5, Math.round((act.count / maxFrequency) * 100));

                return (
                  <div
                    key={act.name}
                    className="p-3 rounded-xl border border-border bg-bg/30 hover:bg-bg/60 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-bg dark:bg-gray-800 border border-border text-[10px] font-bold flex items-center justify-center text-hug-muted">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-hug-text">
                          {act.name}
                        </span>
                      </div>

                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-black text-hug-text">
                          {act.count} <span className="text-[10px] font-normal text-hug-muted">times</span>
                        </span>
                      </div>
                    </div>

                    <div className="w-full bg-border/60 h-1.5 rounded-full overflow-hidden mb-2">
                      <div
                        className="bg-primary h-full rounded-full transition-all duration-300"
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-hug-muted">
                      <span>Total: ₱{act.totalCost.toLocaleString()}</span>
                      <span>Avg: ₱{act.avgCost.toLocaleString()} / execution</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chronological Monthly Cadence */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-hug-muted mb-3">
              Monthly Operational Cadence
            </h4>

            {chronologicalActivity.length === 0 ? (
              <p className="text-xs text-hug-muted">No monthly timeline data available.</p>
            ) : (
              <div className="space-y-3">
                {chronologicalActivity.map((month) => {
                  const [y, m] = month.period.split('-').map(Number);
                  const d = new Date(y, m - 1, 1);
                  const label = isNaN(d.getTime()) ? month.period : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

                  return (
                    <div
                      key={month.period}
                      className="p-3 rounded-xl border border-border bg-bg/30 flex items-center justify-between"
                    >
                      <div>
                        <span className="text-xs font-bold text-hug-text block">
                          {label}
                        </span>
                        <span className="text-[10px] text-hug-muted">
                          {month.count} operations performed
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-black text-primary dark:text-primary-light block">
                          ₱{month.cost.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-hug-muted">
                          total logged expense
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
