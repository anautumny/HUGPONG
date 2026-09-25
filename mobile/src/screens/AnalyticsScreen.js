import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Platform, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW, TYPE } from '../theme';
import {
  fields as fieldsStore,
  cropCycles as cropCyclesStore,
  operationLogs as opsStore,
  blockFarms as farmsStore,
  getSortedPrices,
  getCurrentSession,
  subscribe,
  publishSraPrice,
  calculateSRAWeekLabel
} from '../data/dataStore';
import { useTranslation } from '../services/i18n';
import {
  selectCropFieldProgress,
  selectProductionCost,
  selectOperationalCostBreakdown,
  selectFarmOperationsAnalytics,
  selectPriceTrends,
  filterOperationsByCropYearCycle
} from '../services/analyticsSelectors';
import {
  AnalyticsScopeCard,
  AnalyticsScopeModal,
  PrimaryMetric,
  StageDistributionList,
  CostBreakdownList,
  ActivityFrequencyList,
  PriceSummaryCard,
  AnalyticsEmptyState
} from '../components/analytics/AnalyticsComponents';
import { ScreenHeader, Card, PrimaryButton, SecondaryButton } from '../components/ui';
import { canonicalStoredCropYear, uniqueCropYears } from '../utils/dataHelpers';

export default function AnalyticsScreen({ navigation, route }) {
  const { t } = useTranslation();
  const [session, setSession] = useState(getCurrentSession());
  const [allFields, setAllFields] = useState(fieldsStore);
  const [allCropCycles, setAllCropCycles] = useState(cropCyclesStore);
  const [allOps, setAllOps] = useState(opsStore);
  const [allFarms, setAllFarms] = useState(farmsStore);
  const [pricesList, setPricesList] = useState(getSortedPrices());

  // Navigation & Segmented Tabs: 'overview' | 'costs' | 'operations' | 'market'
  const [activeTab, setActiveTab] = useState(route?.params?.initialTab || 'overview');
  const [priceTimeframe, setPriceTimeframe] = useState('weekly');

  // Filter scopes
  const isMember = session?.role === 'Farm Member';
  const isManager = session?.role === 'Farm Manager';
  const isSRA = session?.role === 'SRA Admin';

  const defaultFarmId = useMemo(() => {
    if (isManager) {
      const managedFarm = allFarms.find(f => f.managerUserId === (session?.id || session?.employeeId));
      return managedFarm ? managedFarm.id : 'ALL';
    }
    return 'ALL';
  }, [isManager, allFarms, session]);

  const [selectedSeason, setSelectedSeason] = useState('ALL');
  const [cycleFilterInitialized, setCycleFilterInitialized] = useState(false);
  const [selectedFarmId, setSelectedFarmId] = useState(defaultFarmId);
  const [selectedFieldId, setSelectedFieldId] = useState('ALL');
  const [selectedPeriod, setSelectedPeriod] = useState('ALL');
  const [showScopeModal, setShowScopeModal] = useState(false);

  // SRA Price Modal
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [newSugarPrice, setNewSugarPrice] = useState('');
  const [newMolassesPrice, setNewMolassesPrice] = useState('');
  const [newEffectiveDate, setNewEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newWeekLabel, setNewWeekLabel] = useState(() => calculateSRAWeekLabel(new Date()));
  const [newCircularNumber, setNewCircularNumber] = useState('');
  const [newPriceSource, setNewPriceSource] = useState('');

  // Subscribe to live data updates
  useEffect(() => {
    const unsub = subscribe(() => {
      setSession(getCurrentSession());
      setAllFields([...fieldsStore]);
      setAllCropCycles([...cropCyclesStore]);
      setAllOps([...opsStore]);
      setAllFarms([...farmsStore]);
      setPricesList(getSortedPrices());
    });
    return unsub;
  }, []);

  // Update default farm if route params or manager loads
  useEffect(() => {
    if (route?.params?.blockFarmId) {
      setSelectedFarmId(route.params.blockFarmId);
    }
  }, [route?.params?.blockFarmId]);

  // Scoped fields based on role
  const scopedFields = useMemo(() => {
    if (isMember) {
      const uid = session?.employeeId || session?.id;
      return allFields.filter(f => f.memberUserId === uid || f.memberId === uid);
    }
    if (isManager) {
      const managedFarm = allFarms.find(f => f.managerUserId === (session?.id || session?.employeeId));
      if (managedFarm) {
        return allFields.filter(f => f.blockFarmId === managedFarm.id);
      }
    }
    return allFields;
  }, [isMember, isManager, allFields, allFarms, session]);

  // Scoped operations based on scoped fields
  const scopedOps = useMemo(() => {
    const validFieldIds = new Set(scopedFields.map(f => f.id));
    return allOps.filter(op => {
      if (!validFieldIds.has(op.fieldId)) return false;
      return ['ACTIVE', 'ARCHIVED', 'submitted'].includes(String(op.status || 'ACTIVE'));
    });
  }, [scopedFields, allOps]);

  // Available filter options derived strictly from recorded data
  const availableSeasons = useMemo(() => {
    const fieldIds = new Set(scopedFields.map(field => field.id));
    return uniqueCropYears(allCropCycles.filter(cycle => fieldIds.has(cycle.fieldId)));
  }, [scopedFields, allCropCycles]);

  const currentSeason = useMemo(() => {
    const fieldIds = new Set(scopedFields.map(field => field.id));
    return allCropCycles
      .filter(cycle => cycle.status === 'ACTIVE' && fieldIds.has(cycle.fieldId))
      .map(cycle => canonicalStoredCropYear(cycle.cropYear))
      .filter(Boolean)
      .sort()
      .reverse()[0] || '';
  }, [scopedFields, allCropCycles]);

  useEffect(() => {
    if (!cycleFilterInitialized && allCropCycles.length > 0) {
      setSelectedSeason(currentSeason || 'ALL');
      setCycleFilterInitialized(true);
    }
  }, [cycleFilterInitialized, currentSeason, allCropCycles.length]);

  const cycleScopedOps = useMemo(() => filterOperationsByCropYearCycle({
    operations: scopedOps,
    cropCycles: allCropCycles,
    selectedSeason
  }), [scopedOps, allCropCycles, selectedSeason]);

  const availablePeriods = useMemo(() => {
    const set = new Set();
    cycleScopedOps.forEach(op => {
      const d = String(op.performedOn || op.isoDate || op.date || '');
      if (d && d.length >= 7) set.add(d.slice(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [cycleScopedOps]);

  // Effective farm and field display names for ScopeCard
  const activeFarmName = useMemo(() => {
    if (selectedFarmId === 'ALL') return isMember ? 'My Assigned Farm' : 'All Block Farms';
    const f = allFarms.find(farm => farm.id === selectedFarmId);
    return f ? f.name : selectedFarmId;
  }, [selectedFarmId, allFarms, isMember]);

  const activeFieldName = useMemo(() => {
    if (selectedFieldId === 'ALL') return 'All Plots';
    return selectedFieldId;
  }, [selectedFieldId]);

  // ══════════════════════════════════════════════════════════════
  // CANONICAL ANALYTICS COMPUTATIONS (100% WEB PARITY)
  // ══════════════════════════════════════════════════════════════
  const cropProgress = useMemo(() => {
    try {
      return selectCropFieldProgress({
        fields: scopedFields,
        cropCycles: allCropCycles,
        selectedFarmId: selectedFarmId,
        selectedParcelId: selectedFieldId,
        selectedSeason: selectedSeason
      });
    } catch (e) {
      return { totalPlots: 0, totalAcreageHa: 0, stagesDistribution: [], activePlots: [] };
    }
  }, [scopedFields, allCropCycles, selectedFarmId, selectedFieldId, selectedSeason]);

  const productionCost = useMemo(() => {
    try {
      return selectProductionCost({
        operations: cycleScopedOps,
        fields: scopedFields,
        blockFarms: allFarms,
        selectedFarmId: selectedFarmId,
        selectedParcelId: selectedFieldId,
        selectedPeriod: selectedPeriod,
        isFarmManager: isManager || isMember
      });
    } catch (e) {
      return { totalExpenditure: 0, operationsCount: 0, averageCostPerHa: 0, totalAuditedHa: 0, breakdownByEntity: [] };
    }
  }, [cycleScopedOps, scopedFields, allFarms, selectedFarmId, selectedFieldId, selectedPeriod, isManager, isMember]);

  const costBreakdown = useMemo(() => {
    try {
      return selectOperationalCostBreakdown({
        operations: cycleScopedOps,
        fields: scopedFields,
        selectedFarmId: selectedFarmId,
        selectedParcelId: selectedFieldId,
        selectedPeriod: selectedPeriod
      });
    } catch (e) {
      return { grandTotalCost: 0, categories: [], topCategory: null };
    }
  }, [cycleScopedOps, scopedFields, selectedFarmId, selectedFieldId, selectedPeriod]);

  const operationsAnalytics = useMemo(() => {
    try {
      return selectFarmOperationsAnalytics({
        operations: cycleScopedOps,
        fields: scopedFields,
        selectedFarmId: selectedFarmId,
        selectedParcelId: selectedFieldId,
        selectedPeriod: selectedPeriod
      });
    } catch (e) {
      return { totalOps: 0, totalHa: 0, byActivity: [], byMonth: [], mostFrequent: null };
    }
  }, [cycleScopedOps, scopedFields, selectedFarmId, selectedFieldId, selectedPeriod]);

  const priceTrends = useMemo(() => {
    return selectPriceTrends({
      prices: pricesList,
      timeframe: priceTimeframe
    });
  }, [pricesList, priceTimeframe]);

  // Handler to publish SRA price
  const handlePublishPrice = async () => {
    const s = parseFloat(newSugarPrice);
    const m = parseFloat(newMolassesPrice);
    const parsedDate = new Date(`${newEffectiveDate}T00:00:00.000Z`);
    const canonicalDate = /^\d{4}-\d{2}-\d{2}$/.test(newEffectiveDate)
      && !Number.isNaN(parsedDate.getTime())
      && parsedDate.toISOString().slice(0, 10) === newEffectiveDate;
    if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(m) || m <= 0) {
      Alert.alert('Invalid Price', 'Both official price values must be greater than zero.');
      return;
    }
    if (!canonicalDate || !newWeekLabel.trim() || !newCircularNumber.trim() || !newPriceSource.trim()) {
      Alert.alert('Incomplete Circular', 'Effective date, week label, circular number, and official source are required.');
      return;
    }
    const record = {
      sugarPricePerLkg: s,
      molassesPricePerMetricTon: m,
      effectiveDate: newEffectiveDate,
      weekLabel: newWeekLabel.trim(),
      circularNumber: newCircularNumber.trim(),
      source: newPriceSource.trim()
    };
    await publishSraPrice(record);
    setShowPriceModal(false);
    setNewSugarPrice('');
    setNewMolassesPrice('');
    setNewCircularNumber('');
    setNewPriceSource('');
    Alert.alert('Published', 'Official SRA benchmark published successfully to all devices.');
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* 52dp Accessible Screen Header */}
      <ScreenHeader
        title="Farm & Price Analytics"
        subtitle="Canonical SRA & Cooperative Intelligence"
        onBackPress={() => navigation.goBack()}
        rightAction={{
          icon: 'filter-outline',
          onPress: () => setShowScopeModal(true)
        }}
      />

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Analytics Scope Card ── */}
        <AnalyticsScopeCard
          season={selectedSeason}
          farmName={activeFarmName}
          fieldName={activeFieldName}
          period={selectedPeriod}
          onChangeScopePress={() => setShowScopeModal(true)}
          isMember={isMember}
        />

        {/* ── 2. 4 Segmented Navigation Tabs ── */}
        <View style={s.segmentedTabBar}>
          {[
            { key: 'overview', label: 'Overview', icon: 'pie-chart' },
            { key: 'costs', label: 'Costs', icon: 'cash' },
            { key: 'operations', label: 'Operations', icon: 'construct' },
            { key: 'market', label: 'Market', icon: 'trending-up' }
          ].map(tabItem => {
            const isActive = activeTab === tabItem.key;
            return (
              <TouchableOpacity
                key={tabItem.key}
                style={[s.segmentedTabBtn, isActive && s.segmentedTabBtnActive]}
                onPress={() => setActiveTab(tabItem.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={tabItem.icon}
                  size={14}
                  color={isActive ? COLORS.primary : COLORS.textMuted}
                />
                <Text style={[s.segmentedTabText, isActive && s.segmentedTabTextActive]}>
                  {tabItem.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 1: OVERVIEW                                            */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <View style={{ gap: SPACING.md }}>
            {/* Primary KPI Card */}
            <Card style={s.overviewKpiCard}>
              <Text style={s.sectionHeaderTag}>FINANCIAL & ACREAGE SUMMARY</Text>
              <View style={s.kpiRow}>
                <View style={s.kpiBox}>
                  <Text style={s.kpiLabel}>TOTAL RECORDED EXPENDITURE</Text>
                  <Text style={s.kpiMainNumber}>
                    ₱{productionCost.totalExpenditure.toLocaleString()}
                  </Text>
                  <Text style={s.kpiSub}>
                    Across {productionCost.operationsCount} logged operations
                  </Text>
                </View>

                <View style={s.kpiDivider} />

                <View style={s.kpiBox}>
                  <Text style={s.kpiLabel}>AVERAGE COST / HA</Text>
                  <Text style={[s.kpiMainNumber, { color: COLORS.text }]}>
                    ₱{productionCost.averageCostPerHa.toLocaleString()}
                  </Text>
                  <Text style={s.kpiSub}>
                    {cropProgress.totalAcreageHa.toFixed(2)} Ha active area
                  </Text>
                </View>
              </View>

              <View style={s.parcelAcreageRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="grid-outline" size={15} color={COLORS.primary} />
                  <Text style={s.parcelAcreageText}>
                    {cropProgress.totalPlots} {cropProgress.totalPlots === 1 ? 'Registered Plot' : 'Registered Plots'}
                  </Text>
                </View>
                <Text style={s.parcelAcreageSub}>
                  {cropProgress.totalAcreageHa.toFixed(2)} Total Hectares
                </Text>
              </View>
            </Card>

            {/* Primary Expense Driver Notice */}
            {costBreakdown.topCategory && (
              <Card variant="subtle" style={s.driverCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[s.driverDot, { backgroundColor: costBreakdown.topCategory.color }]} />
                  <Text style={s.driverTitle}>
                    Primary Expense Driver: <Text style={{ fontWeight: '800', color: COLORS.text }}>{costBreakdown.topCategory.label}</Text>
                  </Text>
                </View>
                <Text style={s.driverSub}>
                  Accounts for ₱{costBreakdown.topCategory.totalCost.toLocaleString()} ({costBreakdown.topCategory.percentOfTotal}% of total spend)
                </Text>
              </Card>
            )}

            {/* Quick SRA Sugar Benchmark */}
            <PriceSummaryCard
              priceRecord={pricesList[0]}
              canPost={isSRA}
              onPostPricePress={() => setShowPriceModal(true)}
            />

            {/* Stage Progression Preview */}
            <Card style={s.stagePreviewCard}>
              <View style={s.stagePreviewHeader}>
                <Text style={s.sectionHeaderTag}>SUGARCANE GROWTH PROGRESSION</Text>
                <TouchableOpacity onPress={() => setActiveTab('operations')}>
                  <Text style={s.viewDetailsLink}>View Details →</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.stagePreviewTitle}>
                {cropProgress.totalPlots} plots distributed across 6 agronomic stages
              </Text>
              <View style={{ marginTop: 8 }}>
                <StageDistributionList
                  stages={cropProgress.stagesDistribution}
                  totalAcreageHa={cropProgress.totalAcreageHa}
                  totalPlots={cropProgress.totalPlots}
                  onViewStageDetails={() => setActiveTab('operations')}
                />
              </View>
            </Card>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 2: COSTS                                               */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'costs' && (
          <View style={{ gap: SPACING.md }}>
            <PrimaryMetric
              title="TOTAL OPERATIONAL EXPENDITURE"
              value={`₱${costBreakdown.grandTotalCost.toLocaleString()}`}
              subtitle={`Average ₱${productionCost.averageCostPerHa.toLocaleString()} per hectare across ${cropProgress.totalAcreageHa.toFixed(2)} Ha`}
            />

            {/* Cost Breakdown by Canonical Category */}
            <Card style={s.contentCard}>
              <Text style={s.sectionHeaderTag}>EXPENSE CATEGORY DISTRIBUTION</Text>
              <Text style={s.cardDescText}>
                Distribution across Land Prep, Planting, Fertilization, Weeding, Maintenance, and Harvesting.
              </Text>
              <CostBreakdownList
                categories={costBreakdown.categories}
                grandTotalCost={costBreakdown.grandTotalCost}
                topCategory={costBreakdown.topCategory}
              />
            </Card>

            {/* Production Breakdown by Entity (Parcels or Block Farms) */}
            {productionCost.breakdownByEntity.length > 0 && (
              <Card style={s.contentCard}>
                <Text style={s.sectionHeaderTag}>
                  {isManager || isMember ? 'EXPENDITURE BY PLOT PARCEL' : 'EXPENDITURE BY BLOCK FARM'}
                </Text>
                <View style={{ gap: 8, marginTop: 8 }}>
                  {productionCost.breakdownByEntity.map((item) => (
                    <View key={item.id} style={s.entityRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.entityName} numberOfLines={1}>{item.name}</Text>
                        <Text style={s.entitySub}>
                          {item.areaHa.toFixed(2)} Ha · {item.opsCount} {item.opsCount === 1 ? 'operation' : 'operations'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.entityCost}>₱{item.totalCost.toLocaleString()}</Text>
                        <Text style={s.entityPerHa}>₱{item.costPerHa.toLocaleString()} / ha</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 3: OPERATIONS                                          */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'operations' && (
          <View style={{ gap: SPACING.md }}>
            {/* 6 Stage Cane Distribution */}
            <Card style={s.contentCard}>
              <Text style={s.sectionHeaderTag}>6-STAGE CROP GROWTH DISTRIBUTION</Text>
              <Text style={s.cardDescText}>
                Active parcel location across the official SRA Sugarcane lifecycle (Month 0 to Month 12).
              </Text>
              <StageDistributionList
                stages={cropProgress.stagesDistribution}
                totalAcreageHa={cropProgress.totalAcreageHa}
                totalPlots={cropProgress.totalPlots}
              />
            </Card>

            {/* Operation Frequency Ranking */}
            <Card style={s.contentCard}>
              <Text style={s.sectionHeaderTag}>MOST FREQUENT FIELD ACTIVITIES</Text>
              <Text style={s.cardDescText}>
                Ranking of field tasks by execution count, total outlay, and average cost per pass.
              </Text>
              <ActivityFrequencyList
                ranking={operationsAnalytics.frequencyRanking}
              />
            </Card>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 4: MARKET                                              */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'market' && (
          <View style={{ gap: SPACING.md }}>
            {/* Latest Official SRA Benchmark */}
            <PriceSummaryCard
              priceRecord={pricesList[0]}
              canPost={isSRA}
              onPostPricePress={() => setShowPriceModal(true)}
            />

            {/* Timeframe selector (Weekly vs Monthly) */}
            <View style={s.timeframeRow}>
              <Text style={s.sectionHeaderTag}>PRICE CIRCULARS & BENCHMARKS</Text>
              <View style={s.timeframeChipsWrap}>
                {['weekly', 'monthly'].map(tf => (
                  <TouchableOpacity
                    key={tf}
                    style={[s.timeframeChip, priceTimeframe === tf && s.timeframeChipActive]}
                    onPress={() => setPriceTimeframe(tf)}
                  >
                    <Text style={[s.timeframeChipText, priceTimeframe === tf && s.timeframeChipTextActive]}>
                      {tf === 'weekly' ? 'Weekly' : 'Monthly'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Historical Circulars List */}
            <Card style={s.contentCard}>
              {priceTrends.trendPoints.length === 0 ? (
                <AnalyticsEmptyState
                  title="No price records available"
                  subtitle="Official circulars will display here once published."
                />
              ) : (
                <View style={{ gap: 8 }}>
                  {priceTrends.trendPoints.map((pt, idx) => (
                    <View key={idx} style={s.priceHistoryRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.priceCircularNum}>{pt.circularNumber}</Text>
                        <Text style={s.pricePeriodDate}>{pt.periodLabel}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.priceSugarValue}>₱{pt.sugarPrice.toLocaleString()} / Lkg</Text>
                        <Text style={s.priceMolassesValue}>Molasses: ₱{pt.molassesPrice.toLocaleString()} / MT</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </View>
        )}
      </ScrollView>

      {/* ── Scope Filter Bottom Sheet Modal ── */}
      <AnalyticsScopeModal
        visible={showScopeModal}
        onClose={() => setShowScopeModal(false)}
        seasons={['ALL', ...availableSeasons]}
        currentSeason={currentSeason}
        farms={allFarms}
        fields={scopedFields}
        periods={availablePeriods}
        selectedSeason={selectedSeason}
        selectedFarmId={selectedFarmId}
        selectedFieldId={selectedFieldId}
        selectedPeriod={selectedPeriod}
        onSelectSeason={setSelectedSeason}
        onSelectFarm={setSelectedFarmId}
        onSelectField={setSelectedFieldId}
        onSelectPeriod={setSelectedPeriod}
        onReset={() => {
          setSelectedSeason(currentSeason || 'ALL');
          setSelectedFarmId(defaultFarmId);
          setSelectedFieldId('ALL');
          setSelectedPeriod('ALL');
        }}
        isMember={isMember}
        isManager={isManager}
      />

      {/* ── Post Official SRA Price Modal (SRA Admin) ── */}
      <Modal visible={showPriceModal} transparent animationType="slide" onRequestClose={() => setShowPriceModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Publish Official SRA Price</Text>
                <Text style={s.modalSub}>HPCo Silay Milling District Benchmark</Text>
              </View>
              <TouchableOpacity onPress={() => setShowPriceModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 12, marginVertical: 16 }}>
              <View>
                <Text style={s.inputLabel}>Effective Date (YYYY-MM-DD) *</Text>
                <TextInput
                  style={s.input}
                  placeholder="2026-09-23"
                  value={newEffectiveDate}
                  onChangeText={value => {
                    setNewEffectiveDate(value);
                    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) setNewWeekLabel(calculateSRAWeekLabel(value));
                  }}
                />
              </View>

              <View>
                <Text style={s.inputLabel}>Week Label *</Text>
                <TextInput style={s.input} placeholder="Week 4 Sep" value={newWeekLabel} onChangeText={setNewWeekLabel} />
              </View>

              <View>
                <Text style={s.inputLabel}>Raw Sugar (Class B) Price (₱/Lkg) *</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. 2650.00"
                  keyboardType="numeric"
                  value={newSugarPrice}
                  onChangeText={setNewSugarPrice}
                />
              </View>

              <View>
                <Text style={s.inputLabel}>Molasses Price (₱/MT) *</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. 9500.00"
                  keyboardType="numeric"
                  value={newMolassesPrice}
                  onChangeText={setNewMolassesPrice}
                />
              </View>

              <View>
                <Text style={s.inputLabel}>Official Circular Number *</Text>
                <TextInput style={s.input} placeholder="e.g. SRA Circular #105" value={newCircularNumber} onChangeText={setNewCircularNumber} />
              </View>

              <View>
                <Text style={s.inputLabel}>Official Source *</Text>
                <TextInput style={s.input} placeholder="e.g. SRA Millsite Notice" value={newPriceSource} onChangeText={setNewPriceSource} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <SecondaryButton
                title="Cancel"
                onPress={() => setShowPriceModal(false)}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title="Publish Benchmark"
                onPress={handlePublishPrice}
                style={{ flex: 1.5 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  scrollContent: {
    padding: SPACING.md,
    gap: SPACING.md,
    paddingBottom: 40
  },
  segmentedTabBar: {
    flexDirection: 'row',
    backgroundColor: '#EEF4EC',
    borderRadius: RADIUS.md,
    padding: 3,
    gap: 4
  },
  segmentedTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    minHeight: 40,
    borderRadius: RADIUS.sm
  },
  segmentedTabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOW.xs
  },
  segmentedTabText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.textMuted
  },
  segmentedTabTextActive: {
    color: COLORS.primaryDark,
    fontWeight: '900'
  },
  overviewKpiCard: {
    padding: SPACING.md
  },
  sectionHeaderTag: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAF5',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  kpiBox: {
    flex: 1
  },
  kpiDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border,
    marginHorizontal: 12
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.4
  },
  kpiMainNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.primaryDark,
    marginTop: 2
  },
  kpiSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2
  },
  parcelAcreageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight
  },
  parcelAcreageText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text
  },
  parcelAcreageSub: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.primary
  },
  driverCard: {
    padding: SPACING.md
  },
  driverDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  driverTitle: {
    fontSize: 13,
    color: COLORS.textSecondary
  },
  driverSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
    marginLeft: 16
  },
  stagePreviewCard: {
    padding: SPACING.md
  },
  stagePreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  viewDetailsLink: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary
  },
  stagePreviewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8
  },
  contentCard: {
    padding: SPACING.md
  },
  cardDescText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 12,
    lineHeight: 17
  },
  entityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight
  },
  entityName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: COLORS.text
  },
  entitySub: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    marginTop: 1
  },
  entityCost: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primaryDark
  },
  entityPerHa: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1
  },
  timeframeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  timeframeChipsWrap: {
    flexDirection: 'row',
    backgroundColor: '#EAEFE7',
    borderRadius: RADIUS.sm,
    padding: 2,
    gap: 2
  },
  timeframeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.xs
  },
  timeframeChipActive: {
    backgroundColor: '#fff'
  },
  timeframeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted
  },
  timeframeChipTextActive: {
    color: COLORS.primaryDark,
    fontWeight: '800'
  },
  priceHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight
  },
  priceCircularNum: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text
  },
  pricePeriodDate: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1
  },
  priceSugarValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.primaryDark
  },
  priceMolassesValue: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: SPACING.md
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOW.float
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text
  },
  modalSub: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    marginTop: 2
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    backgroundColor: '#FBFDFB'
  }
});
