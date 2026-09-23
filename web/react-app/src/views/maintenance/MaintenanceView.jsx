import React, { useState, useEffect } from 'react';
import { ShieldAlert, Server, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { checkSystemHealth, fetchCropCycleInventory, subscribeToAuditLogs } from '../../services/maintenanceService';
import { subscribeToUsersData } from '../../services/usersService';
import { subscribeToFieldsData } from '../../services/fieldsService';
import { subscribeToOperationsData } from '../../services/operationsService';
import { subscribeToPrices } from '../../services/pricesService';
import SystemHealthSummary from '../../components/maintenance/SystemHealthSummary';
import SystemAuditLedger from '../../components/maintenance/SystemAuditLedger';

export default function MaintenanceView() {
  const { user, roleKey } = useAuth();

  const [healthData, setHealthData] = useState(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  const [auditLogs, setAuditLogs] = useState([]);
  const [isLogsLoading, setIsLogsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Collection counts
  const [counts, setCounts] = useState({
    users: 0,
    blockFarms: 0,
    fields: 0,
    operations: 0,
    prices: 0,
    cropCycles: null,
    activeCropCycles: null,
    archivedCropCycles: null
  });

  const loadCropCycleInventory = async () => {
    setCounts(prev => ({
      ...prev,
      cropCycles: null,
      activeCropCycles: null,
      archivedCropCycles: null
    }));
    try {
      const inventory = await fetchCropCycleInventory();
      setCounts(prev => ({
        ...prev,
        cropCycles: inventory.count,
        activeCropCycles: inventory.active,
        archivedCropCycles: inventory.archived
      }));
    } catch (err) {
      console.warn('[MaintenanceView] Crop cycle inventory err:', err.message);
      setCounts(prev => ({
        ...prev,
        cropCycles: 'UNAVAILABLE',
        activeCropCycles: null,
        archivedCropCycles: null
      }));
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
    if (roleKey !== 'superadmin') loadCropCycleInventory();

    setIsLogsLoading(true);
    const unsubLogs = subscribeToAuditLogs({
      onUpdate: (data) => {
        setAuditLogs(data.logs || []);
        setIsLogsLoading(data.isLoading);
        setError(data.error);
      },
      onError: (err) => {
        setError(err.message || 'Failed to load audit logs.');
        setIsLogsLoading(false);
      }
    });

    // Subscriptions to collect truthful live record volumes
    const unsubUsers = subscribeToUsersData({
      user,
      onUpdate: (data) => {
        setCounts(prev => ({ ...prev, users: (data.users || []).length + (data.pendingUsers || []).length }));
      }
    });

    const unsubFields = roleKey === 'superadmin' ? null : subscribeToFieldsData({
      user,
      onUpdate: (data) => {
        const cycles = Array.isArray(data.cropCycles) ? data.cropCycles : [];
        const active = cycles.filter(c => String(c.status || '').toUpperCase() === 'ACTIVE').length;
        const archived = cycles.filter(c => String(c.status || '').toUpperCase() === 'ARCHIVED').length;
        setCounts(prev => ({
          ...prev,
          blockFarms: (data.blockFarms || []).length,
          fields: (data.fields || []).length,
          ...(cycles.length > 0 ? {
            cropCycles: cycles.length,
            activeCropCycles: active,
            archivedCropCycles: archived
          } : {})
        }));
      }
    });

    const unsubOps = roleKey === 'superadmin' ? null : subscribeToOperationsData({
      user,
      onUpdate: (data) => {
        setCounts(prev => ({ ...prev, operations: (data.operations || []).length }));
      }
    });

    const unsubPrices = roleKey === 'superadmin' ? null : subscribeToPrices({
      onUpdate: (data) => {
        setCounts(prev => ({ ...prev, prices: (data.prices || []).length }));
      }
    });

    return () => {
      if (typeof unsubLogs === 'function') unsubLogs();
      if (typeof unsubUsers === 'function') unsubUsers();
      if (typeof unsubFields === 'function') unsubFields();
      if (typeof unsubOps === 'function') unsubOps();
      if (typeof unsubPrices === 'function') unsubPrices();
    };
  }, [user, roleKey]);

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
