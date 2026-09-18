import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, ArrowRight } from 'lucide-react';

export default function AttentionItemsCard({
  title = 'Attention Required',
  items = [],
  isLoading = false,
  emptyTitle = 'All systems normal',
  emptyDescription = 'No immediate action items or operational alerts requiring your attention.'
}) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-surface rounded-2xl p-5 border border-border shadow-xs animate-pulse">
        <div className="h-4 w-36 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-14 bg-gray-100 dark:bg-gray-800/50 rounded-xl" />
          <div className="h-14 bg-gray-100 dark:bg-gray-800/50 rounded-xl" />
        </div>
      </div>
    );
  }

  const hasItems = items && items.length > 0;

  if (!hasItems) {
    return (
      <div className="bg-surface border border-border/80 rounded-xl px-4 py-3 shadow-xs flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-5 h-5 rounded-full bg-primary/10 text-primary dark:text-primary-light flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-hug-text truncate">{emptyTitle}</span>
          <span className="text-hug-muted hidden sm:inline truncate">— {emptyDescription}</span>
        </div>
        <span className="text-[11px] font-medium text-hug-muted uppercase tracking-wider shrink-0">Normal</span>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-xs overflow-hidden">
      <div className="p-4 sm:p-5 pb-3 border-b border-border/70 flex items-center justify-between">
        <h2 className="text-xs sm:text-sm font-bold text-hug-text uppercase tracking-wider flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500" />
          <span>{title}</span>
        </h2>
        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/40">
          {items.length} {items.length === 1 ? 'Action' : 'Actions'}
        </span>
      </div>

      <div className="divide-y divide-border/60">
        {items.map((item, idx) => {
          const isWarning = item.type === 'warning';
          const isDanger = item.type === 'danger';
          const Icon = isDanger ? AlertTriangle : isWarning ? AlertCircle : Info;

          return (
            <div
              key={item.id || idx}
              className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-bg/40 dark:hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    isDanger
                      ? 'bg-danger-bg dark:bg-danger/20 text-danger'
                      : isWarning
                      ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400'
                      : 'bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs sm:text-sm font-bold text-hug-text">
                      {item.title}
                    </p>
                    {item.badge && (
                      <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-bg text-hug-muted border border-border">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-hug-muted mt-0.5 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>

              {item.to && (
                <Link
                  to={item.to}
                  className="self-end sm:self-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border hover:bg-bg text-hug-text inline-flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer transition-colors"
                >
                  <span>{item.actionLabel || 'Review'}</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              )}
              {item.onClick && !item.to && (
                <button
                  type="button"
                  onClick={item.onClick}
                  className="self-end sm:self-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border hover:bg-bg text-hug-text inline-flex items-center gap-1 shadow-2xs shrink-0 cursor-pointer transition-colors"
                >
                  <span>{item.actionLabel || 'Review'}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
