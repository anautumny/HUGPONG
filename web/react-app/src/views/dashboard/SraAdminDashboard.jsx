import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  PlusCircle,
  ShieldCheck,
  Building2,
  FileCheck2,
  MapPin,
  Layers,
  Calendar,
  BarChart3,
  ArrowRight
} from 'lucide-react';
import CompactDashboardHeader from '../../components/dashboard/CompactDashboardHeader';
import CurrentPriceCard from '../../components/dashboard/CurrentPriceCard';
import MetricSummaryRow from '../../components/dashboard/MetricSummaryRow';
import RecentOperationsTable from '../../components/dashboard/RecentOperationsTable';
import AttentionItemsCard from '../../components/dashboard/AttentionItemsCard';
import PublishPriceModal from '../../components/prices/PublishPriceModal';
import { formatHectares, formatCurrency } from '../../utils/formatters';

export default function SraAdminDashboard({ data = {}, user = {} }) {
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const {
    currentPrice,
    previousPrice,
    blockFarms = [],
    fields = [],
    auditReports = [],
    recentOperations = [],
    isLoading = false
  } = data;

  // Calculate total district area across all block farms
  const totalDistrictArea = useMemo(() => {
    return blockFarms.reduce((sum, bf) => sum + (Number(bf.declaredAreaHa ?? bf.declaredHa ?? 0)), 0);
  }, [blockFarms]);

  // Pending audit reports awaiting certification
  const pendingAudits = useMemo(() => {
    return auditReports.filter(r => ['PENDING', 'PENDING_REVIEW'].includes((r.status || '').toUpperCase()));
  }, [auditReports]);

  // Derive regulatory attention items
  const attentionItems = useMemo(() => {
    const items = [];

    if (!currentPrice) {
      items.push({
        id: 'no-price',
        title: 'No Current SRA Price Published',
        description: 'Publish the latest official millsite circular to broadcast official prices across district terminals.',
        type: 'warning',
        to: '/prices',
        actionLabel: 'Publish Price'
      });
    }

    if (pendingAudits.length > 0) {
      items.push({
        id: 'pending-audits',
        title: `${pendingAudits.length} Audit Compilation${pendingAudits.length > 1 ? 's' : ''} Pending`,
        description: 'Block Farm monthly audit submissions require regulatory certification.',
        type: 'warning',
        to: '/audit',
        actionLabel: 'Certify Reports'
      });
    }

    if (blockFarms.length === 0) {
      items.push({
        id: 'no-farms',
        title: 'No Block Farms Registered',
        description: 'Register sugarcane block farms to establish district management boundaries.',
        type: 'info',
        to: '/fields',
        actionLabel: 'Register Farm'
      });
    }

    return items;
  }, [currentPrice, pendingAudits, blockFarms]);

  const headerActions = [
    {
      label: 'Post Official SRA Price',
      onClick: () => setIsPublishModalOpen(true),
      icon: PlusCircle,
      variant: 'primary'
    },
    {
      label: 'Audit Center',
      to: '/audit',
      icon: ShieldCheck,
      variant: 'primary'
    }
  ];

  const summaryMetrics = [
    {
      label: 'Registered Block Farms',
      value: blockFarms.length,
      subtext: 'District Jurisdiction',
      icon: Building2
    },
    {
      label: 'Total District Area',
      value: formatHectares(totalDistrictArea),
      subtext: `${fields.length} registered plots`,
      icon: MapPin
    },
    {
      label: 'Pending Audits',
      value: pendingAudits.length,
      subtext: `${auditReports.length} total compiled`,
      icon: FileCheck2,
      alert: pendingAudits.length > 0
    },
    {
      label: 'Active Fields',
      value: fields.length,
      subtext: 'District Coverage',
      icon: Layers
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header */}
      <CompactDashboardHeader
        category="Regulatory Oversight"
        badge="District Administration"
        title="SRA Admin Dashboard"
        subtitle="Sugar Regulatory Administration · District regulatory compliance, millsite benchmarks, and audit verification."
        actions={headerActions}
      />

      {/* 2. Primary Official Price Section (12-col grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 min-w-0 flex flex-col">
          <CurrentPriceCard
            price={currentPrice}
            previousPrice={previousPrice}
            isLoading={isLoading}
          />
        </div>

        {/* Regulatory Governance Overview (4 cols) */}
        <div className="lg:col-span-4 min-w-0 bg-surface rounded-2xl p-5 sm:p-6 border border-border shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-bold text-hug-muted uppercase tracking-wider truncate">
                District Regulatory Scope
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-bg text-primary dark:text-primary-light shrink-0">
                SRA Authority
              </span>
            </div>

            <h3 className="text-lg font-black text-hug-text tracking-tight">
              Regulatory Oversight
            </h3>
            <p className="text-xs text-hug-muted mt-1 leading-relaxed">
              Supervising block farms, official price circulars, and compliance audit certifications.
            </p>

            <div className="mt-4 pt-3 border-t border-border/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-hug-muted">Certified Reports</span>
                <span className="font-semibold text-hug-text">
                  {auditReports.length - pendingAudits.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-hug-muted">Awaiting SRA Signature</span>
                <span className={`font-semibold ${pendingAudits.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-hug-text'}`}>
                  {pendingAudits.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-hug-muted">District Block Farms</span>
                <span className="font-semibold text-hug-text">
                  {blockFarms.length} Active
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-border/60">
            <p className="text-[11px] text-hug-muted font-medium">
              Official prices published here sync immediately to all mobile field terminals.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Concise District Metrics Row */}
      <MetricSummaryRow
        metrics={summaryMetrics}
        isLoading={isLoading}
      />

      {/* 4. Regulatory Attention Strip */}
      <AttentionItemsCard
        title="Regulatory Attention"
        items={attentionItems}
        isLoading={isLoading}
        emptyTitle="All regulatory items current"
        emptyDescription="Official SRA prices are published and all submitted audit reports have been certified."
      />

      {/* 5. Concise District Analytics Preview */}
      <div className="bg-surface rounded-2xl p-5 border border-border shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary dark:text-primary-light" />
            <h3 className="text-xs font-bold text-hug-text uppercase tracking-wider">
              District Analytics Preview
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
            <span className="text-[11px] font-medium text-hug-muted block mb-1">Total District Area</span>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-bold text-hug-text">{formatHectares(totalDistrictArea)}</span>
              <span className="text-xs text-hug-muted font-medium">{blockFarms.length} Block Farms</span>
            </div>
            <p className="text-[11px] text-hug-muted mt-1.5">
              Supervising {fields.length} registered sugarcane member plots in this district.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-bg border border-border/60">
            <span className="text-[11px] font-medium text-hug-muted block mb-1">Price Stability Index</span>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-bold text-hug-text">
                {currentPrice ? formatCurrency(currentPrice.sugarPricePerLkg) : '—'}
              </span>
              <span className="text-xs text-hug-muted font-medium">per LKg</span>
            </div>
            <p className="text-[11px] text-hug-muted mt-1.5">
              {previousPrice ? 'Tracked against preceding official price circular.' : 'Current active district baseline rate.'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-bg border border-border/60">
            <span className="text-[11px] font-medium text-hug-muted block mb-1">Audit Compliance Rate</span>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-bold text-hug-text">
                {auditReports.length > 0
                  ? `${Math.round(((auditReports.length - pendingAudits.length) / auditReports.length) * 100)}%`
                  : '—'}
              </span>
              <span className="text-xs text-hug-muted font-medium">Certified Dossiers</span>
            </div>
            <p className="text-[11px] text-hug-muted mt-1.5">
              {pendingAudits.length} dossier{pendingAudits.length === 1 ? '' : 's'} awaiting regulatory sign-off.
            </p>
          </div>
        </div>
      </div>

      {/* 6. Recent District Operations Table */}
      <RecentOperationsTable
        operations={recentOperations}
        isLoading={isLoading}
        showConsoleLink={false}
      />

      {/* 7. Publish Price Modal */}
      <PublishPriceModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        latestPrice={currentPrice}
      />
    </div>
  );
}
