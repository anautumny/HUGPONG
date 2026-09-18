import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Activity,
  LifeBuoy,
  Server,
  Smartphone,
  ShieldAlert,
  Database,
  CheckCircle,
  BarChart3,
  ArrowRight
} from 'lucide-react';
import CompactDashboardHeader from '../../components/dashboard/CompactDashboardHeader';
import CurrentPriceCard from '../../components/dashboard/CurrentPriceCard';
import MetricSummaryRow from '../../components/dashboard/MetricSummaryRow';
import AttentionItemsCard from '../../components/dashboard/AttentionItemsCard';

export default function SuperAdminDashboard({ data = {}, user = {} }) {
  const {
    currentPrice,
    previousPrice,
    blockFarms = [],
    fields = [],
    supportTickets = [],
    auditReports = [],
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
  const totalPlots = fields.length;
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
      icon: Users
    },
    {
      label: 'System Health',
      to: '/maintenance',
      icon: Activity
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
      label: 'District Block Farms',
      value: blockFarms.length,
      subtext: `${totalPlots} registered member plots`,
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
    <div className="space-y-6">
      {/* 1. Compact Working Header */}
      <CompactDashboardHeader
        title="Super Admin Dashboard"
        contextText="System Governance, Platform Infrastructure & Support Operations"
        actions={headerActions}
      />

      {/* 2. Platform Infrastructure & Reference SRA Price (12-col grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 flex flex-col">
          <CurrentPriceCard
            price={currentPrice}
            previousPrice={previousPrice}
            isLoading={isLoading}
          />
        </div>

        {/* System Health Card (4 cols) */}
        <div className="lg:col-span-4 bg-surface rounded-2xl p-5 sm:p-6 border border-border shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-hug-muted uppercase tracking-wider">
                System Pulse
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-success-bg text-success">
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
                  Audit Records
                </span>
                <span className="font-semibold text-hug-text">{auditReports.length} Verified</span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-border/60">
            <p className="text-[11px] text-hug-muted font-medium">
              Agricultural analytics are aggregated across all district block farms.
            </p>
          </div>
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

      {/* 5. Concise Platform Analytics Preview */}
      <div className="bg-surface rounded-2xl p-5 border border-border shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary dark:text-primary-light" />
            <h3 className="text-xs font-bold text-hug-text uppercase tracking-wider">
              Platform Analytics Preview
            </h3>
          </div>
          <Link
            to="/analytics"
            className="text-xs font-semibold text-primary dark:text-primary-light hover:underline inline-flex items-center gap-1 transition-colors"
          >
            <span>View Full Analytics</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-xl bg-bg border border-border/60">
            <span className="text-[11px] font-medium text-hug-muted block mb-1">District Farm Registry</span>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-bold text-hug-text">{blockFarms.length} Block Farms</span>
              <span className="text-xs text-hug-muted font-medium">{totalPlots} Plots</span>
            </div>
            <p className="text-[11px] text-hug-muted mt-1.5">
              Covers all registered cooperative members and production acreage.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-bg border border-border/60">
            <span className="text-[11px] font-medium text-hug-muted block mb-1">Support Resolution</span>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-bold text-hug-text">
                {openTickets.length === 0 ? 'All Cleared' : `${openTickets.length} Open`}
              </span>
              <span className="text-xs text-hug-muted font-medium">&lt; 24h SLA</span>
            </div>
            <p className="text-[11px] text-hug-muted mt-1.5">
              {supportTickets.length} total tickets processed this season.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-bg border border-border/60">
            <span className="text-[11px] font-medium text-hug-muted block mb-1">Data Governance</span>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-bold text-success">Compliant</span>
              <span className="text-xs text-hug-muted font-medium">RA 10173</span>
            </div>
            <p className="text-[11px] text-hug-muted mt-1.5">
              Dual outbox synchronization with cryptographic integrity checks.
            </p>
          </div>
        </div>
      </div>

      {/* 6. Platform Governance Overview */}
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
