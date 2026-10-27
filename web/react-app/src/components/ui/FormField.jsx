import React from 'react';
import { AlertCircle } from 'lucide-react';

export default function FormField({
  id,
  label,
  required = false,
  badge,
  helperText,
  error,
  children,
  className = ''
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {(label || badge) && (
        <div className="flex items-center justify-between">
          {label && (
            <label
              htmlFor={id}
              className="text-xs sm:text-sm font-semibold text-hug-text2 select-none"
            >
              {label}
              {required && (
                <span
                  className="text-rose-600/70 dark:text-rose-400/70 ml-0.5 text-xs font-normal select-none"
                  aria-hidden="true"
                >
                  *
                </span>
              )}
            </label>
          )}

          {badge && (
            <span className="text-[10px] font-bold text-primary dark:text-primary-light bg-primary-bg dark:bg-primary/20 px-2 py-0.5 rounded tracking-wide">
              {badge}
            </span>
          )}
        </div>
      )}

      {React.isValidElement(children) && error && !children.props.error
        ? React.cloneElement(children, { error: children.props.error || error })
        : children}

      {error ? (
        <p
          id={id ? `${id}-error` : undefined}
          className="text-xs font-semibold text-danger flex items-center gap-1.5 mt-0.5"
          role="alert"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p
          id={id ? `${id}-helper` : undefined}
          className="text-xs text-hug-muted mt-0.5"
        >
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
