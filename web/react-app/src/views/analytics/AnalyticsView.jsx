import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3, Download, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToFieldsData } from '../../services/fieldsService';
import { subscribeToOperationsData } from '../../services/operationsService';
import { subscribeToPrices } from '../../services/pricesService';
import {
  selectCropFieldProgress,
  selectProductionCost,
  selectOperationalCostBreakdown,
  selectFarmOperationsAnalytics,
  selectPriceTrends
} from '../../services/analyticsSelectors';

import AnalyticsFilters from '../../components/analytics/AnalyticsFilters';
import CropProgressSection from '../../components/analytics/CropProgressSection';
import ProductionCostSection from '../../components/analytics/ProductionCostSection';
import CostBreakdownSection from '../../components/analytics/CostBreakdownSection';
import FarmOperationsSection from '../../components/analytics/FarmOperationsSection';
import PriceTrendsSection from '../../components/analytics/PriceTrendsSection';
import Button from '../../components/ui/Button';
import { formatCropYear } from '../../utils/formatters';

export default function AnalyticsView() {
  const { user } = useAuth();
  const isFarmManager = user?.role === 'FARM_MANAGER';

  // Data states
  const [fields, setFields] = useState([]);
  const [cropCycles, setCropCycles] = useState([]);
  const [blockFarms, setBlockFarms] = useState([]);
  const [operations, setOperations] = useState([]);
  const [prices, setPrices] = useState([]);

  // Loading & Error states
  const [isFieldsLoading, setIsFieldsLoading] = useState(true);
  const [isOpsLoading, setIsOpsLoading] = useState(true);
  const [isPricesLoading, setIsPricesLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter states
  const [selectedSeason, setSelectedSeason] = useState('ALL');
  const [selectedFarmId, setSelectedFarmId] = useState('ALL');
  const [selectedPeriod, setSelectedPeriod] = useState('ALL');
  const [priceTimeframe, setPriceTimeframe] = useState('weekly');

  // Subscriptions
  useEffect(() => {
    setIsFieldsLoading(true);
    const unsubFields = subscribeToFieldsData({
      user,
      onUpdate: (data) => {
        setFields(data.fields || []);
        setCropCycles(data.cropCycles || []);
        setBlockFarms(data.blockFarms || []);
        setIsFieldsLoading(false);
      },
      onError: (err) => {
        console.warn('[AnalyticsView] Fields err:', err.message);
        setIsFieldsLoading(false);
      }
    });

    setIsOpsLoading(true);
    const unsubOps = subscribeToOperationsData({
      onUpdate: (data) => {
        setOperations(data.operations || []);
        setIsOpsLoading(false);
      },
      onError: (err) => {
        console.warn('[AnalyticsView] Ops err:', err.message);
        setIsOpsLoading(false);
      }
    });

    setIsPricesLoading(true);
    const unsubPrices = subscribeToPrices({
      onUpdate: (data) => {
        setPrices(data.prices || []);
        setIsPricesLoading(false);
      },
      onError: (err) => {
        console.warn('[AnalyticsView] Prices err:', err.message);
        setIsPricesLoading(false);
      }
    });

    return () => {
      if (typeof unsubFields === 'function') unsubFields();
      if (typeof unsubOps === 'function') unsubOps();
      if (typeof unsubPrices === 'function') unsubPrices();
    };
  }, [user]);

  // Derive available filter options dynamically from real recorded data
  const availableSeasons = useMemo(() => {
    const seasons = new Set();
    cropCycles.forEach(c => {
      if (c.cropYear) seasons.add(formatCropYear(c.cropYear));
    });
    fields.forEach(f => {
      if (f.cropYear) seasons.add(formatCropYear(f.cropYear));
    });
    if (seasons.size === 0) {
      seasons.add(formatCropYear(new Date().getFullYear()));
    }
    return Array.from(seasons).sort().reverse();
  }, [cropCycles, fields]);

  const availablePeriods = useMemo(() => {
    const periods = new Set();
    operations.forEach(op => {
      const d = String(op.performedOn || op.isoDate || op.date || '');
      if (d && d.length >= 7) {
        periods.add(d.slice(0, 7));
      }
    });
    return Array.from(periods).sort().reverse();
  }, [operations]);

  // Reset Filters handler
  const handleResetFilters = () => {
    setSelectedSeason('ALL');
    setSelectedFarmId('ALL');
    setSelectedPeriod('ALL');
  };

  // Pure Descriptive Selectors
  const cropProgressData = useMemo(() => {
    return selectCropFieldProgress({
      fields,
      cropCycles,
      selectedFarmId,
      selectedSeason
    });
  }, [fields, cropCycles, selectedFarmId, selectedSeason]);

  const productionCostData = useMemo(() => {
    return selectProductionCost({
      operations,
      fields,
      blockFarms,
      selectedFarmId,
      selectedPeriod,
      isFarmManager
    });
  }, [operations, fields, blockFarms, selectedFarmId, selectedPeriod, isFarmManager]);

  const costBreakdownData = useMemo(() => {
    return selectOperationalCostBreakdown({
      operations,
      fields,
      selectedFarmId,
      selectedPeriod
    });
  }, [operations, fields, selectedFarmId, selectedPeriod]);

  const operationsAnalyticsData = useMemo(() => {
    return selectFarmOperationsAnalytics({
      operations,
      fields,
      selectedFarmId,
      selectedPeriod
    });
  }, [operations, fields, selectedFarmId, selectedPeriod]);

  const priceTrendsData = useMemo(() => {
    return selectPriceTrends({
      prices,
      timeframe: priceTimeframe
    });
  }, [prices, priceTimeframe]);

  // Export Analytics Summary to CSV
  const handleExportSummary = () => {
    const date = new Date().toISOString().split('T')[0];
    const lines = [
      'HUGPONG DESCRIPTIVE ANALYTICS REPORT',
      `Generated: ${date}`,
      `Scope Season: ${selectedSeason}`,
      `Scope Farm: ${selectedFarmId}`,
      `Scope Period: ${selectedPeriod}`,
      '',
      '--- DOMAIN 1: CROP & FIELD PROGRESS ---',
      `Total Registered Plots: ${cropProgressData.totalPlots}`,
      `Total Tracked Acreage: ${cropProgressData.totalAcreageHa.toFixed(2)} ha`,
      'Stage,Plots Count,Acreage (Ha),Area Share (%)',
      ...cropProgressData.stagesDistribution.map(s => `"${s.shortName}",${s.plotsCount},${s.areaHa.toFixed(2)},${s.percentOfArea}%`),
      '',
      '--- DOMAIN 2: PRODUCTION COST ---',
      `Total Recorded Expenditure: PHP ${productionCostData.totalExpenditure}`,
      `Tracked Operational Acreage: ${productionCostData.totalAuditedHa.toFixed(2)} ha`,
      `Average Cost per Hectare: PHP ${productionCostData.averageCostPerHa}`,
      'Entity,Total Cost (PHP),Area (Ha),Cost per Ha (PHP),Ops Count',
      ...productionCostData.breakdownByEntity.map(e => `"${e.name}",${e.totalCost},${e.areaHa.toFixed(2)},${e.costPerHa},${e.opsCount}`),
      '',
      '--- DOMAIN 3: OPERATIONAL COST BREAKDOWN ---',
      'Category,Total Cost (PHP),Ops Count,Share (%)',
      ...costBreakdownData.categories.map(c => `"${c.label}",${c.totalCost},${c.opsCount},${c.percentOfTotal}%`),
      '',
      '--- DOMAIN 4: FARM OPERATIONS FREQUENCY ---',
      'Activity Name,Logged Count,Total Cost (PHP),Average Cost (PHP)',
      ...operationsAnalyticsData.frequencyRanking.map(a => `"${a.name}",${a.count},${a.totalCost},${a.avgCost}`)
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + lines.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `HUGPONG_Analytics_Report_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isGlobalLoading = isFieldsLoading && isOpsLoading && isPricesLoading;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary dark:text-primary-light uppercase tracking-wider">
              Agronomic Intelligence
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
              Descriptive Analytics
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
            Operational & Market Analytics
          </h1>
          <p className="text-xs sm:text-sm text-hug-muted mt-1 max-w-2xl">
            Strictly descriptive insights derived from recorded sugarcane parcel lifecycles, field operations, and official SRA market benchmarks.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="md"
            onClick={handleExportSummary}
            disabled={isGlobalLoading}
            icon={Download}
          >
            Export Summary
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-danger-bg/40 border border-danger/30 rounded-2xl flex items-start gap-3 text-xs sm:text-sm font-semibold text-danger">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Error loading analytics telemetry</p>
            <p className="text-xs text-danger/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Shared Filter Bar */}
      <AnalyticsFilters
        seasons={availableSeasons}
        selectedSeason={selectedSeason}
        onSeasonChange={setSelectedSeason}
        blockFarms={blockFarms}
        selectedFarmId={selectedFarmId}
        onFarmChange={setSelectedFarmId}
        periods={availablePeriods}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        onResetFilters={handleResetFilters}
        isFarmManager={isFarmManager}
      />

      {/* Domain 1: Crop & Field Progress */}
      <CropProgressSection
        progressData={cropProgressData}
        isLoading={isFieldsLoading}
      />

      {/* Domain 2: Production Cost */}
      <ProductionCostSection
        costData={productionCostData}
        isLoading={isOpsLoading || isFieldsLoading}
        isFarmManager={isFarmManager}
      />

      {/* Domain 3: Operational Cost Breakdown */}
      <CostBreakdownSection
        breakdownData={costBreakdownData}
        isLoading={isOpsLoading}
      />

      {/* Domain 4: Farm Operations & Labor Cadence */}
      <FarmOperationsSection
        operationsData={operationsAnalyticsData}
        isLoading={isOpsLoading}
      />

      {/* Domain 5: Official SRA Price Trends */}
      <PriceTrendsSection
        trendsData={priceTrendsData}
        timeframe={priceTimeframe}
        onTimeframeChange={setPriceTimeframe}
        isLoading={isPricesLoading}
      />
    </div>
  );
}
