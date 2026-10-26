import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AnimatedBottomSheet from './AnimatedBottomSheet';
import { PrimaryButton, SecondaryButton } from './ui';
import { AppText as Text, AppTextInput as TextInput } from './Typography';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useTranslation } from '../services/i18n';
import { hapticFeedback } from '../utils/haptics';
import { SearchableSelect, SearchableSelectContent } from './ui/SearchableSelect';

const STAGES = [
  { stageNumber: 1, label: 'Pre-Planting', full: 'Stage 1: Pre-Planting' },
  { stageNumber: 2, label: 'Planting', full: 'Stage 2: Planting' },
  { stageNumber: 3, label: 'Basal', full: 'Stage 3: Basal' },
  { stageNumber: 4, label: 'Cultivation', full: 'Stage 4: Cultivation' },
  { stageNumber: 5, label: 'Maintenance', full: 'Stage 5: Maintenance' },
  { stageNumber: 6, label: 'Harvesting', full: 'Stage 6: Harvesting' },
];

export default function ArchiveFilters({
  visible,
  onClose,
  filters = {},
  onApply,
  cropYears = [],
  fields = [],
  operations = [],
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(filters);
  const [picker, setPicker] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [operationSearch, setOperationSearch] = useState('');

  // Sync draft when modal becomes visible
  useEffect(() => {
    if (visible) {
      setDraft(filters || {});
      setOperationSearch('');
      setPicker(null);

      // Auto-select stage if an operation is already active
      if (filters?.operationDefinitionId && operations.length > 0) {
        const activeOp = operations.find(op => op.id === filters.operationDefinitionId);
        if (activeOp?.stageNumber) {
          setSelectedStage(activeOp.stageNumber);
          return;
        }
      }
      setSelectedStage(null);
    }
  }, [visible, filters, operations]);

  // Count active filters in the current draft
  const activeCount = useMemo(() => {
    return [draft.cropYearCycle, draft.fieldId, draft.operationDefinitionId].filter(Boolean).length;
  }, [draft]);

  // Operations filtered by selected stage or search query
  const displayedOperations = useMemo(() => {
    let list = operations;
    if (selectedStage !== null) {
      list = list.filter(op => op.stageNumber === selectedStage);
    }
    const q = operationSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(op =>
        op.name.toLowerCase().includes(q) ||
        (op.id && op.id.toLowerCase().includes(q))
      );
    }
    return list;
  }, [operations, selectedStage, operationSearch]);

  const handleReset = () => {
    setDraft({
      cropYearCycle: '',
      fieldId: '',
      operationDefinitionId: '',
    });
    setSelectedStage(null);
    setOperationSearch('');
  };

  const handleApply = () => {
    onApply?.(draft);
    onClose?.();
  };

  return (
    <AnimatedBottomSheet
      visible={visible}
      onClose={() => picker ? setPicker(null) : onClose()}
      dismissible
      expandable
      keyboardAvoiding
      sheetStyle={styles.sheet}
    >
      {picker ? (
        <SearchableSelectContent
          {...picker}
          onClose={() => setPicker(null)}
          closeLabel="Back to archive filters"
          back
        />
      ) : (
        <>
      {/* Header bar with title, active badge, and explicit close button */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>
            {t('sheet_past_cycles', 'Filter Past Cycles')}
          </Text>
          <View style={styles.activeBadgeRow}>
            {activeCount > 0 ? (
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeBadgeText}>
                  {activeCount} {activeCount === 1 ? 'filter active' : 'filters active'}
                </Text>
              </View>
            ) : (
              <Text style={styles.headerSubtitle}>
                {t('sheet_showing_all', 'Showing all archived records')}
              </Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close filter sheet"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={20} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {/* Filter Body with Interactive Chips */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        {/* 1. Crop Year Section */}
        <SearchableSelect
          variant="capsule"
          onOpen={setPicker}
          label={t('sheet_crop_year', 'CROP YEAR')}
          options={[
            { id: '', label: t('sheet_all_years', 'All Crop Years'), icon: 'calendar-outline' },
            ...cropYears.map(year => ({
              id: year,
              label: year,
              icon: 'calendar-outline'
            }))
          ]}
          selectedValue={draft.cropYearCycle || ''}
          onSelect={(opt) => setDraft(prev => ({ ...prev, cropYearCycle: opt.id }))}
          modalTitle={t('sheet_crop_year', 'Select Crop Year')}
          searchPlaceholder="Search crop year..."
          leftIcon="calendar"
        />

        {/* 2. Plot / Field Section */}
        <SearchableSelect
          variant="capsule"
          onOpen={setPicker}
          label={t('sheet_plot', 'PLOT / FIELD')}
          options={[
            { id: '', label: t('sheet_all_plots', 'All Plots'), icon: 'map-outline' },
            ...fields.map(field => {
              const ownerName = field.memberName || field.farmerName;
              return {
                id: field.id,
                label: field.id,
                sublabel: ownerName ? `Member: ${ownerName}` : undefined,
                icon: 'leaf-outline'
              };
            })
          ]}
          selectedValue={draft.fieldId || ''}
          onSelect={(opt) => setDraft(prev => ({ ...prev, fieldId: opt.id }))}
          modalTitle={t('sheet_plot', 'Select Plot / Field')}
          searchPlaceholder="Search plot ID or member..."
          leftIcon="map"
        />

        {/* 3. Lifecycle Stage & Operation Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="leaf-outline" size={15} color={COLORS.primary} />
            <Text style={styles.sectionLabel}>
              {t('sheet_stage_operation', 'GROWTH STAGE & OPERATION')}
            </Text>
          </View>

          {/* Stage Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <TouchableOpacity
              onPress={() => {
                hapticFeedback.light();
                setSelectedStage(null);
                setDraft(prev => ({ ...prev, operationDefinitionId: '' }));
              }}
              style={[
                styles.stageChip,
                selectedStage === null && !draft.operationDefinitionId && styles.stageChipActive,
              ]}
              activeOpacity={0.65}
            >
              {selectedStage === null && !draft.operationDefinitionId ? (
                <View style={styles.capsuleCheckBadge}>
                  <Ionicons name="checkmark" size={11} color={COLORS.primary} />
                </View>
              ) : (
                <View style={styles.capsuleUnselectedDot} />
              )}
              <Text
                style={[
                  styles.stageChipText,
                  selectedStage === null && !draft.operationDefinitionId && styles.stageChipTextActive,
                ]}
              >
                {t('sheet_all_stages', 'All Stages')}
              </Text>
            </TouchableOpacity>

            {STAGES.map(stage => {
              const isStageActive = selectedStage === stage.stageNumber;
              return (
                <TouchableOpacity
                  key={stage.stageNumber}
                  onPress={() => {
                    hapticFeedback.light();
                    if (isStageActive) {
                      setSelectedStage(null);
                      setDraft(prev => ({ ...prev, operationDefinitionId: '' }));
                    } else {
                      setSelectedStage(stage.stageNumber);
                      setDraft(prev => ({ ...prev, operationDefinitionId: '' }));
                    }
                  }}
                  style={[styles.stageChip, isStageActive && styles.stageChipActive]}
                  activeOpacity={0.65}
                >
                  {isStageActive ? (
                    <View style={styles.capsuleCheckBadge}>
                      <Ionicons name="checkmark" size={11} color={COLORS.primary} />
                    </View>
                  ) : (
                    <View style={styles.capsuleUnselectedDot} />
                  )}
                  <Text style={[styles.stageChipText, isStageActive && styles.stageChipTextActive]}>
                    S{stage.stageNumber}: {stage.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Quick search input if more than 4 operations */}
          {operations.length > 4 && (
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('sheet_search_ops', 'Search operation name...')}
                placeholderTextColor={COLORS.textMuted}
                value={operationSearch}
                onChangeText={setOperationSearch}
                clearButtonMode="while-editing"
              />
              {operationSearch.length > 0 && (
                <TouchableOpacity
                  onPress={() => setOperationSearch('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Operations list in flex wrap chips */}
          <View style={styles.operationsWrap}>
            <TouchableOpacity
              onPress={() => {
                hapticFeedback.light();
                setDraft(prev => ({ ...prev, operationDefinitionId: '' }));
              }}
              style={[styles.opChip, !draft.operationDefinitionId && styles.opChipActive]}
              activeOpacity={0.65}
            >
              {!draft.operationDefinitionId && (
                <Ionicons name="checkmark" size={13} color="#FFFFFF" style={styles.chipCheck} />
              )}
              <Text style={[styles.opChipText, !draft.operationDefinitionId && styles.opChipTextActive]}>
                {selectedStage !== null
                  ? `All in Stage ${selectedStage}`
                  : t('sheet_all_operations', 'All Operations')}
              </Text>
            </TouchableOpacity>

            {displayedOperations.map(op => {
              const isSelected = draft.operationDefinitionId === op.id;
              return (
                <TouchableOpacity
                  key={op.id}
                  onPress={() => {
                    hapticFeedback.light();
                    setDraft(prev => ({ ...prev, operationDefinitionId: op.id }));
                  }}
                  style={[styles.opChip, isSelected && styles.opChipActive]}
                  activeOpacity={0.65}
                >
                  {isSelected && (
                    <Ionicons name="checkmark" size={13} color="#FFFFFF" style={styles.chipCheck} />
                  )}
                  <Text style={[styles.opChipText, isSelected && styles.opChipTextActive]}>
                    {op.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Footer Action Bar */}
      <View style={styles.footer}>
        <SecondaryButton
          title={t('sheet_reset', 'Reset')}
          onPress={handleReset}
          style={styles.resetButton}
        />
        <PrimaryButton
          title={
            activeCount > 0
              ? `${t('sheet_apply', 'Apply Filters')} (${activeCount})`
              : t('sheet_apply', 'Apply Filters')
          }
          onPress={handleApply}
          style={styles.applyButton}
        />
      </View>
    </>
  )}
</AnimatedBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleWrap: {
    flex: 1,
    paddingRight: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  activeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  activeBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: COLORS.primaryBg,
    borderColor: COLORS.primary,
  },
  chipCheck: {
    marginRight: 4,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  stageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 9,
    minHeight: 38,
    borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D4E2D0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.1,
    shadowRadius: 2.5,
    elevation: 2.5,
  },
  stageChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3.5,
    elevation: 3.5,
  },
  stageChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  stageChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  capsuleUnselectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#A3BFA0',
    marginRight: 6,
  },
  capsuleCheckBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
    marginBottom: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    padding: 0,
  },
  operationsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  opChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1.5,
  },
  opChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  opChipText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  opChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  resetButton: {
    flex: 1,
  },
  applyButton: {
    flex: 2,
  },
});
