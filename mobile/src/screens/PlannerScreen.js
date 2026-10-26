import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';
import { ScreenHeader, SearchableSelect } from '../components/ui';
import { COLORS, FONT_FAMILY, RADIUS, SHADOW, SPACING } from '../theme';
import { fieldsStore, getCurrentSession, saveFieldOperationSchedule, subscribe } from '../data/dataStore';
import { getOperationsForStage } from '../domain/operationCatalogue';
import { getOperationCapabilities } from '../domain/operationAuthorization';
import { estimatedScheduleTotal, scheduleEntryLabel } from '../domain/operationSchedule';
import { SUGARCANE_STAGES } from '../constants/cropStages';
import { createClientRecordId } from '../services/secureId';
import { syncPlannerDeviceNotifications } from '../services/plannerNotificationService';
import { useTranslation } from '../services/i18n';
import { AppText as Text, AppTextInput as TextInput } from '../components/Typography';

const localDate = (value = new Date()) => {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
  date.setHours(12, 0, 0, 0);
  return date;
};
const isoDate = (value = new Date()) => {
  const date = localDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const addDays = (value, amount) => {
  const date = localDate(value);
  date.setDate(date.getDate() + amount);
  return date;
};
const startOfWeek = value => {
  const date = localDate(value);
  return addDays(date, -date.getDay());
};
const calendarDays = (anchor, viewMode) => {
  if (viewMode === 'WEEK') {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
};
const money = value => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const displayDate = (value, withWeekday = false, locale = 'en-PH') => localDate(value).toLocaleDateString(locale, withWeekday
  ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
  : { month: 'short', day: 'numeric', year: 'numeric' });
const emptyForm = plannedDate => ({ id: null, plannedDate, operationChoiceId: '', customName: '', estimatedLabor: '', estimatedMaterials: '', estimatedOther: '', notes: '' });

export default function PlannerScreen({ navigation, route }) {
  const { t, language } = useTranslation();
  const locale = language === 'tl' ? 'fil-PH' : language === 'hil' ? 'hil-PH' : 'en-PH';
  const daysOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(day => t(`weekday_${day}`));
  const [session, setSession] = useState(getCurrentSession());
  const [allFields, setAllFields] = useState([...fieldsStore]);
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [viewMode, setViewMode] = useState('MONTH');
  const [anchorDate, setAnchorDate] = useState(localDate());
  const [selectedDate, setSelectedDate] = useState(isoDate());
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState(emptyForm(isoDate()));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => subscribe(() => {
    setSession(getCurrentSession());
    setAllFields([...fieldsStore]);
  }), []);

  useEffect(() => {
    const requestedDate = route?.params?.selectedDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(requestedDate || ''))) return;
    setSelectedDate(requestedDate);
    setAnchorDate(localDate(requestedDate));
    navigation.setParams({ selectedDate: undefined });
  }, [navigation, route?.params?.selectedDate]);

  const fields = useMemo(() => allFields.filter(field => getOperationCapabilities(session, field).canPlan), [allFields, session]);
  const fieldOptions = useMemo(() => {
    return fields.map(item => ({
      id: item.id,
      label: item.id,
      sublabel: `${item.ha || item.areaHa || 0} Ha · Stage ${item.stageNumber || 1} · Crop Year ${item.cropYear || 'Current'}`,
      icon: 'leaf-outline',
    }));
  }, [fields]);
  useEffect(() => {
    if (!fields.some(field => field.id === selectedFieldId)) setSelectedFieldId(fields[0]?.id || '');
  }, [fields, selectedFieldId]);

  const field = fields.find(item => item.id === selectedFieldId) || null;
  const allSchedule = useMemo(() => Array.isArray(field?.operationSchedule)
    ? field.operationSchedule.filter(entry => !entry.cycleId || entry.cycleId === field.currentCycleId)
    : [], [field]);
  const schedule = useMemo(() => allSchedule.filter(entry => !entry.completedOperationLogId), [allSchedule]);
  const days = useMemo(() => calendarDays(anchorDate, viewMode), [anchorDate, viewMode]);
  const today = isoDate();
  const selectedEntries = useMemo(() => schedule.filter(entry => entry.plannedDate === selectedDate), [schedule, selectedDate]);
  const stage = SUGARCANE_STAGES.find(item => item.stageNumber === Number(field?.stageNumber || field?.cropCycle?.currentStageNumber || 1));
  const currentStageNumber = Number(field?.stageNumber || field?.cropCycle?.currentStageNumber || 1);
  const operationChoices = useMemo(() => {
    const fixed = getOperationsForStage(currentStageNumber).flatMap(operation => {
      if (operation.id !== 'SRA-08') {
        return [{
          id: operation.id,
          label: operation.name,
          sublabel: operation.stageName,
          icon: 'construct-outline',
          operationDefinitionId: operation.id,
          operationName: operation.name,
          childOperationDefinitionId: null,
          childOperationName: '',
          stageNumber: currentStageNumber,
          category: operation.category || 'General Care'
        }];
      }
      return (operation.subItems || []).map(item => ({
        id: `${operation.id}:${item.id}`,
        label: item.description,
        sublabel: operation.name,
        icon: 'construct-outline',
        operationDefinitionId: operation.id,
        operationName: operation.name,
        childOperationDefinitionId: item.id,
        childOperationName: item.description,
        stageNumber: currentStageNumber,
        category: operation.category || 'General Care'
      }));
    });
    return [...fixed, {
      id: 'CUSTOM',
      label: t('planner_custom_operation'),
      sublabel: `${t('stage')} ${currentStageNumber}`,
      icon: 'create-outline',
      operationDefinitionId: 'CUSTOM',
      operationName: '',
      childOperationDefinitionId: null,
      childOperationName: '',
      stageNumber: currentStageNumber,
      category: 'General Care'
    }];
  }, [currentStageNumber, t]);

  const movePeriod = direction => {
    const next = localDate(anchorDate);
    if (viewMode === 'MONTH') next.setMonth(next.getMonth() + direction, 1);
    else next.setDate(next.getDate() + (direction * 7));
    setAnchorDate(next);
    setSelectedDate(isoDate(viewMode === 'MONTH' ? new Date(next.getFullYear(), next.getMonth(), 1, 12) : startOfWeek(next)));
  };
  const goToday = () => {
    setAnchorDate(localDate());
    setSelectedDate(today);
  };
  const openNew = () => {
    setForm(emptyForm(selectedDate));
    setShowEditor(true);
  };
  const openEdit = entry => {
    const operationChoiceId = entry.operationDefinitionId === 'CUSTOM'
      ? 'CUSTOM'
      : entry.childOperationDefinitionId
        ? `${entry.operationDefinitionId}:${entry.childOperationDefinitionId}`
        : entry.operationDefinitionId;
    setForm({
      id: entry.id,
      plannedDate: entry.plannedDate,
      operationChoiceId,
      customName: entry.operationDefinitionId === 'CUSTOM' ? entry.operationName || '' : '',
      estimatedLabor: entry.estimatedLabor ? String(entry.estimatedLabor) : '',
      estimatedMaterials: entry.estimatedMaterials ? String(entry.estimatedMaterials) : '',
      estimatedOther: entry.estimatedOther ? String(entry.estimatedOther) : '',
      notes: entry.notes || ''
    });
    setShowEditor(true);
  };
  const persistSchedule = async nextActiveSchedule => {
    if (!field) return;
    const previousSchedule = allSchedule.map(entry => ({ ...entry }));
    const completedSchedule = allSchedule.filter(entry => entry.completedOperationLogId);
    const nextSchedule = [...completedSchedule, ...nextActiveSchedule];
    const editorWasOpen = showEditor;
    const optimisticFields = allFields.map(item => item.id === field.id
      ? { ...item, operationSchedule: nextSchedule.map(entry => ({ ...entry })) }
      : item);
    setAllFields(optimisticFields);
    if (editorWasOpen) setShowEditor(false);
    setIsSaving(true);
    try {
      await saveFieldOperationSchedule(field.id, nextSchedule);
      const hasActivePlan = nextSchedule.some(entry => !entry.completedOperationLogId && String(entry.plannedDate || '') >= today);
      syncPlannerDeviceNotifications(optimisticFields, session, { requestPermission: hasActivePlan }).catch(() => {});
    } catch (error) {
      setAllFields(current => current.map(item => item.id === field.id
        ? { ...item, operationSchedule: previousSchedule }
        : item));
      if (editorWasOpen) setShowEditor(true);
      Alert.alert(t('planner_schedule_not_saved'), t('planner_schedule_not_saved_msg'));
    } finally {
      setIsSaving(false);
    }
  };
  const saveEntry = async () => {
    const selectedChoice = operationChoices.find(choice => choice.id === form.operationChoiceId);
    if (!selectedChoice) return Alert.alert(t('planner_operation_required'), t('planner_operation_required_msg'));
    const customName = String(form.customName || '').trim();
    if (selectedChoice.operationDefinitionId === 'CUSTOM' && !customName) {
      return Alert.alert(t('planner_activity_required'), t('planner_activity_required_msg'));
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.plannedDate)) return Alert.alert(t('planner_date_required'), t('planner_date_required_msg'));
    const numbers = [form.estimatedLabor, form.estimatedMaterials, form.estimatedOther].map(value => value === '' ? 0 : Number(value));
    if (numbers.some(value => !Number.isFinite(value) || value < 0)) return Alert.alert(t('planner_invalid_estimate'), t('planner_invalid_estimate_msg'));
    const now = new Date().toISOString();
    const prior = schedule.find(entry => entry.id === form.id);
    const nextEntry = {
      ...(prior || {}), id: prior?.id || createClientRecordId('PLAN', field.id), cycleId: field.currentCycleId,
      ...selectedChoice,
      operationName: selectedChoice.operationDefinitionId === 'CUSTOM' ? customName : selectedChoice.operationName,
      plannedDate: form.plannedDate, estimatedLabor: numbers[0], estimatedMaterials: numbers[1], estimatedOther: numbers[2],
      estimatedTotal: numbers.reduce((sum, value) => sum + value, 0), notes: form.notes.trim(), createdAt: prior?.createdAt || now, updatedAt: now
    };
    await persistSchedule([...schedule.filter(entry => entry.id !== nextEntry.id), nextEntry]);
    setSelectedDate(nextEntry.plannedDate);
    setAnchorDate(localDate(nextEntry.plannedDate));
  };

  const openOperationInputs = entry => {
    if (!field || entry.completedOperationLogId) return;
    navigation?.navigate('Field Ops', {
      screen: 'SchedMain',
      params: {
        fieldId: field.id,
        plannedOperation: {
          id: entry.id,
          fieldId: field.id,
          stageNumber: entry.stageNumber,
          operationDefinitionId: entry.operationDefinitionId,
          operationName: entry.operationName,
          childOperationDefinitionId: entry.childOperationDefinitionId || null,
          childOperationName: entry.childOperationName || '',
          plannedDate: entry.plannedDate,
          estimatedCost: {
            labor: Number(entry.estimatedLabor || 0),
            materials: Number(entry.estimatedMaterials || 0),
            other: Number(entry.estimatedOther || 0),
            total: estimatedScheduleTotal(entry)
          }
        }
      }
    });
  };
  const removeEntry = entry => Alert.alert(t('planner_remove_title'), `${t('planner_remove_prefix')} “${scheduleEntryLabel(entry)}” ${t('planner_remove_suffix')}`, [
    { text: t('btn_cancel'), style: 'cancel' },
    { text: t('btn_delete'), style: 'destructive', onPress: () => persistSchedule(schedule.filter(item => item.id !== entry.id)) }
  ]);

  const formEstimate = Number(form.estimatedLabor || 0) + Number(form.estimatedMaterials || 0) + Number(form.estimatedOther || 0);
  const headerLabel = viewMode === 'MONTH' ? anchorDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' }) : `${displayDate(startOfWeek(anchorDate), false, locale)} – ${displayDate(addDays(startOfWeek(anchorDate), 6), false, locale)}`;

  if (showEditor) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader
          title={form.id ? t('planner_edit_work') : t('planner_schedule_farm_work')}
          subtitle={t('planner_free_form_note')}
          onBackPress={() => {
            if (!isSaving) setShowEditor(false);
          }}
        />
        <ScrollView
          contentContainerStyle={s.editorContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.editorCard}>
            <Text style={s.inputLabel}>{t('planner_planned_activity')}</Text>
            <SearchableSelect
              variant="capsule"
              options={operationChoices}
              selectedValue={form.operationChoiceId}
              onSelect={choice => setForm(current => ({ ...current, operationChoiceId: choice?.id || choice, customName: (choice?.id || choice) === 'CUSTOM' ? current.customName : '' }))}
              placeholder={t('planner_select_operation_placeholder')}
              modalTitle={t('planner_select_operation')}
              searchPlaceholder={t('planner_search_operations')}
              leftIcon="construct"
            />
            {form.operationChoiceId === 'CUSTOM' && (
              <TextInput style={[s.input, s.customActivityInput]} value={form.customName} onChangeText={value => setForm(current => ({ ...current, customName: value }))} placeholder={t('planner_activity_placeholder')} maxLength={300} />
            )}
            <Text style={s.inputHelp}>{t('planner_stage_later_help')}</Text>
            <Text style={s.inputLabel}>{t('planner_planned_date')}</Text>
            <View style={s.plannedDateDisplay} accessibilityRole="text">
              <Ionicons name="calendar-outline" size={19} color={COLORS.primary} />
              <Text style={s.plannedDateText}>{displayDate(form.plannedDate, true, locale)}</Text>
              <Ionicons name="lock-closed-outline" size={16} color={COLORS.textMuted} />
            </View>
          </View>

          <View style={s.estimateBox}>
            <Text style={s.estimateTitle}>{t('planner_estimated_cost_optional')}</Text>
            <Text style={s.estimateHint}>{t('planner_estimates_disclaimer')}</Text>
            <EstimateInput label={t('planner_estimated_labor')} value={form.estimatedLabor} onChange={value => setForm(current => ({ ...current, estimatedLabor: value }))} />
            <EstimateInput label={t('planner_estimated_materials')} value={form.estimatedMaterials} onChange={value => setForm(current => ({ ...current, estimatedMaterials: value }))} />
            <EstimateInput label={t('planner_estimated_other')} value={form.estimatedOther} onChange={value => setForm(current => ({ ...current, estimatedOther: value }))} />
            <View style={s.estimateTotal}><Text style={s.estimateTotalLabel}>{t('planner_estimated_total')}</Text><Text style={s.estimateTotalValue}>{money(formEstimate)}</Text></View>
          </View>

          <View style={s.editorCard}>
            <Text style={s.inputLabel}>{t('planner_notes_optional')}</Text>
            <TextInput style={[s.input, s.notes]} value={form.notes} onChangeText={value => setForm(current => ({ ...current, notes: value }))} multiline placeholder={t('planner_notes_placeholder')} />
          </View>

          <TouchableOpacity style={[s.saveButton, isSaving && s.disabled]} onPress={saveEntry} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveButtonText}>{t('planner_save_schedule')}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return <SafeAreaView style={s.safe} edges={['top']}>
    <AppHeader />
    <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
      <View><Text style={s.title}>{t('planner_screen_title')}</Text><Text style={s.subtitle}>{t('planner_screen_sub')}</Text></View>
      {isSaving && !showEditor && (
        <View style={s.savingBanner} accessibilityRole="progressbar" accessibilityLabel="Saving schedule changes">
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={s.savingBannerText}>{t('planner_saving_schedule', 'Saving schedule changes...')}</Text>
        </View>
      )}
      {fields.length === 0 ? <EmptyState t={t} /> : <>
        <SearchableSelect
          variant="capsule"
          label={t('field_plot', 'Active Sugarcane Field Plot')}
          options={fieldOptions}
          selectedValue={selectedFieldId}
          onSelect={(opt) => setSelectedFieldId(opt?.id || opt)}
          modalTitle={t('select_field_plot', 'Select Sugarcane Field Plot')}
          searchPlaceholder={t('search_fields', 'Search by plot ID or size...')}
          leftIcon="leaf"
        />
        <View style={s.contextCard}><Text style={s.eyebrow}>{t('planner_current_stage')}</Text><Text style={s.contextTitle}>{stage?.name || `${t('stage')} ${field?.stageNumber || 1}`}</Text><Text style={s.contextText}>{t('planner_field_context')} {field?.id} · {t('planner_crop_year_context')} {field?.cropYear || t('planner_current_cycle')}</Text></View>
        <View style={s.calendarCard}>
          <View style={s.calendarTop}><View style={s.segment}><Segment label={t('planner_month')} active={viewMode === 'MONTH'} onPress={() => setViewMode('MONTH')} /><Segment label={t('planner_week')} active={viewMode === 'WEEK'} onPress={() => setViewMode('WEEK')} /></View><TouchableOpacity style={s.todayButton} onPress={goToday}><Text style={s.todayButtonText}>{t('planner_today')}</Text></TouchableOpacity></View>
          <View style={s.navRow}><TouchableOpacity style={s.navButton} onPress={() => movePeriod(-1)}><Ionicons name="chevron-back" size={22} color={COLORS.text} /></TouchableOpacity><Text style={s.periodTitle}>{headerLabel}</Text><TouchableOpacity style={s.navButton} onPress={() => movePeriod(1)}><Ionicons name="chevron-forward" size={22} color={COLORS.text} /></TouchableOpacity></View>
          <View style={s.weekLabels}>{daysOfWeek.map((day, index) => <Text key={`${day}-${index}`} style={s.weekLabel}>{day}</Text>)}</View>
          <View style={s.calendarGrid}>{days.map(day => {
            const date = isoDate(day);
            const entries = schedule.filter(entry => entry.plannedDate === date);
            const outside = viewMode === 'MONTH' && day.getMonth() !== anchorDate.getMonth();
            return <TouchableOpacity key={date} style={[s.dayCell, viewMode === 'WEEK' && s.weekDayCell, date === selectedDate && s.daySelected]} onPress={() => setSelectedDate(date)}><View style={[s.dayNumberWrap, date === today && s.todayNumber]}><Text style={[s.dayNumber, outside && s.outsideText, date === today && s.todayNumberText]}>{day.getDate()}</Text></View>{entries.length > 0 && <View style={s.dotRow}><View style={[s.dot, s.dotGreen]} />{entries.length > 1 && <Text style={s.dotCount}>{entries.length}</Text>}</View>}</TouchableOpacity>;
          })}</View>
        </View>
        <View style={s.sectionHeader}><View style={s.sectionCopy}><Text style={s.sectionTitle}>{displayDate(selectedDate, true, locale)}</Text><Text style={s.sectionHint}>{selectedEntries.length ? `${selectedEntries.length} ${selectedEntries.length === 1 ? t('planner_scheduled_one') : t('planner_scheduled_many')}` : t('planner_no_work_date')}</Text></View><TouchableOpacity style={s.addButton} onPress={openNew}><Ionicons name="add" size={20} color="#fff" /><Text style={s.addButtonText}>{t('planner_schedule_work')}</Text></TouchableOpacity></View>
        <View style={s.listGap}>{selectedEntries.map(entry => <ScheduleCard key={entry.id} entry={entry} canEdit={!entry.stageNumber || Number(entry.stageNumber) === currentStageNumber} onRecord={() => openOperationInputs(entry)} onEdit={() => openEdit(entry)} onRemove={() => removeEntry(entry)} t={t} />)}{!selectedEntries.length && <TouchableOpacity style={s.emptyDate} onPress={openNew}><Text style={s.emptyTitle}>{t('planner_date_open')}</Text><Text style={s.emptyText}>{t('planner_tap_schedule')}</Text></TouchableOpacity>}</View>
      </>}
    </ScrollView>
  </SafeAreaView>;
}

function EmptyState({ t }) { return <View style={s.emptyCard}><Text style={s.emptyTitle}>{t('planner_no_field')}</Text><Text style={s.emptyText}>{t('planner_field_required')}</Text></View>; }
function Segment({ label, active, onPress }) { return <TouchableOpacity style={[s.segmentButton, active && s.segmentActive]} onPress={onPress}><Text style={[s.segmentText, active && s.segmentTextActive]}>{label}</Text></TouchableOpacity>; }
function EstimateInput({ label, value, onChange }) { return <View style={s.estimateRow}><Text style={s.estimateLabel}>{label}</Text><View style={s.moneyInputWrap}><Text style={s.moneyPrefix}>₱</Text><TextInput style={s.moneyInput} value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="0" /></View></View>; }
function ScheduleCard({ entry, canEdit, onRecord, onEdit, onRemove, t }) {
  const estimate = estimatedScheduleTotal(entry);
  return <View style={s.scheduleCard}><View style={s.cardTop}><View style={s.cardCopy}><Text style={s.cardTitle}>{entry.childOperationName || entry.operationName}</Text>{entry.childOperationName && <Text style={s.cardParent}>{entry.operationName}</Text>}<Text style={s.cardMeta}>{t('stage')} {entry.stageNumber || '—'} · {t('planner_todo_label')}</Text></View></View>{estimate > 0 && <View style={s.costLine}><Text style={s.costLabel}>{t('planner_estimated_cost')}</Text><Text style={s.costValue}>{money(estimate)}</Text></View>}{entry.notes ? <Text style={s.cardNotes}>{entry.notes}</Text> : null}<TouchableOpacity style={s.recordButton} onPress={onRecord}><Ionicons name="arrow-forward-circle-outline" size={20} color="#fff" /><Text style={s.recordButtonText}>{t('planner_open_operation_inputs')}</Text></TouchableOpacity><View style={s.cardActions}>{canEdit && <TouchableOpacity style={s.secondaryButton} onPress={onEdit}><Text style={s.secondaryButtonText}>{t('btn_edit')}</Text></TouchableOpacity>}<TouchableOpacity style={s.removeButton} onPress={onRemove}><Text style={s.removeButtonText}>{t('btn_delete')}</Text></TouchableOpacity></View></View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background }, page: { padding: SPACING.lg, paddingBottom: 120, gap: SPACING.lg },
  editorContent: { padding: SPACING.lg, paddingBottom: 48, gap: SPACING.md },
  editorCard: { padding: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, ...SHADOW.card },
  title: { fontFamily: FONT_FAMILY.display, fontSize: 26, lineHeight: 32, fontWeight: '800', color: COLORS.text }, subtitle: { marginTop: 4, fontSize: 15, lineHeight: 22, color: COLORS.textSecondary },
  fieldRow: { gap: 8, paddingVertical: 2 }, fieldChip: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 16, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface }, fieldChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }, fieldChipText: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary }, fieldChipTextActive: { color: COLORS.primary },
  contextCard: { padding: 16, borderRadius: RADIUS.lg, backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primaryBorder }, eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: COLORS.primary }, contextTitle: { marginTop: 6, fontSize: 18, lineHeight: 24, fontWeight: '800', color: COLORS.text }, contextText: { marginTop: 5, fontSize: 14, color: COLORS.textSecondary },
  savingBanner: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primaryBorder }, savingBannerText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  calendarCard: { padding: 12, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card }, calendarTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, segment: { flexDirection: 'row', padding: 3, borderRadius: RADIUS.md, backgroundColor: COLORS.background }, segmentButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: RADIUS.sm }, segmentActive: { backgroundColor: COLORS.surface, ...SHADOW.card }, segmentText: { fontSize: 14, fontWeight: '700', color: COLORS.textMuted }, segmentTextActive: { color: COLORS.primary },
  todayButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 15, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.primary }, todayButtonText: { fontSize: 14, fontWeight: '800', color: COLORS.primary }, navRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.full, backgroundColor: COLORS.background }, periodTitle: { flex: 1, paddingHorizontal: 6, textAlign: 'center', fontSize: 17, fontWeight: '800', color: COLORS.text },
  weekLabels: { flexDirection: 'row', marginTop: 10 }, weekLabel: { width: '14.2857%', textAlign: 'center', fontSize: 12, fontWeight: '700', color: COLORS.textMuted }, calendarGrid: { marginTop: 4, flexDirection: 'row', flexWrap: 'wrap' }, dayCell: { width: '14.2857%', minHeight: 55, alignItems: 'center', paddingTop: 5, borderRadius: RADIUS.sm }, weekDayCell: { minHeight: 82, justifyContent: 'center' }, daySelected: { backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primaryBorder }, dayNumberWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 }, todayNumber: { backgroundColor: COLORS.primary }, dayNumber: { fontSize: 14, fontWeight: '800', color: COLORS.text }, todayNumberText: { color: '#fff' }, outsideText: { color: COLORS.textDisabled }, dotRow: { marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 3 }, dot: { width: 7, height: 7, borderRadius: 4 }, dotGreen: { backgroundColor: COLORS.primary }, dotCount: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted },
  sectionHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, sectionCopy: { flex: 1, minWidth: 180 }, sectionTitle: { fontSize: 19, lineHeight: 25, fontWeight: '800', color: COLORS.text }, sectionHint: { marginTop: 2, fontSize: 13, lineHeight: 18, color: COLORS.textMuted }, addButton: { minHeight: 48, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.primary }, addButtonText: { flexShrink: 1, textAlign: 'center', fontSize: 14, fontWeight: '800', color: '#fff' }, listGap: { gap: 10 },
  scheduleCard: { padding: 16, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, ...SHADOW.card }, cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, cardCopy: { flex: 1 }, cardTitle: { fontSize: 17, lineHeight: 23, fontWeight: '800', color: COLORS.text }, cardParent: { marginTop: 3, fontSize: 13, lineHeight: 18, color: COLORS.textSecondary }, cardMeta: { marginTop: 5, fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  costLine: { marginTop: 13, padding: 12, flexDirection: 'row', justifyContent: 'space-between', borderRadius: RADIUS.md, backgroundColor: COLORS.background }, costLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary }, costValue: { fontSize: 15, fontWeight: '900', color: COLORS.primary }, cardNotes: { marginTop: 10, fontSize: 14, lineHeight: 20, color: COLORS.textSecondary }, recordButton: { minHeight: 48, marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.primary }, recordButtonText: { fontSize: 14, fontWeight: '900', color: '#fff' }, cardActions: { marginTop: 9, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, secondaryButton: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 15, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.primaryBorder }, secondaryButtonText: { fontSize: 14, fontWeight: '800', color: COLORS.primary }, removeButton: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 12 }, removeButtonText: { fontSize: 14, fontWeight: '700', color: COLORS.danger },
  emptyCard: { padding: 20, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, emptyDate: { minHeight: 100, justifyContent: 'center', padding: 18, borderRadius: RADIUS.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.primaryBorder, backgroundColor: COLORS.primaryBg }, emptyTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text }, emptyText: { marginTop: 4, fontSize: 14, lineHeight: 20, color: COLORS.textSecondary },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.overlay }, modalSheet: { maxHeight: '93%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: COLORS.surface, ...SHADOW.modal }, modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: 18, borderBottomWidth: 1, borderBottomColor: COLORS.divider }, modalHeading: { flex: 1, minWidth: 0 }, modalTitle: { fontFamily: FONT_FAMILY.display, fontSize: 22, lineHeight: 28, fontWeight: '900', color: COLORS.text }, modalSubtitle: { marginTop: 4, fontSize: 13, lineHeight: 19, color: COLORS.textSecondary }, closeButton: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }, modalContent: { padding: 18, paddingBottom: 44 }, inputLabel: { marginTop: 16, marginBottom: 7, fontSize: 14, lineHeight: 20, fontWeight: '800', color: COLORS.text }, input: { minHeight: 50, paddingHorizontal: 14, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.background, fontSize: 16, color: COLORS.text }, customActivityInput: { marginTop: 10 }, inputHelp: { marginTop: 6, fontSize: 12, lineHeight: 18, color: COLORS.textMuted }, notes: { minHeight: 90, paddingTop: 13, textAlignVertical: 'top' }, plannedDateDisplay: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.primaryBorder, backgroundColor: COLORS.primaryBg }, plannedDateText: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '800', color: COLORS.text },
  choiceList: { gap: 8 }, choice: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border }, choiceActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }, choiceTextWrap: { flex: 1 }, choiceTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: COLORS.text }, choiceTitleActive: { color: COLORS.primary }, choiceParent: { marginTop: 2, fontSize: 12, color: COLORS.textMuted }, stagePill: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted }, stagePillActive: { color: COLORS.primary }, parentNotice: { marginTop: 12, padding: 12, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryBg }, parentNoticeLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: COLORS.primary }, parentNoticeText: { marginTop: 4, fontSize: 14, fontWeight: '700', color: COLORS.text },
  customBox: { marginTop: 12, padding: 14, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.primaryBorder, backgroundColor: COLORS.primaryBg }, stageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, stageChoice: { minWidth: '30%', minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface }, stageChoiceActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary }, stageChoiceText: { fontSize: 13, fontWeight: '800', color: COLORS.textSecondary }, stageChoiceTextActive: { color: '#fff' },
  estimateBox: { marginTop: 18, padding: 14, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.primaryBorder, backgroundColor: COLORS.primaryBg }, estimateTitle: { fontSize: 17, fontWeight: '900', color: COLORS.text }, estimateHint: { marginTop: 3, marginBottom: 8, fontSize: 13, lineHeight: 19, color: COLORS.textSecondary }, estimateRow: { marginTop: 10 }, estimateLabel: { marginBottom: 5, fontSize: 13, fontWeight: '700', color: COLORS.textSecondary }, moneyInputWrap: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface }, moneyPrefix: { paddingLeft: 13, fontSize: 16, fontWeight: '800', color: COLORS.textSecondary }, moneyInput: { flex: 1, paddingHorizontal: 8, fontSize: 16, color: COLORS.text }, estimateTotal: { marginTop: 13, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: COLORS.primaryBorder }, estimateTotalLabel: { fontSize: 15, fontWeight: '800', color: COLORS.text }, estimateTotalValue: { fontSize: 18, fontWeight: '900', color: COLORS.primary }, saveButton: { minHeight: 54, marginTop: 22, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.primary }, saveButtonText: { fontSize: 16, fontWeight: '900', color: '#fff' }, disabled: { opacity: 0.65 }
});
