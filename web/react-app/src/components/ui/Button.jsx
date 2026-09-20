import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function Button({
  children,
  to,
  type = 'button',
  variant = 'primary', // 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'
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
    primary: 'bg-primary hover:bg-primary-hover text-white shadow-xs focus:ring-primary',
    secondary: 'bg-surface border border-border text-hug-text hover:bg-bg hover:border-border-strong focus:ring-border',
    outline: 'bg-surface border border-border text-hug-text hover:bg-bg hover:border-border-strong focus:ring-border',
    ghost: 'text-hug-muted hover:text-hug-text hover:bg-bg focus:ring-border',
    destructive: 'bg-danger hover:bg-danger/90 text-white shadow-xs focus:ring-danger'
  };

  const sizeStyles = {
    sm: 'px-3.5 py-2 text-xs sm:text-sm gap-1.5',
    md: 'px-4.5 py-2.5 text-sm font-bold gap-2',
    lg: 'px-6 py-3 text-base font-bold gap-2.5'
  };

  const isDisabled = disabled || isLoading;

  if (to) {
    return (
      <Link
        to={to}
        className={`
          ${baseStyles}
          ${variantStyles[variant] || variantStyles.primary}
          ${sizeStyles[size] || sizeStyles.md}
          ${isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
          ${className}
        `}
        {...props}
      >
        {Icon && iconPosition === 'left' && <Icon className="w-4 h-4 shrink-0" />}
        <span>{children}</span>
        {Icon && iconPosition === 'right' && <Icon className="w-4 h-4 shrink-0" />}
      </Link>
    );
  }

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
