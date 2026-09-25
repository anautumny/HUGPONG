import React from 'react';

export default function MetricSummaryRow({
  metrics = [],
  isLoading = false
}) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-surface rounded-2xl p-5 border border-border shadow-xs">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-7 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-3 w-16 bg-gray-200 dark:bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!metrics || metrics.length === 0) return null;

  return (
    <div className="bg-white dark:bg-surface rounded-2xl border border-border shadow-xs overflow-hidden">
      <div className={`grid grid-cols-2 lg:grid-cols-${Math.min(metrics.length, 4)} divide-y sm:divide-y-0 sm:divide-x divide-border/70`}>
        {metrics.map((m, idx) => {
          const Icon = m.icon;
          return (
            <div key={idx} className="p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-hug-muted uppercase tracking-wider">
                  {m.label}
                </span>
                {Icon && (
                  <span className="text-hug-muted w-4 h-4 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2">
                <span className={`text-2xl sm:text-3xl font-black tracking-tight ${
                  m.tone === 'danger'
                    ? 'text-danger'
                    : m.tone === 'warning' || m.alert
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-hug-text'
                }`}>
                  {m.value}
                </span>
                {m.unit && (
                  <span className="text-xs font-semibold text-hug-muted">
                    {m.unit}
                  </span>
                )}
              </div>

              {m.subtext && (
                <p className="text-xs text-hug-muted mt-1 font-medium truncate">
                  {m.subtext}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
