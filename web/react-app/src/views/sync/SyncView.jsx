import React, { useState, useEffect } from 'react';
import { RefreshCw, Smartphone, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useSync } from '../../context/SyncContext';
import { useAuth } from '../../context/AuthContext';
import { subscribeToTerminalDiagnostics } from '../../services/telemetryService';
import { subscribeToUsersData } from '../../services/usersService';
import SyncDiagnosticsSummary from '../../components/sync/SyncDiagnosticsSummary';
import SyncTelemetryTable from '../../components/sync/SyncTelemetryTable';

export default function SyncView() {
  const { user } = useAuth();
  const { isOnline, syncStatus, lastSyncedAt, activeOperationsCount } = useSync();

  const [diagnostics, setDiagnostics] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setIsLoading(true);
    const unsubDiag = subscribeToTerminalDiagnostics({
      onUpdate: (data) => {
        setDiagnostics(data.diagnostics || []);
        setIsLoading(data.isLoading);
        setError(data.error);
      },
      onError: (err) => {
        setError(err.message || 'Failed to load telemetry.');
        setIsLoading(false);
      }
    });

    const unsubUsers = subscribeToUsersData({
      user,
      onUpdate: (data) => {
        setUsers(data.users || []);
      }
    });

    return () => {
      if (typeof unsubDiag === 'function') unsubDiag();
      if (typeof unsubUsers === 'function') unsubUsers();
    };
  }, [user]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary dark:text-primary-light uppercase tracking-wider">
              System Infrastructure
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
              Telemetry Monitor
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
            Sync & Telemetry Monitor
          </h1>
          <p className="text-xs sm:text-sm text-hug-muted mt-1 max-w-2xl">
            Review live connectivity, local mutation outbox states, and mobile terminal sync telemetry.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-danger-bg/40 border border-danger/30 rounded-2xl flex items-start gap-3 text-xs sm:text-sm font-semibold text-danger">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Error loading sync diagnostics</p>
            <p className="text-xs text-danger/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Sync Status & Metrics Summary */}
      <SyncDiagnosticsSummary
        isOnline={isOnline}
        syncStatus={syncStatus}
        lastSyncedAt={lastSyncedAt}
        activeOperationsCount={activeOperationsCount}
        diagnostics={diagnostics}
      />

      {/* Terminal Node Diagnostics Table */}
      <SyncTelemetryTable
        diagnostics={diagnostics}
        users={users}
        isLoading={isLoading}
      />
    </div>
  );
}
