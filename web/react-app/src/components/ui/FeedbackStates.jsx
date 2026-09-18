import React from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import Button from './Button';

/**
 * EmptyState — Honest, uncluttered empty treatment
 */
export function EmptyState({
  title = 'No records found',
  description,
  action,
  icon: Icon = Inbox,
  className = ''
}) {
  return (
    <div className={`p-8 sm:p-12 text-center flex flex-col items-center justify-center ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-bg border border-border text-hug-muted flex items-center justify-center mb-3">
        <Icon className="w-6 h-6" />
      </div>

      <h3 className="text-sm sm:text-base font-bold text-hug-text tracking-tight">
        {title}
      </h3>

      {description && (
        <p className="text-xs sm:text-sm text-hug-muted mt-1 max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      )}

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * LoadingState — Small inline or section spinner
 */
export function LoadingState({
  message = 'Loading...',
  size = 'md', // 'sm' | 'md' | 'lg'
  className = ''
}) {
  const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className={`p-6 sm:p-10 flex flex-col items-center justify-center gap-2 text-hug-muted ${className}`}>
      <Loader2 className={`${sizeMap[size] || sizeMap.md} animate-spin text-primary dark:text-primary-light`} />
      {message && (
        <p className="text-xs font-semibold text-hug-muted mt-1">
          {message}
        </p>
      )}
    </div>
  );
}

/**
 * Skeleton — Generic resembling content placeholder
 */
export function Skeleton({ className = '' }) {
  return (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-800 rounded-xl ${className}`} />
  );
}

/**
 * ErrorState — Concise recoverable error message
 */
export function ErrorState({
  title = 'Unable to load content',
  message = 'An error occurred while loading this section. Please check your connection.',
  onRetry,
  retryText = 'Retry',
  className = ''
}) {
  return (
    <div className={`p-6 sm:p-8 text-center flex flex-col items-center justify-center max-w-md mx-auto ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-danger-bg dark:bg-danger/20 text-danger border border-danger/30 flex items-center justify-center mb-3">
        <AlertCircle className="w-6 h-6" />
      </div>

      <h3 className="text-base font-bold text-hug-text tracking-tight">
        {title}
      </h3>

      <p className="text-xs sm:text-sm text-hug-muted mt-1 leading-relaxed">
        {message}
      </p>

      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          icon={RefreshCw}
          className="mt-4"
        >
          {retryText}
        </Button>
      )}
    </div>
  );
}
