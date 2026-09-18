import React from 'react';
import { Shield, X } from 'lucide-react';

export default function AccountRecoveryModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Account Recovery & Lost SIM Advisory"
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-surface rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-border flex flex-col gap-4 relative animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-bg dark:bg-[#0C1015] hover:bg-border flex items-center justify-center text-hug-muted hover:text-hug-text cursor-pointer transition-colors"
          aria-label="Close recovery advisory"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary-bg dark:bg-primary/20 flex items-center justify-center text-primary dark:text-primary-light shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-hug-text">Account Recovery &amp; Lost SIM</h3>
            <p className="text-xs text-hug-muted">HUGPONG Security &amp; Member Assistance</p>
          </div>
        </div>

        {/* Advisory Body */}
        <div className="flex flex-col gap-3 text-xs text-hug-text2 mt-1">
          {/* Option 1 */}
          <div className="p-3.5 rounded-2xl bg-[#F0F8EC] dark:bg-emerald-950/20 border border-primary/25 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-primary text-white uppercase tracking-wider">
                Option 1
              </span>
              <span className="font-bold text-primary dark:text-primary-light text-xs">
                Lost your SIM card or Phone?
              </span>
            </div>
            <p className="text-[11.5px] leading-relaxed text-hug-text2">
              If you still know your password, you do <strong>not</strong> need to reset your account. Simply enter your permanent <strong className="font-mono text-primary dark:text-primary-light font-bold">8-digit User ID (e.g. 03000001)</strong> into the User ID / Mobile field to sign in immediately. Your sugarcane plots and historical records remain fully intact.
            </p>
          </div>

          {/* Option 2 */}
          <div className="p-3.5 rounded-2xl bg-bg dark:bg-[#0C1015] border border-border flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-hug-muted text-white uppercase tracking-wider">
                Option 2
              </span>
              <span className="font-bold text-hug-text text-xs">
                Forgot Password or Lost Credentials?
              </span>
            </div>
            <p className="text-[11.5px] leading-relaxed text-hug-muted">
              Because HUGPONG protects official land tenure, sugarcane allocations, and financial subsidies, online password recovery requires verified identity. Please visit your:
            </p>
            <ul className="list-disc list-inside space-y-1 text-[11px] font-medium text-hug-text2 pl-1">
              <li><strong>Assigned Block Farm Manager</strong></li>
              <li><strong>SRA District Regulatory Officer</strong></li>
            </ul>
            <p className="text-[11px] text-hug-muted">
              They will verify your identity in person and update your registered mobile contact or issue an authorized password reset directly from the cooperative console.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm text-center"
          >
            Understood, Return to Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
