import React from 'react';

export function Radio({
  id,
  name,
  value,
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  className = ''
}) {
  const inputId = id || (name && value ? `radio-${name}-${value}` : undefined);

  return (
    <div className={`flex items-start gap-3 select-none ${className}`}>
      <div className="relative flex items-center justify-center mt-0.5">
        <input
          type="radio"
          id={inputId}
          name={name}
          value={value}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only peer"
        />

        <label
          htmlFor={inputId}
          className={`
            w-5 h-5 rounded-full border flex items-center justify-center transition-all cursor-pointer
            peer-focus:ring-2 peer-focus:ring-primary/40 peer-focus:ring-offset-1 dark:peer-focus:ring-offset-surface
            ${
              checked
                ? 'border-primary bg-white dark:bg-[#121820]'
                : 'border-border bg-white dark:bg-[#121820] hover:border-primary/60'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed bg-bg/70 dark:bg-surface/50' : ''}
          `}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full bg-primary transition-transform ${
              checked ? 'scale-100' : 'scale-0'
            }`}
          />
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
        </label>
      )}
    </div>
  );
}

export function RadioGroup({
  name,
  value,
  onChange,
  options = [],
  disabled = false,
  className = ''
}) {
  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {options.map((opt) => (
        <Radio
          key={opt.value}
          name={name}
          value={opt.value}
          checked={value === opt.value}
          onChange={() => onChange && onChange(opt.value)}
          label={opt.label}
          description={opt.description}
          disabled={disabled || opt.disabled}
        />
      ))}
    </div>
  );
}
