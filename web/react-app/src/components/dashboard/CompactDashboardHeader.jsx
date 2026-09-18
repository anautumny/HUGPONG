import React from 'react';
import { Link } from 'react-router-dom';

export default function CompactDashboardHeader({
  title,
  contextText,
  actions = []
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/80">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-hug-text tracking-tight">
          {title}
        </h1>
        {contextText && (
          <p className="text-xs sm:text-sm text-hug-muted mt-0.5 font-medium">
            {contextText}
          </p>
        )}
      </div>

      {actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((act, idx) => {
            const Icon = act.icon;
            const btnClasses = `px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-2 cursor-pointer bg-surface dark:bg-surface-elevated border border-border hover:border-border-strong hover:bg-surface-subtle active:scale-[0.98] text-hug-text hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary select-none ${act.className || ''}`;

            if (act.to) {
              return (
                <Link
                  key={idx}
                  to={act.to}
                  className={btnClasses}
                >
                  {Icon && <Icon className="w-3.5 h-3.5 text-hug-muted shrink-0" />}
                  <span>{act.label}</span>
                </Link>
              );
            }
            return (
              <button
                key={idx}
                type="button"
                onClick={act.onClick}
                className={btnClasses}
              >
                {Icon && <Icon className="w-3.5 h-3.5 text-hug-muted shrink-0" />}
                <span>{act.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
