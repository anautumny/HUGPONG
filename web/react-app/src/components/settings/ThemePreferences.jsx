import React from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function ThemePreferences({
  className = ''
}) {
  const { theme, setTheme } = useTheme();

  const themes = [
    {
      id: 'light',
      label: 'Light Mode',
      description: 'Daytime interface',
      icon: Sun
    },
    {
      id: 'dark',
      label: 'Dark Mode',
      description: 'Low-light night',
      icon: Moon
    },
    {
      id: 'system',
      label: 'System Preference',
      description: 'Follow OS theme',
      icon: Monitor
    }
  ];

  return (
    <div className={`space-y-3.5 ${className}`}>
      <div className="flex items-center justify-between pb-1 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Sun className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-hug-text leading-tight">
              Appearance &amp; Display Theme
            </h3>
            <p className="text-[11px] text-hug-muted leading-tight">
              Interface style stored on this device
            </p>
          </div>
        </div>
      </div>

      {/* 3 Theme Options */}
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5 pt-0.5">
        {themes.map((t) => {
          const Icon = t.icon;
          const isSelected = theme === t.id;

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                isSelected
                  ? 'border-primary/80 bg-primary-bg/50 dark:bg-primary/20 ring-1 ring-primary/40 shadow-2xs'
                  : 'border-border bg-surface-subtle/40 dark:bg-surface-elevated/20 hover:border-border-strong hover:bg-surface-subtle/80'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  isSelected
                    ? 'bg-primary text-white shadow-2xs'
                    : 'bg-surface dark:bg-surface-elevated text-hug-muted border border-border/60'
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>

                {isSelected && (
                  <span className="w-3.5 h-3.5 rounded-full bg-primary text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold text-hug-text leading-tight">
                  {t.label}
                </h4>
                <p className="text-[10px] text-hug-muted mt-0.5 leading-tight truncate">
                  {t.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
