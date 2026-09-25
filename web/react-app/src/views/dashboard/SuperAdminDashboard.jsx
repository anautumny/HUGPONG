import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  LifeBuoy,
  Server,
  Smartphone,
  ShieldAlert,
  Database
} from 'lucide-react';
import CompactDashboardHeader from '../../components/dashboard/CompactDashboardHeader';
import MetricSummaryRow from '../../components/dashboard/MetricSummaryRow';
import AttentionItemsCard from '../../components/dashboard/AttentionItemsCard';

function accountNameList(accounts) {
  const names = accounts.map(account => account.displayName).filter(Boolean);
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

export default function SuperAdminDashboard({ data = {}, user = {} }) {
  const {
    supportTickets = [],
    terminalDiagnostics = [],
    systemDiagnostics = {},
    isLoading = false
  } = data;

  // Open support tickets
  const openTickets = useMemo(() => {
    return supportTickets.filter(t => {
      const status = (t.status || 'OPEN').toUpperCase();
      return status === 'OPEN' || status === 'PENDING' || status === 'IN_PROGRESS';
    });
  }, [supportTickets]);

  const activeAccountCount = terminalDiagnostics.length;
  const accountsWithSyncReports = terminalDiagnostics.filter(subject => Boolean(subject.sync?.lastReportedAt)).length;
  const withinWindowAccounts = terminalDiagnostics.filter(subject => subject.activity?.attentionStatus === 'WITHIN_WINDOW');
  const attentionAccounts = terminalDiagnostics.filter(subject => subject.activity?.attentionStatus === 'NEEDS_ATTENTION');
  const criticalAccounts = terminalDiagnostics.filter(subject => subject.activity?.attentionStatus === 'CRITICAL');
  const diagnosticsReported = Object.keys(systemDiagnostics).length > 0;
  const activityAlertCount = attentionAccounts.length + criticalAccounts.length;
  const platformAttentionCount = activityAlertCount + openTickets.length;
  const platformStatus = criticalAccounts.length > 0
    ? { label: 'Critical review required', tone: 'border-danger/30 bg-danger-bg/40 text-danger' }
    : platformAttentionCount > 0
      ? { label: 'Review required', tone: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' }
      : { label: 'No current alerts', tone: 'border-success/25 bg-success-bg text-success' };
  const storedOperations = diagnosticsReported
    ? Number(systemDiagnostics.operations || 0).toLocaleString()
    : '—';

  // Platform attention items
  const attentionItems = useMemo(() => {
    const items = [];

    if (criticalAccounts.length > 0) {
      items.push({
        id: 'critical-inactivity',
        title: `${criticalAccounts.length} Critical Inactive Account${criticalAccounts.length === 1 ? '' : 's'}`,
        description: `Not active for at least 5 days: ${accountNameList(criticalAccounts)}.`,
        type: 'danger',
        to: '/sync',
        actionLabel: 'Review Activity'
      });
    }

    if (attentionAccounts.length > 0) {
      items.push({
        id: 'attention-inactivity',
        title: `${attentionAccounts.length} Account${attentionAccounts.length === 1 ? '' : 's'} Need Attention`,
        description: `Not active for 3 to 4 days, or no activity date is available: ${accountNameList(attentionAccounts)}.`,
        type: 'warning',
        to: '/sync',
        actionLabel: 'Review Activity'
      });
    }

    if (openTickets.length > 0) {
      items.push({
        id: 'open-tickets',
        title: `${openTickets.length} Open Support Ticket${openTickets.length > 1 ? 's' : ''}`,
        description: 'Farm Members or Farm Managers submitted support issues requiring Super Admin review.',
        type: 'warning',
        to: '/support',
        actionLabel: 'Review Tickets'
      });
    }

    return items;
  }, [openTickets, attentionAccounts, criticalAccounts]);

  const headerActions = [
    {
      label: 'User Administration',
      to: '/users',
      icon: Users,
      variant: 'primary'
    },
    {
      label: 'System Sync',
      to: '/sync',
      icon: Smartphone,
      variant: 'primary'
    }
  ];

  const summaryMetrics = [
    {
      label: 'Active Accounts',
      value: activeAccountCount,
      subtext: `${accountsWithSyncReports} with sync report${accountsWithSyncReports === 1 ? '' : 's'}`,
      icon: Database
    },
    {
      label: 'Within 3-Day Window',
      value: withinWindowAccounts.length,
      subtext: 'No inactivity alert',
      icon: Users
    },
    {
      label: 'Needs Attention',
      value: attentionAccounts.length,
      subtext: 'Not active for 3 to 4 days',
      icon: LifeBuoy,
      tone: 'warning'
    },
    {
      label: 'Critical',
      value: criticalAccounts.length,
      subtext: 'Not active for at least 5 days',
      icon: ShieldAlert,
      tone: 'danger'
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header */}
      <CompactDashboardHeader
        category="Platform Administration"
        badge="System Governance"
        title="Super Admin Dashboard"
        subtitle="System governance, account activity monitoring, and technical support."
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
                Monitoring Active
              </span>
            </div>

            <h3 className="text-lg font-black text-hug-text tracking-tight">
              Platform Status
            </h3>
            <p className="text-xs text-hug-muted mt-1 leading-relaxed">
              Server availability, database reporting, and account activity monitoring.
            </p>

            <div className="mt-4 pt-3 border-t border-border/60 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-hug-muted flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-hug-muted" />
                  Database Persistence
                </span>
                <span className={`font-semibold ${diagnosticsReported ? 'text-success' : 'text-hug-muted'}`}>
                  {diagnosticsReported ? 'Reporting' : 'Not reported'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-hug-muted flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-hug-muted" />
                  API Server
                </span>
                <span className="font-semibold text-success">Dashboard request completed</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-hug-muted flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-hug-muted" />
                  Account Activity
                </span>
                <span className="font-semibold text-hug-text">
                  {withinWindowAccounts.length} Within 3-Day Window
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-border/60">
            <p className="text-[11px] text-hug-muted font-medium">
              Governance access is limited to accounts, support, account activity, and platform health.
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
        emptyTitle="No accounts need attention"
        emptyDescription="No account has crossed an inactivity threshold and no unresolved support ticket requires attention."
      />

      {/* 5. Platform Governance Overview */}
      <section className="bg-surface rounded-2xl border border-border shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 border-b border-border/70">
          <div className="max-w-3xl">
            <span className="text-[11px] font-bold text-primary dark:text-primary-light uppercase tracking-[0.16em]">
              Platform Overview
            </span>
            <h2 className="text-lg sm:text-xl font-black text-hug-text tracking-tight mt-1">
              Governance Snapshot
            </h2>
            <p className="text-xs sm:text-sm text-hug-muted leading-relaxed mt-1.5">
              Review support demand, account inactivity, and the latest server-reported operational record count.
            </p>
          </div>

          <span className={`self-start inline-flex rounded-full border px-3 py-1.5 text-[11px] font-bold ${platformStatus.tone}`}>
            {isLoading ? 'Loading status' : platformStatus.label}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border/70">
          <Link
            to="/support"
            className="group bg-surface p-5 sm:p-6 transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <span className="text-[10px] font-bold text-hug-muted uppercase tracking-wider">Support</span>
            <div className="flex items-end justify-between gap-4 mt-2">
              <span className="text-3xl font-black text-hug-text tracking-tight">{openTickets.length}</span>
              <span className="text-[11px] font-semibold text-primary dark:text-primary-light group-hover:underline">Open desk</span>
            </div>
            <p className="text-xs text-hug-muted mt-2">
              {openTickets.length === 0 ? 'No tickets awaiting action.' : `${openTickets.length} ticket${openTickets.length === 1 ? '' : 's'} awaiting action.`}
            </p>
          </Link>

          <Link
            to="/sync"
            className="group bg-surface p-5 sm:p-6 transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <span className="text-[10px] font-bold text-hug-muted uppercase tracking-wider">Account Activity</span>
            <div className="flex items-end justify-between gap-4 mt-2">
              <span className={`text-3xl font-black tracking-tight ${criticalAccounts.length > 0 ? 'text-danger' : attentionAccounts.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-hug-text'}`}>
                {activityAlertCount}
              </span>
              <span className="text-[11px] font-semibold text-primary dark:text-primary-light group-hover:underline">Review accounts</span>
            </div>
            <p className="text-xs text-hug-muted mt-2">
              {attentionAccounts.length} need attention · {criticalAccounts.length} critical
            </p>
          </Link>

          <Link
            to="/maintenance"
            className="group bg-surface p-5 sm:p-6 transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <span className="text-[10px] font-bold text-hug-muted uppercase tracking-wider">Operational Records</span>
            <div className="flex items-end justify-between gap-4 mt-2">
              <span className="text-3xl font-black text-hug-text tracking-tight">{storedOperations}</span>
              <span className="text-[11px] font-semibold text-primary dark:text-primary-light group-hover:underline">System controls</span>
            </div>
            <p className="text-xs text-hug-muted mt-2">
              {diagnosticsReported ? 'Stored operation records reported by the server.' : 'System totals are currently unavailable.'}
            </p>
          </Link>
        </div>

        <footer className="px-5 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-bg/40">
          <span className="text-[11px] text-hug-muted">Authority scope: Super Admin</span>
          <span className={`text-[11px] font-semibold ${diagnosticsReported ? 'text-success' : 'text-hug-muted'}`}>
            {isLoading ? 'Loading server data' : diagnosticsReported ? 'Server snapshot available' : 'System totals unavailable'}
          </span>
        </footer>
      </section>
    </div>
  );
}
