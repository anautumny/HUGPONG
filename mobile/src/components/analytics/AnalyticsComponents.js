import { formatPhaseMonth } from '../../services/i18n';
import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { Card, PrimaryButton, SecondaryButton, SearchableSelect } from '../ui';
import { AppText as Text } from '../Typography';
import AnimatedBottomSheet from '../AnimatedBottomSheet';
import { SearchableSelectContent } from '../ui/SearchableSelect';
import { filterOperationsByCropYearCycle } from '../../services/analyticsSelectors';
import { hapticFeedback } from '../../utils/haptics';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function formatMonthLabel(val) {
  if (!val || val === 'ALL') return 'All Months';
  const str = String(val).trim();
  const match = str.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (match) {
    const monthIndex = parseInt(match[2], 10) - 1;
    return `${MONTH_NAMES[monthIndex]} ${match[1]}`;
  }
  if (typeof formatPhaseMonth === 'function') {
    try {
      return formatPhaseMonth(val);
    } catch {
      // fallback
    }
  }
  return val;
}

// ── 1. Analytics Scope Summary Card ──────────────────────────────
export function AnalyticsScopeCard({
  season,
  farmName,
  fieldName,
  period,
  isMember,
  onPress,
  activeFilterCount = 0
}) {
  const chips = [
    { label: season === 'ALL' ? 'All crop years' : season, icon: 'calendar-outline' },
    !isMember && farmName ? { label: farmName, icon: 'business-outline' } : null,
    { label: fieldName || 'All plots', icon: 'leaf-outline' },
    period && period !== 'ALL' ? { label: formatMonthLabel(period), icon: 'time-outline' } : null
  ].filter(Boolean);

  const hasActiveFilters = Boolean(activeFilterCount);

  return (
    <View style={styles.scopeCapsuleBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scopeCapsuleScroll}
      >
        <TouchableOpacity
          activeOpacity={0.65}
          onPress={() => {
            hapticFeedback.light();
            onPress();
          }}
          style={[
            styles.scopeCapsule,
            styles.scopeActionCapsule,
            hasActiveFilters && styles.scopeActionCapsuleActive
          ]}
          accessibilityRole="button"
          accessibilityLabel="Filter analytics scope"
        >
          <Ionicons
            name="options-outline"
            size={13}
            color={hasActiveFilters ? '#FFFFFF' : COLORS.primary}
          />
          <Text
            style={[
              styles.scopeActionCapsuleText,
              hasActiveFilters && styles.scopeActionCapsuleTextActive
            ]}
          >
            {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
          </Text>
        </TouchableOpacity>

        {chips.map((chip, index) => (
          <TouchableOpacity
            key={index}
            activeOpacity={0.65}
            onPress={() => {
              hapticFeedback.light();
              onPress();
            }}
            style={styles.scopeCapsule}
            accessibilityRole="button"
            accessibilityLabel={`Filter: ${chip.label}`}
          >
            <Ionicons name={chip.icon} size={12} color={COLORS.primary} />
            <Text style={styles.scopeCapsuleText}>{chip.label}</Text>
            <Ionicons name="chevron-down" size={10} color={COLORS.textMuted} style={{ marginLeft: 1 }} />
          </TouchableOpacity>
        ))}
      </ScrollView>
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
      backdropColor="rgba(0, 0, 0, 0.48)"
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

          <ScrollView style={{ flexShrink: 1, minHeight: 0 }} contentContainerStyle={{ gap: 14, paddingVertical: 12, paddingHorizontal: SPACING.lg }} keyboardShouldPersistTaps="handled">
            {/* Season Selector */}
            <SearchableSelect
              variant="capsule"
              onOpen={setPicker}
              label="CROP YEAR CYCLE"
              options={seasons.map(s => ({
                id: s,
                label: s === 'ALL' ? 'All Crop Years' : `${s}${s === currentSeason ? ' (Current)' : ''}`,
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
                variant="capsule"
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
              variant="capsule"
              onOpen={setPicker}
              label="FIELD PLOT"
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
              modalTitle="Select Field Plot"
              searchPlaceholder="Search plot ID or member..."
              leftIcon="leaf"
            />

            {/* Period Selector */}
            <SearchableSelect
              variant="capsule"
              onOpen={setPicker}
              label="REPORTING PERIOD / MONTH"
              options={['ALL', ...draftPeriods].map(p => ({
                id: p,
                label: p === 'ALL' ? 'All Months' : formatMonthLabel(p),
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

// Canonical 6-stage agronomic colors matching Web design system
const STAGE_COLORS = {
  1: '#9A5B32', // Stage 1: Pre-Planting & Land Preparation (earth brown)
  2: '#15803D', // Stage 2: Planting & Crop Establishment (emerald green)
  3: '#D97706', // Stage 3: Basal Nutrition & Early Care (harvest amber/gold)
  4: '#0D9488', // Stage 4: Cultivation & Weed Management (cultivation teal)
  5: '#2563EB', // Stage 5: Crop Maintenance & Final Hilling-Up (royal blue)
  6: '#EA580C', // Stage 6: Harvesting & Hauling (harvest orange)
};

// ── 4. 6-Stage Sugarcane Progression List ─────────────────────────
export function StageDistributionList({
  stages = [],
  totalAcreageHa = 0,
  totalPlots = 0,
  onViewStageDetails
}) {
  return (
    <View style={{ gap: 12 }}>
      {stages.map((st, idx) => {
        const stageNum = Number(st.stageNumber || idx + 1);
        const stageColor = STAGE_COLORS[stageNum] || COLORS.primary;
        const plotsCount = st.plotsCount ?? st.plotCount ?? 0;
        const areaHa = Number(st.areaHa ?? st.acreageHa ?? 0);
        const pct = st.percentOfArea ?? st.percentOfTotal ?? 0;
        const barWidth = Math.min(100, Math.max(0, pct));
        const hasParcels = plotsCount > 0 || areaHa > 0;

        return (
          <View key={st.stageNumber || idx} style={styles.stageItemWrap}>
            {/* Row 1: Stage badge + Name */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <View style={[
                styles.stageBadge,
                {
                  backgroundColor: hasParcels ? stageColor : '#F1F5F9',
                  borderWidth: hasParcels ? 0 : 1.5,
                  borderColor: '#E2E8F0'
                }
              ]}>
                <Text style={[styles.stageBadgeNum, { color: hasParcels ? '#FFFFFF' : '#64748B' }]}>
                  {st.stageNumber}
                </Text>
              </View>
              <Text style={[
                styles.stageNameText,
                { flex: 1, color: hasParcels ? COLORS.text : '#475569', fontWeight: hasParcels ? '800' : '700' }
              ]}>
                {st.name}
              </Text>
            </View>

            {/* Row 2: Metrics */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 36, marginBottom: 6 }}>
              <Text style={[styles.stageMetricText, { color: hasParcels ? COLORS.textSecondary : '#94A3B8' }]}>
                {plotsCount} {plotsCount === 1 ? 'plot' : 'plots'} · {areaHa.toFixed(2)} Ha
              </Text>
              {hasParcels ? (
                <View style={styles.pctBadgeActive}>
                  <Text style={styles.pctTextActive}>{pct}%</Text>
                </View>
              ) : (
                <Text style={styles.pctTextMuted}>0%</Text>
              )}
            </View>

            {/* Progress bar */}
            <View style={[styles.stageProgressTrack, { marginLeft: 36 }]}>
              <View
                style={[
                  styles.stageProgressFill,
                  {
                    width: `${barWidth}%`,
                    backgroundColor: stageColor,
                    minWidth: barWidth > 0 ? 6 : 0,
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
    <View style={{ gap: 12, marginTop: 10 }}>
      {categories.map((cat, idx) => {
        const pct = cat.percentOfTotal || 0;
        const hasCost = cat.totalCost > 0;
        return (
          <View key={cat.key || idx} style={styles.costCatItem}>
            <View style={styles.costCatRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                <View style={[styles.catDot, { backgroundColor: cat.color || COLORS.primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.catLabel}>{cat.label}</Text>
                  <Text style={styles.catSub}>{cat.opsCount ?? cat.operationsCount ?? 0} operations logged</Text>
                </View>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.catAmount}>₱{cat.totalCost.toLocaleString()}</Text>
                <Text style={[styles.catPercent, hasCost && styles.catPercentActive]}>
                  {pct}% of total
                </Text>
              </View>
            </View>

            {/* Progress bar */}
            <View style={styles.catProgressTrack}>
              <View
                style={[
                  styles.catProgressFill,
                  {
                    width: `${Math.min(100, Math.max(pct > 0 ? 5 : 0, pct))}%`,
                    backgroundColor: cat.color || COLORS.primary
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

// ── 6. Activity Frequency Ranking List ────────────────────────────
export function ActivityFrequencyList({ ranking = [] }) {
  if (!ranking || ranking.length === 0) {
    return (
      <View style={{ paddingVertical: 16, alignItems: 'center' }}>
        <Text style={{ fontSize: 12.5, color: COLORS.textMuted, fontWeight: '500' }}>No operations recorded yet</Text>
      </View>
    );
  }

  const totalExec = ranking.reduce((acc, curr) => acc + (curr.count ?? curr.executionCount ?? 0), 0);

  return (
    <View style={{ gap: 10, marginTop: 4 }}>
      {ranking.slice(0, 8).map((act, idx) => {
        const actName = act.name ?? act.activity ?? 'Field Operation';
        const execCount = act.count ?? act.executionCount ?? 0;
        const avgCost = act.avgCost ?? act.averageCost ?? 0;
        const totalCost = act.totalCost ?? 0;
        const pctShare = act.percentageOfTotal ?? (totalExec > 0 ? Math.round((execCount / totalExec) * 100) : 0);

        return (
          <View key={actName + idx} style={styles.freqCard}>
            <View style={styles.freqCardTopRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
                <View style={styles.freqRankBadge}>
                  <Text style={styles.freqRankText}>{idx + 1}</Text>
                </View>
                <Text style={styles.freqTitle} numberOfLines={1}>
                  {actName}
                </Text>
              </View>

              <View style={styles.freqSharePill}>
                <Text style={styles.freqShareText}>
                  {execCount} {execCount === 1 ? 'pass' : 'passes'}{pctShare > 0 ? ` · ${pctShare}%` : ''}
                </Text>
              </View>
            </View>

            <View style={styles.freqCardBottomRow}>
              <Text style={styles.freqCostLabel}>
                Total: <Text style={styles.freqCostVal}>₱{Number(totalCost).toLocaleString()}</Text>
              </Text>
              <Text style={styles.freqCostLabel}>
                Avg: <Text style={styles.freqAvgVal}>₱{Number(avgCost).toLocaleString()}</Text> / op
              </Text>
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
    fontSize: 13,
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
    fontSize: 14,
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
    fontSize: 12.5,
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
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingHorizontal: SPACING.lg,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  // Primary Metric
  primaryMetricCard: {
    backgroundColor: '#FEF5E7',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1.2,
    borderColor: '#FCE2B6',
    ...SHADOW.card,
    gap: 4
  },
  primaryMetricTag: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  primaryMetricVal: {
    fontSize: 28,
    fontWeight: '900',
    color: '#78350F',
    letterSpacing: -0.5
  },
  primaryMetricSub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
    marginTop: 2
  },

  // Stages
  stageItemWrap: {
    gap: 6,
    paddingVertical: 3
  },
  stageItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  stageBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stageBadgeNum: {
    fontSize: 13,
    fontWeight: '900',
    color: '#fff'
  },
  stageNameText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 20
  },
  stageMetricText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary
  },
  pctBadgeActive: {
    backgroundColor: '#FDF1DC',
    borderWidth: 1,
    borderColor: '#FCE2B6',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: RADIUS.full
  },
  pctTextActive: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#B45309'
  },
  pctTextMuted: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted
  },
  stageProgressTrack: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: RADIUS.full,
    overflow: 'hidden'
  },
  stageProgressFill: {
    height: '100%',
    borderRadius: RADIUS.full
  },

  // Cost Categories
  costCatItem: {
    gap: 6
  },
  costCatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  catDot: {
    width: 12,
    height: 12,
    borderRadius: 6
  },
  catLabel: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text
  },
  catSub: {
    fontSize: 12.5,
    color: COLORS.textSecondary,
    marginTop: 1,
    fontWeight: '500'
  },
  catAmount: {
    fontSize: 16.5,
    fontWeight: '900',
    color: COLORS.text
  },
  catPercent: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600'
  },
  catPercentActive: {
    color: '#B45309',
    fontWeight: '800'
  },
  catProgressTrack: {
    height: 7,
    backgroundColor: '#F1F5F9',
    borderRadius: RADIUS.full,
    overflow: 'hidden'
  },
  catProgressFill: {
    height: '100%',
    borderRadius: RADIUS.full
  },

  // Activity Frequency Cards (Synchronized with Web)
  freqCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#FCE2B6',
    borderRadius: RADIUS.lg,
    padding: 13,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  freqCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  freqRankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FDECCF',
    borderWidth: 1,
    borderColor: '#FCD69D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  freqRankText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#92400E',
  },
  freqTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },
  freqSharePill: {
    backgroundColor: '#FDF1DC',
    borderWidth: 1,
    borderColor: '#FCE2B6',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  freqShareText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#78350F',
  },
  freqCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
    paddingTop: 8,
  },
  freqCostLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  freqCostVal: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.text,
  },
  freqAvgVal: {
    fontSize: 13,
    fontWeight: '900',
    color: '#92400E',
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
    fontSize: 15,
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
    fontSize: 11.5,
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
    fontSize: 11.5,
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
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text
  },
  emptySub: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center'
  },

  // Scope Filter Capsules
  scopeCapsuleBar: {
    marginVertical: 4,
  },
  scopeCapsuleScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 2,
  },
  scopeCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D4E2D0',
    borderRadius: RADIUS.full,
    paddingHorizontal: 15,
    paddingVertical: 9,
    minHeight: 38,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.1,
    shadowRadius: 2.5,
    elevation: 2.5,
  },
  scopeActionCapsule: {
    backgroundColor: '#EAF6E7',
    borderColor: '#BFDEB6',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.1,
    shadowRadius: 2.5,
    elevation: 2.5,
  },
  scopeActionCapsuleActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3.5,
    elevation: 3.5,
  },
  scopeActionCapsuleText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  scopeActionCapsuleTextActive: {
    color: '#FFFFFF',
  },
  scopeCapsuleText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },

  // Scope Filter Bar (Backwards-compatibility)
  scopeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAF5',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginVertical: 4,
    gap: 8,
  },
  scopeChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7ECD0',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  scopeChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.primary,
  },
  scopeEditIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EAF6E7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Analytics Filter Bottom Modal
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  modalSub: {
    fontSize: 12.5,
    color: COLORS.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
});
