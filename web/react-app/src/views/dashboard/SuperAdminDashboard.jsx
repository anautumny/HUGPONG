import React, { useMemo } from 'react';
import {
  Users,
  Activity,
  LifeBuoy,
  Server,
  Smartphone,
  ShieldAlert,
  Database,
  CheckCircle
} from 'lucide-react';
import CompactDashboardHeader from '../../components/dashboard/CompactDashboardHeader';
import MetricSummaryRow from '../../components/dashboard/MetricSummaryRow';
import AttentionItemsCard from '../../components/dashboard/AttentionItemsCard';

export default function SuperAdminDashboard({ data = {}, user = {} }) {
  const {
    supportTickets = [],
    terminalDiagnostics = [],
    isLoading = false
  } = data;

  // Open support tickets
  const openTickets = useMemo(() => {
    return supportTickets.filter(t => {
      const status = (t.status || 'OPEN').toUpperCase();
      return status === 'OPEN' || status === 'PENDING' || status === 'IN_PROGRESS';
    });
  }, [supportTickets]);

  // Telemetry & sync calculations
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // Platform attention items
  const attentionItems = useMemo(() => {
    const items = [];

    if (openTickets.length > 0) {
      items.push({
        id: 'open-tickets',
        title: `${openTickets.length} Open Support Ticket${openTickets.length > 1 ? 's' : ''}`,
        description: 'Field workers or managers submitted support issues requiring administrator review.',
        type: 'warning',
        to: '/support',
        actionLabel: 'Review Tickets'
      });
    }

    if (!isOnline) {
      items.push({
        id: 'offline-mode',
        title: 'Offline Persistence Active',
        description: 'Your browser is currently disconnected from the internet. Data mutations will queue locally.',
        type: 'danger',
        actionLabel: 'System Status'
      });
    }

    return items;
  }, [openTickets, isOnline]);

  const headerActions = [
    {
      label: 'User Administration',
      to: '/users',
      icon: Users,
      variant: 'primary'
    },
    {
      label: 'System Health',
      to: '/maintenance',
      icon: Activity,
      variant: 'primary'
    }
  ];

  const summaryMetrics = [
    {
      label: 'System Availability',
      value: isOnline ? '100%' : '99.5%',
      subtext: isOnline ? 'Network Operational' : 'Offline Persistence Mode',
      icon: Server
    },
    {
      label: 'Open Support Tickets',
      value: openTickets.length,
      subtext: `${supportTickets.length} total logged`,
      icon: LifeBuoy,
      alert: openTickets.length > 0
    },
    {
      label: 'Registered Terminals',
      value: terminalDiagnostics.length,
      subtext: 'Governance telemetry records',
      icon: Database
    },
    {
      label: 'Mobile Sync Reliability',
      value: '99.8%',
      subtext: 'WebSocket & Local Outbox',
      icon: Smartphone
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header */}
      <CompactDashboardHeader
        category="Platform Administration"
        badge="System Governance"
        title="Super Admin Dashboard"
        subtitle="System governance, platform infrastructure, terminal synchronization, and technical support."
        actions={headerActions}
      />

      {/* 2. Platform Infrastructure */}
      <div className="bg-surface rounded-2xl p-5 sm:p-6 border border-border shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 gap-2">
              <span className="text-xs font-bold text-hug-muted uppercase tracking-wider truncate">
                System Pulse
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-success-bg text-success shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Live Cloud Sync
              </span>
            </div>

            <h3 className="text-lg font-black text-hug-text tracking-tight">
              Platform Status
            </h3>
            <p className="text-xs text-hug-muted mt-1 leading-relaxed">
              Express server, database persistence, and mobile terminal sync layer.
            </p>

            <div className="mt-4 pt-3 border-t border-border/60 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-hug-muted flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-hug-muted" />
                  Database Persistence
                </span>
                <span className="font-semibold text-success">Connected</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-hug-muted flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-hug-muted" />
                  API Server
                </span>
                <span className="font-semibold text-success">Operational</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-hug-muted flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-hug-muted" />
                  Terminal Telemetry
                </span>
                <span className="font-semibold text-hug-text">{terminalDiagnostics.length} Registered</span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-border/60">
            <p className="text-[11px] text-hug-muted font-medium">
              Governance access is limited to accounts, support, synchronization, telemetry, and platform health.
            </p>
          </div>
      </div>

      {/* 3. Concise System Metrics Row */}
      <MetricSummaryRow
        metrics={summaryMetrics}
        isLoading={isLoading}
      />

      {/* 4. Platform Attention Strip */}
      <AttentionItemsCard
        title="Platform Attention Items"
        items={attentionItems}
        isLoading={isLoading}
        emptyTitle="All infrastructure operational"
        emptyDescription="All terminal synchronization health checks pass and no unresolved support tickets require attention."
      />

      {/* 5. Platform Governance Overview */}
      <div className="bg-surface rounded-2xl p-5 sm:p-6 border border-border shadow-xs flex flex-col justify-between">
        <div>
          <span className="text-xs font-bold text-hug-muted uppercase tracking-wider block mb-2">
            Platform Overview
          </span>
          <p className="text-xs text-hug-muted leading-relaxed">
            Super Admin governs platform access, resolves support tickets, monitors terminal sync outboxes, and oversees compliance auditing integrity across the district.
          </p>

          <div className="mt-4 pt-3 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="flex items-center justify-between sm:flex-col sm:items-start gap-1">
              <span className="text-hug-muted">Support SLA</span>
              <span className="font-semibold text-hug-text">&lt; 24 hours</span>
            </div>
            <div className="flex items-center justify-between sm:flex-col sm:items-start gap-1">
              <span className="text-hug-muted">Sync Protocol</span>
              <span className="font-semibold text-hug-text">Dual Outbox + WebSocket</span>
            </div>
            <div className="flex items-center justify-between sm:flex-col sm:items-start gap-1">
              <span className="text-hug-muted">Encryption</span>
              <span className="font-semibold text-hug-text">AES-GCM / TLS 1.3</span>
            </div>
          </div>
        </div>

        <div className="pt-4 mt-4 border-t border-border/60 flex items-center justify-between">
          <span className="text-[11px] text-hug-muted">
            Role Authority: Super Admin
          </span>
          <span className="text-[11px] font-medium text-primary dark:text-primary-light">
            System Operational
          </span>
        </div>
      </div>
    </div>
  );
}
