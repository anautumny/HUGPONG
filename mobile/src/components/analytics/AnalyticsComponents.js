import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { Card, PrimaryButton, SecondaryButton } from '../ui';

// ── 1. Analytics Scope Summary Card ──────────────────────────────
export function AnalyticsScopeCard({
  season,
  farmName,
  fieldName,
  period,
  onChangeScopePress,
  isMember
}) {
  return (
    <Card style={styles.scopeCardClean}>
      <View style={styles.scopeHeaderClean}>
        <View style={styles.scopeTitleWrapClean}>
          <Ionicons name="funnel-outline" size={15} color={COLORS.primary} />
          <Text style={styles.scopeHeaderTagClean}>ANALYTICS SCOPE</Text>
        </View>
        <TouchableOpacity
          style={styles.changeScopeBtnClean}
          onPress={onChangeScopePress}
          activeOpacity={0.75}
        >
          <Text style={styles.changeScopeTextClean}>Filter Scope</Text>
          <Ionicons name="chevron-down" size={13} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scopeChipsRowClean}
      >
        {!isMember && farmName && (
          <TouchableOpacity
            style={styles.scopeChipClean}
            onPress={onChangeScopePress}
            activeOpacity={0.7}
          >
            <Ionicons name="leaf-outline" size={13} color={COLORS.primary} />
            <Text style={styles.scopeChipValueClean} numberOfLines={1}>{farmName}</Text>
          </TouchableOpacity>
        )}
        {season && (
          <TouchableOpacity
            style={styles.scopeChipClean}
            onPress={onChangeScopePress}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={13} color={COLORS.textSecondary} />
            <Text style={styles.scopeChipValueClean}>{season === 'ALL' ? 'All Seasons' : season}</Text>
          </TouchableOpacity>
        )}
        {fieldName && (
          <TouchableOpacity
            style={styles.scopeChipClean}
            onPress={onChangeScopePress}
            activeOpacity={0.7}
          >
            <Ionicons name="grid-outline" size={13} color={COLORS.textSecondary} />
            <Text style={styles.scopeChipValueClean} numberOfLines={1}>{fieldName}</Text>
          </TouchableOpacity>
        )}
        {period && (
          <TouchableOpacity
            style={styles.scopeChipClean}
            onPress={onChangeScopePress}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={13} color={COLORS.textSecondary} />
            <Text style={styles.scopeChipValueClean}>{period === 'ALL' ? 'All Periods' : period}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </Card>
  );
}

// ── 2. Scope Filter Bottom Sheet Modal ────────────────────────────
export function AnalyticsScopeModal({
  visible,
  onClose,
  seasons = [],
  farms = [],
  fields = [],
  periods = [],
  selectedSeason,
  selectedFarmId,
  selectedFieldId,
  selectedPeriod,
  onSelectSeason,
  onSelectFarm,
  onSelectField,
  onSelectPeriod,
  onReset,
  isMember,
  isManager
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Filter Analytics Scope</Text>
              <Text style={styles.modalSub}>Select season, farm, parcel, or period</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 14, paddingVertical: 10 }}>
            {/* Season Selector */}
            <View>
              <Text style={styles.filterSectionTitle}>CROP YEAR / SEASON</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsWrap}>
                {seasons.map(s => {
                  const isSel = selectedSeason === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.filterChip, isSel && styles.filterChipActive]}
                      onPress={() => onSelectSeason(s)}
                    >
                      <Text style={[styles.filterChipText, isSel && styles.filterChipTextActive]}>
                        {s === 'ALL' ? 'All Seasons' : s}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Farm Selector (if not member) */}
            {!isMember && farms.length > 0 && (
              <View>
                <Text style={styles.filterSectionTitle}>BLOCK FARM</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsWrap}>
                  <TouchableOpacity
                    style={[styles.filterChip, selectedFarmId === 'ALL' && styles.filterChipActive]}
                    onPress={() => onSelectFarm('ALL')}
                  >
                    <Text style={[styles.filterChipText, selectedFarmId === 'ALL' && styles.filterChipTextActive]}>
                      All Farms
                    </Text>
                  </TouchableOpacity>
                  {farms.map(f => {
                    const isSel = selectedFarmId === f.id;
                    return (
                      <TouchableOpacity
                        key={f.id}
                        style={[styles.filterChip, isSel && styles.filterChipActive]}
                        onPress={() => onSelectFarm(f.id)}
                      >
                        <Text style={[styles.filterChipText, isSel && styles.filterChipTextActive]} numberOfLines={1}>
                          {f.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Field / Plot Selector */}
            <View>
              <Text style={styles.filterSectionTitle}>PARCEL / PLOT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsWrap}>
                <TouchableOpacity
                  style={[styles.filterChip, selectedFieldId === 'ALL' && styles.filterChipActive]}
                  onPress={() => onSelectField('ALL')}
                >
                  <Text style={[styles.filterChipText, selectedFieldId === 'ALL' && styles.filterChipTextActive]}>
                    All Plots ({fields.length})
                  </Text>
                </TouchableOpacity>
                {fields.map(fld => {
                  const isSel = selectedFieldId === fld.id;
                  return (
                    <TouchableOpacity
                      key={fld.id}
                      style={[styles.filterChip, isSel && styles.filterChipActive]}
                      onPress={() => onSelectField(fld.id)}
                    >
                      <Text style={[styles.filterChipText, isSel && styles.filterChipTextActive]}>
                        {fld.id} ({fld.ha || 0} Ha)
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Period Selector */}
            {periods.length > 0 && (
              <View>
                <Text style={styles.filterSectionTitle}>REPORTING PERIOD / MONTH</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsWrap}>
                  {periods.map(p => {
                    const isSel = selectedPeriod === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[styles.filterChip, isSel && styles.filterChipActive]}
                        onPress={() => onSelectPeriod(p)}
                      >
                        <Text style={[styles.filterChipText, isSel && styles.filterChipTextActive]}>
                          {p === 'ALL' ? 'All Months' : p}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <SecondaryButton
              title="Reset"
              onPress={onReset}
              style={{ flex: 1 }}
            />
            <PrimaryButton
              title="Apply Scope"
              onPress={onClose}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </View>
    </Modal>
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
              <Text style={[styles.stageNameText, { flex: 1 }]} numberOfLines={2}>
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
                <Text style={styles.catLabel} numberOfLines={1}>{cat.label}</Text>
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
              <Text style={styles.freqTitle} numberOfLines={1}>{actName}</Text>
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
export function PriceSummaryCard({ priceRecord, canPost, onPostPricePress }) {
  const sugarPrice = priceRecord?.sugarPricePerLkg ?? priceRecord?.sugarPrice ?? 2650;
  const molassesPrice = priceRecord?.molassesPricePerMetricTon ?? priceRecord?.molassesPrice ?? 9500;
  const circularNum = priceRecord?.circularNumber ?? priceRecord?.source ?? 'SRA Sugar Circular';
  const periodLabel = priceRecord?.weekLabel ?? priceRecord?.periodLabel ?? priceRecord?.effectiveDate ?? 'Current Milling Season';

  return (
    <Card style={styles.priceCard}>
      <View style={styles.priceHeader}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.scopeHeaderTag}>OFFICIAL SRA SUGAR BENCHMARK</Text>
          <Text style={styles.priceCircularTitle} numberOfLines={1}>{circularNum}</Text>
          <Text style={styles.priceCircularSub}>{periodLabel}</Text>
        </View>
        {canPost && (
          <TouchableOpacity
            style={styles.postPriceBtn}
            onPress={onPostPricePress}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle" size={14} color="#fff" />
            <Text style={styles.postPriceBtnText}>Publish</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.priceGrid}>
        <View style={styles.priceBox}>
          <Text style={styles.priceBoxLabel}>RAW SUGAR (CLASS B)</Text>
          <Text style={styles.priceBoxValue}>₱{sugarPrice.toLocaleString()}</Text>
          <Text style={styles.priceBoxUnit}>per Lkg (50-kg bag)</Text>
        </View>

        <View style={styles.priceDivider} />

        <View style={styles.priceBox}>
          <Text style={styles.priceBoxLabel}>MOLASSES BENCHMARK</Text>
          <Text style={[styles.priceBoxValue, { color: COLORS.text }]}>
            ₱{molassesPrice.toLocaleString()}
          </Text>
          <Text style={styles.priceBoxUnit}>per Metric Ton (MT)</Text>
        </View>
      </View>
    </Card>
  );
}

// ── 8. Empty State Component ──────────────────────────────────────
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
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  scopeTitleWrapClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  scopeHeaderTagClean: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  changeScopeBtnClean: {
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
    fontSize: 12.5,
    color: COLORS.text,
    fontWeight: '700'
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end'
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    paddingBottom: 32,
    gap: 12
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
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
    gap: 10,
    marginTop: 8
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
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  catDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5
  },
  catLabel: {
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
    alignItems: 'center',
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
  priceGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAF5',
    borderRadius: RADIUS.md,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E4EEE1'
  },
  priceBox: {
    flex: 1,
    alignItems: 'center'
  },
  priceDivider: {
    width: 1,
    backgroundColor: '#D7ECD0',
    marginHorizontal: 8
  },
  priceBoxLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.3,
    textAlign: 'center'
  },
  priceBoxValue: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.primary,
    marginTop: 2
  },
  priceBoxUnit: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1
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
