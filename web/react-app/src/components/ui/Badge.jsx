import React from 'react';

export default function Badge({
  children,
  variant = 'neutral', // 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  size = 'sm',        // 'sm' | 'md'
  dot = false,
  className = ''
}) {
  const variantStyles = {
    success: 'bg-success-bg dark:bg-success/20 text-success border-success/30',
    warning: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
    danger: 'bg-danger-bg dark:bg-danger/20 text-danger border-danger/30',
    info: 'bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light border-primary/30',
    neutral: 'bg-bg text-hug-muted border-border'
  };

  const dotStyles = {
    success: 'bg-success',
    warning: 'bg-amber-500',
    danger: 'bg-danger',
    info: 'bg-primary',
    neutral: 'bg-hug-muted'
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5'
  };

  return (
    <span
      className={`
        inline-flex items-center font-bold rounded-full border tracking-wide select-none
        ${variantStyles[variant] || variantStyles.neutral}
        ${sizeStyles[size] || sizeStyles.sm}
        ${className}
      `}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotStyles[variant] || dotStyles.neutral}`}
        />
      )}
      <span>{children}</span>
    </span>
  );
}

export function StatusBadge({ status, size = 'sm', className = '' }) {
  if (!status) return null;

  const normalized = String(status).trim().toUpperCase();

  let variant = 'neutral';
  let label = status;
  let dot = false;

  switch (normalized) {
    case 'ACTIVE':
    case 'ONLINE':
    case 'CERTIFIED':
    case 'HEALTHY':
    case 'SYNCED':
    case 'COMPLETED':
      variant = 'success';
      dot = true;
      break;

    case 'PENDING':
    case 'IN_PROGRESS':
    case 'WARNING':
    case 'LAGGING':
    case 'QUEUED':
      variant = 'warning';
      dot = true;
      break;

    case 'ARCHIVED':
    case 'CLOSED':
    case 'RESOLVED':
      variant = 'neutral';
      break;

    case 'FAILED':
    case 'CRITICAL':
    case 'REJECTED':
    case 'ERROR':
    case 'OFFLINE':
      variant = 'danger';
      dot = true;
      break;

    case 'INFO':
    case 'SUPER_ADMIN':
    case 'SRA_ADMIN':
      variant = 'info';
      break;

    default:
      variant = 'neutral';
      break;
  }

  return (
    <Badge variant={variant} size={size} dot={dot} className={className}>
      {label}
    </Badge>
  );
}
