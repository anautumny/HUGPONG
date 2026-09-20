import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

const Select = forwardRef(function Select(
  {
    id,
    name,
    value,
    defaultValue,
    onChange,
    onBlur,
    options = [],
    placeholder,
    disabled = false,
    required = false,
    error,
    className = '',
    children,
    ...props
  },
  ref
) {
  return (
    <div className="relative flex items-center w-full min-w-0">
      <select
        ref={ref}
        id={id}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`
          w-full min-w-0 truncate rounded-xl border text-sm transition-colors appearance-none
          bg-white dark:bg-[#121820] text-hug-text
          outline-none
          py-2.5 pl-3.5 pr-10
          cursor-pointer
          ${
            error
              ? 'border-danger focus:border-danger focus:ring-1 focus:ring-danger'
              : 'border-border focus:border-primary focus:ring-1 focus:ring-primary'
          }
          ${disabled ? 'opacity-50 bg-bg/70 dark:bg-surface/50 cursor-not-allowed' : ''}
          ${className}
        `}
        {...props}
      >
        {placeholder && (
          <option value="" disabled className="text-hug-muted bg-white dark:bg-[#121820]">
            {placeholder}
          </option>
        )}

        {options.length > 0
          ? options.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className="bg-white dark:bg-[#121820] text-hug-text py-1"
              >
                {opt.label}
              </option>
            ))
          : children}
      </select>

      <div className="absolute right-3.5 pointer-events-none text-hug-muted">
        <ChevronDown className="w-4 h-4" />
      </div>
    </div>
  );
});

export default Select;
