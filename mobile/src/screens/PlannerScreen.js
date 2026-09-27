import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../components/AppHeader';
import { COLORS, RADIUS, SHADOW, SPACING } from '../theme';
import { draftLogs, fieldsStore, getCurrentSession, saveFieldOperationSchedule, saveLocalOperationDraft, subscribe } from '../data/dataStore';
import { SRA_OPERATIONS_CATALOGUE } from '../domain/operationCatalogue';
import { getOperationCapabilities } from '../domain/operationAuthorization';
import { estimatedScheduleTotal, scheduleEntryLabel, scheduleEntryStatus } from '../domain/operationSchedule';
import { SUGARCANE_STAGES } from '../constants/cropStages';
import { createClientRecordId } from '../services/secureId';
import { syncPlannerDeviceNotifications } from '../services/plannerNotificationService';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
const displayDate = (value, withWeekday = false) => localDate(value).toLocaleDateString('en-PH', withWeekday
  ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
  : { month: 'short', day: 'numeric', year: 'numeric' });
const emptyForm = plannedDate => ({ id: null, plannedDate, customName: '', estimatedLabor: '', estimatedMaterials: '', estimatedOther: '', notes: '' });

export default function PlannerScreen({ navigation, route }) {
  const [session, setSession] = useState(getCurrentSession());
  const [allFields, setAllFields] = useState([...fieldsStore]);
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [viewMode, setViewMode] = useState('MONTH');
  const [anchorDate, setAnchorDate] = useState(localDate());
  const [selectedDate, setSelectedDate] = useState(isoDate());
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState(emptyForm(isoDate()));
  const [isSaving, setIsSaving] = useState(false);
  const [draftingId, setDraftingId] = useState(null);

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
  useEffect(() => {
    if (!fields.some(field => field.id === selectedFieldId)) setSelectedFieldId(fields[0]?.id || '');
  }, [fields, selectedFieldId]);

  const field = fields.find(item => item.id === selectedFieldId) || null;
  const schedule = useMemo(() => Array.isArray(field?.operationSchedule)
    ? field.operationSchedule.filter(entry => !entry.cycleId || entry.cycleId === field.currentCycleId)
    : [], [field]);
  const days = useMemo(() => calendarDays(anchorDate, viewMode), [anchorDate, viewMode]);
  const today = isoDate();
  const selectedEntries = useMemo(() => schedule.filter(entry => entry.plannedDate === selectedDate), [schedule, selectedDate]);
  const upcoming = useMemo(() => schedule.filter(entry => scheduleEntryStatus(entry, today) === 'UPCOMING').sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)).slice(0, 5), [schedule, today]);
  const counts = useMemo(() => schedule.reduce((result, entry) => {
    result[scheduleEntryStatus(entry, today)] += 1;
    return result;
  }, { UPCOMING: 0, COMPLETED: 0, OVERDUE: 0 }), [schedule, today]);
  const draftedPlanIds = useMemo(() => new Set(draftLogs
    .filter(draft => draft.status === 'DRAFT' && draft.fieldId === field?.id && draft.plannedOperationId)
    .map(draft => draft.plannedOperationId)), [allFields, field?.id]);
  const stage = SUGARCANE_STAGES.find(item => item.stageNumber === Number(field?.stageNumber || field?.cropCycle?.currentStageNumber || 1));

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
    setForm({
      id: entry.id,
      plannedDate: entry.plannedDate,
      customName: entry.childOperationName || entry.operationName || '',
      estimatedLabor: entry.estimatedLabor ? String(entry.estimatedLabor) : '',
      estimatedMaterials: entry.estimatedMaterials ? String(entry.estimatedMaterials) : '',
      estimatedOther: entry.estimatedOther ? String(entry.estimatedOther) : '',
      notes: entry.notes || ''
    });
    setShowEditor(true);
  };
  const persistSchedule = async nextSchedule => {
    if (!field) return;
    const previousSchedule = schedule.map(entry => ({ ...entry }));
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
      Alert.alert('Schedule Not Saved', error.message || 'The planned operation could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };
  const saveEntry = async () => {
    const customName = String(form.customName || '').trim();
    if (!customName) return Alert.alert('Planned Activity Required', 'Enter the farm activity you want to schedule.');
    const selectedChoice = {
      operationDefinitionId: 'CUSTOM', operationName: customName,
      childOperationDefinitionId: null, childOperationName: '', stageNumber: null, category: 'General Care'
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.plannedDate)) return Alert.alert('Date Required', 'Enter the planned date as YYYY-MM-DD.');
    const numbers = [form.estimatedLabor, form.estimatedMaterials, form.estimatedOther].map(value => value === '' ? 0 : Number(value));
    if (numbers.some(value => !Number.isFinite(value) || value < 0)) return Alert.alert('Invalid Estimate', 'Estimated costs must be zero or a positive amount.');
    const now = new Date().toISOString();
    const prior = schedule.find(entry => entry.id === form.id);
    const nextEntry = {
      ...(prior || {}), id: prior?.id || createClientRecordId('PLAN', field.id), cycleId: field.currentCycleId,
      ...selectedChoice, plannedDate: form.plannedDate, estimatedLabor: numbers[0], estimatedMaterials: numbers[1], estimatedOther: numbers[2],
      estimatedTotal: numbers.reduce((sum, value) => sum + value, 0), notes: form.notes.trim(), createdAt: prior?.createdAt || now, updatedAt: now
    };
    await persistSchedule([...schedule.filter(entry => entry.id !== nextEntry.id), nextEntry]);
    setSelectedDate(nextEntry.plannedDate);
    setAnchorDate(localDate(nextEntry.plannedDate));
  };
  const removeEntry = entry => Alert.alert('Remove Planned Operation', `Remove “${scheduleEntryLabel(entry)}” from the schedule?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => persistSchedule(schedule.filter(item => item.id !== entry.id)) }
  ]);

  const addToDraft = async entry => {
    if (!field || entry.completedOperationLogId) return;
    if (draftLogs.some(draft => draft.status === 'DRAFT' && draft.plannedOperationId === entry.id)) {
      return Alert.alert('Already in Drafts', 'This planned operation already has a draft. Open Field Operations to complete it.');
    }
    const isCustom = entry.operationDefinitionId === 'CUSTOM';
    const operation = SRA_OPERATIONS_CATALOGUE.find(item => item.id === entry.operationDefinitionId)
      || (isCustom ? { id: 'CUSTOM', name: entry.operationName, category: 'General Care', unit: 'ha', isGroup: false } : null);
    if (!operation) return Alert.alert('Draft Not Created', 'The operation definition is no longer available.');
    setDraftingId(entry.id);
    try {
      const draftStageNumber = Number(field.stageNumber || field.cropCycle?.currentStageNumber || 1);
      const isChild = Boolean(entry.childOperationDefinitionId);
      const childLine = isChild ? (operation.subItems || []).find(item => (item.id || item.lineItemId) === entry.childOperationDefinitionId) : null;
      const isGroup = isChild || Boolean(operation.isGroup);
      const subItems = isChild ? [{
        id: entry.childOperationDefinitionId, description: entry.childOperationName, qty: Number(field.ha || field.areaHa || 1),
        unit: childLine?.unit || 'ha', unitCost: 0, subTotal: 0
      }] : (isGroup ? (operation.subItems || []).map(item => ({
        id: item.id || item.lineItemId, description: item.description, qty: 0, unit: item.unit || 'ha', unitCost: 0, subTotal: 0
      })) : []);
      const draft = await saveLocalOperationDraft({
        fieldId: field.id, taskId: `S${draftStageNumber}`, stageNumber: draftStageNumber,
        stageName: SUGARCANE_STAGES.find(item => item.stageNumber === draftStageNumber)?.name || `Stage ${draftStageNumber}`,
        sraOperationId: entry.operationDefinitionId, operationDefinitionId: entry.operationDefinitionId, parentOperationDefinitionId: null,
        childOperationDefinitionId: entry.childOperationDefinitionId || null, childOperationName: entry.childOperationName || '',
        operationName: entry.operationName, activity: entry.operationName, category: operation.category || 'General Care', isGroup, inputType: isGroup ? 'group' : 'direct',
        cost: 0, totalCost: 0, hectares: String(field.ha || field.areaHa || ''), people: '0', workers: [], subItems,
        inputQty: '', inputUnit: operation.unit || 'ha', inputName: '', directRate: '', date: displayDate(entry.plannedDate),
        plannedOperationId: entry.id, plannedDate: entry.plannedDate,
        estimatedCost: { labor: Number(entry.estimatedLabor || 0), materials: Number(entry.estimatedMaterials || 0), other: Number(entry.estimatedOther || 0), total: estimatedScheduleTotal(entry) },
        isSupplemental: false
      });
      Alert.alert('Added to Draft', 'The schedule and estimated cost remain planning information. Enter actual labor, materials, expenses, and date in Field Operations.', [
        { text: 'Keep Planning', style: 'cancel' },
        { text: 'Open Draft', onPress: () => navigation?.navigate('Field Ops', { screen: 'SchedMain', params: { openDrafts: true, initialTab: 'drafts', highlightDraftId: draft.id, fieldId: field.id } }) }
      ]);
    } catch (error) {
      Alert.alert('Draft Not Created', error.message || 'The operation could not be added to Drafts.');
    } finally {
      setDraftingId(null);
    }
  };

  const formEstimate = Number(form.estimatedLabor || 0) + Number(form.estimatedMaterials || 0) + Number(form.estimatedOther || 0);
  const headerLabel = viewMode === 'MONTH' ? anchorDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : `${displayDate(startOfWeek(anchorDate))} – ${displayDate(addDays(startOfWeek(anchorDate), 6))}`;

  return <SafeAreaView style={s.safe} edges={['top']}>
    <AppHeader />
    <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
      <View><Text style={s.title}>Farm Work Planner</Text><Text style={s.subtitle}>Schedule future work. Record actual work and spending in Field Operations.</Text></View>
      {fields.length === 0 ? <EmptyState /> : <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fieldRow}>
          {fields.map(item => <TouchableOpacity key={item.id} style={[s.fieldChip, selectedFieldId === item.id && s.fieldChipActive]} onPress={() => setSelectedFieldId(item.id)}><Text style={[s.fieldChipText, selectedFieldId === item.id && s.fieldChipTextActive]}>{item.id} · {item.ha || item.areaHa} Ha</Text></TouchableOpacity>)}
        </ScrollView>
        <View style={s.contextCard}><Text style={s.eyebrow}>CURRENT CROP STAGE</Text><Text style={s.contextTitle}>{stage?.name || `Stage ${field?.stageNumber || 1}`}</Text><Text style={s.contextText}>Field {field?.id} · Crop Year {field?.cropYear || 'Current Cycle'}</Text></View>
        <View style={s.statusRow}><StatusBox label="Upcoming" value={counts.UPCOMING} /><StatusBox label="Completed" value={counts.COMPLETED} blue /><StatusBox label="Overdue" value={counts.OVERDUE} red /></View>
        <View style={s.calendarCard}>
          <View style={s.calendarTop}><View style={s.segment}><Segment label="Month" active={viewMode === 'MONTH'} onPress={() => setViewMode('MONTH')} /><Segment label="Week" active={viewMode === 'WEEK'} onPress={() => setViewMode('WEEK')} /></View><TouchableOpacity style={s.todayButton} onPress={goToday}><Text style={s.todayButtonText}>Today</Text></TouchableOpacity></View>
          <View style={s.navRow}><TouchableOpacity style={s.navButton} onPress={() => movePeriod(-1)}><Ionicons name="chevron-back" size={22} color={COLORS.text} /></TouchableOpacity><Text style={s.periodTitle}>{headerLabel}</Text><TouchableOpacity style={s.navButton} onPress={() => movePeriod(1)}><Ionicons name="chevron-forward" size={22} color={COLORS.text} /></TouchableOpacity></View>
          <View style={s.weekLabels}>{DAYS.map(day => <Text key={day} style={s.weekLabel}>{day}</Text>)}</View>
          <View style={s.calendarGrid}>{days.map(day => {
            const date = isoDate(day);
            const entries = schedule.filter(entry => entry.plannedDate === date);
            const outside = viewMode === 'MONTH' && day.getMonth() !== anchorDate.getMonth();
            const hasOverdue = entries.some(entry => scheduleEntryStatus(entry, today) === 'OVERDUE');
            const hasCompleted = entries.some(entry => scheduleEntryStatus(entry, today) === 'COMPLETED');
            return <TouchableOpacity key={date} style={[s.dayCell, viewMode === 'WEEK' && s.weekDayCell, date === selectedDate && s.daySelected]} onPress={() => setSelectedDate(date)}><View style={[s.dayNumberWrap, date === today && s.todayNumber]}><Text style={[s.dayNumber, outside && s.outsideText, date === today && s.todayNumberText]}>{day.getDate()}</Text></View>{entries.length > 0 && <View style={s.dotRow}><View style={[s.dot, hasOverdue ? s.dotRed : hasCompleted ? s.dotBlue : s.dotGreen]} />{entries.length > 1 && <Text style={s.dotCount}>{entries.length}</Text>}</View>}</TouchableOpacity>;
          })}</View>
        </View>
        <View style={s.sectionHeader}><View style={s.sectionCopy}><Text style={s.sectionTitle}>{displayDate(selectedDate, true)}</Text><Text style={s.sectionHint}>{selectedEntries.length ? `${selectedEntries.length} scheduled ${selectedEntries.length === 1 ? 'activity' : 'activities'}` : 'No work scheduled'}</Text></View><TouchableOpacity style={s.addButton} onPress={openNew}><Ionicons name="add" size={20} color="#fff" /><Text style={s.addButtonText}>Schedule Work</Text></TouchableOpacity></View>
        <View style={s.listGap}>{selectedEntries.map(entry => <ScheduleCard key={entry.id} entry={entry} today={today} drafting={draftingId === entry.id} inDraft={draftedPlanIds.has(entry.id)} onDraft={() => addToDraft(entry)} onEdit={() => openEdit(entry)} onRemove={() => removeEntry(entry)} />)}{!selectedEntries.length && <TouchableOpacity style={s.emptyDate} onPress={openNew}><Text style={s.emptyTitle}>This date is open</Text><Text style={s.emptyText}>Tap here to schedule a farm operation.</Text></TouchableOpacity>}</View>
        <View style={s.upcomingCard}><Text style={s.sectionTitle}>Upcoming Activities</Text><Text style={s.sectionHint}>Your next planned field work</Text>{upcoming.length ? upcoming.map(entry => <TouchableOpacity key={entry.id} style={s.upcomingRow} onPress={() => { setSelectedDate(entry.plannedDate); setAnchorDate(localDate(entry.plannedDate)); }}><View style={s.upcomingDate}><Text style={s.upcomingMonth}>{localDate(entry.plannedDate).toLocaleDateString('en-PH', { month: 'short' }).toUpperCase()}</Text><Text style={s.upcomingDay}>{localDate(entry.plannedDate).getDate()}</Text></View><View style={s.upcomingCopy}><Text style={s.upcomingTitle}>{entry.childOperationName || entry.operationName}</Text><Text style={s.upcomingMeta}>Flexible farm plan</Text></View></TouchableOpacity>) : <Text style={s.emptyText}>No upcoming work has been scheduled.</Text>}</View>
      </>}
    </ScrollView>
    <Modal visible={showEditor} animationType="slide" transparent onRequestClose={() => !isSaving && setShowEditor(false)}><View style={s.modalOverlay}><View style={s.modalSheet}>
      <View style={s.modalHeader}><View style={s.modalHeading}><Text style={s.modalTitle}>{form.id ? 'Edit Planned Work' : 'Schedule Farm Work'}</Text><Text style={s.modalSubtitle}>Free-form planning · Stage and actual costs belong in Field Operations</Text></View><TouchableOpacity style={s.closeButton} onPress={() => setShowEditor(false)} disabled={isSaving}><Ionicons name="close" size={26} color={COLORS.text} /></TouchableOpacity></View>
      <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
        <Text style={s.inputLabel}>Planned Date</Text><TextInput style={s.input} value={form.plannedDate} onChangeText={value => setForm(current => ({ ...current, plannedDate: value }))} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
        <Text style={s.inputLabel}>Planned Activity</Text><TextInput style={s.input} value={form.customName} onChangeText={value => setForm(current => ({ ...current, customName: value }))} placeholder="What farm work do you want to schedule?" maxLength={300} /><Text style={s.inputHelp}>Choose the crop stage later when recording the actual work in Field Operations.</Text>
        <View style={s.estimateBox}><Text style={s.estimateTitle}>Estimated Cost (Optional)</Text><Text style={s.estimateHint}>These amounts are planning estimates, never actual field expenses.</Text><EstimateInput label="Estimated Labor" value={form.estimatedLabor} onChange={value => setForm(current => ({ ...current, estimatedLabor: value }))} /><EstimateInput label="Estimated Materials" value={form.estimatedMaterials} onChange={value => setForm(current => ({ ...current, estimatedMaterials: value }))} /><EstimateInput label="Estimated Other Expenses" value={form.estimatedOther} onChange={value => setForm(current => ({ ...current, estimatedOther: value }))} /><View style={s.estimateTotal}><Text style={s.estimateTotalLabel}>Estimated Total</Text><Text style={s.estimateTotalValue}>{money(formEstimate)}</Text></View></View>
        <Text style={s.inputLabel}>Planning Notes (Optional)</Text><TextInput style={[s.input, s.notes]} value={form.notes} onChangeText={value => setForm(current => ({ ...current, notes: value }))} multiline placeholder="Timing, field conditions, equipment needs..." />
        <TouchableOpacity style={[s.saveButton, isSaving && s.disabled]} onPress={saveEntry} disabled={isSaving}>{isSaving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveButtonText}>Save to Schedule</Text>}</TouchableOpacity>
      </ScrollView>
    </View></View></Modal>
  </SafeAreaView>;
}

function EmptyState() { return <View style={s.emptyCard}><Text style={s.emptyTitle}>No personal field available</Text><Text style={s.emptyText}>A field assigned to your account is required before you can schedule farm work.</Text></View>; }
function Segment({ label, active, onPress }) { return <TouchableOpacity style={[s.segmentButton, active && s.segmentActive]} onPress={onPress}><Text style={[s.segmentText, active && s.segmentTextActive]}>{label}</Text></TouchableOpacity>; }
function StatusBox({ label, value, blue, red }) { return <View style={[s.statusBox, blue && s.statusBlue, red && s.statusRed]}><Text style={s.statusValue}>{value}</Text><Text style={s.statusLabel}>{label}</Text></View>; }
function EstimateInput({ label, value, onChange }) { return <View style={s.estimateRow}><Text style={s.estimateLabel}>{label}</Text><View style={s.moneyInputWrap}><Text style={s.moneyPrefix}>₱</Text><TextInput style={s.moneyInput} value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="0" /></View></View>; }
function ScheduleCard({ entry, today, drafting, inDraft, onDraft, onEdit, onRemove }) {
  const status = scheduleEntryStatus(entry, today);
  const estimate = estimatedScheduleTotal(entry);
  return <View style={s.scheduleCard}><View style={s.cardTop}><View style={s.cardCopy}><Text style={s.cardTitle}>{entry.childOperationName || entry.operationName}</Text>{entry.childOperationName && <Text style={s.cardParent}>{entry.operationName}</Text>}<Text style={s.cardMeta}>Flexible farm plan</Text></View><View style={[s.statusPill, status === 'COMPLETED' ? s.completedPill : status === 'OVERDUE' ? s.overduePill : s.upcomingPill]}><Text style={[s.statusPillText, status === 'COMPLETED' ? s.completedText : status === 'OVERDUE' ? s.overdueText : s.upcomingText]}>{status === 'COMPLETED' ? 'Completed' : status === 'OVERDUE' ? 'Overdue' : 'Upcoming'}</Text></View></View>{estimate > 0 && <View style={s.costLine}><Text style={s.costLabel}>Estimated Cost</Text><Text style={s.costValue}>{money(estimate)}</Text></View>}{entry.notes ? <Text style={s.cardNotes}>{entry.notes}</Text> : null}{status !== 'COMPLETED' && <View style={s.cardActions}><TouchableOpacity style={[s.draftButton, inDraft && s.draftButtonDone]} onPress={onDraft} disabled={drafting || inDraft}>{drafting && !inDraft ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[s.draftButtonText, inDraft && s.draftButtonDoneText]}>{inDraft ? 'In Drafts' : 'Add to Draft'}</Text>}</TouchableOpacity><TouchableOpacity style={s.secondaryButton} onPress={onEdit}><Text style={s.secondaryButtonText}>Edit</Text></TouchableOpacity><TouchableOpacity style={s.removeButton} onPress={onRemove}><Text style={s.removeButtonText}>Remove</Text></TouchableOpacity></View>}</View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background }, page: { padding: SPACING.lg, paddingBottom: 120, gap: SPACING.lg },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: COLORS.text }, subtitle: { marginTop: 4, fontSize: 15, lineHeight: 22, color: COLORS.textSecondary },
  fieldRow: { gap: 8, paddingVertical: 2 }, fieldChip: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 16, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface }, fieldChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }, fieldChipText: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary }, fieldChipTextActive: { color: COLORS.primary },
  contextCard: { padding: 16, borderRadius: RADIUS.lg, backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primaryBorder }, eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: COLORS.primary }, contextTitle: { marginTop: 6, fontSize: 18, lineHeight: 24, fontWeight: '800', color: COLORS.text }, contextText: { marginTop: 5, fontSize: 14, color: COLORS.textSecondary },
  statusRow: { flexDirection: 'row', gap: 8 }, statusBox: { flex: 1, padding: 12, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primaryBorder }, statusRed: { backgroundColor: COLORS.dangerBg, borderColor: '#F2C5C2' }, statusBlue: { backgroundColor: COLORS.blueBg, borderColor: '#B8DAEE' }, statusValue: { fontSize: 22, fontWeight: '900', color: COLORS.text }, statusLabel: { marginTop: 2, fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  calendarCard: { padding: 12, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card }, calendarTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, segment: { flexDirection: 'row', padding: 3, borderRadius: RADIUS.md, backgroundColor: COLORS.background }, segmentButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: RADIUS.sm }, segmentActive: { backgroundColor: COLORS.surface, ...SHADOW.card }, segmentText: { fontSize: 14, fontWeight: '700', color: COLORS.textMuted }, segmentTextActive: { color: COLORS.primary },
  todayButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 15, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.primary }, todayButtonText: { fontSize: 14, fontWeight: '800', color: COLORS.primary }, navRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.full, backgroundColor: COLORS.background }, periodTitle: { flex: 1, paddingHorizontal: 6, textAlign: 'center', fontSize: 17, fontWeight: '800', color: COLORS.text },
  weekLabels: { flexDirection: 'row', marginTop: 10 }, weekLabel: { width: '14.2857%', textAlign: 'center', fontSize: 12, fontWeight: '700', color: COLORS.textMuted }, calendarGrid: { marginTop: 4, flexDirection: 'row', flexWrap: 'wrap' }, dayCell: { width: '14.2857%', minHeight: 55, alignItems: 'center', paddingTop: 5, borderRadius: RADIUS.sm }, weekDayCell: { minHeight: 82, justifyContent: 'center' }, daySelected: { backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primaryBorder }, dayNumberWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 }, todayNumber: { backgroundColor: COLORS.primary }, dayNumber: { fontSize: 14, fontWeight: '800', color: COLORS.text }, todayNumberText: { color: '#fff' }, outsideText: { color: COLORS.textDisabled }, dotRow: { marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 3 }, dot: { width: 7, height: 7, borderRadius: 4 }, dotGreen: { backgroundColor: COLORS.primary }, dotBlue: { backgroundColor: COLORS.blue }, dotRed: { backgroundColor: COLORS.danger }, dotCount: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, sectionCopy: { flex: 1 }, sectionTitle: { fontSize: 19, lineHeight: 25, fontWeight: '800', color: COLORS.text }, sectionHint: { marginTop: 2, fontSize: 13, color: COLORS.textMuted }, addButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.primary }, addButtonText: { fontSize: 14, fontWeight: '800', color: '#fff' }, listGap: { gap: 10 },
  scheduleCard: { padding: 16, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, ...SHADOW.card }, cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, cardCopy: { flex: 1 }, cardTitle: { fontSize: 17, lineHeight: 23, fontWeight: '800', color: COLORS.text }, cardParent: { marginTop: 3, fontSize: 13, lineHeight: 18, color: COLORS.textSecondary }, cardMeta: { marginTop: 5, fontSize: 12, fontWeight: '700', color: COLORS.textMuted }, statusPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: RADIUS.full }, upcomingPill: { backgroundColor: COLORS.primaryBg }, completedPill: { backgroundColor: COLORS.blueBg }, overduePill: { backgroundColor: COLORS.dangerBg }, statusPillText: { fontSize: 11, fontWeight: '800' }, upcomingText: { color: COLORS.primary }, completedText: { color: COLORS.blue }, overdueText: { color: COLORS.danger },
  costLine: { marginTop: 13, padding: 12, flexDirection: 'row', justifyContent: 'space-between', borderRadius: RADIUS.md, backgroundColor: COLORS.background }, costLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary }, costValue: { fontSize: 15, fontWeight: '900', color: COLORS.primary }, cardNotes: { marginTop: 10, fontSize: 14, lineHeight: 20, color: COLORS.textSecondary }, cardActions: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, draftButton: { minWidth: 118, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.primary }, draftButtonDone: { backgroundColor: COLORS.primaryBg, borderWidth: 1.5, borderColor: COLORS.primaryBorder }, draftButtonText: { fontSize: 14, fontWeight: '800', color: '#fff' }, draftButtonDoneText: { color: COLORS.primary }, secondaryButton: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 15, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.primaryBorder }, secondaryButtonText: { fontSize: 14, fontWeight: '800', color: COLORS.primary }, removeButton: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 12 }, removeButtonText: { fontSize: 14, fontWeight: '700', color: COLORS.danger },
  emptyCard: { padding: 20, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, emptyDate: { minHeight: 100, justifyContent: 'center', padding: 18, borderRadius: RADIUS.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.primaryBorder, backgroundColor: COLORS.primaryBg }, emptyTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text }, emptyText: { marginTop: 4, fontSize: 14, lineHeight: 20, color: COLORS.textSecondary },
  upcomingCard: { padding: 16, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, upcomingRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.divider }, upcomingDate: { width: 50, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.primaryBg }, upcomingMonth: { fontSize: 10, fontWeight: '800', color: COLORS.primary }, upcomingDay: { fontSize: 20, fontWeight: '900', color: COLORS.text }, upcomingCopy: { flex: 1 }, upcomingTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text }, upcomingMeta: { marginTop: 3, fontSize: 12, color: COLORS.textMuted },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.overlay }, modalSheet: { maxHeight: '93%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: COLORS.surface, ...SHADOW.modal }, modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: COLORS.divider }, modalHeading: { flex: 1 }, modalTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text }, modalSubtitle: { marginTop: 4, fontSize: 13, color: COLORS.textSecondary }, closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, modalContent: { padding: 18, paddingBottom: 44 }, inputLabel: { marginTop: 16, marginBottom: 7, fontSize: 14, fontWeight: '800', color: COLORS.text }, input: { minHeight: 50, paddingHorizontal: 14, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.background, fontSize: 16, color: COLORS.text }, inputHelp: { marginTop: 6, fontSize: 12, lineHeight: 18, color: COLORS.textMuted }, notes: { minHeight: 90, paddingTop: 13, textAlignVertical: 'top' },
  choiceList: { gap: 8 }, choice: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border }, choiceActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }, choiceTextWrap: { flex: 1 }, choiceTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: COLORS.text }, choiceTitleActive: { color: COLORS.primary }, choiceParent: { marginTop: 2, fontSize: 12, color: COLORS.textMuted }, stagePill: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted }, stagePillActive: { color: COLORS.primary }, parentNotice: { marginTop: 12, padding: 12, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryBg }, parentNoticeLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: COLORS.primary }, parentNoticeText: { marginTop: 4, fontSize: 14, fontWeight: '700', color: COLORS.text },
  customBox: { marginTop: 12, padding: 14, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.primaryBorder, backgroundColor: COLORS.primaryBg }, stageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, stageChoice: { minWidth: '30%', minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface }, stageChoiceActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary }, stageChoiceText: { fontSize: 13, fontWeight: '800', color: COLORS.textSecondary }, stageChoiceTextActive: { color: '#fff' },
  estimateBox: { marginTop: 18, padding: 14, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.primaryBorder, backgroundColor: COLORS.primaryBg }, estimateTitle: { fontSize: 17, fontWeight: '900', color: COLORS.text }, estimateHint: { marginTop: 3, marginBottom: 8, fontSize: 13, lineHeight: 19, color: COLORS.textSecondary }, estimateRow: { marginTop: 10 }, estimateLabel: { marginBottom: 5, fontSize: 13, fontWeight: '700', color: COLORS.textSecondary }, moneyInputWrap: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface }, moneyPrefix: { paddingLeft: 13, fontSize: 16, fontWeight: '800', color: COLORS.textSecondary }, moneyInput: { flex: 1, paddingHorizontal: 8, fontSize: 16, color: COLORS.text }, estimateTotal: { marginTop: 13, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: COLORS.primaryBorder }, estimateTotalLabel: { fontSize: 15, fontWeight: '800', color: COLORS.text }, estimateTotalValue: { fontSize: 18, fontWeight: '900', color: COLORS.primary }, saveButton: { minHeight: 54, marginTop: 22, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.primary }, saveButtonText: { fontSize: 16, fontWeight: '900', color: '#fff' }, disabled: { opacity: 0.65 }
});
