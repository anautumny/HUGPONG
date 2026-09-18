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
            if (act.to) {
              return (
                <Link
                  key={idx}
                  to={act.to}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer ${
                    act.primary
                      ? 'bg-primary hover:bg-primary-dark text-white'
                      : act.accent
                      ? 'bg-accent hover:brightness-105 text-hug-text'
                      : 'bg-surface border border-border hover:bg-bg text-hug-text'
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  <span>{act.label}</span>
                </Link>
              );
            }
            return (
              <button
                key={idx}
                type="button"
                onClick={act.onClick}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer ${
                  act.primary
                    ? 'bg-primary hover:bg-primary-dark text-white'
                    : act.accent
                    ? 'bg-accent hover:brightness-105 text-hug-text'
                    : 'bg-surface border border-border hover:bg-bg text-hug-text'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                <span>{act.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
