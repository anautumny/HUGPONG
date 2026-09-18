import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({
  isOpen = false,
  onClose,
  title,
  subtitle,
  badge,
  icon: Icon,
  size = 'md', // 'sm' | 'md' | 'lg'
  children,
  footer,
  preventBackdropClose = false,
  preventEscapeClose = false,
  isLoading = false,
  className = ''
}) {
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);

  // Size mapping
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg sm:max-w-xl',
    lg: 'max-w-2xl sm:max-w-3xl'
  };

  // Focus management & Escape handler
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElement.current = document.activeElement;

    // Focus the modal container
    const focusTimer = setTimeout(() => {
      if (modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, 50);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (!preventEscapeClose && !isLoading && onClose) {
          e.preventDefault();
          onClose();
        }
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Prevent body scrolling
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, preventEscapeClose, isLoading, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !preventBackdropClose && !isLoading && onClose) {
      onClose();
    }
  };

  return createPortal(
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 transition-opacity animate-in fade-in duration-150"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        tabIndex={-1}
        className={`
          bg-white dark:bg-surface rounded-2xl w-full p-5 sm:p-6 shadow-2xl border border-border
          flex flex-col gap-4 max-h-[90vh] overflow-hidden outline-none
          ${sizeClasses[size] || sizeClasses.md}
          ${className}
        `}
      >
        {/* Header */}
        {(title || badge || Icon) && (
          <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-3.5">
            <div className="flex items-start gap-3">
              {Icon && (
                <div className="w-10 h-10 rounded-xl bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-5 h-5" />
                </div>
              )}
              <div>
                {badge && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light uppercase tracking-wider block mb-1 w-fit">
                    {badge}
                  </span>
                )}
                {title && (
                  <h2
                    id="modal-title"
                    className="text-base sm:text-lg font-bold text-hug-text tracking-tight"
                  >
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p className="text-xs text-hug-muted mt-0.5 leading-relaxed">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                aria-label="Close dialog"
                className="w-8 h-8 rounded-full bg-bg hover:bg-border/60 flex items-center justify-center text-hug-muted hover:text-hug-text cursor-pointer transition-colors shrink-0 disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Scrollable Body */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-4 text-xs sm:text-sm text-hug-text2">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="pt-3.5 border-t border-border/70 flex items-center justify-end gap-2.5 flex-wrap">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
