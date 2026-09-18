import React, { forwardRef } from 'react';

const Input = forwardRef(function Input(
  {
    type = 'text',
    id,
    name,
    value,
    defaultValue,
    onChange,
    onBlur,
    onFocus,
    placeholder,
    disabled = false,
    readOnly = false,
    required = false,
    error,
    prefix,
    suffix,
    icon: Icon,
    iconPosition = 'left',
    className = '',
    autoComplete,
    min,
    max,
    step,
    ...props
  },
  ref
) {
  const hasLeft = prefix || (Icon && iconPosition === 'left');
  const hasRight = suffix || (Icon && iconPosition === 'right');

  return (
    <div className="relative flex items-center w-full">
      {hasLeft && (
        <div className="absolute left-3.5 flex items-center pointer-events-none text-hug-muted text-xs sm:text-sm font-bold">
          {prefix ? (
            <span>{prefix}</span>
          ) : Icon && iconPosition === 'left' ? (
            <Icon className="w-4 h-4" />
          ) : null}
        </div>
      )}

      <input
        ref={ref}
        type={type}
        id={id}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        autoComplete={autoComplete}
        min={min}
        max={max}
        step={step}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error ? `${id}-error` : id ? `${id}-helper` : undefined
        }
        className={`
          w-full rounded-xl border text-sm transition-colors
          bg-white dark:bg-[#121820] text-hug-text
          placeholder:text-hug-muted/70
          outline-none
          py-2.5
          ${hasLeft ? 'pl-9 sm:pl-10' : 'pl-3.5'}
          ${hasRight ? 'pr-9 sm:pr-10' : 'pr-3.5'}
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

      {hasRight && (
        <div className="absolute right-3.5 flex items-center pointer-events-none text-hug-muted text-xs sm:text-sm font-semibold">
          {suffix ? (
            <span>{suffix}</span>
          ) : Icon && iconPosition === 'right' ? (
            <Icon className="w-4 h-4" />
          ) : null}
        </div>
      )}
    </div>
  );
});

export default Input;
