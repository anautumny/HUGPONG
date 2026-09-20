import React from 'react';
import Button from '../ui/Button';

export default function CompactDashboardHeader({
  category,
  badge,
  title,
  subtitle,
  contextText,
  actions = []
}) {
  const desc = subtitle || contextText;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        {(category || badge) && (
          <div className="flex items-center gap-2">
            {category && (
              <span className="text-xs font-bold text-primary dark:text-primary-light uppercase tracking-wider">
                {category}
              </span>
            )}
            {badge && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
                {badge}
              </span>
            )}
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
          {title}
        </h1>
        {desc && (
          <p className="text-xs sm:text-sm text-hug-muted mt-1 max-w-2xl">
            {desc}
          </p>
        )}
      </div>

      {actions.length > 0 && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {actions.map((act, idx) => {
            const Icon = act.icon;
            const variant = act.variant || 'primary';

            return (
              <Button
                key={idx}
                to={act.to}
                variant={variant}
                size="md"
                onClick={act.onClick}
                icon={Icon}
                className={act.className}
              >
                {act.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
