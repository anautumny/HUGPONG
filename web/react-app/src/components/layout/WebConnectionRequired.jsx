import React, { useEffect, useRef } from 'react';
import { WifiOff } from 'lucide-react';

export default function WebConnectionRequired({ networkOnline, checking = false, onRetry }) {
  const retryRef = useRef(null);
  useEffect(() => { retryRef.current?.focus(); }, []);
  return (
    <section role="alertdialog" aria-modal="true" aria-labelledby="web-connection-title"
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Tab' || event.key === 'Escape') {
          event.preventDefault();
          retryRef.current?.focus();
        }
      }}
      className="fixed inset-0 z-[200] flex min-h-screen items-center justify-center bg-bg p-6 text-hug-text">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-7 text-center shadow-lg">
        <WifiOff className="mx-auto mb-4 h-9 w-9 text-primary" aria-hidden="true" />
        <h1 id="web-connection-title" className="text-xl font-bold">
          {checking ? 'Checking connection' : networkOnline ? 'HUGPONG is unavailable' : 'Internet connection required'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-hug-text2">
          The Web console requires a live HUGPONG connection. Reconnect to continue.
          Use the Android app for offline field work.
        </p>
        <button ref={retryRef} type="button" onClick={onRetry}
          className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-dark">
          Retry connection
        </button>
      </div>
    </section>
  );
}
