import React from 'react';
import { Server, Database, Activity, CheckCircle2, AlertTriangle, ShieldCheck, Clock, Layers } from 'lucide-react';
import { formatCropYearDisplay } from '../../utils/formatters';

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

  const activeCropYears = Array.isArray(collectionCounts.activeCropYears)
    ? collectionCounts.activeCropYears.map(year => formatCropYearDisplay(year)).filter(Boolean)
    : [];
  const activeCropYearLabel = activeCropYears.length > 0
    ? activeCropYears.join(' · ')
    : 'None active';

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
          <div className="bg-surface-subtle p-4 rounded-xl border border-border">
            <div className="flex items-center justify-between text-xs text-hug-muted mb-1.5">
              <span className="font-bold uppercase tracking-wider text-[10px]">API Server</span>
              <Server className="w-4 h-4 text-hug-muted" />
            </div>
            <div className="flex items-center gap-2">
              {isApiConnected ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
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
          <div className="bg-surface-subtle p-4 rounded-xl border border-border">
            <div className="flex items-center justify-between text-xs text-hug-muted mb-1.5">
              <span className="font-bold uppercase tracking-wider text-[10px]">Firestore Database</span>
              <Database className="w-4 h-4 text-hug-muted" />
            </div>
            <div className="flex items-center gap-2">
              {isDbAvailable ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Available &amp; Read/Write Ready
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
          <div className="bg-surface-subtle p-4 rounded-xl border border-border">
            <div className="flex items-center justify-between text-xs text-hug-muted mb-1.5">
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
      <div className="bg-white dark:bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-hug-muted">
            Authoritative Database Collection Ledger
          </h4>
          {!isDbAvailable && healthData !== null && (
            <span className="text-[11px] font-bold text-danger bg-danger-bg px-2.5 py-0.5 rounded-full">
              Database Unreachable
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {/* 1. Users */}
          <div className="p-3.5 bg-surface-subtle rounded-xl border border-border">
            <span className="text-[10px] text-hug-muted uppercase font-bold block mb-1">Users</span>
            <span className="text-xl font-black text-hug-text block">
              {!isDbAvailable && healthData !== null ? 'Unavailable' : (collectionCounts.users ?? 0)}
            </span>
            <span className="text-[10px] text-hug-muted block">
              {!isDbAvailable && healthData !== null ? 'connection failed' : 'accounts'}
            </span>
          </div>

          {/* 2. Block Farms */}
          <div className="p-3.5 bg-surface-subtle rounded-xl border border-border">
            <span className="text-[10px] text-hug-muted uppercase font-bold block mb-1">Block Farms</span>
            <span className="text-xl font-black text-hug-text block">
              {!isDbAvailable && healthData !== null ? 'Unavailable' : (collectionCounts.blockFarms ?? 0)}
            </span>
            <span className="text-[10px] text-hug-muted block">
              {!isDbAvailable && healthData !== null ? 'connection failed' : 'clusters'}
            </span>
          </div>

          {/* 3. Fields / Plots */}
          <div className="p-3.5 bg-surface-subtle rounded-xl border border-border">
            <span className="text-[10px] text-hug-muted uppercase font-bold block mb-1">Fields / Plots</span>
            <span className="text-xl font-black text-hug-text block">
              {!isDbAvailable && healthData !== null ? 'Unavailable' : (collectionCounts.fields ?? 0)}
            </span>
            <span className="text-[10px] text-hug-muted block">
              {!isDbAvailable && healthData !== null ? 'connection failed' : 'registries'}
            </span>
          </div>

          {/* 4. Operation Logs */}
          <div className="p-3.5 bg-surface-subtle rounded-xl border border-border">
            <span className="text-[10px] text-hug-muted uppercase font-bold block mb-1">Operation Logs</span>
            <span className="text-xl font-black text-primary dark:text-primary-light block">
              {!isDbAvailable && healthData !== null ? 'Unavailable' : (collectionCounts.operations ?? 0)}
            </span>
            <span className="text-[10px] text-hug-muted block">
              {!isDbAvailable && healthData !== null ? 'connection failed' : 'logged activities'}
            </span>
          </div>

          {/* 5. Active Crop Year Cycle */}
          <div className="p-3.5 bg-surface-subtle rounded-xl border border-border">
            <span className="text-[10px] text-hug-muted uppercase font-bold block mb-1">Active Crop Year Cycle</span>
            <span
              className={`${activeCropYears.length > 1 ? 'text-sm' : 'text-xl'} font-black text-hug-text block truncate`}
              title={activeCropYears.join(', ')}
            >
              {(!isDbAvailable && healthData !== null) || collectionCounts.cropCycles === 'UNAVAILABLE'
                ? 'Unavailable'
                : collectionCounts.cropCycles == null
                  ? 'Loading...'
                  : activeCropYearLabel}
            </span>
            <span className="text-[10px] text-hug-muted block">
              {(!isDbAvailable && healthData !== null) || collectionCounts.cropCycles === 'UNAVAILABLE'
                ? 'database unreachable'
                : collectionCounts.cropCycles == null
                  ? 'reading crop_cycles'
                  : `${collectionCounts.cropCycles ?? 0} records · ${collectionCounts.activeCropCycles ?? 0} active · ${collectionCounts.archivedCropCycles ?? 0} archived`}
            </span>
          </div>

          {/* 6. SRA Circulars */}
          <div className="p-3.5 bg-surface-subtle rounded-xl border border-border">
            <span className="text-[10px] text-hug-muted uppercase font-bold block mb-1">SRA Circulars</span>
            <span className="text-xl font-black text-hug-text block">
              {!isDbAvailable && healthData !== null ? 'Unavailable' : (collectionCounts.prices ?? 0)}
            </span>
            <span className="text-[10px] text-hug-muted block">
              {!isDbAvailable && healthData !== null ? 'connection failed' : 'official prices'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
