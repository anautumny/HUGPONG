import React, { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

const CONSENT_KEY = 'hugpong_cookie_consent';

export default function ConsentBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (!stored) {
        setIsVisible(true);
      }
    } catch {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    try {
      localStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({
          accepted: true,
          timestamp: new Date().toISOString(),
          version: '2.4'
        })
      );
    } catch (e) {
      console.warn('[Consent] localStorage unavailable:', e);
    }
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div
      role="region"
      aria-label="Data Privacy and Storage Consent Notice"
      className="fixed bottom-4 left-4 right-4 sm:left-6 sm:right-6 md:left-auto md:right-8 md:max-w-xl bg-white/95 dark:bg-[#151C24]/95 backdrop-blur-md rounded-2xl border border-border p-5 sm:p-6 shadow-2xl z-50 transition-all duration-300 text-hug-text animate-in slide-in-from-bottom-4"
    >
      <div className="flex items-start gap-3.5">
        <div
          className="w-9 h-9 rounded-xl bg-primary-bg dark:bg-primary/20 border border-primary/20 text-primary dark:text-primary-light flex items-center justify-center shrink-0 mt-0.5"
          aria-hidden="true"
        >
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="flex-1 space-y-2">
          <h2 className="text-xs sm:text-sm font-bold text-hug-text flex items-center gap-2">
            <span>Data Privacy &amp; Essential Storage Notice</span>
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
              RA 10173
            </span>
          </h2>
          <p className="text-xs text-hug-text2 leading-relaxed">
            HUGPONG uses strictly necessary local storage (session tokens &amp; offline field caches) to maintain agricultural operations. We do <strong>not</strong> use advertising or commercial tracking cookies.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
            <Link
              to="/privacy"
              className="font-semibold text-primary dark:text-primary-light hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded"
            >
              Privacy Policy
            </Link>
            <span className="text-hug-muted" aria-hidden="true">•</span>
            <Link
              to="/cookies"
              className="font-semibold text-primary dark:text-primary-light hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded"
            >
              Storage Details
            </Link>
          </div>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={handleAccept}
          className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-bold transition-all shadow-xs focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none cursor-pointer"
        >
          Acknowledge &amp; Accept
        </button>
      </div>
    </div>
  );
}
