import React, { useState, forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const PasswordInput = forwardRef(function PasswordInput(
  {
    id,
    name,
    value,
    onChange,
    onBlur,
    placeholder = '••••••••',
    disabled = false,
    error,
    className = '',
    autoComplete = 'current-password',
    ...props
  },
  ref
) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative flex items-center w-full">
      <input
        ref={ref}
        type={showPassword ? 'text' : 'password'}
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`
          w-full rounded-xl border text-sm transition-colors
          bg-white dark:bg-[#121820] text-hug-text
          placeholder:text-hug-muted/70
          outline-none
          py-2.5 pl-3.5 pr-11
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

      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => setShowPassword(!showPassword)}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        className="absolute right-3 p-1 rounded-lg text-hug-muted hover:text-hug-text hover:bg-bg transition-colors cursor-pointer"
      >
        {showPassword ? (
          <EyeOff className="w-4 h-4" />
        ) : (
          <Eye className="w-4 h-4" />
        )}
      </button>
    </div>
  );
});

export default PasswordInput;
