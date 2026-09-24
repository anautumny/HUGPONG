import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { checkSystemHealth, fetchSystemDiagnostics, subscribeToAuditLogs } from '../../services/maintenanceService';
import SystemHealthSummary from '../../components/maintenance/SystemHealthSummary';
import SystemAuditLedger from '../../components/maintenance/SystemAuditLedger';

export default function MaintenanceView() {
  const [healthData, setHealthData] = useState(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  const [auditLogs, setAuditLogs] = useState([]);
  const [isLogsLoading, setIsLogsLoading] = useState(true);
  const [errors, setErrors] = useState({ audit: null, inventory: null });
  const error = errors.audit || errors.inventory;

  // Collection counts
  const [counts, setCounts] = useState({
    users: 0,
    blockFarms: 0,
    fields: 0,
    operations: 0,
    prices: 0,
    cropCycles: null,
    activeCropCycles: null,
    archivedCropCycles: null,
    activeCropYears: []
  });

  const loadSystemInventory = async () => {
    setCounts(prev => ({
      ...prev,
      cropCycles: null,
      activeCropCycles: null,
      archivedCropCycles: null,
      activeCropYears: []
    }));
    try {
      const inventory = await fetchSystemDiagnostics();
      setCounts(inventory);
      setErrors(prev => ({ ...prev, inventory: null }));
    } catch (err) {
      console.warn('[MaintenanceView] System inventory err:', err.message);
      setCounts(prev => ({
        ...prev,
        cropCycles: 'UNAVAILABLE',
        activeCropCycles: null,
        archivedCropCycles: null,
        activeCropYears: []
      }));
      setErrors(prev => ({ ...prev, inventory: err.message || 'Failed to load system inventory.' }));
    }
  };

  const runHealthCheck = async () => {
    setIsCheckingHealth(true);
    try {
      const data = await checkSystemHealth();
      setHealthData(data);
    } catch (err) {
      console.warn('[MaintenanceView] Health ping err:', err.message);
    } finally {
      setIsCheckingHealth(false);
    }
  };

  useEffect(() => {
    runHealthCheck();
    loadSystemInventory();
    const inventoryTimer = setInterval(loadSystemInventory, 15000);

    setIsLogsLoading(true);
    const unsubLogs = subscribeToAuditLogs({
      onUpdate: (data) => {
        setAuditLogs(data.logs || []);
        setIsLogsLoading(data.isLoading);
        setErrors(prev => ({ ...prev, audit: data.error || null }));
      },
      onError: (err) => {
        setErrors(prev => ({ ...prev, audit: err.message || 'Failed to load audit logs.' }));
        setIsLogsLoading(false);
      }
    });

    return () => {
      clearInterval(inventoryTimer);
      if (typeof unsubLogs === 'function') unsubLogs();
    };
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary dark:text-primary-light uppercase tracking-wider">
              System Governance
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
              Maintenance & Diagnostics
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
            Maintenance & Security Console
          </h1>
          <p className="text-xs sm:text-sm text-hug-muted mt-1 max-w-2xl">
            Authoritative platform health verification, live collection inventories, and immutable security audit records.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-danger-bg/40 border border-danger/30 rounded-2xl flex items-start gap-3 text-xs sm:text-sm font-semibold text-danger">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Error loading system diagnostics</p>
            <p className="text-xs text-danger/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Health & Volume Summary */}
      <SystemHealthSummary
        healthData={healthData}
        collectionCounts={counts}
        isCheckingHealth={isCheckingHealth}
        onRefreshHealth={runHealthCheck}
      />

      {/* Immutable System Audit Ledger */}
      <SystemAuditLedger
        logs={auditLogs}
        isLoading={isLogsLoading}
      />
    </div>
  );
}
