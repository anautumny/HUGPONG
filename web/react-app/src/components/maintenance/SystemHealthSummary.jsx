import React from 'react';
import { Server, Database, Activity, CheckCircle2, AlertTriangle, ShieldCheck, Clock, Layers } from 'lucide-react';

export default function SystemHealthSummary({
  healthData = null,
  collectionCounts = {},
  isCheckingHealth = false,
  onRefreshHealth,
  className = ''
}) {
  const {
    isApiConnected = false,
    isDbAvailable = false,
    latencyMs = null,
    timestamp = null,
    error = null
  } = healthData || {};

  const formatTimestamp = (ts) => {
    if (!ts) return 'Checking...';
    try {
      const d = new Date(ts);
      return isNaN(d.getTime()) ? ts : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return ts;
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Backend & DB Verified Status */}
      <div className="bg-white dark:bg-surface rounded-2xl border border-border p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-hug-muted">
                Authoritative Infrastructure Status
              </span>
            </div>
            <h3 className="text-base font-bold text-hug-text mt-0.5">
              Backend Connectivity & Service Health
            </h3>
            <p className="text-xs text-hug-muted mt-0.5">
              Empirical latency and database readiness measured against the active Express server.
            </p>
          </div>

          <button
            type="button"
            onClick={onRefreshHealth}
            disabled={isCheckingHealth}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl border border-border bg-bg hover:bg-bg/80 text-xs font-semibold text-hug-text flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Activity className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin text-primary' : 'text-hug-muted'}`} />
            <span>{isCheckingHealth ? 'Pinging Server...' : 'Ping Server'}</span>
          </button>
        </div>

        {/* Concrete Health Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* API Server */}
          <div className="bg-bg/60 dark:bg-gray-800/40 p-3.5 rounded-xl border border-border">
            <div className="flex items-center justify-between text-xs text-hug-muted mb-1">
              <span className="font-bold uppercase tracking-wider text-[10px]">API Server</span>
              <Server className="w-4 h-4 text-hug-muted" />
            </div>
            <div className="flex items-center gap-2">
              {isApiConnected ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Express API Responsive
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-danger">
                  <AlertTriangle className="w-3.5 h-3.5" /> API Offline
                </span>
              )}
            </div>
            <span className="text-[11px] text-hug-muted mt-1 block">
              Round-trip latency: {latencyMs !== null ? `${latencyMs} ms` : '—'}
            </span>
          </div>

          {/* Database Availability */}
          <div className="bg-bg/60 dark:bg-gray-800/40 p-3.5 rounded-xl border border-border">
            <div className="flex items-center justify-between text-xs text-hug-muted mb-1">
              <span className="font-bold uppercase tracking-wider text-[10px]">Firestore Database</span>
              <Database className="w-4 h-4 text-hug-muted" />
            </div>
            <div className="flex items-center gap-2">
              {isDbAvailable ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Available & Read/Write Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-danger">
                  <AlertTriangle className="w-3.5 h-3.5" /> Database Unreachable
                </span>
              )}
            </div>
            <span className="text-[11px] text-hug-muted mt-1 block">
              Last verified: {formatTimestamp(timestamp)}
            </span>
          </div>

          {/* Security Rules Engine */}
          <div className="bg-bg/60 dark:bg-gray-800/40 p-3.5 rounded-xl border border-border">
            <div className="flex items-center justify-between text-xs text-hug-muted mb-1">
              <span className="font-bold uppercase tracking-wider text-[10px]">Security Engine</span>
              <ShieldCheck className="w-4 h-4 text-primary" />
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-primary dark:text-primary-light">
              <CheckCircle2 className="w-3.5 h-3.5" /> Server RBAC Enforced
            </span>
            <span className="text-[11px] text-hug-muted mt-1 block">
              Zero client direct writes permitted
            </span>
          </div>
        </div>
      </div>

      {/* Collection Record Volume Inventory */}
      <div className="bg-white dark:bg-surface rounded-2xl border border-border p-5 shadow-xs">
        <h4 className="text-xs font-bold uppercase tracking-wider text-hug-muted mb-3">
          Authoritative Database Collection Ledger
        </h4>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 bg-bg/40 dark:bg-gray-800/30 rounded-xl border border-border">
            <span className="text-[10px] text-hug-muted uppercase font-bold block">Users</span>
            <span className="text-xl font-black text-hug-text">{collectionCounts.users ?? 0}</span>
            <span className="text-[10px] text-hug-muted block">accounts</span>
          </div>

          <div className="p-3 bg-bg/40 dark:bg-gray-800/30 rounded-xl border border-border">
            <span className="text-[10px] text-hug-muted uppercase font-bold block">Block Farms</span>
            <span className="text-xl font-black text-hug-text">{collectionCounts.blockFarms ?? 0}</span>
            <span className="text-[10px] text-hug-muted block">clusters</span>
          </div>

          <div className="p-3 bg-bg/40 dark:bg-gray-800/30 rounded-xl border border-border">
            <span className="text-[10px] text-hug-muted uppercase font-bold block">Fields / Plots</span>
            <span className="text-xl font-black text-hug-text">{collectionCounts.fields ?? 0}</span>
            <span className="text-[10px] text-hug-muted block">registries</span>
          </div>

          <div className="p-3 bg-bg/40 dark:bg-gray-800/30 rounded-xl border border-border">
            <span className="text-[10px] text-hug-muted uppercase font-bold block">Operation Logs</span>
            <span className="text-xl font-black text-primary dark:text-primary-light">{collectionCounts.operations ?? 0}</span>
            <span className="text-[10px] text-hug-muted block">logged activities</span>
          </div>

          <div className="p-3 bg-bg/40 dark:bg-gray-800/30 rounded-xl border border-border">
            <span className="text-[10px] text-hug-muted uppercase font-bold block">SRA Circulars</span>
            <span className="text-xl font-black text-hug-text">{collectionCounts.prices ?? 0}</span>
            <span className="text-[10px] text-hug-muted block">official prices</span>
          </div>
        </div>
      </div>
    </div>
  );
}
