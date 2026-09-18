import React, { forwardRef } from 'react';

const Textarea = forwardRef(function Textarea(
  {
    id,
    name,
    value,
    defaultValue,
    onChange,
    onBlur,
    placeholder,
    rows = 3,
    maxLength,
    disabled = false,
    readOnly = false,
    required = false,
    error,
    className = '',
    showCount = false,
    ...props
  },
  ref
) {
  const currentLength = typeof value === 'string' ? value.length : 0;

  return (
    <div className="w-full flex flex-col gap-1">
      <textarea
        ref={ref}
        id={id}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`
          w-full rounded-xl border text-sm transition-colors
          bg-white dark:bg-[#121820] text-hug-text
          placeholder:text-hug-muted/70
          outline-none
          p-3
          ${
            error
              ? 'border-danger focus:border-danger focus:ring-1 focus:ring-danger'
              : 'border-border focus:border-primary focus:ring-1 focus:ring-primary'
          }
          ${disabled ? 'opacity-50 bg-bg/70 dark:bg-surface/50 cursor-not-allowed' : ''}
          ${className}
        `}
        {...props}
      />

      {showCount && maxLength && (
        <div className="text-right text-[11px] text-hug-muted font-mono">
          {currentLength} / {maxLength}
        </div>
      )}
    </div>
  );
});

export default Textarea;
