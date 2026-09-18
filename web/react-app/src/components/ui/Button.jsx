import React from 'react';
import { Loader2 } from 'lucide-react';

export default function Button({
  children,
  type = 'button',
  variant = 'primary', // 'primary' | 'secondary' | 'ghost' | 'destructive'
  size = 'md',        // 'sm' | 'md' | 'lg'
  isLoading = false,
  loadingText,
  disabled = false,
  icon: Icon,
  iconPosition = 'left',
  className = '',
  onClick,
  ...props
}) {
  const baseStyles = 'inline-flex items-center justify-center font-bold transition-all rounded-xl cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-offset-1 dark:focus:ring-offset-surface';

  const variantStyles = {
    primary: 'bg-primary hover:bg-primary-dark text-white shadow-xs focus:ring-primary',
    secondary: 'bg-surface border border-border text-hug-text hover:bg-bg focus:ring-border',
    ghost: 'text-hug-muted hover:text-hug-text hover:bg-bg focus:ring-border',
    destructive: 'bg-danger hover:bg-danger/90 text-white shadow-xs focus:ring-danger'
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-xs sm:text-sm gap-2',
    lg: 'px-5 py-2.5 text-sm sm:text-base gap-2.5'
  };

  const isDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      aria-busy={isLoading}
      className={`
        ${baseStyles}
        ${variantStyles[variant] || variantStyles.primary}
        ${sizeStyles[size] || sizeStyles.md}
        ${isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
        ${className}
      `}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>{loadingText || children}</span>
        </>
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className="w-4 h-4 shrink-0" />}
          <span>{children}</span>
          {Icon && iconPosition === 'right' && <Icon className="w-4 h-4 shrink-0" />}
        </>
      )}
    </button>
  );
}
