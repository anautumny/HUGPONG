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
      description: 'Clean high-contrast daytime interface',
      icon: Sun
    },
    {
      id: 'dark',
      label: 'Dark Mode',
      description: 'Sleek low-light night interface',
      icon: Moon
    },
    {
      id: 'system',
      label: 'System Preference',
      description: 'Automatically follows your operating system theme',
      icon: Monitor
    }
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h3 className="text-base font-bold text-hug-text">
          Appearance & Display Theme
        </h3>
        <p className="text-xs text-hug-muted mt-0.5">
          Select your visual theme preference. Stored locally on this client device.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl pt-1">
        {themes.map((t) => {
          const Icon = t.icon;
          const isSelected = theme === t.id;

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                isSelected
                  ? 'border-primary bg-primary-bg/20 dark:bg-primary/10 ring-2 ring-primary/20 shadow-xs'
                  : 'border-border bg-bg/40 dark:bg-gray-800/40 hover:border-primary/40 hover:bg-bg'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isSelected
                    ? 'bg-primary text-white'
                    : 'bg-bg dark:bg-gray-700 text-hug-muted'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>

                {isSelected && (
                  <span className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold text-hug-text">
                  {t.label}
                </h4>
                <p className="text-[11px] text-hug-muted mt-0.5 leading-snug">
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
