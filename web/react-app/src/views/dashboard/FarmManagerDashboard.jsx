import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Folder,
  ClipboardList,
  UserCheck,
  MapPin,
  Calendar,
  Layers,
  Activity,
  BarChart3,
  ArrowRight
} from 'lucide-react';
import CompactDashboardHeader from '../../components/dashboard/CompactDashboardHeader';
import CurrentPriceCard from '../../components/dashboard/CurrentPriceCard';
import MetricSummaryRow from '../../components/dashboard/MetricSummaryRow';
import RecentOperationsTable from '../../components/dashboard/RecentOperationsTable';
import AttentionItemsCard from '../../components/dashboard/AttentionItemsCard';
import { formatHectares } from '../../utils/formatters';

export default function FarmManagerDashboard({ data = {}, user = {} }) {
  const {
    currentPrice,
    previousPrice,
    assignedBlockFarm,
    scopedFields = [],
    recentOperations = [],
    isLoading = false
  } = data;

  const farmName = assignedBlockFarm?.name || 'Unassigned Block Farm';
  const farmCode = assignedBlockFarm?.code || '—';
  const declaredHa = assignedBlockFarm?.declaredHa ?? assignedBlockFarm?.declaredAreaHa ?? 0;

  // Calculate cultivated area from scoped fields
  const totalCultivatedArea = useMemo(() => {
    return scopedFields.reduce((sum, f) => sum + (Number(f.ha || f.areaHa || 0)), 0);
  }, [scopedFields]);

  const utilizationPct = declaredHa > 0
    ? Math.min(100, Math.round((totalCultivatedArea / declaredHa) * 100))
    : 0;

  // Derive attention items
  const attentionItems = useMemo(() => {
    const items = [];

    if (!assignedBlockFarm) {
      items.push({
        id: 'no-farm',
        title: 'Block Farm Assignment Pending',
        description: 'You are currently not linked to a specific Block Farm. Contact your SRA Administrator.',
        type: 'warning',
        to: '/profile',
        actionLabel: 'Check Profile'
      });
    }

    if (assignedBlockFarm && scopedFields.length === 0) {
      items.push({
        id: 'no-fields',
        title: 'No Member Plots Registered',
        description: `No fields have been linked to ${farmName} yet. Register member plots to begin operational tracking.`,
        type: 'info',
        to: '/fields',
        actionLabel: 'Register Fields'
      });
    }

    // Check for any operations needing follow-up
    const pendingOps = recentOperations.filter(op => (op.status || '').toUpperCase() === 'PENDING');
    if (pendingOps.length > 0) {
      items.push({
        id: 'pending-ops',
        title: `${pendingOps.length} Pending Operation Record${pendingOps.length > 1 ? 's' : ''}`,
        description: 'Recent field logs submitted require status review in the Operations Console.',
        type: 'warning',
        to: '/operations',
        actionLabel: 'Review Ops'
      });
    }

    return items;
  }, [assignedBlockFarm, scopedFields, recentOperations, farmName]);

  const headerActions = [
    {
      label: 'Field Operations',
      to: '/operations',
      icon: ClipboardList
    },
    {
      label: 'Take Over Console',
      to: '/takeover',
      icon: UserCheck
    }
  ];

  const summaryMetrics = [
    {
      label: 'Active Fields',
      value: scopedFields.length,
      subtext: `${farmName}`,
      icon: Layers
    },
    {
      label: 'Cultivated Area',
      value: formatHectares(totalCultivatedArea),
      subtext: `Declared: ${formatHectares(declaredHa)}`,
      icon: MapPin
    },
    {
      label: 'Recent Operations',
      value: recentOperations.length,
      subtext: 'Scoped to assigned farm',
      icon: Activity
    },
    {
      label: 'Crop Cycle State',
      value: 'Active',
      subtext: 'Current Milling Season',
      icon: Calendar
    }
  ];

  return (
    <div className="space-y-6">
      {/* 1. Compact Working Header */}
      <CompactDashboardHeader
        title="Farm Manager Dashboard"
        contextText={`${farmName} (${farmCode}) · Operational Workspace`}
        actions={headerActions}
      />

      {/* 2. Primary Current Price & Operational Focus (12-col grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 flex flex-col">
          <CurrentPriceCard
            price={currentPrice}
            previousPrice={previousPrice}
            isLoading={isLoading}
          />
        </div>

        {/* Assigned Block Farm Overview (4 cols) */}
        <div className="lg:col-span-4 bg-surface rounded-2xl p-5 sm:p-6 border border-border shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-hug-muted uppercase tracking-wider">
                Assigned Block Farm
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-bg text-primary dark:text-primary-light">
                {farmCode}
              </span>
            </div>

            <h3 className="text-lg font-black text-hug-text tracking-tight">
              {farmName}
            </h3>

            {assignedBlockFarm?.location && (
              <p className="text-xs text-hug-muted mt-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-hug-muted shrink-0" />
                <span className="truncate">{assignedBlockFarm.location}</span>
              </p>
            )}

            <div className="mt-4 pt-3 border-t border-border/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-hug-muted">Manager in Charge</span>
                <span className="font-semibold text-hug-text">
                  {user?.displayName || user?.name || 'Farm Manager'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-hug-muted">Declared Area</span>
                <span className="font-semibold text-hug-text">
                  {formatHectares(declaredHa)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-hug-muted">Active Member Fields</span>
                <span className="font-semibold text-hug-text">
                  {scopedFields.length} plots
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-border/60">
            <p className="text-[11px] text-hug-muted font-medium">
              Member field operations and activity logs sync to your local console.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Concise Operational Metrics Row */}
      <MetricSummaryRow
        metrics={summaryMetrics}
        isLoading={isLoading}
      />

      {/* 4. Operational Attention Strip */}
      <AttentionItemsCard
        title="Operational Attention"
        items={attentionItems}
        isLoading={isLoading}
        emptyTitle="All plots operational"
        emptyDescription="No lagging member syncs or pending operational blockers detected for your block farm."
      />

      {/* 5. Concise Analytics Preview Row */}
      <div className="bg-surface rounded-2xl p-5 border border-border shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary dark:text-primary-light" />
            <h3 className="text-xs font-bold text-hug-text uppercase tracking-wider">
              Operational Analytics Preview
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
            <span className="text-[11px] font-medium text-hug-muted block mb-1">Plot Area Coverage</span>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-base font-bold text-hug-text">{formatHectares(totalCultivatedArea)}</span>
              <span className="text-xs text-hug-muted font-medium">{utilizationPct}% of declared</span>
            </div>
            <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${utilizationPct}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-bg border border-border/60">
            <span className="text-[11px] font-medium text-hug-muted block mb-1">Operational Activity</span>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-bold text-hug-text">{recentOperations.length} Records</span>
              <span className="text-xs text-hug-muted font-medium">This Season</span>
            </div>
            <p className="text-[11px] text-hug-muted mt-1.5">
              Logs recorded across {scopedFields.length} active registered member plots.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-bg border border-border/60">
            <span className="text-[11px] font-medium text-hug-muted block mb-1">Production Readiness</span>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-bold text-success">Active Milling</span>
              <span className="text-xs text-hug-muted font-medium">Standard Cycle</span>
            </div>
            <p className="text-[11px] text-hug-muted mt-1.5">
              Crop tracking updated based on scheduled milling calendar.
            </p>
          </div>
        </div>
      </div>

      {/* 6. Recent Operations Table */}
      <RecentOperationsTable
        operations={recentOperations}
        isLoading={isLoading}
      />
    </div>
  );
}
