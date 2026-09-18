import React from 'react';
import { Wifi, WifiOff, Smartphone, Clock, AlertTriangle, Layers, Database } from 'lucide-react';
import { evaluateNodeStatus } from '../../services/telemetryService';

export default function SyncDiagnosticsSummary({
  isOnline = true,
  syncStatus = 'idle',
  lastSyncedAt = null,
  activeOperationsCount = 0,
  diagnostics = [],
  className = ''
}) {
  const totalNodes = diagnostics.length;

  let activeCount = 0;
  let delayedCount = 0;
  let offlineCount = 0;

  diagnostics.forEach(d => {
    const evaluated = evaluateNodeStatus(d.updatedAt);
    if (evaluated.state === 'ACTIVE') activeCount++;
    else if (evaluated.state === 'DELAYED') delayedCount++;
    else offlineCount++;
  });

  const formatLastSync = (date) => {
    if (!date) return 'No sync completed yet in this session';
    try {
      const d = new Date(date);
      return isNaN(d.getTime()) ? String(date) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return String(date);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Network & Local Outbox Status Bar */}
      <div className={`rounded-2xl p-4 sm:p-5 border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
        !isOnline
          ? 'bg-danger-bg/30 dark:bg-danger/10 border-danger/40'
          : syncStatus === 'syncing'
          ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/50'
          : 'bg-white dark:bg-surface border-border'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            !isOnline
              ? 'bg-danger/20 text-danger'
              : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
          }`}>
            {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-hug-text">
                {isOnline ? 'Web Client Connected' : 'Offline Mode (Local Storage Active)'}
              </h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                !isOnline
                  ? 'bg-danger text-white'
                  : syncStatus === 'syncing'
                  ? 'bg-blue-500 text-white animate-pulse'
                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200'
              }`}>
                {!isOnline ? 'OFFLINE' : syncStatus === 'syncing' ? 'SYNCHRONIZING' : 'ONLINE'}
              </span>
            </div>
            <p className="text-xs text-hug-muted mt-0.5 flex items-center gap-2 flex-wrap">
              <span>Last confirmed session sync: <strong className="text-hug-text">{formatLastSync(lastSyncedAt)}</strong></span>
            </p>
          </div>
        </div>

        {/* Local mutation outbox counter */}
        <div className="flex items-center gap-2 self-start sm:self-auto bg-bg dark:bg-gray-800/60 px-3.5 py-2 rounded-xl border border-border text-xs">
          <Database className="w-4 h-4 text-primary shrink-0" />
          <div>
            <span className="text-[10px] text-hug-muted uppercase font-bold block">Local Outbox Queue</span>
            <span className="font-extrabold text-hug-text">
              {activeOperationsCount} pending mutation{activeOperationsCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </div>

      {/* Node Metrics KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-surface rounded-2xl p-4 border border-border shadow-xs">
          <div className="flex items-center justify-between text-xs text-hug-muted mb-1">
            <span className="font-bold uppercase tracking-wider text-[10px]">Registered Terminals</span>
            <Smartphone className="w-4 h-4 text-hug-muted" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-hug-text">{totalNodes}</span>
            <span className="text-xs text-hug-muted font-medium">mobile nodes</span>
          </div>
          <span className="text-[11px] text-hug-muted mt-1 block">
            Terminals reporting hardware telemetry
          </span>
        </div>

        <div className="bg-white dark:bg-surface rounded-2xl p-4 border border-border shadow-xs">
          <div className="flex items-center justify-between text-xs text-hug-muted mb-1">
            <span className="font-bold uppercase tracking-wider text-[10px]">Active & Synced</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{activeCount}</span>
            <span className="text-xs text-hug-muted font-medium">nodes (&lt; 24h)</span>
          </div>
          <span className="text-[11px] text-hug-muted mt-1 block">
            Communicating within 24-hour cycle
          </span>
        </div>

        <div className="bg-white dark:bg-surface rounded-2xl p-4 border border-border shadow-xs">
          <div className="flex items-center justify-between text-xs text-hug-muted mb-1">
            <span className="font-bold uppercase tracking-wider text-[10px]">Delayed / Inactive</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-hug-text">
              {delayedCount + offlineCount}
            </span>
            <span className="text-xs text-hug-muted font-medium">lagging</span>
          </div>
          <span className="text-[11px] text-hug-muted mt-1 block">
            {delayedCount} delayed (&gt;24h), {offlineCount} inactive (&gt;72h)
          </span>
        </div>
      </div>
    </div>
  );
}
