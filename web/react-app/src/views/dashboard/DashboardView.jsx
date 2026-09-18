import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_KEYS } from '../../utils/authRouting';
import { subscribeToDashboardData } from '../../services/dashboardService';
import FarmManagerDashboard from './FarmManagerDashboard';
import SraAdminDashboard from './SraAdminDashboard';
import SuperAdminDashboard from './SuperAdminDashboard';
import { ErrorState } from '../../components/ui';

export default function DashboardView() {
  const { user, roleKey } = useAuth();

  const [dashboardData, setDashboardData] = useState({
    prices: [],
    currentPrice: null,
    previousPrice: null,
    fields: [],
    scopedFields: [],
    blockFarms: [],
    assignedBlockFarm: null,
    operations: [],
    recentOperations: [],
    cropCycles: [],
    supportTickets: [],
    auditReports: [],
    terminalDiagnostics: [],
    isLoading: true,
    error: null
  });

  const [subscriptionKey, setSubscriptionKey] = useState(0);

  const handleRetry = useCallback(() => {
    setDashboardData(prev => ({ ...prev, isLoading: true, error: null }));
    setSubscriptionKey(k => k + 1);
  }, []);

  useEffect(() => {
    let active = true;

    const unsubscribe = subscribeToDashboardData({
      roleKey,
      user,
      onUpdate: (updatedState) => {
        if (!active) return;
        setDashboardData(updatedState);
      },
      onError: (err) => {
        if (!active) return;
        setDashboardData(prev => ({
          ...prev,
          isLoading: false,
          error: 'Unable to synchronize real-time dashboard data. Please check connection.'
        }));
      }
    });

    return () => {
      active = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [roleKey, user?.id, user?.employeeId, user?.blockFarmId, subscriptionKey]);

  // Handle scoped section failure
  if (dashboardData.error && dashboardData.isLoading) {
    return (
      <ErrorState
        title="Dashboard Connection Issue"
        message={dashboardData.error}
        onRetry={handleRetry}
        retryText="Retry Connection"
        className="py-12"
      />
    );
  }

  // Render role-specific dashboard
  switch (roleKey) {
    case ROLE_KEYS.SRA_ADMIN:
      return <SraAdminDashboard data={dashboardData} user={user} />;
    case ROLE_KEYS.SUPER_ADMIN:
      return <SuperAdminDashboard data={dashboardData} user={user} />;
    case ROLE_KEYS.FARM_MANAGER:
    default:
      return <FarmManagerDashboard data={dashboardData} user={user} />;
  }
}
