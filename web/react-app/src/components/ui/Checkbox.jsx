import React from 'react';
import { Check } from 'lucide-react';

export default function Checkbox({
  id,
  name,
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  error,
  className = ''
}) {
  const inputId = id || (name ? `checkbox-${name}` : undefined);

  return (
    <div className={`flex items-start gap-3 select-none ${className}`}>
      <div className="relative flex items-center justify-center mt-0.5">
        <input
          type="checkbox"
          id={inputId}
          name={name}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className="sr-only peer"
        />

        <label
          htmlFor={inputId}
          className={`
            w-5 h-5 rounded-lg border flex items-center justify-center transition-all cursor-pointer
            peer-focus:ring-2 peer-focus:ring-primary/40 peer-focus:ring-offset-1 dark:peer-focus:ring-offset-surface
            ${
              checked
                ? 'bg-primary border-primary text-white'
                : 'bg-white dark:bg-[#121820] border-border text-transparent hover:border-primary/60'
            }
            ${
              error
                ? 'border-danger peer-focus:ring-danger'
                : ''
            }
            ${disabled ? 'opacity-50 cursor-not-allowed bg-bg/70 dark:bg-surface/50' : ''}
          `}
        >
          <Check className={`w-3.5 h-3.5 stroke-[3] transition-transform ${checked ? 'scale-100' : 'scale-0'}`} />
        </label>
      </div>

      {(label || description) && (
        <label htmlFor={inputId} className="cursor-pointer flex flex-col">
          {label && (
            <span className="text-xs sm:text-sm font-semibold text-hug-text">
              {label}
            </span>
          )}
          {description && (
            <span className="text-xs text-hug-muted mt-0.5 leading-relaxed">
              {description}
            </span>
          )}
          {error && (
            <span className="text-xs font-semibold text-danger mt-1">
              {error}
            </span>
          )}
        </label>
      )}
    </div>
  );
}
