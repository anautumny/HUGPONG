import React from 'react';
import Modal from './Modal';
import Button from './Button';
import { AlertTriangle, AlertCircle, Info, HelpCircle } from 'lucide-react';

export default function ConfirmDialog({
  isOpen = false,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'warning', // 'danger' | 'warning' | 'info' | 'primary'
  onConfirm,
  onCancel,
  isLoading = false,
  loadingText
}) {
  const typeConfig = {
    danger: {
      icon: AlertTriangle,
      iconWrapper: 'bg-danger-bg dark:bg-danger/20 text-danger border border-danger/30',
      confirmVariant: 'destructive'
    },
    warning: {
      icon: AlertCircle,
      iconWrapper: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50',
      confirmVariant: 'primary'
    },
    info: {
      icon: Info,
      iconWrapper: 'bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light border border-primary/30',
      confirmVariant: 'primary'
    },
    primary: {
      icon: HelpCircle,
      iconWrapper: 'bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light border border-primary/30',
      confirmVariant: 'primary'
    }
  };

  const config = typeConfig[type] || typeConfig.warning;
  const Icon = config.icon;

  const footer = (
    <>
      <Button
        variant="secondary"
        size="md"
        onClick={onCancel}
        disabled={isLoading}
      >
        {cancelText}
      </Button>
      <Button
        variant={config.confirmVariant}
        size="md"
        onClick={onConfirm}
        isLoading={isLoading}
        loadingText={loadingText}
      >
        {confirmText}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      size="sm"
      preventBackdropClose={isLoading}
      preventEscapeClose={isLoading}
      footer={footer}
    >
      <div className="flex items-start gap-4 pt-1">
        <div
          className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${config.iconWrapper}`}
        >
          <Icon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-hug-text tracking-tight">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-hug-muted mt-1 leading-relaxed whitespace-pre-line">
            {message}
          </p>
        </div>
      </div>
    </Modal>
  );
}
