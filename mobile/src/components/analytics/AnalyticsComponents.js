import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { Card, PrimaryButton, SecondaryButton, SearchableSelect } from '../ui';
import { AppText as Text } from '../Typography';
import AnimatedBottomSheet from '../AnimatedBottomSheet';
import { SearchableSelectContent } from '../ui/SearchableSelect';
import { filterOperationsByCropYearCycle } from '../../services/analyticsSelectors';

// ── 1. Analytics Scope Summary Card ──────────────────────────────
export function AnalyticsScopeCard({
  season,
  farmName,
  fieldName,
  period,
  isMember
}) {
  return (
    <View style={{ paddingHorizontal: 2, paddingVertical: 4 }}>
      <Text style={{ fontSize: 12, lineHeight: 19, color: COLORS.textSecondary }}>
        {[season === 'ALL' ? 'All crop years' : season, !isMember && farmName, fieldName, period === 'ALL' ? 'All periods' : period].filter(Boolean).join(' · ')}
      </Text>
    </View>
  );
}

// ── 2. Scope Filter Bottom Sheet Modal ────────────────────────────
export function AnalyticsScopeModal({
  visible,
  onClose,
  seasons = [],
  currentSeason = '',
  farms = [],
  fields = [],
  periods = [],
  operations = [],
  cropCycles = [],
  selectedSeason,
  selectedFarmId,
  selectedFieldId,
  selectedPeriod,
  onApply,
  defaultFarmId = 'ALL',
  isMember,
  isManager
}) {
  const [picker, setPicker] = useState(null);
  const [draft, setDraft] = useState({ season: selectedSeason, farm: selectedFarmId, field: selectedFieldId, period: selectedPeriod });
  useEffect(() => {
    if (visible) setDraft({ season: selectedSeason, farm: selectedFarmId, field: selectedFieldId, period: selectedPeriod });
    setPicker(null);
  }, [visible]);
  const draftFields = fields.filter(field => draft.farm === 'ALL' || field.blockFarmId === draft.farm);
  const draftFieldIds = new Set(draftFields.map(field => field.id));
  const draftPeriods = [...new Set(filterOperationsByCropYearCycle({ operations, cropCycles, selectedSeason: draft.season })
    .filter(op => draftFieldIds.has(op.fieldId) && (draft.field === 'ALL' || op.fieldId === draft.field))
    .map(op => String(op.performedOn || op.isoDate || op.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();

  return (
    <AnimatedBottomSheet
      dismissible
      expandable
      visible={visible}
      onClose={() => picker ? setPicker(null) : onClose()}
      keyboardAvoiding
      backdropColor="rgba(0, 0, 0, 0.45)"
      sheetStyle={styles.modalSheet}
    >
      {picker ? (
        <SearchableSelectContent
          {...picker}
          onClose={() => setPicker(null)}
          closeLabel="Back to analytics filters"
          back
        />
      ) : (
        <>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.modalTitle}>Filters</Text>
              <Text style={styles.modalSub}>Choose the records to include</Text>
            </View>
          </View>

          <ScrollView style={{ flexShrink: 1, minHeight: 0 }} contentContainerStyle={{ gap: 4, paddingVertical: 10, paddingHorizontal: SPACING.lg }} keyboardShouldPersistTaps="handled">
            {/* Season Selector */}
            <SearchableSelect
              onOpen={setPicker}
              label="CROP YEAR CYCLE"
              options={seasons.map(s => ({
                id: s,
                label: s === 'ALL' ? 'All Crop Year Cycles' : `${s}${s === currentSeason ? ' (Current)' : ''}`,
                sublabel: s === 'ALL' ? 'Aggregate all historical and active cycles' : (s === currentSeason ? 'Active season in progress' : 'Historical cycle records'),
                icon: 'calendar-outline'
              }))}
              selectedValue={draft.season}
              onSelect={(opt) => setDraft(value => ({ ...value, season: opt.id, period: 'ALL' }))}
              modalTitle="Select Crop Year Cycle"
              searchPlaceholder="Search crop year..."
              leftIcon="calendar"
            />

            {/* Farm Selector (if not member) */}
            {!isMember && !isManager && farms.length > 1 && (
              <SearchableSelect
                onOpen={setPicker}
                label="BLOCK FARM"
                options={[
                  { id: 'ALL', label: 'All Farms', sublabel: `${farms.length} block farms in district`, icon: 'business-outline' },
                  ...farms.map(f => ({
                    id: f.id,
                    label: f.name,
                    sublabel: `${f.address || f.location ? `${f.address || f.location} · ` : ''}${Number(
                      f.effectiveAreaHa ?? f.declaredAreaHa ?? f.declaredHa ?? f.allocatedAreaHa ?? 0
                    ).toFixed(2)} Ha`,
                    icon: 'business-outline'
                  }))
                ]}
                selectedValue={draft.farm}
                onSelect={(opt) => setDraft(value => ({ ...value, farm: opt.id, field: 'ALL', period: 'ALL' }))}
                modalTitle="Select Block Farm"
                searchPlaceholder="Search block farm..."
                leftIcon="business"
              />
            )}

            {/* Field / Plot Selector */}
            <SearchableSelect
              onOpen={setPicker}
              label="PARCEL / PLOT"
              options={[
                { id: 'ALL', label: `All Plots (${draftFields.length})`, icon: 'grid-outline' },
                ...draftFields.map(fld => ({
                  id: fld.id,
                  label: fld.id,
                  sublabel: `${fld.ha || 0} Ha · Member: ${fld.memberName || fld.farmerName || 'Assigned Member'}`,
                  icon: 'leaf-outline'
                }))
              ]}
              selectedValue={draft.field}
              onSelect={(opt) => setDraft(value => ({ ...value, field: opt.id, period: 'ALL' }))}
              modalTitle="Select Parcel / Plot"
              searchPlaceholder="Search plot ID or member..."
              leftIcon="leaf"
            />

            {/* Period Selector */}
              <SearchableSelect
                onOpen={setPicker}
                label="REPORTING PERIOD / MONTH"
                options={['ALL', ...draftPeriods].map(p => ({
                  id: p,
                  label: p === 'ALL' ? 'All Months' : p,
                  sublabel: p === 'ALL' ? 'Aggregate all recorded months in cycle' : 'Monthly reporting activity window',
                  icon: 'time-outline'
                }))}
                selectedValue={draft.period}
                onSelect={(opt) => setDraft(value => ({ ...value, period: opt.id }))}
                modalTitle="Select Reporting Period"
                searchPlaceholder="Search period (e.g. 2026-03)..."
                leftIcon="time"
              />
          </ScrollView>

          <View style={styles.modalFooter}>
            <SecondaryButton
              title="Reset"
              onPress={() => setDraft({ season: currentSeason || 'ALL', farm: defaultFarmId, field: 'ALL', period: 'ALL' })}
              style={{ flex: 1 }}
            />
            <PrimaryButton
              title="Apply filters"
              onPress={() => {
                onApply({ ...draft, field: draftFields.some(field => field.id === draft.field) ? draft.field : 'ALL', period: draftPeriods.includes(draft.period) ? draft.period : 'ALL' });
                onClose();
              }}
              style={{ flex: 2 }}
            />
          </View>
        </>
      )}
    </AnimatedBottomSheet>
  );
}

// ── 3. Primary KPI Metric Card ────────────────────────────────────
export function PrimaryMetric({ title, value, subtitle }) {
  return (
    <Card style={styles.primaryMetricCard}>
      <Text style={styles.primaryMetricTag}>{title}</Text>
      <Text style={styles.primaryMetricVal}>{value}</Text>
      {subtitle ? <Text style={styles.primaryMetricSub}>{subtitle}</Text> : null}
    </Card>
  );
}

// ── 4. 6-Stage Sugarcane Progression List ─────────────────────────
export function StageDistributionList({
  stages = [],
  totalAcreageHa = 0,
  totalPlots = 0,
  onViewStageDetails
}) {
  return (
    <View style={{ gap: 10 }}>
      {stages.map((st, idx) => {
        const plotsCount = st.plotsCount ?? st.plotCount ?? 0;
        const areaHa = Number(st.areaHa ?? st.acreageHa ?? 0);
        const pct = st.percentOfArea ?? st.percentOfTotal ?? 0;
        const barWidth = Math.min(100, Math.max(0, pct));
        return (
          <View key={st.stageNumber || idx} style={styles.stageItemWrap}>
            {/* Row 1: Stage badge + Name */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <View style={[styles.stageBadge, { backgroundColor: COLORS.primary }]}>
                <Text style={styles.stageBadgeNum}>{st.stageNumber}</Text>
              </View>
              <Text style={[styles.stageNameText, { flex: 1 }]}>
                {st.name}
              </Text>
            </View>

            {/* Row 2: Metrics */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 30, marginBottom: 5 }}>
              <Text style={styles.stageMetricText}>
                {plotsCount} {plotsCount === 1 ? 'plot' : 'plots'} · {areaHa.toFixed(2)} Ha
              </Text>
              <Text style={[styles.stageMetricText, { fontWeight: '700', color: COLORS.text }]}>
                {pct}%
              </Text>
            </View>

            {/* Progress bar */}
            <View style={[styles.stageProgressTrack, { marginLeft: 30 }]}>
              <View
                style={[
                  styles.stageProgressFill,
                  {
                    width: `${barWidth}%`,
                    backgroundColor: COLORS.primary,
                    minWidth: barWidth > 0 ? 4 : 0,
                  }
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── 5. Cost Breakdown List ─────────────────────────────────────────
export function CostBreakdownList({
  categories = [],
  grandTotalCost = 0,
  topCategory
}) {
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      {categories.map((cat, idx) => (
        <View key={cat.key || idx} style={styles.costCatItem}>
          <View style={styles.costCatRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
              <View style={[styles.catDot, { backgroundColor: cat.color || COLORS.primary }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.catLabel}>{cat.label}</Text>
                <Text style={styles.catSub}>{cat.opsCount ?? cat.operationsCount ?? 0} operations logged</Text>
              </View>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.catAmount}>₱{cat.totalCost.toLocaleString()}</Text>
              <Text style={styles.catPercent}>{cat.percentOfTotal}% of total</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.catProgressTrack}>
            <View
              style={[
                styles.catProgressFill,
                {
                  width: `${Math.min(100, Math.max(0, cat.percentOfTotal || 0))}%`,
                  backgroundColor: cat.color || COLORS.primary
                }
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── 6. Activity Frequency Ranking List ────────────────────────────
export function ActivityFrequencyList({ ranking = [] }) {
  if (!ranking || ranking.length === 0) {
    return (
      <View style={{ paddingVertical: 16, alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: COLORS.textMuted }}>No operations recorded yet</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      {ranking.slice(0, 8).map((act, idx) => {
        const actName = act.name ?? act.activity ?? 'Field Operation';
        const execCount = act.count ?? act.executionCount ?? 0;
        const avgCost = act.avgCost ?? act.averageCost ?? 0;
        const totalCost = act.totalCost ?? 0;
        const pctShare = act.percentageOfTotal ?? 0;
        return (
          <View key={actName + idx} style={styles.freqRow}>
            <View style={styles.freqRankBadge}>
              <Text style={styles.freqRankText}>#{idx + 1}</Text>
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.freqTitle}>{actName}</Text>
              <Text style={styles.freqSub}>
                {execCount} {execCount === 1 ? 'pass' : 'passes'} · Avg ₱{Number(avgCost).toLocaleString()}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.freqCost}>₱{Number(totalCost).toLocaleString()}</Text>
              <Text style={styles.freqShare}>{pctShare}% share</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── 7. Price Summary Card ─────────────────────────────────────────
export { default as PriceSummaryCard } from '../PriceReferenceCard';

export function AnalyticsEmptyState({ title, subtitle }) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconCircle}>
        <Ionicons name="bar-chart-outline" size={26} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scopeCard: {
    backgroundColor: '#F8FAF5',
    borderWidth: 1,
    borderColor: '#E2EBDC',
    borderRadius: RADIUS.lg,
    padding: 12,
    gap: 8,
    ...SHADOW.card
  },
  scopeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  scopeTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  scopeHeaderTag: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  changeScopeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7ECD0',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: RADIUS.sm
  },
  changeScopeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary
  },
  scopeCardClean: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2EBDC',
    borderRadius: RADIUS.lg,
    padding: 12,
    gap: 8,
    ...SHADOW.xs
  },
  scopeHeaderClean: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  scopeTitleWrapClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0
  },
  scopeHeaderTagClean: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  changeScopeBtnClean: {
    maxWidth: '100%',
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F8EC',
    borderWidth: 1.2,
    borderColor: '#D0E4CA',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    minHeight: 32
  },
  changeScopeTextClean: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary
  },
  scopeChipsRowClean: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2
  },
  scopeChipClean: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FAFCF8',
    borderWidth: 1.2,
    borderColor: '#E2EBDC',
    borderRadius: RADIUS.md,
    paddingHorizontal: 11,
    paddingVertical: 6,
    minHeight: 32
  },
  scopeChipValueClean: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12.5,
    color: COLORS.text,
    fontWeight: '700'
  },

  // Modal
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '90%',
    paddingBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: SPACING.lg,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  modalClose: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
  filterSectionTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  filterChipsWrap: {
    gap: 6,
    paddingVertical: 2
  },
  filterChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  filterChipActive: {
    backgroundColor: '#F4FAF0',
    borderColor: '#D7ECD0'
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: COLORS.textSecondary
  },
  filterChipTextActive: {
    color: COLORS.primary,
    fontWeight: '800'
  },
  modalFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
    paddingHorizontal: SPACING.lg,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  // Primary Metric
  primaryMetricCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
    gap: 4
  },
  primaryMetricTag: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  primaryMetricVal: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: -0.5
  },
  primaryMetricSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2
  },

  // Stages
  stageItemWrap: {
    gap: 5
  },
  stageItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  stageBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stageBadgeNum: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#fff'
  },
  stageNameText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.text
  },
  stageMetricText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted
  },
  stageProgressTrack: {
    height: 6,
    backgroundColor: '#EEF2E6',
    borderRadius: 3,
    overflow: 'hidden'
  },
  stageProgressFill: {
    height: '100%',
    borderRadius: 3
  },

  // Cost Categories
  costCatItem: {
    gap: 5
  },
  costCatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  catDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5
  },
  catLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text
  },
  catSub: {
    fontSize: 10.5,
    color: COLORS.textMuted,
    marginTop: 1
  },
  catAmount: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.text
  },
  catPercent: {
    fontSize: 10.5,
    color: COLORS.textMuted,
    fontWeight: '600'
  },
  catProgressTrack: {
    height: 5,
    backgroundColor: '#F3F4F6',
    borderRadius: 2.5,
    overflow: 'hidden'
  },
  catProgressFill: {
    height: '100%',
    borderRadius: 2.5
  },

  // Activity Frequency
  freqRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5'
  },
  freqRankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EEF2E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },
  freqRankText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary
  },
  freqTitle: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text
  },
  freqSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1
  },
  freqCost: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text
  },
  freqShare: {
    fontSize: 10.5,
    color: COLORS.textMuted,
    fontWeight: '600'
  },

  // Price Card
  priceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2EBDC',
    gap: 10,
    ...SHADOW.card
  },
  priceHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  priceCircularTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 2
  },
  priceCircularSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1
  },
  postPriceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.sm
  },
  postPriceBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff'
  },
  priceBoxLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.3,
  },
  analyticsSugarBox: {
    paddingVertical: 2,
    gap: 2,
  },
  analyticsSugarPriceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 6,
  },
  analyticsSugarValue: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  analyticsSugarUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  analyticsMolassesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAF5',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E4EEE1',
    marginTop: 6,
  },
  analyticsMolLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  analyticsMolPriceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 2,
  },
  analyticsMolValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  analyticsMolUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8
  },
  emptyIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F4FAF0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text
  },
  emptySub: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center'
  }
});
