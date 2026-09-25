import React from 'react';
import { RefreshCw, WifiOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useSync } from '../../context/SyncContext';

export default function SyncIndicator({ compact = false }) {
  const { syncStatus, networkOnline } = useSync();

  if (!networkOnline || syncStatus === 'offline') {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-danger-bg text-danger border border-danger/20"
        title="Network disconnected. You are currently offline."
        role="status"
        aria-live="polite"
      >
        <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
        {!compact && <span>Offline</span>}
      </div>
    );
  }

  if (syncStatus === 'syncing') {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-farm-blue-bg text-farm-blue dark:bg-farm-blue/15 border border-farm-blue/20"
        title="Active data synchronization in progress."
        role="status"
        aria-live="polite"
      >
        <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
        {!compact && <span>Syncing...</span>}
      </div>
    );
  }

  if (syncStatus === 'failed') {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-warning-bg text-warning border border-warning/20"
        title="The browser is online, but the HUGPONG API is unavailable."
        role="status"
        aria-live="polite"
      >
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
        {!compact && <span>Server Unavailable</span>}
      </div>
    );
  }

  // Idle connected state
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-hug-text2 dark:text-hug-text2 bg-bg dark:bg-surface border border-border"
      title="Connected to HUGPONG Server. Real-time listeners active."
      role="status"
      aria-live="polite"
    >
      <span className="w-2 h-2 rounded-full bg-success animate-pulse flex-shrink-0" />
      {!compact && <span className="text-[11px] font-medium">Cloud Active</span>}
    </div>
  );
}
