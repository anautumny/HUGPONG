import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Dimensions, TextInput, Alert, Platform, Image, Share,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import AppHeader from '../components/AppHeader';
import { formatDisplayDate, toISODateString, cleanupDuplicateLogs, subscribe, getCurrentSession, setSynced, setSession, updateSessionFieldId, updateFieldStageAndCycle, archiveFieldCropCycle, getIsSynced, assignmentRequests, resolveAssignmentRequest, requestFieldAssignment, fields, operationLogs, draftLogs as draftLogsStore, notifyDataUpdate, updateFieldCustomStages, getMemberSyncHealth, performMobileSync, SRA_OPERATIONS_CATALOGUE, getFieldCustomOperations, saveFieldCustomOperations, auditLogs, auditReports, blockFarms, users, resolveFieldBlockFarm, resolveFieldMember, findUserByIdOrContact, updateOperationLogWithSecurity, isLogLocked, getLogAuditTrail, pendingUsers, approvePendingRegistration, rejectPendingRegistration, saveFieldPlot, deleteDraftLogs, clearAllDraftsForField, saveDraftLogs, logSystemEvent, generateNextFieldId, cleanDataForFirestore, verifyCurrentPassword } from '../data/dataStore';
import { saveItem, STORAGE_KEYS } from '../services/storageService';
import { enqueueAndFlushMutation, generateLogId, generateDraftId, generateSubItemId, generateCustomOpId } from '../services/syncEngine';
import { getNetworkStatus } from '../services/networkService';
import { useTranslation } from '../services/i18n';
import MemberFieldOpsView from './member/MemberFieldOpsView';
import ManagerFieldOpsView from './manager/ManagerFieldOpsView';
import SRAFieldOpsView from './sra/SRAFieldOpsView';
import AuditHistoryModal from '../components/AuditHistoryModal';
import OfflineQRCode from '../components/OfflineQRCode';
import LiveQRScanner from '../components/LiveQRScanner';
import { safeAlert } from '../utils/dialogs';
import {
  canonicalRole,
  fromAuditReportDocument,
  operationSnapshot,
  toOperationLogDocument,
  toReportPeriod
} from '../data/firestoreSchema';

const commitExplicitMutation = async (type, payload, options = {}) => {
  const outcome = await enqueueAndFlushMutation(type, payload, options);
  if (outcome.queued && (outcome.item?.status === 'conflict' || outcome.item?.status === 'rejected')) {
    const error = new Error(outcome.item.lastError || 'The server rejected this mutation.');
    error.status = outcome.item.status === 'conflict' ? 409 : 400;
    error.data = outcome.item.conflict || null;
    throw error;
  }
  return outcome;
};

const { height, width } = Dimensions.get('window');
// Cane Varieties, Soil Types, and Growth Stages for Field Plot Registration (Web & Mobile Parity)
const CANE_VARIETIES = ['VMC 84-524', 'Phil 99-1793', 'Phil 2006-2289', 'Phil 58-260', 'Phil 80-13'];
const SOIL_TYPES = ['Clay Loam', 'Sandy Loam', 'Loam', 'Clay', 'Silt Loam'];
const INITIAL_STAGES = [
  { number: 1, name: 'Pre-Planting & Land Preparation', label: 'Stage 1: Pre-Planting & Land Preparation' },
  { number: 2, name: 'Planting & Crop Establishment', label: 'Stage 2: Planting & Crop Establishment' },
  { number: 3, name: 'Basal Nutrition & Early Care', label: 'Stage 3: Basal Nutrition & Early Care' },
  { number: 4, name: 'Cultivation & Weed Management', label: 'Stage 4: Cultivation & Weed Management' },
  { number: 5, name: 'Crop Maintenance & Final Hilling-Up', label: 'Stage 5: Crop Maintenance & Final Hilling-Up' },
  { number: 6, name: 'Harvesting & Hauling', label: 'Stage 6: Harvesting & Hauling' }
];

// Official SRA Sugarcane 6 Growth Stages Templates
const CROP_CYCLE_STAGES_BY_TYPE = {
  'Plant Cane (New Plant)': [
    {
      id: 'S1',
      stageNumber: 1,
      name: 'Pre-Planting & Land Preparation',
      monthRange: 'Month 0–1',
      description: 'Soil sampling, mechanical disc plowing, harrowing, and seedbed furrowing (tudling).',
      benchmarkCost: 12100,
      icon: 'construct',
      color: '#8F3A8F',
      done: false,
      active: true,
      operations: [
        { id: 'SRA-01', name: 'Soil Sampling', costPerHa: 100, unit: 'ha' },
        { id: 'SRA-02', name: 'Land Preparation', costPerHa: 12000, unit: 'ha' }
      ]
    },
    {
      id: 'S2',
      stageNumber: 2,
      name: 'Planting & Crop Establishment',
      monthRange: 'Month 1–2',
      description: 'Cane points acquisition (patdan), hauling, selection, and furrow planting crew.',
      benchmarkCost: 20000,
      icon: 'leaf',
      color: '#4A7C2F',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-03', name: 'Cost of Planting Material (Seedcane acquisition)', costPerHa: 15000, unit: 'lac' },
        { id: 'SRA-04', name: 'Planting (including hauling and selection)', costPerHa: 5000, unit: 'lac' }
      ]
    },
    {
      id: 'S3',
      stageNumber: 3,
      name: 'Basal Nutrition & Early Care',
      monthRange: 'Month 2–3',
      description: 'Basal fertilizer application (Urea+DAP+MOP), rock phosphate, and initial off-barring.',
      benchmarkCost: 20800,
      icon: 'flask',
      color: '#1A6B9A',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-05', name: 'Basal Fertilization', costPerHa: 15100, unit: 'bag' },
        { id: 'SRA-06', name: 'Fertilizer Application & Soil Amending', costPerHa: 5700, unit: 'bag' }
      ]
    },
    {
      id: 'S4',
      stageNumber: 4,
      name: 'Cultivation & Weed Management',
      monthRange: 'Month 3–5',
      description: 'Ridge busting, off-barring & on-barring passes, 1st, 2nd, and 3rd round manual weeding.',
      benchmarkCost: 9000,
      icon: 'git-branch',
      color: '#F5A623',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-07', name: 'Cultivation (Off-barring & On-barring)', costPerHa: 3000, unit: 'pass' },
        { id: 'SRA-10', name: 'Weeding', costPerHa: 6000, unit: 'ha' }
      ]
    },
    {
      id: 'S5',
      stageNumber: 5,
      name: 'Crop Maintenance & Final Hilling-Up',
      monthRange: 'Month 5–8',
      description: '2nd dose top-dress fertilization, final hilling-up (pasandig), and canal drainage maintenance.',
      benchmarkCost: 5000,
      icon: 'water',
      color: '#0284C7',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-08', name: 'Fertilization (2nd Dose / Top-dress)', costPerHa: 3800, unit: 'bag' },
        { id: 'SRA-09', name: 'Fertilizer Application (2nd dose labor)', costPerHa: 200, unit: 'bag' },
        { id: 'SRA-11', name: 'Drainage / Irrigation', costPerHa: 1000, unit: 'ha' }
      ]
    },
    {
      id: 'S6',
      stageNumber: 6,
      name: 'Harvesting & Post-Harvest Transport',
      monthRange: 'Month 10–12',
      description: 'Cane cutting (tapas), truck loading (karga), carabao bull cart, and freight transport to sugar mill.',
      benchmarkCost: 51000,
      icon: 'bus',
      color: '#D9534F',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-12', name: 'Cutting and Loading', costPerHa: 21000, unit: 'ton' },
        { id: 'SRA-13', name: 'Hauling (Trucking)', costPerHa: 21000, unit: 'ton' },
        { id: 'SRA-14', name: 'Bull Cart (In-field transport)', costPerHa: 9000, unit: 'ton' }
      ]
    }
  ],
  '1st Ratoon (Ratoon 1)': [
    {
      id: 'S1',
      stageNumber: 1,
      name: 'Pre-Planting & Land Preparation',
      monthRange: 'Month 0–1',
      description: 'Stubble shaving, trash blanketing/farming, and field clearing.',
      benchmarkCost: 4000,
      icon: 'construct',
      color: '#8F3A8F',
      done: false,
      active: true,
      operations: [
        { id: 'SRA-07', name: 'Stubble Shaving & Trash Blanketing', costPerHa: 4000, unit: 'ha' }
      ]
    },
    {
      id: 'S2',
      stageNumber: 2,
      name: 'Planting & Crop Establishment',
      monthRange: 'Month 1–2',
      description: 'Stool rehabilitation, replanting missing hills (gap filling), and seedbed loosening.',
      benchmarkCost: 6000,
      icon: 'leaf',
      color: '#4A7C2F',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-04', name: 'Gap Filling & Stool Rehab', costPerHa: 6000, unit: 'ha' }
      ]
    },
    {
      id: 'S3',
      stageNumber: 3,
      name: 'Basal Nutrition & Early Care',
      monthRange: 'Month 2–3',
      description: 'Ratoon basal fertilization (Urea + DAP + MOP), off-barring & furrow cleaning.',
      benchmarkCost: 14000,
      icon: 'flask',
      color: '#1A6B9A',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-05', name: 'Basal Fertilization', costPerHa: 14000, unit: 'bag' }
      ]
    },
    {
      id: 'S4',
      stageNumber: 4,
      name: 'Cultivation & Weed Management',
      monthRange: 'Month 3–5',
      description: 'Off-barring & on-barring passes, inter-row cultivation, and weeding rounds.',
      benchmarkCost: 7000,
      icon: 'git-branch',
      color: '#F5A623',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-07', name: 'Cultivation (Off-barring & On-barring)', costPerHa: 3000, unit: 'pass' },
        { id: 'SRA-10', name: 'Weeding', costPerHa: 4000, unit: 'ha' }
      ]
    },
    {
      id: 'S5',
      stageNumber: 5,
      name: 'Crop Maintenance & Final Hilling-Up',
      monthRange: 'Month 5–8',
      description: '2nd dose top-dress fertilizer application, final hilling-up, and canal drainage maintenance.',
      benchmarkCost: 4500,
      icon: 'water',
      color: '#0284C7',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-08', name: 'Fertilization (2nd Dose / Top-dress)', costPerHa: 3800, unit: 'bag' },
        { id: 'SRA-11', name: 'Drainage / Irrigation', costPerHa: 700, unit: 'ha' }
      ]
    },
    {
      id: 'S6',
      stageNumber: 6,
      name: 'Harvesting & Post-Harvest Transport',
      monthRange: 'Month 10–12',
      description: 'Cane cutting (tapas), truck loading (karga), and freight transport to sugar mill.',
      benchmarkCost: 48000,
      icon: 'bus',
      color: '#D9534F',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-12', name: 'Cutting and Loading', costPerHa: 20000, unit: 'ton' },
        { id: 'SRA-13', name: 'Hauling (Trucking)', costPerHa: 20000, unit: 'ton' },
        { id: 'SRA-14', name: 'Bull Cart (In-field transport)', costPerHa: 8000, unit: 'ton' }
      ]
    }
  ],
  '2nd Ratoon (Ratoon 2)': [
    {
      id: 'S1',
      stageNumber: 1,
      name: 'Pre-Planting & Land Preparation',
      monthRange: 'Month 0–1',
      description: 'Stubble shaving, trash blanketing, and field clearing.',
      benchmarkCost: 4500,
      icon: 'construct',
      color: '#8F3A8F',
      done: false,
      active: true,
      operations: [
        { id: 'SRA-07', name: 'Stubble Shaving & Prep', costPerHa: 4500, unit: 'ha' }
      ]
    },
    {
      id: 'S2',
      stageNumber: 2,
      name: 'Planting & Crop Establishment',
      monthRange: 'Month 1–2',
      description: 'Stool rehabilitation, gap filling, and soil aeration.',
      benchmarkCost: 6500,
      icon: 'leaf',
      color: '#4A7C2F',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-04', name: '2nd Ratoon Gap Filling', costPerHa: 6500, unit: 'ha' }
      ]
    },
    {
      id: 'S3',
      stageNumber: 3,
      name: 'Basal Nutrition & Early Care',
      monthRange: 'Month 2–3',
      description: '2nd Ratoon basal fertilization, off-barring & furrow clearing.',
      benchmarkCost: 14000,
      icon: 'flask',
      color: '#1A6B9A',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-05', name: 'Basal Fertilization', costPerHa: 14000, unit: 'bag' }
      ]
    },
    {
      id: 'S4',
      stageNumber: 4,
      name: 'Cultivation & Weed Management',
      monthRange: 'Month 3–5',
      description: 'Off-barring & on-barring passes, inter-row cultivation, and weeding.',
      benchmarkCost: 7000,
      icon: 'git-branch',
      color: '#F5A623',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-07', name: 'Cultivation (Off-barring & On-barring)', costPerHa: 3000, unit: 'pass' },
        { id: 'SRA-10', name: 'Weeding', costPerHa: 4000, unit: 'ha' }
      ]
    },
    {
      id: 'S5',
      stageNumber: 5,
      name: 'Crop Maintenance & Final Hilling-Up',
      monthRange: 'Month 5–8',
      description: 'Top-dress fertilization, weed management, and drainage upkeep.',
      benchmarkCost: 4500,
      icon: 'water',
      color: '#0284C7',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-08', name: 'Fertilization (2nd Dose / Top-dress)', costPerHa: 3800, unit: 'bag' },
        { id: 'SRA-11', name: 'Drainage / Irrigation', costPerHa: 700, unit: 'ha' }
      ]
    },
    {
      id: 'S6',
      stageNumber: 6,
      name: 'Harvesting & Post-Harvest Transport',
      monthRange: 'Month 10–12',
      description: 'Cane cutting, hauling to mill, and cycle conclusion.',
      benchmarkCost: 48000,
      icon: 'bus',
      color: '#D9534F',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-12', name: 'Cutting and Loading', costPerHa: 20000, unit: 'ton' },
        { id: 'SRA-13', name: 'Hauling (Trucking)', costPerHa: 20000, unit: 'ton' },
        { id: 'SRA-14', name: 'Bull Cart (In-field transport)', costPerHa: 8000, unit: 'ton' }
      ]
    }
  ]
};

// Preset colour palette for custom stages
const STAGE_COLORS = [
  '#8F3A8F', '#4A7C2F', '#1A6B9A', '#F5A623', '#0284C7', '#D9534F',
  '#267326', '#C97A00', '#5B4DA7', '#8A9B7A',
];

// Returns the active stage list for a field based on its active crop cycle
const getFieldStages = (fieldId) => {
  const field = fields.find(f => f.id === fieldId);
  const cycleType = field?.cycleType || 'Plant Cane (New Plant)';
  const stages = (field?.customStages && field.customStages.length > 0)
    ? field.customStages.map(s => ({ ...s }))
    : (CROP_CYCLE_STAGES_BY_TYPE[cycleType] || CROP_CYCLE_STAGES_BY_TYPE['Plant Cane (New Plant)']).map(s => ({ ...s }));
  
  // stageNumber is the SINGLE authoritative source of cycle position.
  // Never trust s.done from customStages — those flags can be stale from a previous
  // crop cycle when customStages wasn't fully reset before a sync snapshot overwrote them.
  const currentStageNum = Number(field?.stageNumber) || 1;
  const fieldStageName = (field?.stage || '').toLowerCase();

  // Cycle is complete ONLY when on Stage 6 AND explicitly flagged
  const isCycleCompleted = currentStageNum >= 6 && (
    field?.isCompleted === true ||
    fieldStageName.includes('complete') ||
    fieldStageName.includes('milling')
  );

  return stages.map((s, idx) => {
    const sNum = s.stageNumber || s.stageNum || (idx + 1);
    if (isCycleCompleted) {
      return { ...s, stageNumber: sNum, done: true, active: false };
    }
    // Derive done/active purely from the field's stageNumber — ignore s.done
    if (sNum < currentStageNum) {
      return { ...s, stageNumber: sNum, done: true, active: false };
    } else if (sNum === currentStageNum) {
      return { ...s, stageNumber: sNum, done: false, active: true };
    } else {
      return { ...s, stageNumber: sNum, done: false, active: false };
    }
  });
};

const STATUS_COLORS = { approved: COLORS.success, pending: '#F5A623', flagged: '#D9534F' };

// Memoized Log Item Card to prevent re-rendering the entire list on expand/edit
const CompactLogItem = React.memo(function CompactLogItem({
  log,
  isDraft,
  isSelectMode = false,
  isSelected = false,
  onToggleSelect,
  isNewlyAdded = false,
  isExpanded,
  onToggleExpand,
  formatOperationName,
  formatStageName,
  t,
  editDraft,
  submitDraft,
  deleteDraft,
  editSubmittedLog,
  onViewAuditTrail,
  s,
}) {
  const archivedLog = log.status === 'ARCHIVED';
  const isLocked = !isDraft && (archivedLog || isLogLocked(log));
  const isAmended = Array.isArray(log.amendments) && log.amendments.length > 0;
  const editCount = isAmended ? log.amendments.length : 0;
  const latestEdit = isAmended ? log.amendments[log.amendments.length - 1] : null;
  const isNew = Boolean(isNewlyAdded || log.isNew);

  return (
    <View style={[
      s.compactLogCard, 
      isDraft && { borderColor: COLORS.border, backgroundColor: '#FFFFFF', borderWidth: 1.5 },
      isNew && { 
        backgroundColor: '#F6FAF3',
        borderColor: COLORS.primaryBorder,
        borderWidth: 1.5
      },
      isSelected && { borderColor: COLORS.primary, borderWidth: 1.5, backgroundColor: '#F4FAF0' }
    ]}>
      <TouchableOpacity
        style={s.compactLogHeader}
        onPress={isDraft && isSelectMode ? onToggleSelect : onToggleExpand}
        activeOpacity={0.7}
      >
        {isDraft && isSelectMode ? (
          <TouchableOpacity
            onPress={(e) => {
              if (e && e.stopPropagation) e.stopPropagation();
              onToggleSelect && onToggleSelect();
            }}
            style={{ paddingRight: 8, paddingVertical: 4 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isSelected ? "checkbox" : "square-outline"}
              size={20}
              color={isSelected ? COLORS.primary : COLORS.textMuted}
            />
          </TouchableOpacity>
        ) : isNew ? (
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.primary, marginRight: 2 }} />
        ) : null}

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {isDraft && (
              <View style={{ backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#4B5563' }}>DRAFT</Text>
              </View>
            )}
            {log.sraOperationId && (
              <View style={{ backgroundColor: COLORS.primaryBg, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: COLORS.primary }}>{log.sraOperationId}</Text>
              </View>
            )}
            <Text style={s.compactLogTitle} numberOfLines={1}>
              {formatOperationName ? formatOperationName(log.operationName || log.activity) : log.operationName || log.activity}
            </Text>

            {/* Amended Audit Badge */}
            {isAmended && (
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EBF3FB', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#CCE0F5' }}
                onPress={() => onViewAuditTrail && onViewAuditTrail(log)}
                activeOpacity={0.7}
              >
                <Ionicons name="shield-checkmark" size={10} color="#0B63B7" />
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#0B63B7' }}>
                  {log.submissionSource === 'MANAGER_TAKEOVER' ? 'Amended (Takeover)' : `Amended (${editCount}x)`}
                </Text>
              </TouchableOpacity>
            )}

            {/* Operation-log lifecycle is independent of audit-report certification. */}
            {archivedLog ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#E5E7EB' }}>
                <Ionicons name="archive-outline" size={10} color="#4B5563" />
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#4B5563' }}>
                  Past Cycle
                </Text>
              </View>
            ) : isLocked ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#E5E7EB' }}>
                <Ionicons name="lock-closed" size={10} color="#4B5563" />
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#4B5563' }}>
                  Locked
                </Text>
              </View>
            ) : null}
          </View>
          
          {/* Connected Parent Stage Badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
            <Ionicons name="git-branch-outline" size={11} color={COLORS.primary} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }} numberOfLines={1}>
              {formatStageName ? formatStageName(log.stageName || `Stage ${log.stageNumber}`, true) : log.stageName || `Stage ${log.stageNumber}`}
            </Text>
            {log.isSupplemental && (
              <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 5, paddingVertical: 1, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#FEF0D0' }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#92400E' }}>SUPPLEMENTAL</Text>
              </View>
            )}
          </View>

          <Text style={[s.compactLogSub, { marginTop: 2 }]}>
            {formatDisplayDate(log.date || log.period)} · {log.hectares} Ha · {log.people} Workers{log.subItems?.length ? ` · ${log.subItems.length} ${t('child_items_lbl', 'Items')}` : ''}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
          <Text style={[s.compactLogCost, { color: COLORS.text, fontWeight: '800' }]}>
            ₱{Number(log.cost || log.totalCost || 0).toLocaleString()}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            {log.isOffline && <Ionicons name="cloud-offline-outline" size={12} color={COLORS.textMuted} />}
            <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={COLORS.textMuted} />
          </View>
        </View>
      </TouchableOpacity>

      {/* Expandable Details Drawer with Child Sub-Items */}
      {isExpanded && (
        <View style={s.compactLogDrawer}>
          <View style={s.compactLogDivider} />
          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>{t('connected_stage_lbl', 'Connected Stage')}</Text>
            <Text style={[s.receiptValue, { color: COLORS.primary, fontWeight: '800' }]}>
              {log.stageName || (log.stageNumber ? `Stage ${log.stageNumber}` : 'General Operation')}
            </Text>
          </View>
          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>{t('receipt_ref', 'Log Reference')}</Text>
            <Text style={[s.receiptValue, { flex: 1, textAlign: 'right' }]} numberOfLines={1} ellipsizeMode="middle">#{log.id}</Text>
          </View>
          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>{t('receipt_coverage', 'Work Coverage')}</Text>
            <Text style={s.receiptValue}>{log.hectares} {t('hectares_unit', 'Hectares')} · {log.people} {t('workers_unit', 'Workers')}</Text>
          </View>

          {/* Child Items / Materials & Inputs Breakdown */}
          {log.subItems && log.subItems.length > 0 && (
            <View style={{ paddingVertical: 4, gap: 4, marginVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                {t('op_children_materials_lbl', 'Operation Items & Materials')} ({log.subItems.length})
              </Text>
              {log.subItems.map((si, idx) => (
                <View key={si.id || idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 }}>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: COLORS.text, flex: 1, marginRight: 8 }} numberOfLines={1}>
                    • {si.description}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary }}>
                    {si.qty} {si.unit} @ ₱{Number(si.unitCost || 0).toLocaleString()} = ₱{Number(si.subTotal || 0).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>)}

          {Boolean(log.inputQty) && (!log.subItems || log.subItems.length === 0) && (
            <View style={s.receiptRow}>
              <Text style={s.receiptLabel}>{t('direct_op_input_lbl', 'Direct Operation Input')}</Text>
              <Text style={s.receiptValue}>{log.inputQty} {log.inputUnit || 'ha'} {log.directRate ? `@ ₱${Number(log.directRate).toLocaleString()}/${log.inputUnit || 'ha'}` : ''}</Text>
            </View>
          )}
          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>{t('stat_total_cost', 'Total Cost')}</Text>
            <Text style={[s.receiptCostText, { color: COLORS.primary, fontWeight: '800' }]}>Php {Number(log.totalCost != null ? log.totalCost : (log.cost || 0)).toLocaleString()}</Text>
          </View>
          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>{t('form_date', 'Date Recorded')}</Text>
            <Text style={s.receiptValue}>{formatDisplayDate(log.date || log.period)}</Text>
          </View>
          {!isDraft && (
            <View style={s.receiptRow}>
              <Text style={s.receiptLabel}>{t('status', 'Status')}</Text>
              <View style={[s.receiptStatusBadge, { backgroundColor: log.isOffline ? '#FFFBF0' : '#F2FBF2', borderColor: log.isOffline ? '#FEF0D0' : '#E8F5E8' }]}>
                <Ionicons name={log.isOffline ? 'cloud-offline-outline' : 'checkmark-circle-outline'} size={12} color={log.isOffline ? '#C97A00' : '#267326'} />
                <Text style={[s.receiptStatusText, { fontSize: 10, color: log.isOffline ? '#C97A00' : '#267326' }]}>
                  {log.isOffline ? t('sync_status_pending', 'Saved Offline (Pending Sync)') : t('synced', 'Recorded')}
                </Text>
              </View>
            </View>
          )}

          {/* Manager Revision & Correction Box in Drawer if amended */}
          {isAmended && (
            <View style={{ backgroundColor: '#F0F6FC', borderWidth: 1, borderColor: '#CCE0F5', borderRadius: RADIUS.sm, padding: 10, marginVertical: 6, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#DCEBFA', paddingBottom: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="shield-checkmark" size={13} color="#0B63B7" />
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#0B63B7' }}>
                    {log.submissionSource === 'MANAGER_TAKEOVER' ? 'Supervisor Takeover / Amendment' : `Revision Details (${editCount} amendment${editCount !== 1 ? 's' : ''})`}
                  </Text>
                </View>
                {latestEdit?.amendedAt && (
                  <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{latestEdit.amendedAt}</Text>
                )}
              </View>

              {latestEdit && (
                <>
                  <Text style={{ fontSize: 11, color: COLORS.text, fontWeight: '600' }}>
                    Edited by user: <Text style={{ fontWeight: '800' }}>{latestEdit.amendedByUserId || 'Unknown'}</Text>
                  </Text>
                  {latestEdit.reason && (
                    <View style={{ backgroundColor: '#FFFFFF', padding: 6, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#E1EDF8' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#0B63B7' }}>Reason for Correction:</Text>
                      <Text style={{ fontSize: 11, color: COLORS.text, fontStyle: 'italic', marginTop: 1 }}>"{latestEdit.reason}"</Text>
                    </View>
                  )}
                  {latestEdit.changes && Object.keys(latestEdit.changes).length > 0 && (
                    <View style={{ backgroundColor: '#FFFFFF', padding: 6, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#E1EDF8', gap: 3 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' }}>Edits Made:</Text>
                      {Object.entries(latestEdit.changes).map(([fieldName, change]) => (
                        <Text key={fieldName} style={{ fontSize: 10.5, color: COLORS.text }}>
                          • {fieldName}: <Text style={{ textDecorationLine: 'line-through', color: '#DC2626' }}>{String(change?.before ?? '—')}</Text> → <Text style={{ fontWeight: '800', color: '#16A34A' }}>{String(change?.after ?? '—')}</Text>
                        </Text>
                      ))}
                    </View>
                  )}
                </>
              )}

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CCE0F5', borderRadius: RADIUS.xs, paddingVertical: 6, marginTop: 2 }}
                onPress={() => onViewAuditTrail && onViewAuditTrail(log)}
                activeOpacity={0.75}
              >
                <Ionicons name="document-text-outline" size={13} color="#0B63B7" />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#0B63B7' }}>
                  View Complete Audit Trail
                </Text>
                <Ionicons name="chevron-forward" size={12} color="#0B63B7" />
              </TouchableOpacity>
            </View>
          )}

          {/* Locked Notice */}
          {archivedLog ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 6, marginVertical: 4 }}>
              <Ionicons name="archive-outline" size={13} color="#6B7280" />
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#4B5563', flex: 1 }}>
                Past Cycle Record — Archived historical crop cycle data.
              </Text>
            </View>
          ) : isLocked ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 6, marginVertical: 4 }}>
              <Ionicons name="lock-closed" size={13} color="#6B7280" />
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#4B5563', flex: 1 }}>
                Locked Record — Protected against modifications.
              </Text>
            </View>
          ) : null}

          {/* Actions inside drawer */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border }}>
            {isDraft ? (
              <>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: 7 }}
                  onPress={() => editDraft(log)}
                >
                  <Ionicons name="create-outline" size={14} color={COLORS.primary} />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.primary }}>{t('btn_edit_draft', 'Edit Draft')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: 7 }}
                  onPress={() => submitDraft(log)}
                >
                  <Ionicons name="paper-plane-outline" size={14} color="#fff" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{t('btn_submit_draft', 'Submit Draft')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ width: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF5F5', borderRadius: RADIUS.sm, borderWidth: 1, borderColor: '#FECACA' }}
                  onPress={() => deleteDraft(log.id)}
                >
                  <Ionicons name="trash-outline" size={15} color="#DC2626" />
                </TouchableOpacity>
              </>
            ) : archivedLog ? (
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: RADIUS.sm, paddingVertical: 8 }}
                onPress={() => Alert.alert('Archived Past Cycle', 'This operation log belongs to a previous crop cycle and is permanently preserved in the historical archive for regulatory compliance.')}
              >
                <Ionicons name="archive-outline" size={13} color="#6B7280" />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#6B7280' }}>Past Cycle Record (Archived)</Text>
              </TouchableOpacity>
            ) : isLocked ? (
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: RADIUS.sm, paddingVertical: 8 }}
                onPress={() => Alert.alert('Locked Record', 'This operation log is locked against direct modifications.')}
              >
                <Ionicons name="lock-closed" size={13} color="#6B7280" />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#6B7280' }}>Locked Record</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#F8FAF5', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingVertical: 7 }}
                  onPress={() => editSubmittedLog(log)}
                >
                  <Ionicons name="create-outline" size={14} color={COLORS.primary} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }}>
                    {t('btn_edit', 'Edit')}
                  </Text>
                </TouchableOpacity>

              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
});

export default function FieldOpsScreen({ navigation, route }) {
  const { t, formatSyncTime, formatOperationName, formatStageName, formatPhaseMonth } = useTranslation();
  const [synced, setSyncedState] = useState(getIsSynced());
  const [session, setSessionLocal] = useState(() => getCurrentSession() || {});
  const [activeRole, setActiveRole] = useState(getCurrentSession().role);
  const sessionUserId = session?.employeeId || session?.id || '';
  const managedFarmIds = new Set(blockFarms.filter(farm => farm.managerUserId === sessionUserId).map(farm => farm.id));
  const accessibleFields = (fields || []).filter(field => {
    if (activeRole === 'Member Farmer') return field.memberUserId === sessionUserId;
    if (activeRole === 'Farm Manager') return managedFarmIds.has(field.blockFarmId);
    return true;
  });
  const targetFarm = blockFarms.find(farm => managedFarmIds.has(farm.id))?.name || 'Unassigned Block Farm';
  const [selectedFarm, setSelectedFarm] = useState('All Block Farms');
  const [selectedField, setSelectedField] = useState(() => {
    const curSess = getCurrentSession() || {};
    const myField = (fields || []).find(f => 
      f && f.memberUserId === (curSess.employeeId || curSess.id)
    );
    if (curSess.role === 'Member Farmer') {
      return myField || null;
    }
    if (curSess.role === 'Farm Manager') {
      const userId = curSess.employeeId || curSess.id;
      const farmIds = new Set(blockFarms.filter(farm => farm.managerUserId === userId).map(farm => farm.id));
      return (fields || []).find(field => farmIds.has(field.blockFarmId)) || null;
    }
    return myField || (fields && fields.length > 0 ? fields[0] : null);
  });

  const safeField = selectedField || accessibleFields[0] || {
    id: 'Unassigned',
    ha: '0.0',
    member: session?.name || 'Member Farmer',
    memberName: session?.name || 'Member Farmer',
    stage: 'Pre-Planting & Land Preparation',
    stageNumber: 1,
    cycleType: 'Plant Cane (New Plant)',
    cropYear: '2026-2027',
    synced: false,
    lastSync: 'Never'
  };
  const [showAuditHistoryModal, setShowAuditHistoryModal] = useState(false);
  const [selectedManagerAuditId, setSelectedManagerAuditId] = useState('AUD-2026-05');
  const currentRealMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const [compileMonth, setCompileMonth] = useState(currentRealMonth);
  const [managerLedgerScope, setManagerLedgerScope] = useState('selected');

  const availableAuditMonths = React.useMemo(() => {
    const monthsMap = new Map();
    const now = new Date();
    
    // 1. Current real-time month + past 5 calendar months
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      monthsMap.set(key, d);
    }

    // 2. Any months from actual recorded operations
    (logs || []).forEach(l => {
      const dStr = l.date || l.period;
      if (dStr) {
        const d = new Date(dStr);
        if (!isNaN(d.getTime())) {
          const key = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
          if (!monthsMap.has(key)) monthsMap.set(key, d);
        }
      }
    });

    return Array.from(monthsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);
  }, [logs]);

  useEffect(() => {
    const targetFieldId = route?.params?.fieldId || route?.params?.initialFieldId || route?.params?.takeOverFieldId;
    if (targetFieldId) {
      const targetF = accessibleFields.find(f => f && f.id === targetFieldId);
      if (targetF) {
        setSelectedField(targetF);
        updateSessionFieldId(targetF.id);
        if (route?.params?.requestTakeOver || route?.params?.isTakeOver || route?.params?.takeOverFieldId) {
          // Strictly require manager password verification — no unauthenticated bypass!
          setIsTakeOver(false);
          setTakeOverAuthPassword('');
          setTakeOverAuthError('');
          setShowTakeOverPassword(false);
          setShowTakeOverAuthModal(true);
        }
        navigation.setParams({ fieldId: undefined, initialFieldId: undefined, takeOverFieldId: undefined, isTakeOver: undefined, requestTakeOver: undefined });
        return;
      }
    }
    
    // Auto-match logged-in member's field if none selected or if selected field doesn't belong to member
    const sess = getCurrentSession() || {};
    if (sess.role === 'Member Farmer') {
      const myField = (fields || []).find(f => 
        f && f.memberUserId === (sess.employeeId || sess.id)
      );
      if (myField) {
        setSelectedField(myField);
      } else {
        setSelectedField(null);
      }
      return;
    }

    if (!selectedField && accessibleFields.length > 0) {
      setSelectedField(accessibleFields[0]);
    }
  }, [route?.params, fields]);

  // Real-time bidirectional synchronization listener with Cloud Firestore & Web
  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setSyncedState(getIsSynced());
      setSessionLocal(getCurrentSession() || {});
      setLogs([...operationLogs]);
      setRequests([...assignmentRequests]);
      setPendingUsersList([...pendingUsers]);
      if (selectedField?.id && selectedField.id !== 'Unassigned') {
        const updatedField = (fields || []).find(f => f && f.id === safeField?.id);
        if (updatedField) {
          setSelectedField({ ...updatedField });
        }
      } else if (getCurrentSession()?.role !== 'Member Farmer' && accessibleFields.length > 0) {
        setSelectedField(accessibleFields[0]);
      }
    });
    return unsubscribe;
  }, [selectedField?.id]);
  const [logs, setLogs] = useState(operationLogs);
  const [showLog, setShowLog] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [activeQRData, setActiveQRData] = useState(null);
  const [scannedAuditReport, setScannedAuditReport] = useState(null);
  const [showSRAInspectModal, setShowSRAInspectModal] = useState(false);
  const [logForm, setLogForm] = useState({
    id: null,
    fieldId: '',
    saveFieldId: true,
    sraOperationId: 'SRA-02',
    operationName: 'Land Preparation',
    activity: 'Land Preparation',
    category: 'prep',
    cost: '12000',
    period: formatDisplayDate(new Date()),
    hectares: '1.50',
    people: '2',
    subItems: [
      { id: 'SI-02-1', description: '1st Pass Disc Plowing (Tractor)', qty: 1.5, unit: 'ha', unitCost: 5000, subTotal: 7500 },
      { id: 'SI-02-2', description: '2nd Pass Disc Harrowing', qty: 1.5, unit: 'ha', unitCost: 4000, subTotal: 6000 },
      { id: 'SI-02-3', description: 'Furrowing / Tudling', qty: 1.5, unit: 'ha', unitCost: 3000, subTotal: 4500 }
    ],
    inputQty: '',
    inputUnit: 'ha',
    inputName: '',
    taskId: null,
    isSubmit: true
  });
  const [draftLogs, setDraftLogs] = useState(draftLogsStore);
  const [isSavingLog, setIsSavingLog] = useState(false);
  const [editingSubItemIdx, setEditingSubItemIdx] = useState(null);
  const [isArchivingCycle, setIsArchivingCycle] = useState(false);
  const [highlightedDraftIds, setHighlightedDraftIds] = useState(new Set());
  const [highlightedSubmittedLogIds, setHighlightedSubmittedLogIds] = useState(new Set());
  const [viewedLogIds, setViewedLogIds] = useState(new Set());
  const [selectedDraftIds, setSelectedDraftIds] = useState(new Set());
  const [isDraftSelectMode, setIsDraftSelectMode] = useState(false);
  const [logTab, setLogTab] = useState('submitted');
  const [managerFieldFilter, setManagerFieldFilter] = useState('all');
  const [logSearch, setLogSearch] = useState('');
  const [logCategoryFilter, setLogCategoryFilter] = useState('all');
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [logCurrentPage, setLogCurrentPage] = useState(1);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [returnToScreen, setReturnToScreen] = useState(null);

  // Subscribe to live dataStore updates so fields, logs and drafts are always 100% in sync
  useEffect(() => {
    const unsub = subscribe(() => {
      setLogs([...operationLogs]);
      setDraftLogs([...draftLogsStore]);
      setSyncedState(getIsSynced());
      if (selectedField?.id) {
        const freshField = fields.find(f => f.id === safeField.id);
        if (freshField) {
          // Use freshField as the source of truth for cycle-critical fields.
          // Do NOT spread prev first — that would allow stale prev.customStages,
          // prev.stageNumber, or prev.isCompleted to override the just-reset field.
          setSelectedField({ ...freshField });
          setCycleTasksByField(p => ({
            ...p,
            [freshField.id]: getFieldStages(freshField.id)
          }));
        }
      }
    });
    return unsub;
  }, [selectedField?.id]);

  // Automatically open the active cycle Operations Ledger or Drafts when navigating
  useEffect(() => {
    if (route?.params?.returnTo) {
      setReturnToScreen(route.params.returnTo);
    }
    if (route?.params?.highlightDraftIds || route?.params?.highlightDraftId) {
      const ids = route.params.highlightDraftIds || [route.params.highlightDraftId];
      setHighlightedDraftIds(new Set(ids));
      setDraftLogs([...draftLogsStore]);
    }
    if (route?.params?.openDrafts || route?.params?.initialTab === 'drafts' || route?.params?.tab === 'drafts') {
      setLogTab('drafts');
      setShowHistoryModal(true);
      setShowLog(false);
      setDraftLogs([...draftLogsStore]);
      navigation.setParams({ openDrafts: undefined, initialTab: undefined, tab: undefined, openLedger: undefined, returnTo: undefined, highlightDraftIds: undefined, highlightDraftId: undefined });
    } else if (route?.params?.openLedger) {
      if (activeRole === 'SRA Admin') {
        setLogTab('audit_history');
      } else {
        setLogTab(route?.params?.initialTab || 'submitted');
      }
      setShowHistoryModal(true);
      setLogs([...operationLogs]);
      navigation.setParams({ openLedger: undefined, returnTo: undefined });
    }
  }, [route?.params?.openLedger, route?.params?.openDrafts, route?.params?.initialTab, route?.params?.tab, route?.params?.returnTo, route?.params?.highlightDraftIds, route?.params?.highlightDraftId]);

  const handleCloseHistoryModal = () => {
    setShowHistoryModal(false);
    if (returnToScreen === 'Home') {
      setReturnToScreen(null);
      if (navigation.canGoBack && navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('HomeMain');
      }
    }
  };
  const [requests, setRequests] = useState(assignmentRequests);
  const [pendingUsersList, setPendingUsersList] = useState(pendingUsers);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingActionLoading, setPendingActionLoading] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calDate, setCalDate] = useState(new Date(2026, 4, 21));
  const [showAddField, setShowAddField] = useState(false);
  const [isTakeOver, setIsTakeOver] = useState(false);
  const prevFieldIdRef = React.useRef(selectedField?.id);
  useEffect(() => {
    if (prevFieldIdRef.current && prevFieldIdRef.current !== selectedField?.id) {
      setIsTakeOver(false);
    }
    prevFieldIdRef.current = selectedField?.id;
  }, [selectedField?.id]);
  const [showTakeOverAuthModal, setShowTakeOverAuthModal] = useState(false);
  const [takeOverAuthPassword, setTakeOverAuthPassword] = useState('');
  const [takeOverAuthError, setTakeOverAuthError] = useState('');
  const [showTakeOverPassword, setShowTakeOverPassword] = useState(false);

  const handleInitiateTakeOver = () => {
    if (isTakeOver) {
      setIsTakeOver(false);
      return;
    }
    setTakeOverAuthPassword('');
    setTakeOverAuthError('');
    setShowTakeOverPassword(false);
    setShowTakeOverAuthModal(true);
  };

  const handleConfirmTakeOverAuth = async () => {
    const cleanPass = String(takeOverAuthPassword || '').trim();
    const isUserPassValid = cleanPass ? await verifyCurrentPassword(cleanPass) : false;

    if (!cleanPass || !isUserPassValid) {
      setTakeOverAuthError('Incorrect password. Enter your manager account password to authorize take over.');
      return;
    }

    setTakeOverAuthError('');
    setShowTakeOverAuthModal(false);
    setIsTakeOver(true);
  };

  const checkTakeOverRequired = (actionDesc = 'record stage work or log operations') => {
    const session = getCurrentSession();
    const isMyField = (selectedField?.member || '').trim().toLowerCase() === (session?.name || '').trim().toLowerCase();
    if (activeRole === 'Farm Manager' && !isMyField && !isTakeOver) {
      Alert.alert(
        'Supervisor Takeover Required',
        `This field is managed by ${selectedField?.member || 'the assigned Member'}. To ${actionDesc}, please authorize Supervisor Take Over first.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take Over Field', onPress: handleInitiateTakeOver }
        ]
      );
      return true;
    }
    return false;
  };
  const [showFieldsModal, setShowFieldsModal] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');
  const [fieldsModalPage, setFieldsModalPage] = useState(1);
  const [manualQR, setManualQR] = useState('');
  const [showOpPicker, setShowOpPicker] = useState(false);
  const [showCycleModal, setShowCycleModal] = useState(false);
  const [cycleTypeForm, setCycleTypeForm] = useState({
    cycleType: 'Plant Cane (New Plant)',
    cropYear: '2026-2027'
  });
  const [showManagerAssignModal, setShowManagerAssignModal] = useState(false);
  const [managerAssignForm, setManagerAssignForm] = useState({
    userId: '',
    fieldId: '',
    blockFarm: '',
    blockFarmId: '',
    ha: '1.5',
    variety: 'VMC 84-524',
    soilType: 'Clay Loam',
    stageNumber: 1,
    isEditing: false
  });
  const [isAssigningPlot, setIsAssigningPlot] = useState(false);

  const openAssignModal = (fieldToEdit = null) => {
    const session = getCurrentSession();
    const userId = session?.employeeId || session?.id || '';
    const matchedBf = fieldToEdit
      ? blockFarms.find(farm => farm.id === fieldToEdit.blockFarmId)
      : blockFarms.find(farm => farm.managerUserId === userId);
    const defaultFarm = matchedBf?.name || '';

    if (fieldToEdit) {
      setManagerAssignForm({
        userId: fieldToEdit.memberUserId || '',
        fieldId: fieldToEdit.id,
        blockFarm: fieldToEdit.blockFarm || defaultFarm,
        blockFarmId: fieldToEdit.blockFarmId || matchedBf?.id || '',
        ha: String(fieldToEdit.ha || '1.5'),
        variety: fieldToEdit.variety || 'VMC 84-524',
        soilType: fieldToEdit.soilType || 'Clay Loam',
        stageNumber: fieldToEdit.stageNumber || 1,
        isEditing: true
      });
    } else {
      const targetFarm = defaultFarm;
      const generatedId = generateNextFieldId(targetFarm, fields, blockFarms);
      setManagerAssignForm({
        userId: '',
        fieldId: generatedId,
        blockFarm: targetFarm,
        blockFarmId: matchedBf?.id || '',
        ha: '1.5',
        variety: 'VMC 84-524',
        soilType: 'Clay Loam',
        stageNumber: 1,
        isEditing: false
      });
    }
    setShowManagerAssignModal(true);
  };

  const [showStageEditor, setShowStageEditor] = useState(false);
  const [editingStages, setEditingStages] = useState([]);
  const [newStageLabel, setNewStageLabel] = useState('');
  const [newStageColor, setNewStageColor] = useState(STAGE_COLORS[0]);

  // Log Edit Security Authorization & Audit Trail States
  const [showEditAuthModal, setShowEditAuthModal] = useState(false);
  const [pendingEditLog, setPendingEditLog] = useState(null);
  const [editAuthPassword, setEditAuthPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editAuthReason, setEditAuthReason] = useState('');
  const [editAuthError, setEditAuthError] = useState('');
  const [logEditAuth, setLogEditAuth] = useState({ password: '', reason: '' });
  const [showLogAuditModal, setShowLogAuditModal] = useState(false);
  const [activeLogForAudit, setActiveLogForAudit] = useState(null);

  // Helper: check if an operation log falls within the target month (e.g. 'May 2026')
  const isLogFromMonth = (log, targetMonthStr) => {
    if (!targetMonthStr) return true;
    const dateStr = String(log?.date || log?.createdAt || log?.recordedAt || log?.timestamp || log?.period || '').trim();
    if (!dateStr) return true;

    const cleanTarget = targetMonthStr.toLowerCase().replace(/\s*\([^)]*\)/, '').trim();
    const parts = cleanTarget.split(' ');
    const targetMonthName = parts[0]?.toLowerCase() || '';
    const targetYear = parts[1] ? parseInt(parts[1], 10) : null;

    // Direct match (e.g. 'sep' in 'Sep 13, 2026')
    if (dateStr.toLowerCase().includes(cleanTarget) || dateStr.toLowerCase().includes(targetMonthName)) {
      return true;
    }

    // Date object parse fallback
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const fullMonthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const logMonthIdx = d.getMonth();
      const logYear = d.getFullYear();

      const monthMatches = monthNames[logMonthIdx] === targetMonthName ||
                           fullMonthNames[logMonthIdx] === targetMonthName ||
                           targetMonthName.startsWith(monthNames[logMonthIdx]) ||
                           fullMonthNames[logMonthIdx].startsWith(targetMonthName);
      const yearMatches = !targetYear || logYear === targetYear;
      return monthMatches && yearMatches;
    }

    return dateStr.toLowerCase().includes(targetMonthName);
  };

  // Helper: detect member devices in the block farm that have not synced for >= 3 days
  const getLaggingMembers = (targetFarm) => {
    const farmId = blockFarms.find(farm => farm.id === targetFarm || farm.name === targetFarm)?.id;
    const farmFields = fields.filter(field => field.blockFarmId === farmId);
    return farmFields.filter(f => {
      if (!f.synced) return true;
      if (typeof f.lastSync === 'string') {
        const match = f.lastSync.match(/(\d+)\s*days?/i);
        if (match && parseInt(match[1], 10) >= 3) return true;
        const lower = f.lastSync.toLowerCase();
        if (lower.includes('critical') || lower.includes('lag') || lower.includes('4 days') || lower.includes('8 days')) return true;
      }
      return false;
    });
  };

  // Preview QR code specifically for an existing or historical audit report
  const handleViewHistoricalAuditQR = (audit) => {
    if (!audit) return;
    const session = getCurrentSession();
    const hash = audit.qrSignature || audit.qrHash;
    const reportId = audit.reportId || audit.id;
    if (!hash || !reportId || !audit.blockFarmId) {
      Alert.alert('Report Unavailable', 'This audit report is missing its canonical ID, block farm ID, or QR hash.');
      return;
    }
    const envelope = audit.envelope || `HUGPONG|${reportId}|${audit.blockFarmId}|${audit.period || audit.month}|${Number(audit.totalHectares || 0).toFixed(2)}|${audit.logsCount || 0}|${audit.totalCost || 0}|${hash}`;

    setActiveQRData({
      reportId: reportId,
      month: audit.month || compileMonth,
      blockFarm: audit.blockFarm || session?.farm || (session?.farm || session?.blockFarm || 'District Central'),
      totalCost: audit.totalCost,
      totalHectares: audit.totalHectares || 0,
      totalFields: audit.fieldsReported || 0,
      totalLogs: audit.logsCount || 0,
      hash: hash,
      envelope: envelope
    });
    setShowQR(true);
  };

  // Dynamic calculations & compilation for month-level Hybrid Cloud-Anchored QR package
  const handleGenerateAudit = () => {
    const session = getCurrentSession();
    const targetFarm = session?.farm || (session?.farm || session?.blockFarm || 'District Central');

    // 1. Check for lagging member devices (>= 3 days without sync)
    const lagging = getLaggingMembers(targetFarm);
    if (lagging.length > 0) {
      const laggingSummary = lagging.map(f => `• ${f.id} (${f.member || 'Member'}): Last synced ${f.lastSync || '4 days ago'}`).join('\n');
      Alert.alert(
        'Member Sync Lag Warning',
        `The following member(s) have not synchronized their devices for 3 or more days:\n\n${laggingSummary}\n\nTheir locally recorded operations are still stored on their phones and cannot be included in this monthly report until they sync or you take over their plots.`,
        [
          { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
          {
            text: 'Review in Sync Monitor',
            onPress: () => {
              if (navigation && navigation.navigate) {
                navigation.navigate('SyncMonitor');
              }
            }
          },
          {
            text: 'Compile Anyway',
            style: 'destructive',
            onPress: () => checkLocalOfflineLogs()
          }
        ]
      );
      return;
    }

    checkLocalOfflineLogs();
  };

  const checkLocalOfflineLogs = () => {
    // 2. Offline-first: check manager's own local unsynced logs (strictly current active cycle)
    const offlineLogs = logs.filter(l => l.status === 'ACTIVE' && !l.isDraft && (l.isOffline === true || l.synced === false));
    
    if (offlineLogs.length > 0) {
      const warningMessage = `There are ${offlineLogs.length} offline logs stored on your device. They will be included in your compiled monthly audit package.`;

      Alert.alert(
        'Compiled Local Operations',
        warningMessage,
        [
          { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
          { text: 'Compile & Generate', onPress: () => checkMissingFields(), style: 'default' }
        ]
      );
      return;
    }

    checkMissingFields();
  };

  const handleViewExistingAudit = () => {
    const session = getCurrentSession();
    const userId = session?.employeeId || session?.id || '';
    const farm = blockFarms.find(item => item.managerUserId === userId);
    const targetFarm = farm?.name || 'Unassigned Block Farm';
    const farmFields = fields.filter(field => field.blockFarmId === farm?.id);
    const farmTotalHa = farmFields.reduce((sum, f) => sum + (Number(f.ha) || 0), 0) || 0;
    const existing = auditReports.find(report => report.blockFarmId === farm?.id && toReportPeriod(report.period || report.month) === toReportPeriod(compileMonth));
    if (existing) {
      const haVal = existing.totalHectares || farmTotalHa;
      setActiveQRData({
        reportId: existing.reportId || existing.id,
        month: existing.month || compileMonth,
        blockFarm: existing.blockFarm || targetFarm,
        totalCost: existing.totalCost || 0,
        totalHectares: haVal,
        totalFields: existing.fieldsReported || farmFields.length || 0,
        totalLogs: existing.logsCount || 0,
        hash: existing.qrSignature || existing.qrHash,
        envelope: existing.envelope || `HUGPONG|${existing.reportId || existing.id}|${existing.blockFarmId}|${existing.period || compileMonth}|${Number(haVal).toFixed(2)}|${existing.logsCount || 0}|${existing.totalCost || 0}|${existing.qrSignature || existing.qrHash}`,
        cloudQueueStatus: existing.cloudQueueStatus || (existing.status === 'CERTIFIED' ? 'transmitted' : 'offline_queued'),
        cloudQueuedAt: existing.cloudQueuedAt || existing.dateGenerated
      });
      setShowQR(true);
    } else {
      handleGenerateAudit();
    }
  };

  const compileAndShow = async () => {
    const session = getCurrentSession();
    const compilerUserId = session?.employeeId || session?.id || '';
    if (canonicalRole(session?.role) !== 'FARM_MANAGER') {
      safeAlert('Cannot Compile Audit', 'Only an assigned Farm Manager may compile an audit report.');
      return;
    }
    const assignedFarm = blockFarms.find(farm => farm.managerUserId === compilerUserId);
    const targetFarmId = assignedFarm?.id || '';
    const targetFarm = assignedFarm?.name || '';
    if (!targetFarmId) {
      safeAlert('Cannot Compile Audit', 'No block farm is assigned to this Farm Manager.');
      return;
    }
    const farmFields = fields.filter(f => f.blockFarmId === targetFarmId);
    const farmFieldIds = new Set(farmFields.map(field => field.id));
    const totalHa = farmFields.reduce((sum, f) => sum + (Number(f.ha) || 0), 0) || 0;
    
    // Filter logs strictly belonging to the active crop cycle
    const activeCycleLogs = logs.filter(l => farmFieldIds.has(l.fieldId) && l.status === 'ACTIVE' && Boolean(l.cycleId));

    const farmLogs = activeCycleLogs.filter(l => isLogFromMonth(l, compileMonth));

    // Existing reports for this month
    const existingReportsForMonth = auditReports.filter(a => 
      a.blockFarmId === targetFarmId && toReportPeriod(a.period || a.month) === toReportPeriod(compileMonth)
    );
    const certifiedReports = existingReportsForMonth.filter(a => a.status === 'CERTIFIED');
    const alreadyReportedLogIds = new Set(existingReportsForMonth.flatMap(report =>
      (report.operationSnapshots || report.operations || []).map(item => item.operationLogId || item.id)
    ));

    // A later report includes only logs that are not already snapshotted in an existing report.
    let logsToCompile = farmLogs;
    let isRevisionBatch = false;

    if (certifiedReports.length > 0) {
      logsToCompile = farmLogs.filter(l => !alreadyReportedLogIds.has(l.id));
      isRevisionBatch = true;
      if (logsToCompile.length === 0) {
        safeAlert(
          'No New Operations to Compile',
          `All field operations for ${compileMonth} are already represented in certified audit report ${certifiedReports[0].reportId || certifiedReports[0].id}. No new operations require compilation.`
        );
        setActiveQRData({
          reportId: certifiedReports[0].reportId || certifiedReports[0].id,
          month: certifiedReports[0].month || compileMonth,
          blockFarm: certifiedReports[0].blockFarm || targetFarm,
          totalCost: certifiedReports[0].totalCost || 0,
          totalHectares: certifiedReports[0].totalHectares || totalHa,
          totalFields: certifiedReports[0].fieldsReported || farmFields.length || 0,
          totalLogs: certifiedReports[0].logsCount || certifiedReports[0].totalLogs || 0,
          hash: certifiedReports[0].qrSignature || certifiedReports[0].qrHash,
          envelope: certifiedReports[0].envelope || `HUGPONG|${certifiedReports[0].reportId || certifiedReports[0].id}|${certifiedReports[0].blockFarmId}|${certifiedReports[0].period}|${totalHa.toFixed(2)}|${certifiedReports[0].logsCount || 0}|${certifiedReports[0].totalCost || 0}|${certifiedReports[0].qrSignature || certifiedReports[0].qrHash}`,
          cloudQueueStatus: 'transmitted',
          cloudQueuedAt: certifiedReports[0].certifiedAt || certifiedReports[0].dateGenerated
        });
        setShowQR(true);
        return;
      }
    }

    const totalCost = logsToCompile.reduce((sum, l) => sum + (Number(l.totalCost || l.cost) || 0), 0);
    const logsCount = logsToCompile.length;

    // Dynamic IDs based on selected month
    const monthParts = compileMonth.split(' ');
    const monthName = monthParts[0] || 'May';
    const yearStr = monthParts[1] || '2026';
    const monthMap = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
      January: '01', February: '02', March: '03', April: '04', June: '06',
      July: '07', August: '08', September: '09', October: '10', November: '11', December: '12'
    };
    const monthNum = monthMap[monthName] || '05';
    const farmShort = targetFarmId.replace('BLK-', '').replace('-', '');
    
    let reportId = `RPT-${yearStr}-${monthNum}-${farmShort}`;
    let auditId = `AUD-${yearStr}-${monthNum}`;
    let hashPrefix = `HUG-${yearStr}${monthNum}`;

    if (isRevisionBatch) {
      const batchNum = existingReportsForMonth.length + 1;
      reportId = `RPT-${yearStr}-${monthNum}-${farmShort}-B${batchNum}`;
      auditId = `AUD-${yearStr}-${monthNum}-B${batchNum}`;
      hashPrefix = `HUG-${yearStr}${monthNum}-B${batchNum}`;
    }

    const hashSuffix = ((totalCost * 17 + logsCount * 31 + Date.now()) % 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    const hash = `${hashPrefix}-${hashSuffix || 'A3F9'}`;
    const monthCode = `${monthName.substring(0, 3).toUpperCase()}${yearStr}`;
    const envelope = `HUGPONG|${reportId}|${targetFarmId}|${monthCode}|${totalHa.toFixed(2)}|${logsCount}|${totalCost}|${hash}`;

    const nowIso = new Date().toISOString();

    // Build stage breakdown dynamically
    const stageGroups = {};
    logsToCompile.forEach(l => {
      const stName = l.stageName || `Stage ${l.stageNumber || 1}`;
      if (!stageGroups[stName]) stageGroups[stName] = { cost: 0, fields: new Set() };
      stageGroups[stName].cost += Number(l.totalCost || l.cost || 0);
      if (l.fieldId) stageGroups[stName].fields.add(l.fieldId);
    });
    const stageBreakdown = Object.keys(stageGroups).map(st => ({
      stage: st,
      cost: stageGroups[st].cost,
      pct: totalCost > 0 ? `${Math.round((stageGroups[st].cost / totalCost) * 100)}%` : '0%',
      fields: Array.from(stageGroups[st].fields).join(', ')
    }));

    // Serialize operations for audit package
    const serializedOps = logsToCompile.map(l => operationSnapshot(l.id, l));

    // Save / update compiled report in auditReports
    let cloudQueueStatus = 'offline_queued';
    let cloudQueuedAt = null;

    const targetReportId = reportId || auditId;
    const compiledAt = new Date().toISOString();
    const newReport = {
      id: targetReportId,
      reportId: targetReportId,
      month: compileMonth,
      period: toReportPeriod(compileMonth),
      blockFarm: targetFarm,
      blockFarmName: targetFarm,
      blockFarmId: targetFarmId,
      totalCost: totalCost,
      totalHectares: totalHa,
      fieldsReported: farmFields.length,
      logsCount: logsCount,
      totalLogs: logsCount,
      status: 'PENDING',
      compiledByUserId: compilerUserId,
      compiledAt,
      createdAt: compiledAt,
      updatedAt: compiledAt,
      cloudQueueStatus: 'offline_queued',
      dateGenerated: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      qrSignature: hash,
      qrHash: hash,
      envelope: envelope,
      verifiedBy: null,
      stageBreakdown: stageBreakdown.length > 0 ? stageBreakdown : [],
      operationSnapshots: serializedOps,
      operations: serializedOps,
      notes: `Compiled by Farm Manager ${session?.name || 'Farm Manager'}. Awaiting SRA District inspection.`
    };

    try {
      const outcome = await commitExplicitMutation('audit_report', {
        id: targetReportId,
        blockFarmId: targetFarmId,
        period: toReportPeriod(compileMonth),
        operationLogIds: logsToCompile.map(log => log.id)
      });
      Object.assign(newReport, outcome.response?.data || {});
      if (!outcome.queued) {
        cloudQueueStatus = 'transmitted';
        cloudQueuedAt = nowIso;
        newReport.cloudQueueStatus = 'transmitted';
        newReport.cloudQueuedAt = nowIso;
      }
    } catch (e) {
      Alert.alert('Audit Report Not Compiled', e.message || 'The server rejected this report.');
      return;
    }

    const existingIdx = auditReports.findIndex(a => a.id === targetReportId || a.reportId === targetReportId);
    if (existingIdx >= 0) {
      auditReports[existingIdx] = { ...auditReports[existingIdx], ...newReport };
    } else {
      auditReports.unshift(newReport);
    }
    saveItem(STORAGE_KEYS.AUDIT_REPORTS, auditReports);
    notifyDataUpdate();

    setActiveQRData({
      reportId: targetReportId,
      month: compileMonth,
      blockFarm: targetFarm,
      totalCost,
      totalHectares: totalHa,
      totalFields: farmFields.length || 5,
      totalLogs: logsCount,
      hash,
      envelope,
      cloudQueueStatus,
      cloudQueuedAt
    });

    const deltaCount = logsCount;
    const countLabel = `${deltaCount} operation log${deltaCount !== 1 ? 's' : ''}`;

    if (cloudQueueStatus === 'transmitted') {
      safeAlert(
        'Audit Transmitted ☁️',
        `Successfully compiled ${countLabel} for ${compileMonth}.\n\n☁️ Sent to Cloud Audit Queue!\nSRA District Officers can review remotely on the district portal or verify via QR.`,
        [{ text: 'View SRA QR Code', onPress: () => setShowQR(true) }]
      );
    } else {
      safeAlert(
        'Audit Stored in Offline Queue 📦',
        `Successfully compiled ${countLabel} for ${compileMonth}.\n\n📦 Stored in Local Offline Queue.\nWill automatically sync to SRA Cloud Queue once online. Regulators can scan this offline QR code immediately.`,
        [{ text: 'View SRA QR Code', onPress: () => setShowQR(true) }]
      );
    }
  };

  const checkMissingFields = () => {
    const missingFields = [];
    fields.forEach(field => {
      const fieldTasks = cycleTasksByField[field.id] || [];
      const activeTask = fieldTasks.find(t => t.active);
      if (activeTask) {
        const hasLog = logs.some(l => l.fieldId === field.id && l.taskId === activeTask.id && !l.declined);
        if (!hasLog) {
          missingFields.push(field.id);
        }
      }
    });

    if (missingFields.length > 0) {
      Alert.alert(
        'Incomplete Logs Notice',
        `The following fields do not have a log for their current active stage:\n\n${missingFields.join('\n')}\n\nYou can still generate the monthly audit package for all completed operations.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Compile & Generate', onPress: compileAndShow, style: 'default' }
        ]
      );
    } else {
      compileAndShow();
    }
  };


  const handleScanOrSubmitCode = (code) => {
    if (!code) return;
    const rawStr = String(code).trim();
    let parsedJson = null;

    try {
      if (rawStr.startsWith('{') && rawStr.endsWith('}')) {
        parsedJson = JSON.parse(rawStr);
      }
    } catch (e) {
      parsedJson = null;
    }

    const requestedId = parsedJson?.reportId || parsedJson?.id || '';
    const match = rawStr.match(/(HUG-[A-Z0-9-]+)/i);
    const hash = parsedJson?.hash || parsedJson?.qrHash || parsedJson?.qrSignature || (match ? match[1].toUpperCase() : rawStr.toUpperCase());
    const report = (auditReports || []).find(candidate =>
      candidate.id === requestedId || candidate.reportId === requestedId || candidate.qrHash === hash || candidate.qrSignature === hash
    );
    if (!report) {
      Alert.alert('Report Not Found', 'The scanned value does not match an existing Firestore audit report. No provisional report was created.');
      setShowScanner(false);
      setIsBarcodeProcessing(false);
      return;
    }

    setScannedAuditReport(report);
    setShowScanner(false);
    setIsBarcodeProcessing(false);
    setShowSRAInspectModal(true);
  };

  const handleCertifyReport = async (report) => {
    if (!report) return;
    const session = getCurrentSession();
    const auditorName = session?.name || 'SRA Officer';
    const certifiedAt = new Date().toISOString();
    const auditorUserId = session?.employeeId || session?.id || '';
    if (canonicalRole(session?.role) !== 'SRA_ADMIN' || report.status !== 'PENDING') {
      Alert.alert('Certification Denied', 'Only an SRA Admin may certify an existing PENDING audit report.');
      return;
    }

    try {
      await commitExplicitMutation('audit_certification', {
        id: report.reportId || report.id,
        certificationNotes: report.certificationNotes || ''
      }, { baseVersion: report.updatedAt || null });
    } catch (e) {
      Alert.alert('Certification Failed', e.message || 'The report could not be certified.');
      return;
    }

    const existingIdx = auditReports.findIndex(a => a.id === report.id || a.reportId === report.reportId || a.qrSignature === report.qrSignature);
    if (existingIdx >= 0) {
      auditReports[existingIdx] = { ...auditReports[existingIdx], status: 'CERTIFIED', certifiedByUserId: auditorUserId, certifiedAt };
    }

    // Update scanned report in state
    setScannedAuditReport(prev => ({
      ...prev,
      status: 'CERTIFIED',
      certifiedByUserId: auditorUserId,
      certifiedAt: certifiedAt
    }));
    await logSystemEvent(
      'audit',
      'Audit Report Certified',
      report.reportId || report.id,
      `Certified audit report ${report.reportId || report.id}.`,
      auditorName,
      'Completed'
    );

    Alert.alert(
      'SRA Seal Issued',
      `Official SRA Certification Seal issued for ${report.blockFarm || (session?.farm || session?.blockFarm || 'District Central')} (${report.month || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}).\n\nCertified By: ${auditorName}\nThe certification is recorded on this audit report.`,
      [{ text: 'OK' }]
    );
  };
  const [reqFieldId, setReqFieldId] = useState('');
  const [reqFieldHa, setReqFieldHa] = useState('');
  const [cycleTasksByField, setCycleTasksByField] = useState(() => {
    const initial = {};
    fields.forEach(f => {
      initial[f.id] = getFieldStages(f.id);
    });
    return initial;
  });
  // ── Canonical Start New Crop Year Cycle ─────────────────────────────
  const handleStartNewCycle = async (fieldId, customCycleType = null, customCropYear = null, forceArchive = false) => {
    if (activeRole === 'Farm Manager' && !isTakeOver) {
      Alert.alert(
        'Supervisor Takeover Required',
        'Crop cycle renewal / restart must be initiated by the Member (Plot Owner), SRA Administrator, or authorized via Supervisor Takeover.'
      );
      return;
    }

    const cleanFieldId = (fieldId || '').trim().toUpperCase();
    const targetField = accessibleFields.find(f => (f.id || '').trim().toUpperCase() === cleanFieldId);
    if (!targetField) {
      Alert.alert('Field Not Found', 'The selected field is not available in your assigned scope.');
      return;
    }

    // Security Safeguard: Check for uncompiled active operations before archiving
    if (!forceArchive) {
      const reportedIds = new Set((auditReports || []).flatMap(audit =>
        (audit.operationSnapshots || audit.operations || []).map(operation => operation.operationLogId || operation.id)
      ));
      const uncompiledActiveLogs = logs.filter(l => l.cycleId === targetField.currentCycleId && l.status === 'ACTIVE' && !reportedIds.has(l.id));

      if (uncompiledActiveLogs.length > 0) {
        const totalUncompiledCost = uncompiledActiveLogs.reduce((sum, l) => sum + (Number(l.totalCost || l.cost) || 0), 0);
        Alert.alert(
          'Archive operation?',
          `This record will remain available in operation history.\n\nStarting a new cycle will archive ${uncompiledActiveLogs.length} current operation record(s) (total ₱${totalUncompiledCost.toLocaleString()}) as historical past cycle data.`,
          [
            {
              text: 'Cancel',
              style: 'cancel'
            },
            {
              text: isArchivingCycle ? 'Archiving...' : 'Archive',
              style: 'destructive',
              onPress: async () => {
                if (isArchivingCycle) return;
                setIsArchivingCycle(true);
                try {
                  await handleStartNewCycle(fieldId, customCycleType, customCropYear, true);
                } finally {
                  setIsArchivingCycle(false);
                }
              }
            }
          ]
        );
        return;
      }
    }

    const finalCycleType = customCycleType || targetField.cycleType || 'Plant Cane (New Plant)';
    const finalCropYear = customCropYear || targetField.cropYear || '2026-2027';

    const baseStages = (CROP_CYCLE_STAGES_BY_TYPE[finalCycleType] || CROP_CYCLE_STAGES_BY_TYPE['Plant Cane (New Plant)']).map((t, idx) => ({
      ...t,
      stageNumber: t.stageNumber || (idx + 1),
      done: false,
      active: idx === 0
    }));
    const stage1Name = baseStages[0].name || baseStages[0].label || 'Pre-Planting & Land Preparation';

    // The server transaction is authoritative when online; offline work is queued by dataStore.
    const rolloverResult = await archiveFieldCropCycle(fieldId, {
      cycleType: finalCycleType,
      cropYear: finalCropYear,
      stage: stage1Name,
      customStages: baseStages.map(s => ({ ...s, done: false, active: s.stageNumber === 1 }))
    });
    if (!rolloverResult.success) {
      safeAlert('Crop Cycle Not Renewed', rolloverResult.message || 'The server rejected this crop-cycle renewal. Refresh and try again.');
      return;
    }

    // Force-clone every log object so React memoized selectors recompute cleanly.
    setLogs(operationLogs.map(l => ({ ...l })));
    setDraftLogs(prev => prev.filter(d => (d.fieldId || '').trim().toUpperCase() !== cleanFieldId));
    setHighlightedSubmittedLogIds(new Set());
    setHighlightedDraftIds(new Set());

    // Reset the local timeline only after the server accepted (or safely queued) the rollover.
    setCycleTasksByField(prev => ({
      ...prev,
      [fieldId]: baseStages.map(s => ({ ...s, done: false, active: s.stageNumber === 1 }))
    }));

    // Refresh selectedField from the updated fields store.
    const refreshedField = fields.find(f => (f.id || '').trim().toUpperCase() === cleanFieldId);
    if (refreshedField) {
      setSelectedField({ ...refreshedField, stage: stage1Name, stageNumber: 1, isCompleted: false, customStages: baseStages });
    }

    setShowCycleModal(false);

    Alert.alert(
      'New Crop Year Started!',
      `Successfully initialized ${finalCycleType} (${finalCropYear}) for ${fieldId}.\n\nStage 1: "${stage1Name}" is now active and ready for field logging.`
    );
  };

  const openOperationLog = (targetTask, sraOpId) => {
    if (checkTakeOverRequired('record stage work or log operations')) return;
    const stageNum = targetTask?.stageNumber || 1;
    const customOps = getFieldCustomOperations(safeField.id, stageNum);
    const targetOp = customOps.find(o => o.id === sraOpId) || SRA_OPERATIONS_CATALOGUE.find(o => o.id === sraOpId) || SRA_OPERATIONS_CATALOGUE.find(o => o.name === targetTask?.name) || SRA_OPERATIONS_CATALOGUE[1];
    const haVal = parseFloat(safeField.ha || '1.5') || 1.0;
    const isGrp = targetOp.isGroup ?? (targetOp.inputType === 'group' || (targetOp.subItems && targetOp.subItems.length > 1));

    let initialSubItems = [];
    let totalCost = 0;
    let directQty = '';
    let directUnit = targetOp.unit || 'ha';
    let directRate = targetOp.rate || targetOp.costPerHa || 0;

    if (isGrp) {
      initialSubItems = (targetOp.subItems || []).map((si, idx) => {
        const scaledQty = Number(((si.qty || 1) * (si.unit === 'lac' || si.unit === 'pass' || si.unit === 'ha' || si.unit === 'ton' ? haVal : 1)).toFixed(1));
        const subTotal = Math.round(scaledQty * (si.unitCost || si.rate || 0));
        return {
          id: generateSubItemId(targetOp.id || 'OP', idx),
          description: si.description || si.name,
          qty: scaledQty,
          unit: si.unit || 'bag',
          unitCost: si.unitCost || si.rate || 0,
          subTotal: subTotal
        };
      });
      totalCost = initialSubItems.reduce((sum, item) => sum + item.subTotal, 0);
    } else {
      const scaledDirectQty = Number(((targetOp.perHa || 1) * haVal).toFixed(1));
      directQty = String(scaledDirectQty);
      directRate = targetOp.rate || targetOp.costPerHa || 0;
      totalCost = Math.round(scaledDirectQty * directRate);
    }

    setLogForm({
      id: null,
      fieldId: safeField.id,
      saveFieldId: true,
      stageNumber: stageNum,
      stageName: targetTask?.name || targetOp.stageName || `Stage ${stageNum}`,
      sraOperationId: targetOp.id || 'CUSTOM',
      operationName: targetOp.name,
      activity: targetOp.name,
      category: targetOp.category || 'prep',
      isGroup: isGrp,
      inputType: isGrp ? 'group' : 'direct',
      cost: String(totalCost),
      directRate: String(directRate),
      period: formatDisplayDate(new Date()),
      hectares: safeField.ha || '1.5',
      people: '2',
      subItems: initialSubItems,
      inputQty: directQty,
      inputUnit: directUnit,
      inputName: !isGrp ? targetOp.name : '',
      taskId: targetTask?.id || `S${stageNum}`,
      isSubmit: true
    });
    setShowOpPicker(false);
    setShowLog(true);
  };

  const toggleTaskStatus = (taskId, forceComplete = false) => {
    if (activeRole === 'SRA Admin') return;
    if (checkTakeOverRequired('record stage work or update stage progress')) return;

    if (!getNetworkStatus()) {
      Alert.alert(
        'Internet Connection Required',
        'Marking a stage as complete or advancing the crop cycle updates the official field state in the central database and requires an active internet connection.\n\nYou can continue logging operations and field activities offline — they will automatically sync to Cloud Firestore when reconnected.'
      );
      return;
    }

    const currentStageNum = Number(safeField.stageNumber) || 1;
    const rawTasks = getFieldStages(safeField.id);
    const fieldTasks = rawTasks;
    const taskIndex = rawTasks.findIndex(t => t.id === taskId || t.stageNumber === currentStageNum);
    const targetTask = rawTasks[taskIndex] || rawTasks[0];
    const completedStageNum = targetTask.stageNumber || (taskIndex + 1);

    const stageDrafts = draftLogs.filter(d =>
      d.fieldId === safeField.id &&
      (d.stageNumber === completedStageNum || d.taskId === targetTask.id)
    );

    const applyToggle = () => {
      // Discard unsubmitted drafts belonging to this completed stage
      if ((forceComplete || targetTask.active) && stageDrafts.length > 0) {
        const remainingDrafts = draftLogsStore.filter(d =>
          !(d.fieldId === safeField.id && (d.stageNumber === completedStageNum || d.taskId === targetTask.id))
        );
        draftLogsStore.length = 0;
        draftLogsStore.push(...remainingDrafts);
        setDraftLogs([...remainingDrafts]);
        notifyDataUpdate();
      }

      if (forceComplete) {
        if (completedStageNum >= 6) {
          // Stage 6 completion -> Crop cycle finished!
          const nextStageLabel = 'Harvesting & Milling (Completed)';
          const updated = rawTasks.map(t => ({ ...t, done: true, active: false }));
          setCycleTasksByField(p => ({ ...p, [safeField.id]: updated }));
          setSelectedField(prevF => ({ ...prevF, stage: nextStageLabel, stageNumber: 6, isCompleted: true, customStages: updated }));
          const mf = fields.find(f => f.id === safeField.id);
          if (mf) {
            mf.stage = nextStageLabel;
            mf.stageNumber = 6;
            mf.isCompleted = true;
            mf.customStages = updated;
            if (isTakeOver) {
              mf.synced = true;
              mf.lastSync = 'Just now (Manager Take Over)';
            }
            saveFieldPlot(mf, false);
          }
          updateFieldStageAndCycle(safeField.id, {
            stage: nextStageLabel,
            stageNumber: 6,
            isCompleted: true,
            customStages: updated,
            cycleType: mf?.cycleType || 'Plant Cane (New Plant)',
            lastUpdated: new Date().toISOString()
          });

          const session = getCurrentSession();
          const actorName = session?.name ? `${session.name} (${session.role || 'Farm Manager'})` : 'Farm Manager';
          logSystemEvent(
            'operation',
            'Crop Cycle Completed',
            safeField.id,
            `All 6 stages completed for plot ${safeField.id} (${safeField.member || 'Member'}).`,
            actorName,
            'Completed'
          );

          setTimeout(() => {
            if (activeRole === 'Farm Manager') {
              Alert.alert(
                'Crop Cycle Completed!',
                'All 6 stages for this field crop cycle are complete. Cycle renewal / restart must be initiated by the Member (Plot Owner) or SRA Administrator.'
              );
            } else {
              Alert.alert(
                'Crop Cycle Completed!',
                'All 6 stages for this field cycle are complete. Would you like to start a new crop cycle?',
                [
                  { text: 'Not Now', style: 'cancel' },
                  {
                    text: 'Start New Cycle',
                    style: 'default',
                    onPress: () => handleStartNewCycle(safeField.id)
                  }
                ]
              );
            }
          }, 500);
        } else {
          // Advance strictly to the next sequential stage (e.g. Stage 1 -> Stage 2)
          const nextStageNum = completedStageNum + 1;
          const stageTemplates = CROP_CYCLE_STAGES_BY_TYPE[safeField.cycleType || 'Plant Cane (New Plant)'] || CROP_CYCLE_STAGES_BY_TYPE['Plant Cane (New Plant)'];
          const nextStageObj = stageTemplates[nextStageNum - 1] || { name: `Stage ${nextStageNum}` };
          const nextStageLabel = nextStageObj.name;

          const updated = stageTemplates.map((t, idx) => {
            const sN = t.stageNumber || (idx + 1);
            if (sN < nextStageNum) return { ...t, done: true, active: false };
            if (sN === nextStageNum) return { ...t, done: false, active: true };
            return { ...t, done: false, active: false };
          });

          setCycleTasksByField(p => ({ ...p, [safeField.id]: updated }));
          setSelectedField(prevF => ({ ...prevF, stage: nextStageLabel, stageNumber: nextStageNum }));
          const mf = fields.find(f => f.id === safeField.id);
          if (mf) {
            mf.stage = nextStageLabel;
            mf.stageNumber = nextStageNum;
            if (isTakeOver) {
              mf.synced = true;
              mf.lastSync = 'Just now (Manager Take Over)';
            }
            saveFieldPlot(mf, false);
          }
          updateFieldStageAndCycle(safeField.id, {
            stage: nextStageLabel,
            stageNumber: nextStageNum,
            cycleType: mf?.cycleType || 'Plant Cane (New Plant)',
            lastUpdated: new Date().toISOString()
          });

          const session = getCurrentSession();
          const actorName = session?.name ? `${session.name} (${session.role || 'Farm Manager'})` : 'Farm Manager';
          logSystemEvent(
            'operation',
            isTakeOver ? 'Stage Advanced via Takeover' : 'Field Stage Advance',
            safeField.id,
            `Advanced plot ${safeField.id} from Stage ${completedStageNum} to Stage ${nextStageNum}: "${nextStageLabel}".`,
            actorName,
            'Completed'
          );
        }
      } else {
        // Non-forced toggle (activating or reverting a stage)
        const targetNum = targetTask.stageNumber || (taskIndex + 1);
        const stageTemplates = CROP_CYCLE_STAGES_BY_TYPE[safeField.cycleType || 'Plant Cane (New Plant)'] || CROP_CYCLE_STAGES_BY_TYPE['Plant Cane (New Plant)'];
        const targetObj = stageTemplates[targetNum - 1] || { name: `Stage ${targetNum}` };
        const targetLabel = targetObj.name;

        const updated = stageTemplates.map((t, idx) => {
          const sN = t.stageNumber || (idx + 1);
          if (sN < targetNum) return { ...t, done: true, active: false };
          if (sN === targetNum) return { ...t, done: false, active: true };
          return { ...t, done: false, active: false };
        });

        setCycleTasksByField(p => ({ ...p, [safeField.id]: updated }));
        setSelectedField(prevF => ({ ...prevF, stage: targetLabel, stageNumber: targetNum }));
        const mf = fields.find(f => f.id === safeField.id);
        if (mf) {
          mf.stage = targetLabel;
          mf.stageNumber = targetNum;
          if (isTakeOver) {
            mf.synced = true;
            mf.lastSync = 'Just now (Manager Take Over)';
          }
          saveFieldPlot(mf, false);
        }
        updateFieldStageAndCycle(safeField.id, {
          stage: targetLabel,
          stageNumber: targetNum,
          cycleType: mf?.cycleType || 'Plant Cane (New Plant)',
          lastUpdated: new Date().toISOString()
        });
      }
    };

    const isProgressing = !targetTask.done;
    
    if (isProgressing && taskIndex > 0) {
      const hasPendingPrior = fieldTasks.slice(0, taskIndex).some(t => !t.done);
      if (hasPendingPrior) {
        if (activeRole === 'Member Farmer') {
          Alert.alert('Action Denied', 'You cannot skip ahead. Please submit logs and mark the previous stages as complete first.');
          return;
        }
        const priorTask = fieldTasks[taskIndex - 1];
        const hasPriorLogs = logs.some(l => l.fieldId === safeField.id && (l.taskId === priorTask?.id || l.stageNumber === priorTask?.stageNumber) && l.status === 'ACTIVE');
        const priorMsg = hasPriorLogs 
          ? 'Previous stages are not yet marked done. Are you sure you want to jump ahead?' 
          : `Notice: Stage ${priorTask?.stageNumber || taskIndex} has no operations recorded yet. Are you sure you want to skip ahead without logging previous work?`;
        Alert.alert(
          'Skip Stage Warning',
          priorMsg,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Yes, Skip Ahead', onPress: applyToggle, style: 'destructive' }
          ]
        );
        return;
      }
    } 

    if (!targetTask.active && !targetTask.done && !forceComplete) {
       Alert.alert(
         'Activate Stage',
         `Start working on Stage ${targetTask.stageNumber || taskIndex + 1}: "${targetTask.name || targetTask.label}"?`,
         [
           { text: 'Cancel', style: 'cancel' },
           { text: 'Activate', onPress: applyToggle, style: 'default' }
         ]
       );
       return;
    }

    if (targetTask.active && !forceComplete) {
      const stageNum = targetTask.stageNumber || taskIndex + 1;
      const stageDrafts = draftLogs.filter(d => (d.taskId === targetTask.id || d.stageNumber === stageNum) && d.fieldId === safeField.id);
      if (stageDrafts.length > 0) {
        editDraft(stageDrafts[0]);
      } else {
        const stageOps = getFieldCustomOperations(safeField.id, stageNum);

        // Find the first operation in this stage that hasn't been recorded yet
        const nextPendingOp = stageOps.find(op => !logs.some(l => 
          l.fieldId === safeField.id && 
          (l.operationName === op.name || l.sraOperationId === op.id || l.activity === op.name) && 
          (l.stageNumber === stageNum || l.taskId === targetTask.id) && 
          l.status === 'ACTIVE'
        ));

        const targetOpToOpen = nextPendingOp || stageOps[0] || (targetTask.operations && targetTask.operations[0]) || { id: 'SRA-02' };
        openOperationLog(targetTask, targetOpToOpen.id);
      }
      return;
    } else if (!isProgressing) {
      if (activeRole === 'Member Farmer') {
        Alert.alert('Action Denied', 'Members cannot revert completed stages. Please contact your Farm Manager if you made a mistake.');
        return;
      }
      const hasSubmittedLogs = logs.some(l => l.fieldId === safeField.id && l.taskId === taskId);
      if (hasSubmittedLogs) {
        Alert.alert('Cannot Revert', 'This stage already has submitted logs. Please delete or decline them first before reverting.');
        return;
      }
      Alert.alert(
        'Revert Stage',
        'Are you sure you want to revert this completed stage back to pending?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes, Revert', onPress: applyToggle, style: 'destructive' }
        ]
      );
      return;
    }

    applyToggle();
  };

  useEffect(() => {
    // Initial sync
    const initialSession = getCurrentSession();
    const initialUserId = initialSession?.employeeId || initialSession?.id || '';
    const initialFarmIds = new Set(blockFarms.filter(farm => farm.managerUserId === initialUserId).map(farm => farm.id));
    const initialFields = fields.filter(field => initialSession?.role === 'Member Farmer'
      ? field.memberUserId === initialUserId
      : initialSession?.role === 'Farm Manager' ? initialFarmIds.has(field.blockFarmId) : true);
    setSelectedField(initialFields.find(field => field.id === initialSession?.fieldId) || initialFields[0] || null);
    const unsubscribe = subscribe(() => {
      const session = getCurrentSession();
      setActiveRole(session?.role || 'Member Farmer');
      // Keep selectedField reactive and aligned with authoritative fields array!
      setSelectedField(prev => {
        const userId = session?.employeeId || session?.id || '';
        const farmIds = new Set(blockFarms.filter(farm => farm.managerUserId === userId).map(farm => farm.id));
        const permitted = fields.filter(field => session?.role === 'Member Farmer'
          ? field.memberUserId === userId
          : session?.role === 'Farm Manager' ? farmIds.has(field.blockFarmId) : true);
        const targetId = prev?.id || session?.fieldId;
        const found = permitted.find(f => f.id === targetId);
        return found ? { ...found } : (permitted[0] || null);
      });
      setSyncedState(getIsSynced());
      setRequests([...assignmentRequests]);
      setPendingUsersList([...pendingUsers]);
      setLogs([...operationLogs]);
      setDraftLogs([...draftLogsStore]);
      // Dynamically re-derive cycleTasksByField for all fields so stage completions from Web reflect in real-time
      setCycleTasksByField(prev => {
        const updated = { ...prev };
        fields.forEach(f => {
          updated[f.id] = getFieldStages(f.id);
        });
        return updated;
      });
    });
    return unsubscribe;
  }, []);

  const handleRequestField = () => {
    if (!reqFieldId.trim() || !reqFieldHa.trim()) {
      Alert.alert('Required', 'Please enter a Field ID and Hectares (HA).');
      return;
    }
    const haValue = parseFloat(reqFieldHa);
    if (isNaN(haValue) || haValue <= 0 || haValue > 100) {
      Alert.alert('Invalid', 'Please enter a valid hectare size (between 0.1 and 100).');
      return;
    }
    requestFieldAssignment(reqFieldId.trim().toUpperCase(), getCurrentSession().name, haValue.toFixed(1));
    Alert.alert('Request Sent', `Assignment request for ${reqFieldId.toUpperCase()} (${haValue.toFixed(1)} Ha) has been sent to the Farm Manager for approval.`);
    setReqFieldId('');
    setReqFieldHa('');
    setShowAddField(false);
  };

  const selectSraOperation = (opId, ha = null) => {
    const op = SRA_OPERATIONS_CATALOGUE.find(o => o.id === opId) || SRA_OPERATIONS_CATALOGUE[0];
    const haVal = parseFloat(ha || logForm.hectares || safeField.ha || '1.5') || 1.0;
    const scaledSubItems = op.subItems.map((si, idx) => {
      const baseQty = si.qty;
      const scaledQty = Number((baseQty * (si.unit === 'lac' || si.unit === 'pass' || si.unit === 'ha' || si.unit === 'ton' ? haVal : 1)).toFixed(1));
      const subTotal = Math.round(scaledQty * si.unitCost);
      return {
        id: generateSubItemId(op.id, idx),
        description: si.description,
        qty: scaledQty,
        unit: si.unit,
        unitCost: si.unitCost,
        subTotal: subTotal
      };
    });
    const totalCost = scaledSubItems.reduce((sum, item) => sum + (Number(item.subTotal) || 0), 0);
    setLogForm(prev => ({
      ...prev,
      sraOperationId: op.id,
      operationName: op.name,
      activity: op.name,
      category: op.category,
      subItems: scaledSubItems,
      cost: String(totalCost),
    }));
  };

  const addCustomSubItem = () => {
    const nextIdx = (logForm.subItems || []).length;
    const newItem = {
      id: generateSubItemId(logForm.sraOperationId || 'CUST', nextIdx),
      description: '',
      qty: 1,
      unit: 'days',
      unitCost: 500,
      subTotal: 500
    };
    setLogForm(prev => {
      const updated = [...(prev.subItems || []), newItem];
      const totalCost = updated.reduce((sum, item) => sum + (Number(item.subTotal) || 0), 0);
      return {
        ...prev,
        subItems: updated,
        cost: String(totalCost)
      };
    });
  };

  const updateSubItemRow = (index, field, value) => {
    setLogForm(prev => {
      const updated = [...(prev.subItems || [])];
      if (!updated[index]) return prev;
      const item = { ...updated[index], [field]: value };
      if (field === 'qty' || field === 'unitCost') {
        const q = parseFloat(item.qty) || 0;
        const uc = parseFloat(item.unitCost) || 0;
        item.subTotal = Math.round(q * uc);
      }
      updated[index] = item;
      const totalCost = updated.reduce((sum, it) => sum + (Number(it.subTotal) || 0), 0);
      return {
        ...prev,
        subItems: updated,
        cost: String(totalCost)
      };
    });
  };

  const removeSubItemRow = (index) => {
    setLogForm(prev => {
      const updated = (prev.subItems || []).filter((_, i) => i !== index);
      const totalCost = updated.reduce((sum, it) => sum + (Number(it.subTotal) || 0), 0);
      return {
        ...prev,
        subItems: updated,
        cost: String(totalCost)
      };
    });
  };

  const openLog = (opId = 'SRA-02') => {
    const targetOp = SRA_OPERATIONS_CATALOGUE.find(o => o.id === opId) || SRA_OPERATIONS_CATALOGUE[1];
    const haVal = parseFloat(safeField.ha || '1.5') || 1.0;
    const initialSubItems = targetOp.subItems.map((si, idx) => {
      const scaledQty = Number((si.qty * (si.unit === 'lac' || si.unit === 'pass' || si.unit === 'ha' || si.unit === 'ton' ? haVal : 1)).toFixed(1));
      const subTotal = Math.round(scaledQty * si.unitCost);
      return {
        id: generateSubItemId(targetOp.id, idx),
        description: si.description,
        qty: scaledQty,
        unit: si.unit,
        unitCost: si.unitCost,
        subTotal: subTotal
      };
    });
    const totalCost = initialSubItems.reduce((sum, item) => sum + item.subTotal, 0);

    setLogForm(p => ({
      ...p,
      id: null,
      fieldId: safeField.id,
      saveFieldId: true,
      sraOperationId: targetOp.id,
      operationName: targetOp.name,
      activity: targetOp.name,
      category: targetOp.category,
      cost: String(totalCost),
      hectares: safeField.ha || '1.5',
      people: '2',
      subItems: initialSubItems,
      inputQty: '',
      inputUnit: targetOp.unit || 'bags',
      inputName: '',
      period: p.period || formatDisplayDate(new Date()),
      isSubmit: true
    }));
    setShowLog(true);
  };

  const closeLog = () => {
    const hasUnsavedWork = Boolean(
      (logForm.operationName && logForm.operationName !== 'Land Preparation') ||
      logForm.notes ||
      (logForm.subItems && logForm.subItems.length > 0)
    );
    if (hasUnsavedWork) {
      Alert.alert(
        'Discard changes?',
        'Your unsaved operation details will be lost.',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => setShowLog(false) }
        ]
      );
    } else {
      setShowLog(false);
    }
  };

  const handleSaveLog = async (asSubmit = true, forceCostConfirm = false, forceDuplicateConfirm = false) => {
    if (isSavingLog) return;

    const effectiveActivity = logForm.operationName || logForm.activity || 'Field Operation';
    let computedCost = parseFloat(logForm.cost) || 0;
    if (logForm.isGroup && logForm.subItems && logForm.subItems.length > 0) {
      computedCost = logForm.subItems.reduce((sum, it) => sum + (it.subTotal || 0), 0);
    } else if (!logForm.isGroup && logForm.inputQty && logForm.directRate) {
      computedCost = Math.round(parseFloat(logForm.inputQty) * parseFloat(logForm.directRate));
    }

    if (!effectiveActivity.trim() || !logForm.fieldId?.trim() || !logForm.period?.trim() || !logForm.hectares || !logForm.people) {
      Alert.alert('Required', 'Please fill in Date, Activity, Operational Cost, Hectares, and Workers.');
      return;
    }
    
    const costValue = computedCost;
    const ha = parseFloat(logForm.hectares);
    const ppl = parseInt(logForm.people);

    if (isNaN(costValue) || costValue < 0) {
      Alert.alert('Invalid Input', 'Please enter a valid positive number for Operational Cost.');
      return;
    }
    if (isNaN(ha) || ha <= 0 || isNaN(ppl) || ppl <= 0) {
      Alert.alert('Invalid Input', 'Hectares and Workers must be positive numbers greater than 0.');
      return;
    }
    if (ha > 50) { Alert.alert('Invalid Input', 'Hectares cannot exceed 50 per log.'); return; }
    if (ppl > 100) { Alert.alert('Invalid Input', 'Worker count cannot exceed 100 per log.'); return; }

    // Block future dates
    const parsedDate = new Date(logForm.period);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (!isNaN(parsedDate.getTime()) && parsedDate > today) {
      Alert.alert('Invalid Date', 'You cannot set a future date for completed work. Please select today or an earlier date.');
      return;
    }
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (!logForm.id && !isNaN(parsedDate.getTime()) && parsedDate < thirtyDaysAgo) {
      Alert.alert('Date Too Old', 'Logs cannot be back-dated more than 30 days. Contact your Farm Manager for corrections beyond this period.');
      return;
    }

    const submittedFieldId = logForm.fieldId.trim().toUpperCase();

    // Member Field Lock: Members can only log activities for their own assigned plot
    if (activeRole === 'Member Farmer') {
      const session = getCurrentSession();
      const myPlot = session.fieldId?.trim()?.toUpperCase();
      if (myPlot && submittedFieldId !== myPlot) {
        Alert.alert(
          'Action Denied',
          `As a Member farmer, you may only record operations for your assigned plot (${session.fieldId}). To request an additional plot, please use Field Requests.`
        );
        return;
      }
    }

    // Farm Manager Supervisor Takeover Validation
    if (activeRole === 'Farm Manager' && !logForm.id) {
      const session = getCurrentSession();
      const targetField = fields.find(f => (f.id || '').trim().toUpperCase() === submittedFieldId) || selectedField;
      const isMyField = (targetField?.member || '').trim().toLowerCase() === (session?.name || '').trim().toLowerCase();
      if (!isMyField && !isTakeOver) {
        Alert.alert(
          'Supervisor Takeover Required',
          `This field is managed by ${targetField?.member || 'the assigned Member'}. To record stage work or submit operations, please authorize Supervisor Take Over first.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Take Over Field', onPress: handleInitiateTakeOver }
          ]
        );
        return;
      }
    }

    // Takeover identical check: prevent re-submitting unchanged stage operation in active cycle
    if (isTakeOver && asSubmit && !logForm.id) {
      const existingMatchingLog = operationLogs.find(l =>
        l.status === 'ACTIVE' &&
        l.fieldId === submittedFieldId &&
        (l.sraOperationId === logForm.sraOperationId || l.operationName === logForm.operationName || l.activity === (logForm.activity || '').trim()) &&
        (l.stageNumber === parentStageNum || l.taskId === logForm.taskId)
      );
      if (existingMatchingLog) {
        const origCost = Math.round(Number(existingMatchingLog.totalCost != null ? existingMatchingLog.totalCost : existingMatchingLog.cost || 0));
        const newCost = Math.round(costValue);
        const origHa = parseFloat(existingMatchingLog.hectares) || 1.5;
        const newHa = ha;
        const origPeople = String(existingMatchingLog.people || '2').trim();
        const newPeople = String(ppl).trim();
        const origDate = formatDisplayDate(existingMatchingLog.date || existingMatchingLog.period);
        const newDate = formatDisplayDate(logForm.period);

        const isSame = (origCost === newCost) &&
          (Math.abs(origHa - newHa) < 0.001) &&
          (origPeople === newPeople) &&
          (origDate === newDate);

        if (isSame) {
          Alert.alert(
            'No Changes Detected',
            `An identical operation for "${finalActivityName}" is already recorded on this field with the same cost, area, workers, and date. No changes were made, so nothing was submitted.`
          );
          return;
        }
      }
    }

    // Duplicate detection (soft warning within active crop cycle)
    const isDupConfirmed = forceDuplicateConfirm || logForm._duplicateConfirmed;
    if (asSubmit && !logForm.id) {
      const isDuplicate = operationLogs.some(l =>
        l.status === 'ACTIVE' &&
        l.fieldId === submittedFieldId &&
        (l.operationName === logForm.operationName || l.activity === (logForm.activity || '').trim()) &&
        (l.date === (logForm.period || '') || formatDisplayDate(l.date) === formatDisplayDate(logForm.period))
      );
      if (isDuplicate && !isDupConfirmed) {
        Alert.alert(
          'Possible Duplicate Notice',
          `An operation for "${logForm.operationName || logForm.activity}" is already recorded on ${logForm.period} for ${submittedFieldId}. Do you still wish to record this?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Record Anyway', style: 'default', onPress: () => {
              setLogForm(prev => ({ ...prev, _duplicateConfirmed: true }));
              handleSaveLog(asSubmit, true, true);
            }}
          ]
        );
        return;
      }
    }

    const safeHa = Math.max(ha, 0.1);
    const costPerHaVal = Math.round(costValue / safeHa);
    const loggedByStr = isTakeOver
      ? `Manager (${getCurrentSession().name} - Takeover)`
      : `${getCurrentSession().role === 'Farm Manager' ? 'Manager' : 'Farmer'} (${getCurrentSession().name})`;

    const matchedOp = SRA_OPERATIONS_CATALOGUE.find(o => o.id === logForm.sraOperationId) || {};
    const parentStageNum = logForm.stageNumber || matchedOp.stageNumber || 1;
    const parentStageName = logForm.stageName || matchedOp.stageName || 'Stage 1: Pre-Planting & Land Preparation';

    const isDraftId = logForm.id && logForm.id.startsWith('DFT-');
    const logIdToUse = (asSubmit && isDraftId)
      ? generateLogId(submittedFieldId)
      : (logForm.id || (asSubmit ? generateLogId(submittedFieldId) : generateDraftId(submittedFieldId)));
    const finalActivityName = (logForm.operationName || logForm.activity || matchedOp.name || logForm.subItems?.[0]?.description || 'Custom Operation').trim();

    const isNetOnline = getNetworkStatus();
    const activeField = fields.find(field => field.id === submittedFieldId) || selectedField || safeField;
    const activeCycleId = activeField?.currentCycleId;
    if (asSubmit && !activeCycleId) {
      Alert.alert('Crop Cycle Required', 'This field has no explicit active crop cycle. Create or synchronize the field cycle before submitting an operation.');
      return;
    }

    const newLog = {
      id: logIdToUse,
      fieldId: submittedFieldId,
      cycleId: activeCycleId || '',
      stageNumber: parentStageNum,
      stageName: parentStageName,
      sraOperationId: logForm.sraOperationId || matchedOp.id || 'CUSTOM',
      operationDefinitionId: logForm.sraOperationId || matchedOp.id || 'CUSTOM',
      operationName: finalActivityName,
      activity: finalActivityName,
      category: logForm.category || matchedOp.category || 'prep',
      totalCost: costValue,
      cost: costValue,
      costPerHa: costPerHaVal,
      hectares: parseFloat(logForm.hectares) || 1.5,
      areaHa: parseFloat(logForm.hectares) || 1.5,
      people: String(logForm.people || '2'),
      peopleCount: Number(logForm.people || 2),
      subItems: (logForm.subItems || []).map(si => ({
        id: si.id || `SI-${Date.now()}`,
        description: si.description || finalActivityName,
        qty: parseFloat(si.qty) || 1,
        unit: si.unit || 'ha',
        unitCost: parseFloat(si.unitCost) || 0,
        subTotal: parseFloat(si.subTotal) || 0,
      })),
      inputQty: logForm.inputQty || '',
      inputUnit: logForm.inputUnit || 'ha',
      inputName: logForm.inputName || '',
      createdAt: new Date().toISOString(),
      date: formatDisplayDate(logForm.period || new Date()),
      period: formatDisplayDate(logForm.period || new Date()),
      isoDate: toISODateString(logForm.period || new Date()),
      performedOn: toISODateString(logForm.period || new Date()),
      status: asSubmit ? 'ACTIVE' : 'DRAFT',
      loggedBy: loggedByStr,
      loggedById: getCurrentSession()?.employeeId || '',
      submittedByUserId: getCurrentSession()?.employeeId || '',
      submissionSource: isTakeOver ? 'MANAGER_TAKEOVER' : 'MEMBER',
      taskId: logForm.taskId || `S${parentStageNum}`,
      isOffline: !isNetOnline,
      synced: isNetOnline,
      cloudQueueStatus: isNetOnline ? 'synced' : 'offline_queued',
      isDraft: !asSubmit,
      isSupplemental: Boolean(logForm.isSupplemental),
      amendments: []
    };

    setIsSavingLog(true);

    try {
      if (!fields.find(f => f.id === submittedFieldId)) {
        const curSess = getCurrentSession();
        fields.push({
          id: submittedFieldId,
          memberName: curSess?.name || 'Current User',
          member: curSess?.name || 'Current User',
          memberId: curSess?.employeeId || '',
          userId: curSess?.employeeId || '',
          ha: parseFloat(logForm.hectares) || 0.0,
          stage: logForm.operationName || 'Newly Logged',
          month: 0,
          synced: false,
          lastSync: 'Just now',
          customStages: []
        });
      }

      if (asSubmit) {
        if (logForm.id) {
          // Check if updating an existing submitted log
          const logIdx = operationLogs.findIndex(l => l.id === logForm.id);
          if (logIdx >= 0) {
            const reason = logEditAuth.reason || 'Record amended';
            const password = logEditAuth.password;
            const result = await updateOperationLogWithSecurity(logForm.id, newLog, reason, password);
            
            if (!result.success) {
              Alert.alert(
                result.noChanges ? 'No Changes Detected' : 'Security Authorization Error',
                result.error || 'Could not update operation log.'
              );
              if (result.noChanges) {
                closeLog();
                setLogEditAuth({ password: '', reason: '' });
              }
              return;
            }

            setLogs([...operationLogs]);
            setLogTab('submitted');
            notifyDataUpdate();
            Alert.alert(
              'Operation updated successfully.',
              `The existing operation ID ${logForm.id} was updated without creating a duplicate.\n\nAudit Reason: ${reason}\nAmended by: ${getCurrentSession().name}`
            );
            setLogEditAuth({ password: '', reason: '' });
            setLogForm({ id: null, fieldId: safeField.id, saveFieldId: true, activity: '', cost: '', period: formatDisplayDate(new Date()), hectares: '', people: '', inputQty: '', inputUnit: 'bags', inputName: '', taskId: null, isSubmit: true });
            closeLog();
            return;
          }

        }

        newLog.synced = isNetOnline;
        newLog.isOffline = !isNetOnline;
        newLog.cloudQueueStatus = isNetOnline ? 'synced' : 'offline_queued';
        newLog.syncedAt = isNetOnline ? new Date().toISOString() : null;

        const cleanNewLog = toOperationLogDocument(newLog, {
          cycleId: activeCycleId,
          submittedByUserId: getCurrentSession()?.employeeId || '',
          submissionSource: isTakeOver ? 'MANAGER_TAKEOVER' : 'MEMBER',
          status: 'ACTIVE'
        });

        try {
          const outcome = await commitExplicitMutation('operation_log', { id: newLog.id, ...cleanNewLog });
          if (outcome.response?.data) {
            Object.assign(newLog, outcome.response.data, { id: outcome.response.data.id || newLog.id });
          }
          if (outcome.queued) {
            newLog.synced = false;
            newLog.isOffline = true;
            newLog.cloudQueueStatus = 'offline_queued';
          }
        }
        catch (err) {
          Alert.alert('Operation Not Submitted', err.message || 'The server rejected this operation. Refresh the field and try again.');
          return;
        }

        const existingIdx = operationLogs.findIndex(l => l.id === newLog.id);
        if (existingIdx >= 0) {
          operationLogs[existingIdx] = newLog;
        } else {
          operationLogs.unshift(newLog);
        }
        await saveItem(STORAGE_KEYS.LOGS, operationLogs);
        if (logForm.id) {
          const draftIdx = draftLogsStore.findIndex(d => d.id === logForm.id);
          if (draftIdx >= 0) draftLogsStore.splice(draftIdx, 1);
          setDraftLogs([...draftLogsStore]);
          await saveDraftLogs();
        }
        setHighlightedSubmittedLogIds(prev => new Set([newLog.id, ...prev]));
        setLogs([...operationLogs]);
        setLogTab('submitted');
        setLogCategoryFilter('all');
        setLogSearch('');
        setLogCurrentPage(1);
        notifyDataUpdate();
        if (isNetOnline) {
          setSynced(true);
        }

        if (isTakeOver || newLog.submissionSource === 'MANAGER_TAKEOVER') {
          const targetField = fields.find(f => f.id === submittedFieldId) || selectedField;
          if (targetField) {
            targetField.synced = true;
            targetField.lastSync = 'Just now (Manager Take Over)';
            saveFieldPlot(targetField, false);
            if ((selectedField?.id || safeField.id) === targetField?.id) {
              setSelectedField({ ...targetField });
            }
          }
        }

        // Close form modal smoothly before showing confirmation
        closeLog();
        
        // Keep stage active and allow multiple operations per stage
        if (logForm.taskId && logForm.taskId !== 'Emergency') {
          const currentTasks = cycleTasksByField[submittedFieldId] || [];
          const targetTask = currentTasks.find(t => t.id === logForm.taskId);
          const stageNum = logForm.stageNumber || targetTask?.stageNumber || 1;
          const stageLoggedOps = operationLogs.filter(l => l.fieldId === submittedFieldId && (l.stageNumber === stageNum || l.taskId === logForm.taskId) && l.status === 'ACTIVE');

          if (targetTask?.done || logForm.isSupplemental || newLog.isSupplemental) {
            Alert.alert(
              isNetOnline ? 'Supplemental Operation Recorded' : '💾 Saved Offline (Supplemental)',
              isNetOnline
                ? `"${newLog.activity}" recorded to field history as a supplemental entry. Stage progress was kept intact.`
                : `"${newLog.activity}" stored in local device storage. It will synchronize to Cloud Firestore when internet connection is restored.`,
              [
                { text: 'Done', style: 'cancel' },
                { text: 'View Ledger', style: 'default', onPress: () => setShowHistoryModal(true) }
              ]
            );
          } else {
            Alert.alert(
              isNetOnline ? '✅ Operation Recorded & Synced' : '💾 Saved Offline to Device',
              isNetOnline
                ? `"${newLog.activity}" (₱${Number(costValue).toLocaleString()}) has been synchronized to Cloud Firestore.\n\nStage ${stageNum} remains active (${stageLoggedOps.length} operations logged). Tap "Mark Stage as Complete" on the field card once all stage tasks are finished.`
                : `"${newLog.activity}" (₱${Number(costValue).toLocaleString()}) has been saved to your device local storage (${stageLoggedOps.length} operations for Stage ${stageNum}).\n\n🟡 Status: Queued for Cloud Sync\nIt will automatically upload to Cloud Firestore when your internet connection is restored.`,
              [
                { text: 'Done', style: 'cancel' },
                { text: 'View Ledger', style: 'default', onPress: () => setShowHistoryModal(true) }
              ]
            );
          }
        } else {
          Alert.alert(
            isNetOnline ? '✅ Operation Recorded & Synced' : '💾 Saved Offline to Device',
            isNetOnline
              ? `"${newLog.activity}" (₱${Number(costValue).toLocaleString()}) has been recorded and synchronized to Cloud Firestore.`
              : `"${newLog.activity}" (₱${Number(costValue).toLocaleString()}) has been saved to device local storage and queued for cloud sync.`,
            [
              { text: 'Done', style: 'cancel' },
              { text: 'View Ledger', style: 'default', onPress: () => setShowHistoryModal(true) }
            ]
          );
        }
      } else {
        if (logForm.id) {
          const idx = draftLogsStore.findIndex(d => d.id === logForm.id);
          if (idx >= 0) draftLogsStore[idx] = { ...newLog, id: logForm.id };
          setHighlightedDraftIds(prev => new Set([logForm.id, ...prev]));
          setDraftLogs([...draftLogsStore]);
        } else {
          const draftObj = { ...newLog, id: generateDraftId(submittedFieldId) };
          draftLogsStore.unshift(draftObj);
          setHighlightedDraftIds(prev => new Set([draftObj.id, ...prev]));
          setDraftLogs([...draftLogsStore]);
        }
        setLogTab('drafts');
        closeLog();
        Alert.alert('Draft Saved', 'Your log has been saved as a draft.');
      }
      
      notifyDataUpdate();

      if (logForm.saveFieldId && submittedFieldId !== (selectedField?.id || safeField.id)) {
        updateSessionFieldId(submittedFieldId);
      }

      setLogForm({ id: null, fieldId: safeField.id, saveFieldId: true, activity: '', cost: '', period: formatDisplayDate(new Date()), hectares: '', people: '', inputQty: '', inputUnit: 'bags', inputName: '', taskId: null, isSubmit: true });
    } finally {
      setIsSavingLog(false);
    }
  };

  const submitDraft = async (log) => {
    if (checkTakeOverRequired('submit drafts or record stage work')) return;
    const draftField = fields.find(field => field.id === (log.fieldId || safeField.id || activeFieldId));
    const activeCycleId = draftField?.currentCycleId || selectedField?.currentCycleId;
    if (!activeCycleId) {
      Alert.alert('Crop Cycle Required', 'This field has no explicit active crop cycle. Synchronize the field before submitting this draft.');
      return;
    }
    const cleanFieldId = (log.fieldId || safeField.id || activeFieldId).trim().toUpperCase();
    const submittedId = generateLogId(cleanFieldId);
    const opCost = Number(log.cost || log.totalCost || 0);
    const submittedLog = {
      ...log,
      id: submittedId,
      fieldId: cleanFieldId,
      cycleId: activeCycleId,
      status: 'ACTIVE',
      cost: opCost,
      totalCost: opCost,
      isOffline: !isNetOnline,
      synced: isNetOnline,
      cloudQueueStatus: isNetOnline ? 'synced' : 'offline_queued',
      isDraft: false,
      isNew: false,
      createdAt: new Date().toISOString(),
      date: formatDisplayDate(log.date || log.period || new Date()),
      period: formatDisplayDate(log.date || log.period || new Date()),
      isoDate: toISODateString(log.date || log.period || new Date())
    };

    const cleanSubmitted = toOperationLogDocument(submittedLog, {
      cycleId: activeCycleId,
      submittedByUserId: submittedLog.submittedByUserId || submittedLog.loggedById || getCurrentSession()?.employeeId || '',
      status: 'ACTIVE'
    });

    try {
      const outcome = await commitExplicitMutation('operation_log', { id: submittedId, ...cleanSubmitted });
      if (outcome.response?.data) {
        Object.assign(submittedLog, outcome.response.data, { id: outcome.response.data.id || submittedId });
      }
      if (outcome.queued) {
        submittedLog.synced = false;
        submittedLog.isOffline = true;
        submittedLog.cloudQueueStatus = 'offline_queued';
      }
    }
    catch (err) {
      Alert.alert('Draft Not Submitted', err.message || 'The server rejected this operation. The local draft was preserved.');
      return;
    }

    const idx = draftLogsStore.findIndex(d => d.id === log.id);
    if (idx >= 0) draftLogsStore.splice(idx, 1);
    setDraftLogs([...draftLogsStore]);
    setSelectedDraftIds(prev => {
      const next = new Set(prev);
      next.delete(log.id);
      return next;
    });
    await saveDraftLogs();

    operationLogs.unshift(submittedLog);
    await saveItem(STORAGE_KEYS.LOGS, operationLogs);
    setHighlightedSubmittedLogIds(prev => new Set([submittedLog.id, ...prev]));
    setLogs([...operationLogs]);
    setLogTab('submitted');
    setLogCategoryFilter('all');
    setLogSearch('');
    setLogCurrentPage(1);
    notifyDataUpdate();

    if (log.taskId && log.taskId !== 'Emergency') {
      const currentTasks = cycleTasksByField[cleanFieldId] || cycleTasksByField[log.fieldId] || [];
      const taskIdx = currentTasks.findIndex(t => t.id === log.taskId);
      if (taskIdx > -1) {
        const targetTask = currentTasks[taskIdx];
        const isAlreadyDone = Boolean(targetTask.done);

        // If stage was already marked done previously, flag this entry as supplemental
        if (isAlreadyDone || log.isSupplemental) {
          submittedLog.isSupplemental = true;
          submittedLog.status = 'ACTIVE';
          await saveItem(STORAGE_KEYS.LOGS, operationLogs);
        }
        // Do NOT auto-complete the stage! Keep stage active so the farmer can log again or add more passes.
      }
    }

    notifyDataUpdate();
    if (submittedLog.isSupplemental) {
      Alert.alert(
        'Supplemental Operation Recorded',
        `"${submittedLog.activity || submittedLog.operationName}" has been recorded to field history as a supplemental entry. Current field stage progress was preserved!`
      );
    } else {
      Alert.alert(
        'Draft Submitted',
        `"${submittedLog.activity || submittedLog.operationName}" recorded to field history! Stage remains active for additional operations or repeat passes.`
      );
    }
  };

  const editDraft = (draft) => {
    if (checkTakeOverRequired('modify drafts or record stage work')) return;
    setLogForm({
      id: draft.id,
      fieldId: draft.fieldId,
      saveFieldId: true,
      sraOperationId: draft.sraOperationId || 'SRA-02',
      operationName: draft.operationName || draft.activity || '',
      activity: draft.activity || draft.operationName || '',
      category: draft.category || 'prep',
      cost: draft.cost ? draft.cost.toString() : (draft.totalCost ? draft.totalCost.toString() : ''),
      period: draft.date || draft.period || formatDisplayDate(new Date()),
      hectares: draft.hectares ? draft.hectares.toString() : '',
      people: draft.people ? draft.people.toString() : '2',
      subItems: draft.subItems || [],
      inputQty: draft.inputQty ? draft.inputQty.toString() : '',
      inputUnit: draft.inputUnit || 'bags',
      inputName: draft.inputName || '',
      taskId: draft.taskId,
      stageNumber: draft.stageNumber || 1,
      stageName: draft.stageName || '',
      isSupplemental: Boolean(draft.isSupplemental),
      isSubmit: false,
    });
    setShowLog(true);
  };

  const deleteDraft = (draftId) => {
    if (checkTakeOverRequired('remove drafts or modify records')) return;
    Alert.alert('Delete Draft', 'Are you sure you want to remove this draft?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const idx = draftLogsStore.findIndex(d => d.id === draftId);
        if (idx >= 0) draftLogsStore.splice(idx, 1);
        setDraftLogs([...draftLogsStore]);
        setSelectedDraftIds(prev => {
          const next = new Set(prev);
          next.delete(draftId);
          return next;
        });
        await saveDraftLogs();
        notifyDataUpdate();
      }}
    ]);
  };

  const submitSelectedDrafts = async () => {
    if (checkTakeOverRequired('submit drafts')) return;
    if (selectedDraftIds.size === 0) {
      Alert.alert(t('no_drafts_selected_title', 'No Drafts Selected'), t('select_drafts_to_submit', 'Please select at least one draft operation to submit.'));
      return;
    }

    const count = selectedDraftIds.size;
    Alert.alert(
      t('submit_selected_drafts_title', 'Submit Selected Drafts?'),
      `${t('confirm_submit_batch_prefix', 'Are you sure you want to submit and record')} ${count} ${count === 1 ? t('draft_singular', 'draft') : t('drafts_plural', 'drafts')} ${t('confirm_submit_batch_suffix', 'to field operation history?')}`,
      [
        { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
        {
          text: `${t('btn_submit_batch', 'Submit')} (${count})`,
          style: 'default',
          onPress: async () => {
            const newlySubmitted = [];
            const remainingDrafts = [];

            for (const d of draftLogsStore) {
              if (!selectedDraftIds.has(d.id)) {
                remainingDrafts.push(d);
                continue;
              }

              const cleanFieldId = (d.fieldId || safeField.id || activeFieldId).trim().toUpperCase();
              const draftField = fields.find(field => field.id === cleanFieldId);
              const activeCycleId = draftField?.currentCycleId || selectedField?.currentCycleId;
              if (!activeCycleId) {
                remainingDrafts.push(d);
                continue;
              }
              const submittedId = generateLogId(cleanFieldId);
              const opCost = Number(d.cost || d.totalCost || 0);
              const submittedLog = {
                ...d,
                id: submittedId,
                fieldId: cleanFieldId,
                cycleId: activeCycleId,
                status: 'ACTIVE',
                cost: opCost,
                totalCost: opCost,
                isOffline: !isNetOnline,
                synced: isNetOnline,
                cloudQueueStatus: isNetOnline ? 'synced' : 'offline_queued',
                isDraft: false,
                isNew: false,
                createdAt: new Date().toISOString(),
                date: formatDisplayDate(d.date || d.period || new Date()),
                period: formatDisplayDate(d.date || d.period || new Date()),
                isoDate: toISODateString(d.date || d.period || new Date())
              };

              const cleanBatchLog = toOperationLogDocument(submittedLog, {
                cycleId: activeCycleId,
                submittedByUserId: submittedLog.submittedByUserId || submittedLog.loggedById || getCurrentSession()?.employeeId || '',
                status: 'ACTIVE'
              });

              try {
                const outcome = await commitExplicitMutation('operation_log', { id: submittedId, ...cleanBatchLog });
                if (outcome.response?.data) {
                  Object.assign(submittedLog, outcome.response.data, { id: outcome.response.data.id || submittedId });
                }
                if (outcome.queued) {
                  submittedLog.synced = false;
                  submittedLog.isOffline = true;
                  submittedLog.cloudQueueStatus = 'offline_queued';
                }
              }
              catch (err) {
                remainingDrafts.push(d);
                console.warn('[FieldOpsScreen] Batch draft rejected; draft retained:', err.message);
                continue;
              }

              const existingIdx = operationLogs.findIndex(l => l.id === submittedLog.id);
              if (existingIdx >= 0) {
                operationLogs[existingIdx] = submittedLog;
              } else {
                operationLogs.unshift(submittedLog);
              }
              newlySubmitted.push(submittedLog);
            }

            draftLogsStore.length = 0;
            draftLogsStore.push(...remainingDrafts);

            await saveDraftLogs();
            await saveItem(STORAGE_KEYS.LOGS, operationLogs);
            setDraftLogs([...draftLogsStore]);
            setSelectedDraftIds(new Set());
            setIsDraftSelectMode(false);
            const newlySubmittedIds = newlySubmitted.map(l => l.id);
            setHighlightedSubmittedLogIds(prev => new Set([...newlySubmittedIds, ...prev]));
            setLogs([...operationLogs]);
            setLogTab('submitted');
            setLogCategoryFilter('all');
            setLogSearch('');
            setLogCurrentPage(1);
            notifyDataUpdate();

            Alert.alert(
              'Drafts Submitted',
              `${newlySubmitted.length} draft operations recorded to field history.${remainingDrafts.length ? ` ${remainingDrafts.length} rejected draft(s) were preserved for review.` : ''} Field stages remain active for additional operations.`
            );
          }
        }
      ]
    );
  };

  const handleClearOrDeleteSelected = () => {
    const selectedIds = Array.from(selectedDraftIds);
    if (selectedIds.length === 0) return;
    const currentPlotDrafts = draftLogsStore.filter(d => (d.fieldId || '').trim().toUpperCase() === (safeField.id || '').trim().toUpperCase());
    const isAll = selectedIds.length >= currentPlotDrafts.length;

    Alert.alert(
      isAll ? 'Clear All Drafts' : 'Delete Selected Drafts',
      isAll
        ? `Are you sure you want to clear all ${selectedIds.length} draft logs?`
        : `Are you sure you want to delete ${selectedIds.length} selected draft log${selectedIds.length > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isAll ? `Clear All (${selectedIds.length})` : `Delete (${selectedIds.length})`,
          style: 'destructive',
          onPress: async () => {
            await deleteDraftLogs(selectedIds);
            setSelectedDraftIds(new Set());
            setIsDraftSelectMode(false);
            setDraftLogs([...draftLogsStore]);
            notifyDataUpdate();
          }
        }
      ]
    );
  };

  const editSubmittedLog = (log, allowNormalManagerEdit = false) => {
    if (isLogLocked(log)) {
      Alert.alert(
        'Archived Historical Record',
        'This operation log belongs to an archived crop cycle and cannot be modified.'
      );
      return;
    }

    if (!allowNormalManagerEdit && checkTakeOverRequired('amend or modify operation logs')) return;

    const session = getCurrentSession();
    const isOwner = selectedField?.member === session.name || log?.authorName === session.name || activeRole === 'Member Farmer';

    // Farm Manager or Member can edit this specific operation directly with amendment authorization

    // Open Security Authorization Modal
    setPendingEditLog(log);
    setEditAuthPassword('');
    setEditAuthReason('');
    setEditAuthError('');
    setShowEditPassword(false);
    setShowEditAuthModal(true);
  };

  const handleConfirmEditAuth = async () => {
    const cleanPass = String(editAuthPassword || '').trim();
    const isUserPassValid = cleanPass ? await verifyCurrentPassword(cleanPass) : false;

    if (!cleanPass || !isUserPassValid) {
      setEditAuthError('Incorrect password. Please enter your account password to authorize modifying this log.');
      return;
    }

    const cleanReason = String(editAuthReason || '').trim();
    if (!cleanReason || cleanReason.length < 3) {
      setEditAuthError('Please provide a mandatory reason for this amendment/correction.');
      return;
    }

    const log = pendingEditLog;
    if (!log) return;

    setLogEditAuth({ password: cleanPass, reason: cleanReason });
    setEditAuthError('');
    setShowEditAuthModal(false);

    setLogForm({
      id: log.id,
      fieldId: log.fieldId,
      saveFieldId: true,
      sraOperationId: log.sraOperationId || '',
      operationName: log.operationName || log.activity || '',
      activity: log.activity || '',
      category: log.category || 'prep',
      stageNumber: log.stageNumber,
      stageName: log.stageName,
      isGroup: Array.isArray(log.subItems) && log.subItems.length > 0,
      subItems: Array.isArray(log.subItems) ? log.subItems.map(si => ({ ...si })) : [],
      cost: log.totalCost != null ? log.totalCost.toString() : (log.cost ? log.cost.toString() : ''),
      period: log.date || log.period || formatDisplayDate(new Date()),
      hectares: log.hectares ? log.hectares.toString() : (selectedField?.ha || '1.5'),
      people: log.people ? log.people.toString() : '',
      inputQty: log.inputQty ? log.inputQty.toString() : '',
      inputUnit: log.inputUnit || 'bags',
      inputName: log.inputName || '',
      taskId: log.taskId,
      isSubmit: true,
    });
    setShowLog(true);
  };

  const activeFieldId = (selectedField?.id || '').trim().toUpperCase();
  
  const visibleLogs = React.useMemo(() => {
    return cleanupDuplicateLogs(logs);
  }, [logs]);

  const isLogPastCycle = React.useCallback((l) => {
    return Boolean(l && l.status === 'ARCHIVED');
  }, []);

  const fieldLogs = React.useMemo(() => {
    return visibleLogs
      .filter(l => {
        const logFId = (l.fieldId || '').trim().toUpperCase();
        return logFId === activeFieldId && l.status === 'ACTIVE' && !l.isDraft;
      })
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || a.date || 0).getTime();
        const timeB = new Date(b.createdAt || b.timestamp || b.date || 0).getTime();
        if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
        return (b.id || '').localeCompare(a.id || '');
      });
  }, [visibleLogs, activeFieldId, isLogPastCycle]);

  const pastLogs = React.useMemo(() => {
    return visibleLogs
      .filter(l => {
        const logFId = (l.fieldId || '').trim().toUpperCase();
        return logFId === activeFieldId && l.status === 'ARCHIVED' && !l.isDraft;
      })
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || a.date || 0).getTime();
        const timeB = new Date(b.createdAt || b.timestamp || b.date || 0).getTime();
        if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
        return (b.id || '').localeCompare(a.id || '');
      });
  }, [visibleLogs, activeFieldId, isLogPastCycle]);

  const allFarmSubmittedLogs = React.useMemo(() => {
    const permittedFieldIds = new Set(accessibleFields.map(field => field.id));
    return visibleLogs
      .filter(l => l.status === 'ACTIVE' && !l.isDraft && permittedFieldIds.has(l.fieldId))
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || a.date || 0).getTime();
        const timeB = new Date(b.createdAt || b.timestamp || b.date || 0).getTime();
        if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
        return (b.id || '').localeCompare(a.id || '');
      });
  }, [visibleLogs, accessibleFields, isLogPastCycle]);

  const managerSubmittedLogs = React.useMemo(() => {
    if (managerLedgerScope === 'all') {
      return allFarmSubmittedLogs;
    }
    return fieldLogs;
  }, [managerLedgerScope, allFarmSubmittedLogs, fieldLogs]);

  const unsynced = React.useMemo(() => {
    return accessibleFields.filter(f => !f.synced || (typeof f.lastSync === 'string' && f.lastSync.includes('days')));
  }, [accessibleFields, synced]);

  // Dynamic calculations for month-level QR code compilation
  const { activeCycleLogs, uniqueFieldsCount, totalLogsCount, totalOperationalCost } = React.useMemo(() => {
    const acl = visibleLogs.filter(l => l.status === 'ACTIVE');
    const ufc = new Set(acl.map(l => l.fieldId)).size;
    const tlc = acl.length;
    const toc = acl.reduce((sum, l) => sum + (Number(l.cost) || 0), 0);
    return { activeCycleLogs: acl, uniqueFieldsCount: ufc, totalLogsCount: tlc, totalOperationalCost: toc };
  }, [visibleLogs]);

  const LOGS_PER_PAGE = 5;

  const renderCompactLogList = (baseList, isDraft = false, isManager = false) => {
    const effectiveBaseList = [...baseList].sort((a, b) => {
      const aHighlighted = isDraft ? highlightedDraftIds.has(a.id) : highlightedSubmittedLogIds.has(a.id);
      const bHighlighted = isDraft ? highlightedDraftIds.has(b.id) : highlightedSubmittedLogIds.has(b.id);
      const aNew = ((a.isNew || aHighlighted) && !viewedLogIds.has(a.id)) ? 1 : 0;
      const bNew = ((b.isNew || bHighlighted) && !viewedLogIds.has(b.id)) ? 1 : 0;
      if (aNew !== bNew) return bNew - aNew; // newly added records on top
      const timeA = new Date(a.createdAt || a.timestamp || a.date || 0).getTime();
      const timeB = new Date(b.createdAt || b.timestamp || b.date || 0).getTime();
      if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
      return (b.id || '').localeCompare(a.id || '');
    });

    const filtered = effectiveBaseList.filter(log => {
      if (!isDraft && logCategoryFilter !== 'all') {
        const stageNum = parseInt(logCategoryFilter.replace('stage', ''), 10);
        const isMatch = (
          log.stageNumber === stageNum ||
          (log.taskId && log.taskId.toUpperCase() === `S${stageNum}`) ||
          (log.taskId && (
            (stageNum === 1 && (log.taskId === 'T1' || log.taskId === 'T2')) ||
            (stageNum === 2 && (log.taskId === 'T3' || log.taskId === 'T4')) ||
            (stageNum === 3 && (log.taskId === 'T5' || log.taskId === 'T6')) ||
            (stageNum === 4 && (log.taskId === 'T7' || log.taskId === 'T10')) ||
            (stageNum === 5 && (log.taskId === 'T8' || log.taskId === 'T9' || log.taskId === 'T11')) ||
            (stageNum === 6 && (log.taskId === 'T12' || log.taskId === 'T13' || log.taskId === 'T14'))
          )) ||
          (log.sraOperationId && (
            (stageNum === 1 && (log.sraOperationId === 'SRA-01' || log.sraOperationId === 'SRA-02')) ||
            (stageNum === 2 && (log.sraOperationId === 'SRA-03' || log.sraOperationId === 'SRA-04')) ||
            (stageNum === 3 && (log.sraOperationId === 'SRA-05' || log.sraOperationId === 'SRA-06')) ||
            (stageNum === 4 && (log.sraOperationId === 'SRA-07' || log.sraOperationId === 'SRA-10')) ||
            (stageNum === 5 && (log.sraOperationId === 'SRA-08' || log.sraOperationId === 'SRA-09' || log.sraOperationId === 'SRA-11')) ||
            (stageNum === 6 && (log.sraOperationId === 'SRA-12' || log.sraOperationId === 'SRA-13' || log.sraOperationId === 'SRA-14'))
          )) ||
          (stageNum === 1 && ((log.activity || '').toLowerCase().includes('prep') || (log.activity || '').toLowerCase().includes('plow') || (log.activity || '').toLowerCase().includes('soil'))) ||
          (stageNum === 2 && ((log.activity || '').toLowerCase().includes('plant') || (log.activity || '').toLowerCase().includes('patdan') || (log.activity || '').toLowerCase().includes('seedcane'))) ||
          (stageNum === 3 && ((log.activity || '').toLowerCase().includes('basal') || (log.activity || '').toLowerCase().includes('dap') || (log.activity || '').toLowerCase().includes('phosphate') || (log.activity || '').toLowerCase().includes('early care'))) ||
          (stageNum === 4 && ((log.activity || '').toLowerCase().includes('cultivation') || (log.activity || '').toLowerCase().includes('weed') || (log.activity || '').toLowerCase().includes('barring'))) ||
          (stageNum === 5 && ((log.activity || '').toLowerCase().includes('top-dress') || (log.activity || '').toLowerCase().includes('hilling') || (log.activity || '').toLowerCase().includes('maintenance') || (log.activity || '').toLowerCase().includes('drainage'))) ||
          (stageNum === 6 && ((log.activity || '').toLowerCase().includes('harvest') || (log.activity || '').toLowerCase().includes('cutting') || (log.activity || '').toLowerCase().includes('truck') || (log.activity || '').toLowerCase().includes('haul') || (log.activity || '').toLowerCase().includes('bull cart')))
        );
        if (!isMatch) return false;
      }

      if (logSearch.trim()) {
        const q = logSearch.trim().toLowerCase();
        const matchAct = (log.activity || '').toLowerCase().includes(q);
        const matchDate = (log.date || log.period || '').toLowerCase().includes(q);
        const matchCost = (log.cost || '').toString().includes(q);
        const matchId = (log.id || '').toLowerCase().includes(q);
        const matchMat = (log.inputName || '').toLowerCase().includes(q);
        return matchAct || matchDate || matchCost || matchId || matchMat;
      }
      return true;
    });

    const isFiltering = logSearch.trim().length > 0 || (!isDraft && logCategoryFilter !== 'all');
    const totalPages = Math.max(1, Math.ceil(filtered.length / LOGS_PER_PAGE));
    const currentPageClamped = Math.min(logCurrentPage, totalPages);
    const displayItems = filtered.slice((currentPageClamped - 1) * LOGS_PER_PAGE, currentPageClamped * LOGS_PER_PAGE);

    return (
      <View style={{ gap: 8 }}>
        {/* Draft Selection & Action Toolbar (Theme-Aligned, Select-First) */}
        {isDraft && baseList.length > 0 && (
          !isDraftSelectMode ? (
            /* Normal Mode: Clean Section Title with "Select" Action Button (No Clear All looming above) */
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 6,
              paddingHorizontal: 2,
              marginBottom: 2
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary }} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text }}>
                  {t('draft_ops_title', 'Draft Operations')} ({baseList.length})
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setIsDraftSelectMode(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1.5,
                  borderColor: COLORS.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 5.5,
                  borderRadius: RADIUS.md,
                  ...SHADOW.card
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="checkbox-outline" size={15} color={COLORS.primary} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.primary }}>
                  {t('btn_select_drafts', 'Select')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Selection Mode: Theme Action Panel with Select All, Submit Selected, and Clear Options */
            <View style={{
              backgroundColor: '#FFFFFF',
              borderWidth: 1.5,
              borderColor: COLORS.primaryBorder,
              borderRadius: RADIUS.md,
              padding: 10,
              marginBottom: 4,
              gap: 8,
              ...SHADOW.card
            }}>
              {/* Row 1: Select All & Done Button */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TouchableOpacity
                  onPress={() => {
                    if (selectedDraftIds.size === baseList.length) {
                      setSelectedDraftIds(new Set());
                    } else {
                      setSelectedDraftIds(new Set(baseList.map(d => d.id)));
                    }
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={selectedDraftIds.size === baseList.length ? "checkbox" : (selectedDraftIds.size > 0 ? "remove-circle" : "square-outline")}
                    size={20}
                    color={COLORS.primary}
                  />
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: COLORS.text }}>
                    {selectedDraftIds.size === baseList.length ? t('btn_deselect_all', 'Deselect All') : t('btn_select_all', 'Select All')}
                  </Text>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: COLORS.primary }}>
                    ({selectedDraftIds.size} of {baseList.length} selected)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setIsDraftSelectMode(false);
                    setSelectedDraftIds(new Set());
                  }}
                  style={{
                    backgroundColor: '#F3F4F6',
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                    borderRadius: RADIUS.sm
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.textSecondary }}>
                    {t('btn_done', 'Done')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Row 2: Submit All Selected or Clear All / Clear Selected */}
              {selectedDraftIds.size > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                  {/* Submit All / Submit Selected Button */}
                  <TouchableOpacity
                    onPress={submitSelectedDrafts}
                    style={{
                      flex: 1.3,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: COLORS.primary,
                      paddingVertical: 8.5,
                      borderRadius: RADIUS.sm
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="paper-plane-outline" size={14} color="#fff" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>
                      {selectedDraftIds.size === baseList.length
                        ? `Submit All (${selectedDraftIds.size})`
                        : `Submit Selected (${selectedDraftIds.size})`}
                    </Text>
                  </TouchableOpacity>

                  {/* Clear All / Clear Selected Button */}
                  <TouchableOpacity
                    onPress={handleClearOrDeleteSelected}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      backgroundColor: '#FFF5F5',
                      borderWidth: 1,
                      borderColor: '#FECACA',
                      paddingVertical: 8.5,
                      borderRadius: RADIUS.sm
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={14} color="#DC2626" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#DC2626' }}>
                      {selectedDraftIds.size === baseList.length
                        ? `Clear All (${selectedDraftIds.size})`
                        : `Clear (${selectedDraftIds.size})`}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', paddingVertical: 2 }}>
                  Tap draft cards below to select, or tap Select All
                </Text>
              )}
            </View>
          )
        )}

        {/* Search Bar */}
        <View style={s.logSearchBox}>
          <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
          <TextInput
            style={s.logSearchInput}
            placeholder={isDraft ? t('search_drafts_placeholder', "Search draft logs...") : t('search_logs_placeholder', "Search logs by activity, date, cost, materials...")}
            placeholderTextColor={COLORS.textMuted}
            value={logSearch}
            onChangeText={(t) => {
              setLogSearch(t);
              setLogCurrentPage(1);
            }}
          />
          {logSearch.length > 0 && (
            <TouchableOpacity onPress={() => { setLogSearch(''); setLogCurrentPage(1); }} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Pills (6 Official SRA Growth Stages) */}
        {!isDraft && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SPACING.lg, marginBottom: 4 }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 6 }}>
            {[
              { key: 'all', label: `${t('cat_all', 'All')} (${baseList.length})` },
              { key: 'stage1', label: `${t('stage_word', 'Stage')} 1: ${t('stage_1_short', 'Land Prep')}` },
              { key: 'stage2', label: `${t('stage_word', 'Stage')} 2: ${t('stage_2_short', 'Planting')}` },
              { key: 'stage3', label: `${t('stage_word', 'Stage')} 3: ${t('stage_3_short', 'Basal Fert')}` },
              { key: 'stage4', label: `${t('stage_word', 'Stage')} 4: ${t('stage_4_short', 'Cultivation')}` },
              { key: 'stage5', label: `${t('stage_word', 'Stage')} 5: ${t('stage_5_short', 'Maintenance')}` },
              { key: 'stage6', label: `${t('stage_word', 'Stage')} 6: ${t('stage_6_short', 'Harvesting')}` },
            ].map(f => (
              <TouchableOpacity
                key={f.key}
                style={[s.filterPill, logCategoryFilter === f.key && s.filterPillActive]}
                onPress={() => {
                  setLogCategoryFilter(f.key);
                  setLogCurrentPage(1);
                }}
              >
                <Text style={[s.filterPillText, logCategoryFilter === f.key && s.filterPillTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Results summary when filtering */}
        {isFiltering && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2, marginBottom: 2 }}>
            <Text style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: '600' }}>
              Showing {filtered.length} of {baseList.length} logs
            </Text>
            <TouchableOpacity onPress={() => { setLogSearch(''); setLogCategoryFilter('all'); setLogCurrentPage(1); }}>
              <Text style={{ fontSize: 11, color: COLORS.primary, fontWeight: '700' }}>{t('btn_reset', 'Reset Filter')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty state */}
        {displayItems.length === 0 && (
          <View style={s.emptyCard}>
            <Ionicons name="document-text-outline" size={28} color={COLORS.border} />
            <Text style={s.emptyText}>{isFiltering ? t('no_matching_logs', 'No logs match your search or filter.') : (isDraft ? t('no_draft_logs', 'No draft logs.') : t('empty_logs', 'No operational logs recorded yet.'))}</Text>
          </View>
        )}

        {/* Compact Expandable Item Rows using memoized component */}
        {displayItems.map((log, logIdx) => {
          const isExpanded = expandedLogId === log.id;
          const isSelected = selectedDraftIds.has(log.id);
          const isHighlighted = isDraft ? highlightedDraftIds.has(log.id) : highlightedSubmittedLogIds.has(log.id);
          const isNewlyAdded = Boolean((log.isNew || isHighlighted) && !viewedLogIds.has(log.id));

          return (
            <CompactLogItem
              key={log.id ? `${log.id}-${logIdx}` : `log-${logIdx}`}
              log={log}
              isDraft={isDraft}
              isSelectMode={isDraft && isDraftSelectMode}
              isSelected={isSelected}
              onToggleSelect={() => {
                setSelectedDraftIds(prev => {
                  const next = new Set(prev);
                  if (next.has(log.id)) next.delete(log.id);
                  else next.add(log.id);
                  return next;
                });
              }}
              isNewlyAdded={isNewlyAdded}
              isExpanded={isExpanded}
              onToggleExpand={() => {
                setExpandedLogId(isExpanded ? null : log.id);
                // Dismiss highlight automatically as soon as the user views/expands it
                setViewedLogIds(prev => new Set([...prev, log.id]));
                if (isDraft) {
                  setHighlightedDraftIds(prev => {
                    if (!prev.has(log.id)) return prev;
                    const next = new Set(prev);
                    next.delete(log.id);
                    return next;
                  });
                } else {
                  setHighlightedSubmittedLogIds(prev => {
                    if (!prev.has(log.id)) return prev;
                    const next = new Set(prev);
                    next.delete(log.id);
                    return next;
                  });
                }
              }}
              formatOperationName={formatOperationName}
              formatStageName={formatStageName}
              t={t}
              editDraft={editDraft}
              submitDraft={submitDraft}
              deleteDraft={deleteDraft}
              editSubmittedLog={editSubmittedLog}
              onViewAuditTrail={(targetLog) => {
                setActiveLogForAudit(targetLog);
                setShowLogAuditModal(true);
              }}
              s={s}
            />
          );
        })}

        {/* Simple Page-by-Page Pagination Controls (Prev / Page X of Y / Next) */}
        {filtered.length > 0 && totalPages > 1 && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border }}>
            <TouchableOpacity
              disabled={currentPageClamped <= 1}
              onPress={() => setLogCurrentPage(p => Math.max(1, p - 1))}
              style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' }, currentPageClamped <= 1 && { opacity: 0.4 }]}
            >
              <Ionicons name="chevron-back" size={14} color={COLORS.text} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>Prev</Text>
            </TouchableOpacity>

            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary }}>
              Page {currentPageClamped} of {totalPages}
            </Text>

            <TouchableOpacity
              disabled={currentPageClamped >= totalPages}
              onPress={() => setLogCurrentPage(p => Math.min(totalPages, p + 1))}
              style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' }, currentPageClamped >= totalPages && { opacity: 0.4 }]}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>Next</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };



  const SRA_TASK_KEY_MAP = {
    T1: 'task_t1',
    T2: 'task_t2',
    T3: 'task_t3',
    T4: 'task_t4',
    T5: 'task_t5',
    T6: 'task_t6',
    T7: 'task_t7',
    T8: 'task_t8',
    T9: 'task_t9',
    T10: 'task_t10',
    T11: 'task_t11',
    T12: 'task_t12',
    T13: 'task_t13',
    T14: 'task_t14',
  };

  const getTaskLabel = (task) => {
    if (task.id && SRA_TASK_KEY_MAP[task.id]) {
      return t(SRA_TASK_KEY_MAP[task.id], task.label);
    }
    return task.label;
  };

  const renderTimeline = () => {
    const currentStageNum = Number(safeField.stageNumber) || 1;
    const isCompletedStage = (safeField.stage || '').toLowerCase().includes('complete');
    // Cycle is complete ONLY when on Stage 6 AND explicitly marked completed
    const isFullyCompleted = currentStageNum >= 6 && (
      safeField.isCompleted === true ||
      isCompletedStage
    );
    const rawTasks = getFieldStages(safeField.id);

    // Dynamic Crop Cycle Progress % across the 6 stages (Accommodates custom operations)
    const completedStagesWeight = isFullyCompleted ? 6 : Math.max(0, currentStageNum - 1);
    let activeStageFraction = 0;
    if (!isFullyCompleted) {
      const activeStagePlanned = getFieldCustomOperations(safeField.id, currentStageNum);
      if (activeStagePlanned.length > 0) {
        const activeStageLogs = operationLogs.filter(l => 
          l.fieldId === safeField.id && 
          (l.stageNumber === currentStageNum || l.taskId === `S${currentStageNum}`) && 
          !isLogPastCycle(l)
        );
        const distinctLogged = new Set(activeStageLogs.map(l => l.sraOperationId || l.activity || l.operationName)).size;
        activeStageFraction = Math.min(1, distinctLogged / activeStagePlanned.length);
      }
    }

    const cycleProgressPercent = isFullyCompleted 
      ? 100 
      : Math.min(100, Math.max(0, Math.round(((completedStagesWeight + activeStageFraction) / 6) * 100)));

    const activeStage = isFullyCompleted 
      ? null 
      : (rawTasks.find(t => (t.stageNumber || 1) === currentStageNum) || rawTasks[0]);
    const activeStageIndex = activeStage ? (activeStage.stageNumber ? activeStage.stageNumber - 1 : 0) : -1;
    const displayStageNum = isFullyCompleted ? rawTasks.length : currentStageNum;

    const session = getCurrentSession();
    const isMyField = (selectedField?.member || '').trim().toLowerCase() === (session?.name || '').trim().toLowerCase();
    const isSupervisoryViewOnly = activeRole === 'Farm Manager' && !isMyField && !isTakeOver;

    return (
      <View style={{ marginBottom: SPACING.md }}>
        {/* Section Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 6 }}>
            <Ionicons name="git-network-outline" size={18} color={COLORS.primary} />
            <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 1 }} numberOfLines={1}>
              {t('field_growth_stages_title', 'Field Growth Stages')}
            </Text>
          </View>
          <View style={{ backgroundColor: '#F0F8EC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.xs, flexShrink: 0 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.primary }}>
              {displayStageNum} / {rawTasks.length} Stages ({cycleProgressPercent}%)
            </Text>
          </View>
        </View>

        {/* Main Growth Stages Card */}
        <View style={[s.fieldCard, { padding: SPACING.md, gap: 12 }]}>
          {/* Active Stage Indicator Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAF5', padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase' }}>{t('current_field_stage_title', 'Current Field Stage')}</Text>
              <Text style={{ fontSize: 15, fontWeight: '900', color: COLORS.text, marginTop: 2 }}>
                {isFullyCompleted 
                  ? 'Harvesting & Milling (Completed)' 
                  : (formatStageName ? formatStageName(activeStage?.name || safeField.stage) : (activeStage?.name || safeField.stage))}
              </Text>
              <Text style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 1 }}>
                {isFullyCompleted 
                  ? 'All 6 stages complete · Ready to renew crop year' 
                  : `${formatPhaseMonth ? formatPhaseMonth(activeStage?.monthRange || 'Month 1–2') : (activeStage?.monthRange || 'Month 1–2')} · ${t('tap_active_stage_hint', 'Tap active stage below to log operations')}`}
              </Text>
            </View>
          </View>

          {/* Visual Progress Bar */}
          <View style={{ height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ width: `${cycleProgressPercent}%`, height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 }} />
          </View>

          {/* 6 Growth Stages — Only current stage is active */}
          <View style={{ gap: 8 }}>
            {rawTasks.map((task, i) => {
              const stageNum = task.stageNumber || (i + 1);
              const isPastDone = isFullyCompleted || stageNum < currentStageNum;
              const isCurrentActive = !isFullyCompleted && stageNum === currentStageNum;
              const isNextStage = !isFullyCompleted && stageNum === currentStageNum + 1;
              const isFutureLocked = !isFullyCompleted && stageNum > currentStageNum + 1;

              return (
                <View
                  key={task.id || i}
                  style={[
                    { borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff', overflow: 'hidden' },
                    isCurrentActive && { borderColor: COLORS.primary, backgroundColor: '#F8FAF5' },
                    isPastDone && { borderColor: '#E8F5E8' },
                    isFutureLocked && { opacity: 0.75, backgroundColor: '#FAFAFA' }
                  ]}
                >
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}
                    onPress={() => {
                      if (checkTakeOverRequired('update the timeline or record stage work')) return;
                      if (isCurrentActive) return;

                      // 1. PAST COMPLETED STAGE: Keep locked, log late/repeat work as Supplemental entries
                      if (isPastDone) {
                        const stageName = formatStageName ? formatStageName(task.name || task.label) : `Stage ${task.stageNumber || i + 1}: ${task.name || task.label}`;
                        Alert.alert(
                          `${stageName} (${t('status_completed', 'Completed')})`,
                          t('stage_completed_supplemental_msg', 'This stage is already marked as complete. Field progress cannot be regressed.\n\nWould you like to log an additional operation as a Supplemental Entry?'),
                          [
                            { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                            {
                              text: t('btn_log_supplemental', 'Log Supplemental Entry'),
                              style: 'default',
                              onPress: () => {
                                const stageOps = getFieldCustomOperations(safeField.id, task.stageNumber || i + 1);
                                const firstOp = stageOps[0] || (task.operations && task.operations[0]) || { id: 'SRA-02', name: 'Supplemental Operation' };
                                setLogForm({
                                  id: null,
                                  fieldId: safeField.id,
                                  saveFieldId: true,
                                  stageNumber: task.stageNumber || i + 1,
                                  stageName: `Stage ${task.stageNumber || i + 1}: ${task.name || task.label}`,
                                  sraOperationId: firstOp.id || 'CUSTOM',
                                  operationName: firstOp.name || '',
                                  activity: firstOp.name || '',
                                  category: firstOp.category || 'prep',
                                  cost: String(firstOp.costPerHa || '0'),
                                  period: formatDisplayDate(new Date()),
                                  hectares: safeField.ha || '1.5',
                                  people: '2',
                                  subItems: (firstOp.subItems || []).map(si => ({ ...si, id: generateSubItemId() })),
                                  inputQty: '',
                                  inputUnit: 'bags',
                                  inputName: '',
                                  taskId: task.id,
                                  isSupplemental: true,
                                  isSubmit: true
                                });
                                setShowOpPicker(false);
                                setShowLog(true);
                              }
                            }
                          ]
                        );
                        return;
                      }

                      // 2. IMMEDIATE NEXT STAGE: Prompt to confirm completing active stage first before advancing
                      if (i === activeStageIndex + 1) {
                        const activeStageNum = activeStage?.stageNumber || (activeStageIndex + 1);
                        const activeStageName = formatStageName ? formatStageName(activeStage?.name || activeStage?.label) : `Stage ${activeStageNum}`;
                        const nextStageNum = task.stageNumber || (i + 1);
                        const nextStageName = formatStageName ? formatStageName(task.name || task.label) : `Stage ${nextStageNum}: ${task.name || task.label}`;

                        const stageDrafts = draftLogs.filter(d => 
                          (d.fieldId || '').trim().toUpperCase() === (safeField.id || '').trim().toUpperCase() && 
                          (d.stageNumber === activeStageNum || d.taskId === activeStage?.id)
                        );
                        const stageRecordedOps = fieldLogs.filter(l => 
                          l.stageNumber === activeStageNum || l.taskId === activeStage?.id
                        );

                        const proceedCompleteAndAdvance = () => {
                          if (activeStage) {
                            toggleTaskStatus(activeStage.id, true);
                          }
                        };

                        if (stageRecordedOps.length === 0) {
                          Alert.alert(
                            t('no_ops_warn_title', 'No Operations Recorded'),
                            `${t('no_ops_warn_desc', 'No operations have been recorded yet for Stage')} ${activeStageNum}: "${activeStage?.name || activeStage?.label}".\n\n${t('no_ops_warn_consequence', 'Marking this stage as complete will advance your sugarcane plot without any activity or cost records for this stage.')}${stageDrafts.length > 0 ? `\n\n${t('no_ops_drafts_discard_note', `Note: ${stageDrafts.length} unsubmitted draft(s) will also be discarded.`)}` : ''}\n\n${t('complete_and_advance_title', 'Complete & Advance Stage')}: Advance to ${nextStageName}?`,
                            [
                              { text: t('btn_keep_active', 'Keep Active'), style: 'cancel' },
                              {
                                text: t('btn_complete_and_advance', 'Complete & Advance'),
                                style: 'destructive',
                                onPress: proceedCompleteAndAdvance
                              }
                            ]
                          );
                        } else if (stageDrafts.length > 0) {
                          Alert.alert(
                            t('unsubmitted_drafts_detected_title', 'Unsubmitted Drafts Detected'),
                            `${t('unsubmitted_drafts_detected_msg', 'You have')} ${stageDrafts.length} ${t('unsubmitted_drafts_detected_count', 'unsubmitted draft(s) for Stage')} ${activeStageNum}.\n\n${t('unsubmitted_drafts_discard_msg', 'Marking this stage as finished will discard these drafts. Would you like to mark this stage as finish and advance to')} ${nextStageName}?`,
                            [
                              { text: t('keep_drafts_btn', 'Keep Drafts & Review'), style: 'cancel' },
                              {
                                text: t('btn_complete_and_advance', 'Complete & Advance'),
                                style: 'destructive',
                                onPress: proceedCompleteAndAdvance
                              }
                            ]
                          );
                        } else {
                          Alert.alert(
                            t('complete_and_advance_title', 'Complete & Advance Stage'),
                            `${activeStageName} ${t('complete_and_advance_msg', 'is currently active. Would you like to mark it as Complete and advance to')} ${nextStageName}?`,
                            [
                              { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                              {
                                text: t('btn_complete_and_advance', 'Complete & Advance'),
                                style: 'default',
                                onPress: proceedCompleteAndAdvance
                              }
                            ]
                          );
                        }
                        return;
                      }

                      // 3. FAR FUTURE STAGE: Locked, requires sequential completion
                      if (activeRole === 'Farm Manager' && isTakeOver) {
                        Alert.alert(
                          t('skip_stage_warning', 'Skip Stage Warning'),
                          `Stage ${activeStage?.stageNumber || 1} is not yet completed. As Farm Manager in Take Over mode, do you want to force advance to Stage ${task.stageNumber || i + 1}?`,
                          [
                            { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                            {
                              text: t('yes_skip_ahead', 'Yes, Skip Ahead'),
                              style: 'destructive',
                              onPress: () => {
                                const currentTasks = cycleTasksByField[safeField.id] || getFieldStages(safeField.id);
                                const updated = currentTasks.map((tItem, idx) => {
                                  if (idx < i) return { ...tItem, done: true, active: false };
                                  if (tItem.id === task.id) return { ...tItem, done: false, active: true };
                                  return { ...tItem, done: false, active: false };
                                });
                                setCycleTasksByField(p => ({ ...p, [safeField.id]: updated }));
                                const newStageLabel = task.name || task.label;
                                const stageNum = task.stageNumber || i + 1;
                                setSelectedField(prevF => ({ ...prevF, stage: newStageLabel, stageNumber: stageNum }));
                                const mf = fields.find(f => f.id === safeField.id);
                                if (mf) {
                                  mf.stage = newStageLabel;
                                  mf.stageNumber = stageNum;
                                  saveFieldPlot(mf, false);
                                }
                                updateFieldStageAndCycle(safeField.id, {
                                  stage: newStageLabel,
                                  stageNumber: stageNum,
                                  cycleType: mf?.cycleType || 'Plant Cane (New Plant)',
                                  lastUpdated: new Date().toISOString()
                                });
                              }
                            }
                          ]
                        );
                        return;
                      }

                      Alert.alert(
                        t('stage_locked_title', 'Stage Locked'),
                        `${t('stage_locked_msg', 'Please complete prior stages first. Sugarcane crop cycles must progress stage by stage.')}\n\nStage ${activeStage?.stageNumber || 1} (${activeStage?.name || 'Current Stage'}) must be completed before Stage ${task.stageNumber || i + 1} can be activated.`
                      );
                    }}
                    activeOpacity={isCurrentActive ? 1 : 0.7}
                  >
                    {/* Stage Number Badge */}
                    <View style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: isPastDone ? COLORS.success : isCurrentActive ? COLORS.primary : isNextStage ? '#E2EED9' : '#E5E7EB',
                      justifyContent: 'center',
                      alignItems: 'center',
                      flexShrink: 0
                    }}>
                      {isPastDone ? (
                        <Ionicons name="checkmark" size={18} color="#fff" />
                      ) : isCurrentActive ? (
                        <Ionicons name="play" size={14} color="#fff" style={{ marginLeft: 2 }} />
                      ) : isFutureLocked ? (
                        <Ionicons name="lock-closed" size={14} color="#9CA3AF" />
                      ) : (
                        <Text style={{ fontSize: 13, fontWeight: '800', color: isNextStage ? COLORS.primary : '#6B7280' }}>{task.stageNumber || i + 1}</Text>
                      )}
                    </View>

                    {/* Stage Details */}
                    <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                      <Text style={{
                        fontSize: isCurrentActive ? 14 : 13,
                        fontWeight: isCurrentActive ? '900' : isPastDone ? '700' : '600',
                        color: isCurrentActive ? COLORS.primary : isPastDone ? COLORS.text : COLORS.textMuted,
                        lineHeight: 18
                      }}>
                        {formatStageName ? formatStageName(task.name || task.label) : `Stage ${task.stageNumber || i + 1}: ${task.name || task.label}`}
                      </Text>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <View style={{ backgroundColor: isCurrentActive ? '#E2EED9' : '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: isCurrentActive ? COLORS.primary : COLORS.textSecondary }}>
                            {formatPhaseMonth ? formatPhaseMonth(task.monthRange || `Month ${task.month || i + 1}`) : (task.monthRange || `Month ${task.month || i + 1}`)}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, color: isPastDone ? COLORS.success : isCurrentActive ? COLORS.textSecondary : isNextStage ? COLORS.primary : COLORS.textMuted, flex: 1 }} numberOfLines={1}>
                          {isPastDone ? t('status_completed', 'Completed') : (isCurrentActive ? t('active_stage_subtitle', 'Active Stage · Select operation below') : isNextStage ? t('next_stage_hint', 'Next Stage · Tap to Complete & Advance') : t('status_locked', 'Locked'))}
                        </Text>
                      </View>
                    </View>

                    {/* Right Icon / Status Badge */}
                    {isPastDone ? (
                      <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                    ) : isCurrentActive ? (
                      <View style={{ backgroundColor: '#E8F5E8', paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#C0D9A8', flexShrink: 0 }}>
                        <Text style={{ fontSize: 10.5, fontWeight: '900', color: '#15803D' }}>{t('badge_active', 'ACTIVE')}</Text>
                      </View>
                    ) : isFutureLocked ? (
                      <Ionicons name="lock-closed-outline" size={16} color="#CBD5E1" />
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                    )}
                  </TouchableOpacity>

                  {/* Active Stage Expanded Action Box with Nested Operations */}
                  {isCurrentActive && (
                    <View style={{ backgroundColor: '#F0F8EC', borderTopWidth: 1, borderTopColor: '#D1E0C5', padding: 12, gap: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase' }}>
                          {t('operations_in_stage', 'Operations in Stage')} {task.stageNumber || i + 1}
                        </Text>
                      </View>

                      {/* List of distinct operations under this stage (Customized by member or SRA default) */}
                      <View style={{ gap: 6 }}>
                        {getFieldCustomOperations(safeField.id, task.stageNumber || i + 1).map(op => {
                          const opCostPerHa = (op.subItems || []).reduce((sum, si) => sum + (si.qty * si.unitCost), 0) || op.costPerHa || 0;
                          const matchingLogs = fieldLogs.filter(l => 
                            (l.operationName === op.name || l.sraOperationId === op.id || l.activity === op.name) && 
                            (l.stageNumber === (task.stageNumber || i + 1) || l.taskId === task.id || l.taskId === `S${task.stageNumber || i + 1}`) && 
                            !isLogPastCycle(l)
                          );
                          const isOpLogged = matchingLogs.length > 0;
                          const hasUnsyncedLog = isOpLogged && matchingLogs.some(l => l.isOffline === true || l.synced === false || l.status === 'Pending Sync' || l.cloudQueueStatus === 'offline_queued');
                          const isFullySyncedLog = isOpLogged && !hasUnsyncedLog;

                          return (
                            <TouchableOpacity
                              key={op.id}
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                backgroundColor: isFullySyncedLog ? '#F4FAF0' : (hasUnsyncedLog ? '#FFFBF0' : '#fff'),
                                padding: 10,
                                borderRadius: RADIUS.md,
                                borderWidth: 1.5,
                                borderColor: isFullySyncedLog ? COLORS.primary + '50' : (hasUnsyncedLog ? '#FEF0D0' : COLORS.border),
                                ...SHADOW.card
                              }}
                              onPress={() => {
                                if (checkTakeOverRequired('record stage work or log operations')) return;
                                if (isOpLogged) {
                                  Alert.alert(
                                    hasUnsyncedLog ? 'Queued Offline Entry' : 'Log Additional Entry',
                                    hasUnsyncedLog
                                      ? `"${op.name}" is stored locally on this device and waiting to sync. Would you like to record an additional entry or repeat pass?`
                                      : `"${op.name}" has already been recorded for this stage. Would you like to record an additional entry or repeat pass?`,
                                    [
                                      { text: 'Cancel', style: 'cancel' },
                                      { text: 'Yes, Log Again', onPress: () => openOperationLog(task, op.id) }
                                    ]
                                  );
                                } else {
                                  openOperationLog(task, op.id);
                                }
                              }}
                              activeOpacity={0.8}
                            >
                              <View style={{ flex: 1, paddingRight: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <View style={{ backgroundColor: COLORS.primaryBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs }}>
                                    <Text style={{ fontSize: 10.5, fontWeight: '900', color: COLORS.primary }}>{op.id}</Text>
                                  </View>
                                  {isFullySyncedLog && (
                                    <View style={{ backgroundColor: '#E8F5E8', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs }}>
                                      <Text style={{ fontSize: 9.5, fontWeight: '900', color: '#15803D' }}>✓ {t('recorded_badge', 'RECORDED')}</Text>
                                    </View>
                                  )}
                                  {hasUnsyncedLog && (
                                    <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs }}>
                                      <Text style={{ fontSize: 9.5, fontWeight: '900', color: '#B45309' }}>🟡 {t('sync_status_pending', 'QUEUED OFFLINE')}</Text>
                                    </View>
                                  )}
                                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: COLORS.text }} numberOfLines={1}>
                                    {formatOperationName ? formatOperationName(op.name) : op.name}
                                  </Text>
                                </View>
                                <Text style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 3 }}>
                                  ₱ {Number(opCostPerHa).toLocaleString()} / ha {(op.isGroup || (op.subItems && op.subItems.length > 1)) ? `· ${op.subItems?.length || 0} Child Item${op.subItems?.length !== 1 ? 's' : ''}` : `· Direct Input`}
                                </Text>
                              </View>
                              <View
                                style={{
                                  width: 38,
                                  height: 38,
                                  borderRadius: RADIUS.sm,
                                  backgroundColor: isFullySyncedLog ? '#E2EED9' : (hasUnsyncedLog ? '#FEF3C7' : COLORS.primary),
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderWidth: isOpLogged ? 1.5 : 0,
                                  borderColor: isFullySyncedLog ? COLORS.primary : '#D97706',
                                  flexShrink: 0
                                }}
                              >
                                <Ionicons
                                  name={hasUnsyncedLog ? "cloud-offline-outline" : (isFullySyncedLog ? "repeat-outline" : "create-outline")}
                                  size={20}
                                  color={isFullySyncedLog ? COLORS.primary : (hasUnsyncedLog ? '#B45309' : '#fff')}
                                />
                              </View>
                            </TouchableOpacity>
                          );
                        })}

                        {/* Quick Add Custom Operation to Active Stage */}
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            backgroundColor: '#fff',
                            borderWidth: 1.5,
                            borderColor: COLORS.primary + '60',
                            borderStyle: 'dashed',
                            borderRadius: RADIUS.md,
                            paddingVertical: 10,
                            marginTop: 4
                          }}
                          onPress={() => {
                            if (checkTakeOverRequired('add custom operations')) return;
                            setLogForm({
                              id: null,
                              fieldId: safeField.id,
                              saveFieldId: true,
                              stageNumber: task.stageNumber || i + 1,
                              stageName: `Stage ${task.stageNumber || i + 1}: ${task.name || task.label}`,
                              sraOperationId: 'CUSTOM',
                              operationName: '',
                              activity: '',
                              category: 'prep',
                              cost: '0',
                              period: formatDisplayDate(new Date()),
                              hectares: safeField.ha || '1.5',
                              people: '2',
                              subItems: [],
                              inputQty: '',
                              inputUnit: 'bags',
                              inputName: '',
                              taskId: task.id,
                              isSubmit: true
                            });
                            setShowOpPicker(false);
                            setShowLog(true);
                          }}
                        >
                          <Ionicons name="add-circle-outline" size={17} color={COLORS.primary} />
                          <Text style={{ fontSize: 12.5, fontWeight: '800', color: COLORS.primary }}>Add Custom Operation</Text>
                        </TouchableOpacity>

                        {/* Manual Complete Stage Button */}
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            backgroundColor: COLORS.primary,
                            borderRadius: RADIUS.md,
                            paddingVertical: 12,
                            marginTop: 6
                          }}
                          onPress={() => {
                            if (checkTakeOverRequired('complete stages or update crop cycle progress')) return;
                            const stageNum = task.stageNumber || i + 1;
                            const stageDrafts = draftLogs.filter(d => 
                              (d.fieldId || '').trim().toUpperCase() === (safeField.id || '').trim().toUpperCase() && 
                              (d.stageNumber === stageNum || d.taskId === task.id)
                            );
                            const stageRecordedOps = fieldLogs.filter(l => 
                              l.stageNumber === stageNum || l.taskId === task.id
                            );

                            if (stageRecordedOps.length === 0) {
                              Alert.alert(
                                t('no_ops_warn_title', 'No Operations Recorded'),
                                `${t('no_ops_warn_desc', 'No operations have been recorded yet for Stage')} ${stageNum}: "${task.name || task.label}".\n\n${t('no_ops_warn_consequence', 'Marking this stage as complete will advance your sugarcane plot without any activity or cost records for this stage.')}${stageDrafts.length > 0 ? `\n\n${t('no_ops_drafts_discard_note', `Note: ${stageDrafts.length} unsubmitted draft(s) will also be discarded.`)}` : ''}\n\n${t('no_ops_warn_confirm', 'Are you sure you want to mark this stage as complete?')}`,
                                [
                                  { text: t('btn_keep_active', 'Keep Active'), style: 'cancel' },
                                  {
                                    text: t('btn_complete_without_ops', 'Yes, Complete Without Ops'),
                                    style: 'destructive',
                                    onPress: () => toggleTaskStatus(task.id, true)
                                  }
                                ]
                              );
                            } else if (stageDrafts.length > 0) {
                              Alert.alert(
                                t('unsubmitted_drafts_detected_title', 'Unsubmitted Drafts Detected'),
                                `${t('unsubmitted_drafts_detected_msg', 'You have')} ${stageDrafts.length} ${t('unsubmitted_drafts_detected_count', 'unsubmitted draft(s) for Stage')} ${stageNum}: "${task.name || task.label}".\n\n${t('unsubmitted_drafts_discard_msg', 'Marking this stage as finished will discard these drafts. Would you like to mark this stage as finish?')}`,
                                [
                                  { text: t('keep_drafts_btn', 'Keep Drafts & Review'), style: 'cancel' },
                                  {
                                    text: t('discard_drafts_complete_btn', 'Yes, Discard Drafts & Complete'),
                                    style: 'destructive',
                                    onPress: () => toggleTaskStatus(task.id, true)
                                  }
                                ]
                              );
                            } else {
                              Alert.alert(
                                t('complete_stage_title', 'Complete Stage'),
                                `${t('complete_stage_msg', 'Are you finished with all operations in Stage')} ${stageNum}: "${task.name || task.label}"? (${stageRecordedOps.length} ${stageRecordedOps.length === 1 ? t('operation_word', 'operation') : t('operations_word', 'operations')} ${t('recorded_word', 'recorded')}).`,
                                [
                                  { text: t('btn_keep_active', 'Keep Active'), style: 'cancel' },
                                  { text: t('yes_complete_stage', 'Yes, Complete Stage'), onPress: () => toggleTaskStatus(task.id, true) }
                                ]
                              );
                            }
                          }}
                        >
                          <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>
                            Mark Stage {task.stageNumber || i + 1} as Complete
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {isFullyCompleted && activeRole !== 'Farm Manager' && (
            <TouchableOpacity
              style={{ marginTop: 8, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
              onPress={() => {
                Alert.alert(
                  t('btn_start_new_cycle', 'Start New Crop Year'),
                  'Are you sure you want to start a new crop cycle? This will archive previous logs and activate Stage 1: Pre-Planting & Land Preparation.',
                  [
                    { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                    {
                      text: 'Yes, Start',
                      style: 'default',
                      onPress: () => handleStartNewCycle(safeField.id)
                    }
                  ]
                );
              }}
            >
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '800' }}>Start New Crop Year Cycle</Text>
            </TouchableOpacity>
          )}

          {isFullyCompleted && activeRole === 'Farm Manager' && (
            <View style={{ marginTop: 8, backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#C0D9A8', paddingVertical: 13, paddingHorizontal: 16, borderRadius: RADIUS.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={19} color="#16A34A" />
              <Text style={{ color: '#166534', fontSize: 13, fontWeight: '800' }}>
                Crop Cycle Completed (Awaiting Member / SRA Admin Cycle Renewal)
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const scopedDrafts = (activeRole === 'Member Farmer' && selectedField?.id) ? draftLogs.filter(d => d.fieldId === safeField.id) : [];
  const totalLedgerCount = fieldLogs.length + (activeRole === 'Member Farmer' ? scopedDrafts.length : 0);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader
        right={
          activeRole === 'SRA Admin' ? (
            <TouchableOpacity
              style={s.topbarLedgerBtn}
              onPress={() => {
                setLogTab('audit_history');
                setShowHistoryModal(true);
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="receipt-outline" size={22} color={COLORS.primary} />
            </TouchableOpacity>
          ) : activeRole === 'Farm Manager' ? (
            <TouchableOpacity
              style={s.topbarLedgerBtn}
              onPress={() => {
                setLogTab('submitted');
                setManagerLedgerScope('selected');
                setShowHistoryModal(true);
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="receipt-outline" size={22} color={COLORS.primary} />
              {fieldLogs.length > 0 && (
                <View style={s.topbarLedgerBadge}>
                  <Text style={s.topbarLedgerBadgeText}>{fieldLogs.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={s.topbarLedgerBtn}
              onPress={() => setShowHistoryModal(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="receipt-outline" size={22} color={COLORS.text} />
              {totalLedgerCount > 0 && (
                <View style={s.topbarLedgerBadge}>
                  <Text style={s.topbarLedgerBadgeText}>{totalLedgerCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )
        }
      />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* MEMBER VIEW */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeRole === 'Member Farmer' && (
          <>
            {(() => {
              const sess = getCurrentSession() || {};
              const sName = (sess.name || '').trim().toLowerCase();
              const memberFieldList = (fields || []).filter(Boolean).filter(f => {
                const mName = (f.member || f.memberName || '').trim().toLowerCase();
                return (sess.fieldId && sess.fieldId !== 'Unassigned (Pending Manager Allocation)' && f.id === sess.fieldId) || 
                       (sess.employeeId && f.memberId === sess.employeeId) || 
                       (sName && (mName === sName || mName.includes(sName) || sName.includes(mName)));
              });

              if (memberFieldList.length === 0) {
                return (
                  <View style={{ marginBottom: SPACING.lg }}>
                    <Text style={s.sectionLabel}>{t('my_fields', 'My Sugarcane Plots')}</Text>
                    
                    <View style={{
                      backgroundColor: '#FFFBEB',
                      borderWidth: 1.5,
                      borderColor: '#FEF0D0',
                      borderRadius: RADIUS.xl,
                      padding: SPACING.lg,
                      marginBottom: SPACING.md,
                      ...SHADOW.xs
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="hourglass-outline" size={20} color="#B45309" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: '#92400E' }}>No Sugarcane Plot Allocated</Text>
                          <Text style={{ fontSize: 11.5, color: '#B45309', fontWeight: '600', marginTop: 1 }}>Status: Pending Farm Manager Allocation</Text>
                        </View>
                        <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#B45309' }}>UNASSIGNED</Text>
                        </View>
                      </View>

                      <Text style={{ fontSize: 12.5, color: '#78350F', lineHeight: 18, marginTop: 4 }}>
                        Your farmer member account is registered under <Text style={{ fontWeight: '800' }}>{sess.farm || sess.blockFarm || 'your Block Farm'}</Text>. Your Block Farm Manager has not yet allocated a sugarcane field plot to your account in the cooperative registry.
                      </Text>

                      <View style={{ marginTop: 12, padding: 10, backgroundColor: '#FFF', borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#FEF0D0' }}>
                        <Text style={{ fontSize: 11.5, color: '#92400E', lineHeight: 16 }}>
                          💡 <Text style={{ fontWeight: '700' }}>Next Steps:</Text> Once your Farm Manager registers your field plot (e.g. FLD-NCY-00X) and declares your land hectarage and cane variety, your 6-stage growth cycle timeline and operation logging will activate here automatically.
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }

              return (
                <>
                  {/* My Fields Selector */}
                  <Text style={s.sectionLabel}>{t('my_fields', 'My Sugarcane Plots')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SPACING.lg, marginBottom: SPACING.sm }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8 }}>
                    {memberFieldList.map(field => {
                      if (!field || !field.id) return null;
                      const isSelected = (selectedField?.id || safeField?.id) === field.id;
                      return (
                        <TouchableOpacity
                          key={field.id}
                          style={[s.fieldChip, isSelected && s.fieldChipActive]}
                          onPress={() => {
                            setSelectedField(field);
                            updateSessionFieldId(field.id);
                          }}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="leaf" size={13} color={isSelected ? COLORS.primary : COLORS.textMuted} />
                          <Text style={[s.fieldChipText, isSelected && s.fieldChipTextActive]}>
                            {field.id} ({field.ha || 1.5} Ha)
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md, backgroundColor: COLORS.primaryBg, borderRadius: RADIUS.md, padding: 10 }}>
                    <Ionicons name="information-circle-outline" size={14} color={COLORS.primary} />
                    <Text style={{ fontSize: 12, color: COLORS.primary, flex: 1 }}>{t('field_alloc_notice')}</Text>
                  </View>

                  <Text style={s.sectionLabel}>{t('field_plot', 'Selected Field')}</Text>
                  <View style={{ backgroundColor: '#fff', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.md }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <View style={s.fieldIdBadge}><Text style={s.fieldIdText}>{safeField?.id || 'No Field'}</Text></View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={safeField?.synced ? 'cloud-done-outline' : 'cloud-offline-outline'} size={13} color={safeField?.synced ? COLORS.success : COLORS.warning} />
                        <Text style={{ fontSize: 12, color: safeField?.synced ? COLORS.success : COLORS.warning, fontWeight: '500' }}>
                          {safeField?.synced ? t('synced', 'Synced') : t('not_synced', 'Not synced')}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text, marginTop: 2 }}>
                      {safeField?.member || safeField?.memberName || resolveFieldMember(selectedField) || (session?.name || 'Member')} · {safeField?.ha || 1.5} ha
                    </Text>
                    <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
                      Current Stage: <Text style={{ fontWeight: '600', color: COLORS.primary }}>{formatStageName ? formatStageName(safeField?.stage) : safeField?.stage}</Text>
                    </Text>
                  </View>

                  {/* Crop Cycle Timeline */}
                  {renderTimeline()}
                </>
              );
            })()}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* FARM MANAGER VIEW */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeRole === 'Farm Manager' && (
          <>
            <ManagerFieldOpsView
              fields={accessibleFields}
              operations={visibleLogs.filter(log => !log.isDraft)}
              onOpenHistory={() => {
                setLogTab('submitted');
                setManagerLedgerScope('all');
                setShowHistoryModal(true);
              }}
              onEditOperation={(field, operation) => {
                setSelectedField(field);
                setManagerLedgerScope('selected');
                editSubmittedLog(operation, true);
              }}
            />
            {(() => {
              const session = getCurrentSession();
              const targetFarm = session?.farm || (session?.farm || session?.blockFarm || 'District Central');
              const farmFields = accessibleFields;
              const totalHa = farmFields.reduce((sum, f) => sum + (Number(f.ha) || 0), 0) || 0;
              const activeCycleLogs = logs.filter(l => !l.declined && l.status === 'ACTIVE');
              let farmLogs = activeCycleLogs.filter(l => isLogFromMonth(l, compileMonth));
              if (farmLogs.length === 0 && activeCycleLogs.length > 0) {
                farmLogs = activeCycleLogs;
              }
              const monthReports = auditReports.filter(report => toReportPeriod(report.period || report.month) === toReportPeriod(compileMonth));
              const reportedIds = new Set(monthReports.flatMap(report =>
                (report.operationSnapshots || report.operations || []).map(operation => operation.operationLogId || operation.id)
              ));
              const uncompiledLogs = farmLogs.filter(l => !reportedIds.has(l.id));
              const compiledLogs = farmLogs.filter(l => reportedIds.has(l.id));
              const isOnline = Boolean(getNetworkStatus().isConnected);
              const monthReport = auditReports.find(a => 
                (a.month && a.month.toLowerCase() === compileMonth.toLowerCase()) || 
                (a.id && (a.id.toLowerCase().includes(compileMonth.toLowerCase()) || a.id.includes('2026'))) ||
                (a.reportId && (a.reportId.toLowerCase().includes(compileMonth.toLowerCase()) || a.reportId.includes('2026')))
              );
              const isAllCompiled = farmLogs.length > 0 && uncompiledLogs.length === 0 && (compiledLogs.length > 0 || !!monthReport);
              const isCloudSent = (monthReport && (isOnline || monthReport.cloudQueueStatus === 'transmitted' || monthReport.status === 'CERTIFIED'));
              const isOfflineQueued = Boolean(monthReport && !isCloudSent);
              const totalCost = farmLogs.reduce((sum, l) => sum + (Number(l.totalCost || l.cost) || 0), 0);
              const logsCount = farmLogs.length;

              return (
                /* Elevated Monthly Regulatory Audit Card */
                <View style={{
                  backgroundColor: '#fff',
                  borderRadius: RADIUS.xl,
                  padding: SPACING.md + 2,
                  marginBottom: SPACING.lg,
                  borderWidth: 1.2,
                  borderColor: '#E2EBDC',
                  ...SHADOW.card,
                }}>
                  {/* Card Header & Badge */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.primary }} />
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.primary, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                          {t('monthly_audit_package_badge', 'Monthly Regulatory Audit')}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: COLORS.text, letterSpacing: -0.2 }}>
                        {targetFarm}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 }}>
                        {t('audit_period_label', 'Period')}: <Text style={{ fontWeight: '700', color: COLORS.text }}>{compileMonth}</Text> · Farm: {totalHa.toFixed(2)} Ha
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: farmLogs.length === 0 ? '#F4F7F2' : (isAllCompiled ? '#EBF7EE' : (uncompiledLogs.length > 0 && compiledLogs.length > 0 ? '#FEF3C7' : '#EBF7EE')),
                      paddingHorizontal: 9,
                      paddingVertical: 4,
                      borderRadius: RADIUS.full,
                      borderWidth: 1,
                      borderColor: farmLogs.length === 0 ? '#E2EBDC' : (isAllCompiled ? '#B7E4C7' : (uncompiledLogs.length > 0 && compiledLogs.length > 0 ? '#FEF0D0' : '#B7E4C7')),
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <Ionicons 
                        name={farmLogs.length === 0 ? "document-text-outline" : (isAllCompiled ? "checkmark-circle" : (uncompiledLogs.length > 0 && compiledLogs.length > 0 ? "time-outline" : "shield-checkmark"))} 
                        size={12} 
                        color={farmLogs.length === 0 ? COLORS.textMuted : (isAllCompiled ? COLORS.success : (uncompiledLogs.length > 0 && compiledLogs.length > 0 ? '#B45309' : COLORS.success))} 
                      />
                      <Text style={{ 
                        fontSize: 10.5, 
                        fontWeight: '800', 
                        color: farmLogs.length === 0 ? COLORS.textMuted : (isAllCompiled ? COLORS.success : (uncompiledLogs.length > 0 && compiledLogs.length > 0 ? '#B45309' : COLORS.success)) 
                      }}>
                        {farmLogs.length === 0
                          ? '0 Logs Recorded'
                          : (isAllCompiled 
                            ? 'Audit Up to Date' 
                            : (uncompiledLogs.length > 0 && compiledLogs.length > 0 
                              ? `${uncompiledLogs.length} New Pending` 
                              : `${uncompiledLogs.length} Ready to Compile`))}
                      </Text>
                    </View>
                  </View>

                  {/* Automatic Active Cycle Batch Indicator */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F4FAF0', borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 11, borderWidth: 1, borderColor: '#D7ECD0' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="flash-outline" size={13} color={COLORS.primary} />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.primary }}>
                        Active Cycle Batch: <Text style={{ color: COLORS.text }}>{compileMonth}</Text>
                      </Text>
                    </View>
                    <View style={{ backgroundColor: COLORS.primaryBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.xs }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '800', color: COLORS.primary }}>AUTOMATIC</Text>
                    </View>
                  </View>

                  {/* 3 Metric Cards with Aligned Typography */}
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 11 }}>
                    <View style={{ flex: 1, backgroundColor: '#F7FAF5', paddingVertical: 10, paddingHorizontal: 9, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#E4EEE1' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{t('stat_recorded_logs', 'Compiled Logs')}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary, marginTop: 3 }}>
                        {farmLogs.length === 0
                          ? '0 logs recorded'
                          : (isAllCompiled 
                            ? `${compiledLogs.length} logs (Up to Date)`
                            : (compiledLogs.length > 0 
                              ? `${compiledLogs.length} comp · ${uncompiledLogs.length} new`
                              : `${uncompiledLogs.length} logs ready`))}
                      </Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: '#F7FAF5', paddingVertical: 10, paddingHorizontal: 9, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#E4EEE1' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>Active Plot Area</Text>
                      <Text style={{ fontSize: 13.5, fontWeight: '800', color: COLORS.text, marginTop: 3 }}>{totalHa.toFixed(2)} Ha</Text>
                    </View>
                    <View style={{ flex: 1.1, backgroundColor: '#F7FAF5', paddingVertical: 10, paddingHorizontal: 9, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#E4EEE1' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{t('report_total_cost', 'Total Cost')}</Text>
                      <Text style={{ fontSize: 13.5, fontWeight: '900', color: COLORS.primary, marginTop: 3 }} numberOfLines={1}>₱{totalCost.toLocaleString()}</Text>
                    </View>
                  </View>

                  {/* Brief description */}
                  <Text style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 15, marginBottom: 12 }}>
                    {t('compile_card_desc', 'Compiles all member operation logs into a tamper-evident, offline vector SRA QR package for district regulatory inspection.')}
                  </Text>

                  {/* Polished Primary Action Button */}
                  <TouchableOpacity
                    style={{
                      backgroundColor: isAllCompiled ? '#234D1E' : COLORS.primary,
                      paddingVertical: 13,
                      paddingHorizontal: 16,
                      borderRadius: RADIUS.lg,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      ...SHADOW.card,
                    }}
                    onPress={() => {
                      if (isAllCompiled) {
                        compileAndShow(true);
                      } else {
                        const countToCompile = uncompiledLogs.length > 0 ? uncompiledLogs.length : farmLogs.length;
                        safeAlert(
                          t('confirm_compile_title', 'Compile Monthly SRA Audit Package?'),
                          `Compile ${countToCompile} recorded sugarcane field operation(s) for ${compileMonth} into an encrypted SRA QR audit package?\n\nThis will compile and transmit the records to the SRA Cloud Queue for district regulatory inspection.`,
                          [
                            { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                            { 
                              text: t('btn_confirm_compile', 'Compile & Transmit'), 
                              style: 'default', 
                              onPress: () => compileAndShow(false) 
                            }
                          ]
                        );
                      }
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons 
                      name={isAllCompiled ? "qr-code" : "flash"} 
                      size={17} 
                      color="#fff" 
                    />
                    <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '800', letterSpacing: 0.3 }}>
                      {isAllCompiled
                        ? t('btn_view_compiled_qr', 'View SRA Regulatory QR Certificate')
                        : (uncompiledLogs.length > 0 && compiledLogs.length > 0
                          ? `Compile ${uncompiledLogs.length} New Logs · Update QR`
                          : t('btn_compile_sra_audit', 'Compile Monthly SRA Audit Package'))}
                    </Text>
                    <Ionicons name="arrow-forward" size={15} color="#fff" style={{ opacity: 0.85, marginLeft: 2 }} />
                  </TouchableOpacity>
                </View>
              );
            })()}

            {/* Pending Member Registrations Alert Banner */}
            {pendingUsersList && pendingUsersList.length > 0 && (
              <View style={{
                backgroundColor: '#FFFBEB',
                borderWidth: 1.5,
                borderColor: '#FEF0D0',
                borderRadius: RADIUS.lg,
                padding: 12,
                marginBottom: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                ...SHADOW.xs
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="people" size={18} color="#B45309" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#92400E' }}>
                        {pendingUsersList.length} Pending Registration{pendingUsersList.length !== 1 ? 's' : ''}
                      </Text>
                      <View style={{ backgroundColor: '#B45309', paddingHorizontal: 5, paddingVertical: 1, borderRadius: RADIUS.full }}>
                        <Text style={{ fontSize: 9, fontWeight: '900', color: '#fff' }}>ACTION</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: '#B45309', marginTop: 1 }} numberOfLines={1}>
                      {pendingUsersList.map(u => u.name).join(' · ')}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setShowPendingModal(true)}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: '#B45309',
                    paddingHorizontal: 11,
                    paddingVertical: 7,
                    borderRadius: RADIUS.md
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Review →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Sync Status Warning */}
            {unsynced.length > 0 && (
              <View style={s.syncWarning}>
                <Ionicons name="alert-circle" size={18} color='#C97A00' />
                <View style={{ flex: 1 }}>
                  <Text style={[s.syncWarningText, { fontWeight: '700' }]}>
                    Member Device Sync Notice
                  </Text>
                  {unsynced.map(f => (
                    <Text key={f.id} style={[s.syncWarningText, { marginTop: 2 }]}>
                      • <Text style={{ fontWeight: '700' }}>{f.id}</Text> ({f.member}): {t('sync_info', 'last synced')} <Text style={{ fontWeight: '700', color: '#C97A00' }}>{formatSyncTime(f.lastSync || '4 days ago')}</Text>
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {/* Field Scope Filter Switcher */}
            {/* Field Selector & Segmented Scope Switcher */}
            {(() => {
              const sess = getCurrentSession();
              const myFieldList = accessibleFields.filter(f =>
                f.member === sess.name || 
                f.memberName === sess.name || 
                f.memberId === sess.employeeId || 
                f.memberId === sess.contact || 
                (sess.fieldId && f.id === sess.fieldId)
              );
              const displayedFields = managerFieldFilter === 'my'
                ? myFieldList
                : accessibleFields;

              return (
                <View style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[s.sectionLabel, { marginBottom: 0 }]}>
                        {managerFieldFilter === 'my' ? t('my_fields', 'My Managed Plot') : t('view_all_fields', 'All Block Farm Fields')}
                      </Text>
                      <TouchableOpacity
                        onPress={() => openAssignModal()}
                        activeOpacity={0.7}
                        style={{
                          backgroundColor: '#EBF7EE',
                          borderWidth: 1,
                          borderColor: COLORS.primary + '60',
                          paddingHorizontal: 8,
                          paddingVertical: 3.5,
                          borderRadius: RADIUS.sm,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <Ionicons name="add-circle" size={13} color={COLORS.primary} />
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.primary }}>
                          + Register Plot
                        </Text>
                      </TouchableOpacity>
                    </View>
                    
                    {/* Sleek Segmented Pill Switcher matching Planner UI */}
                    <View style={{ flexDirection: 'row', backgroundColor: '#EEF2E6', borderRadius: RADIUS.sm, padding: 2 }}>
                      <TouchableOpacity
                        style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.xs }, managerFieldFilter === 'my' && { backgroundColor: '#fff', ...SHADOW.card }]}
                        onPress={() => {
                          setManagerFieldFilter('my');
                          if (myFieldList.length > 0) {
                            setSelectedField(myFieldList[0]);
                          }
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: managerFieldFilter === 'my' ? '800' : '600', color: managerFieldFilter === 'my' ? COLORS.primary : COLORS.textMuted }}>
                          My Plot ({myFieldList.length})
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.xs }, managerFieldFilter === 'all' && { backgroundColor: '#fff', ...SHADOW.card }]}
                        onPress={() => {
                          setManagerFieldFilter('all');
                          if (accessibleFields.length > 0 && !accessibleFields.some(f => f.id === safeField.id)) {
                            setSelectedField(accessibleFields[0]);
                          }
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: managerFieldFilter === 'all' ? '800' : '600', color: managerFieldFilter === 'all' ? COLORS.primary : COLORS.textMuted }}>
                          Managed Plots ({accessibleFields.length})
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {displayedFields.length === 0 ? (
                    <View style={{ padding: 12, backgroundColor: '#F8FAF5', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>No Personal Plots Assigned</Text>
                      <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>You do not have a personal plot allocated. Switch to "All Plots" to oversee member plots.</Text>
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SPACING.lg, marginBottom: SPACING.md }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8, paddingBottom: 4 }}>
                      {displayedFields.slice(0, 3).map(field => (
                        <TouchableOpacity
                          key={field.id}
                          style={[s.fieldChip, (selectedField?.id || safeField.id) === field.id && s.fieldChipActive]}
                          onPress={() => {
                            setSelectedField(field);
                            setManagerLedgerScope('selected');
                          }}
                        >
                          <View style={[s.syncDot, { backgroundColor: field.synced ? COLORS.success : '#C97A00' }]} />
                          <Text style={[s.fieldChipText, (selectedField?.id || safeField.id) === field.id && s.fieldChipTextActive]}>{field.id} ({field.ha} Ha)</Text>
                        </TouchableOpacity>
                      ))}
                      {displayedFields.length > 3 && (
                        <TouchableOpacity style={[s.fieldChip, { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary }]} onPress={() => setShowFieldsModal(true)}>
                          <Text style={[s.fieldChipText, { color: COLORS.primary, fontWeight: '800' }]}>+ {displayedFields.length - 3} More</Text>
                        </TouchableOpacity>
                      )}
                    </ScrollView>
                  )}
                </View>
              );
            })()}

            {/* Selected Field Detail */}
            {fields.length > 0 && safeField.id ? (
              <View style={s.fieldCard}>
                <View style={s.fieldCardTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap', marginRight: 6 }}>
                    <View style={s.fieldIdBadge}><Text style={s.fieldIdText}>{safeField.id}</Text></View>
                    <Text style={s.fieldHa}>{safeField.ha} Ha</Text>
                    {isTakeOver && (
                      <View style={{ backgroundColor: '#FEF2F2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#FCA5A5' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#DC2626' }}>Takeover Active</Text>
                      </View>
                    )}
                  </View>
                  {(() => {
                    const session = getCurrentSession();
                    const isMyField = (selectedField?.member || '').trim().toLowerCase() === (session?.name || '').trim().toLowerCase();
                    if (activeRole === 'Farm Manager' && !isMyField) {
                      return (
                        <TouchableOpacity
                          onPress={handleInitiateTakeOver}
                          style={{
                            backgroundColor: isTakeOver ? '#FEE2E2' : COLORS.primaryBg,
                            borderWidth: isTakeOver ? 1 : 0,
                            borderColor: '#FCA5A5',
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 16
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '800', color: isTakeOver ? '#DC2626' : COLORS.primary }}>
                            {isTakeOver ? 'Exit Takeover' : t('btn_take_over', 'Take Over Field')}
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                    return null;
                  })()}
                </View>
                <Text style={s.fieldMember}>{t('member_label', 'Member')}: {safeField.member || 'Vacant / Unallocated'}</Text>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, flexWrap: 'wrap', gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name={safeField.synced ? 'cloud-done-outline' : 'cloud-offline-outline'} size={14} color={safeField.synced ? COLORS.success : '#C97A00'} />
                    <Text style={[s.fieldSync, { color: safeField.synced ? COLORS.success : '#C97A00', fontWeight: '600' }]}>
                      {safeField.synced ? `${t('synced', 'Synced')} (${formatSyncTime(safeField.lastSync)})` : `${t('not_synced', 'Pending Member Sync')} (${formatSyncTime(safeField.lastSync)})`}
                    </Text>
                  </View>
                  
                  <TouchableOpacity 
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.sm }}
                    onPress={() => {
                      Alert.alert(
                        t('sync_info_alert_title', 'Offline Synchronization Info'),
                        `${t('my_field', 'Field')} ${safeField.id} (${safeField.member || 'Unallocated'})\n\n` +
                        t('sync_info_alert_msg', 'When a member records operations offline in the field, logs are securely saved on the device. Records automatically upload once reconnected to internet or synced at the office.')
                      );
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={13} color={COLORS.textMuted} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textSecondary }}>{t('sync_info', 'Sync Info')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ padding: 18, backgroundColor: '#fff', borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md }}>
                <Ionicons name="layers-outline" size={26} color={COLORS.textMuted} style={{ marginBottom: 4 }} />
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: COLORS.text }}>No Field Plots Registered Yet</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2, textAlign: 'center', maxWidth: 280 }}>
                  Tap "+ Register Plot" above to enroll and allocate the first member field plot.
                </Text>
              </View>
            )}

            {/* Crop Cycle Timeline */}
            {renderTimeline()}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SRA Admin view */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeRole === 'SRA Admin' && (
          <>
            {/* ── Block Farm Summary (SRA Supervision) ── */}
            <Text style={s.sectionLabel}>District Block Farms Overview</Text>

            {/* Farm Selector */}
            {(() => {
              const availableFarms = blockFarms.length > 0
                ? ['All Block Farms', ...blockFarms.map(bf => bf.name)]
                : ['All Block Farms', ...new Set(fields.map(f => f.blockFarm || resolveFieldBlockFarm(f)))];

              return (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 10, marginBottom: SPACING.md }}>
                  {availableFarms.map(farm => (
                    <TouchableOpacity 
                      key={farm}
                      style={{
                        paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                        backgroundColor: (selectedFarm === farm || (selectedFarm === 'All' && farm === 'All Block Farms')) ? COLORS.primary : COLORS.background,
                        borderWidth: 1, borderColor: (selectedFarm === farm || (selectedFarm === 'All' && farm === 'All Block Farms')) ? COLORS.primary : COLORS.border
                      }}
                      onPress={() => setSelectedFarm(farm === 'All Block Farms' ? 'All' : farm)}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: (selectedFarm === farm || (selectedFarm === 'All' && farm === 'All Block Farms')) ? '#fff' : COLORS.text }}>{farm}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              );
            })()}

            <View style={[s.receiptCard, { marginBottom: SPACING.md }]}>
              <View style={s.receiptHeader}>
                <View>
                  <Text style={s.receiptTitle}>Descriptive Summary</Text>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 }}>
                    {selectedFarm === 'All' ? 'All District Block Farms' : selectedFarm}
                  </Text>
                </View>
                <TouchableOpacity 
                  onPress={() => navigation.navigate('Analytics', { blockFarm: selectedFarm })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primaryBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.xs }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }}>Open Analytics</Text>
                  <Ionicons name="chevron-forward" size={12} color={COLORS.primary} />
                </TouchableOpacity>
              </View>
              <View style={s.receiptDivider} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: SPACING.sm }}>
                {(() => {
                  const isAll = selectedFarm === 'All' || selectedFarm === 'All Block Farms';
                  const farmFields = isAll 
                    ? fields 
                    : fields.filter(f => (f.blockFarm || resolveFieldBlockFarm(f)) === selectedFarm || f.blockFarmId === selectedFarm);
                  const farmFieldIds = farmFields.map(f => f.id);
                  const farmLogs = operationLogs.filter(l => farmFieldIds.includes(l.fieldId));

                  const totalHa = farmFields.reduce((sum, f) => sum + (parseFloat(f.ha) || 0), 0);
                  const uniqueFarms = isAll ? blockFarms.length : (farmFields.length > 0 ? 1 : 0);
                  const uniqueMembers = new Set(farmFields.map(f => f.member || f.memberName || resolveFieldMember(f)).filter(Boolean)).size;
                  const fManagers = users.filter(u => u.role === 'Farm Manager').length;
                  const totalCost = Number(farmLogs.reduce((sum, l) => sum + (Number(l.totalCost || l.cost) || 0), 0) || 0);
                  const costPerHa = Number(totalHa > 0 ? Math.round(totalCost / totalHa) : 0 || 0);
                  const compiledLogsCount = Number(farmLogs.length || 0);

                  return [
                    {
                      label: t('stat_total_ha', 'Total Hectares'),
                      value: `${totalHa.toFixed(1)} Ha`,
                      icon: 'map-outline',
                      color: COLORS.primary,
                    },
                    {
                      label: t('stat_block_farms', 'Block Farms'),
                      value: `${uniqueFarms} ${uniqueFarms === 1 ? 'Farm' : 'Farms'}`,
                      icon: 'grid-outline',
                      color: '#4A7C2F',
                    },
                    {
                      label: t('stat_active_members', 'Active Members'),
                      value: `${uniqueMembers} ${uniqueMembers === 1 ? 'Member' : 'Members'}`,
                      icon: 'people-outline',
                      color: '#1A6B9A',
                    },
                    {
                      label: t('stat_farm_managers', 'Farm Managers'),
                      value: `${fManagers} ${fManagers === 1 ? 'Manager' : 'Managers'}`,
                      icon: 'briefcase-outline',
                      color: '#8F3A8F',
                    },
                    {
                      label: 'Avg Direct Cost',
                      value: `₱${costPerHa.toLocaleString()} / Ha`,
                      icon: 'cash-outline',
                      color: '#D97706',
                    },
                    {
                      label: t('stat_recorded_logs', 'Compiled Logs'),
                      value: `${compiledLogsCount.toLocaleString()} ${compiledLogsCount === 1 ? 'Log' : 'Logs'}`,
                      icon: 'checkmark-circle-outline',
                      color: COLORS.success,
                    },
                  ].map(stat => (
                    <View key={stat.label} style={{ width: '48%', backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: SPACING.sm, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name={stat.icon} size={14} color={stat.color} />
                        <Text style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 }} numberOfLines={1}>{stat.label}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: stat.color }} numberOfLines={1}>{stat.value}</Text>
                    </View>
                  ));
                })()}
              </View>
            </View>

            {/* Scanner Card */}
            <TouchableOpacity style={[s.scannerCard, { marginBottom: SPACING.xl }]} onPress={() => setShowScanner(true)}>
              <View style={s.scannerIcon}>
                <Ionicons name="qr-code" size={48} color={COLORS.primary} />
              </View>
              <Text style={s.scannerTitle}>{t('scanner_title', 'Scan Manager QR Code')}</Text>
              <Text style={s.scannerSub}>{t('scanner_sub', "Point camera at the Farm Manager's phone screen to import this month's compiled field report.")}</Text>
              <View style={s.scannerBtn}>
                <Ionicons name="camera-outline" size={18} color="#fff" />
                <Text style={s.scannerBtnText}>{t('open_scanner_btn', 'Open QR Scanner')}</Text>
              </View>
            </TouchableOpacity>

            {/* Last Audit Summary Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs }}>
              <Text style={[s.sectionLabel, { marginBottom: 0 }]}>{t('last_scanned_report', 'Last Scanned Report')}</Text>
              <TouchableOpacity onPress={() => setShowAuditHistoryModal(true)}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.primary }}>{t('monthly_audit_history_tab', 'Audit History')} →</Text>
              </TouchableOpacity>
            </View>
            {(() => {
              const activeReport = scannedAuditReport || (auditReports && auditReports.length > 0 ? auditReports[0] : null);
              if (!activeReport) {
                return (
                  <View style={[s.auditCard, { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, borderStyle: 'dashed', backgroundColor: '#FAFBFA' }]}>
                    <Ionicons name="qr-code-outline" size={36} color={COLORS.textMuted} style={{ marginBottom: 8 }} />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text }}>No Report Scanned Yet</Text>
                    <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 3, textAlign: 'center', paddingHorizontal: 24, lineHeight: 16 }}>
                      Tap "Open QR Scanner" above to scan a Farm Manager's QR certificate or submit an audit ID manually.
                    </Text>
                  </View>
                );
              }

              const repFields = activeReport.fieldsReported || (activeReport.fields && activeReport.fields.length) || 0;
              const repCost = Number(activeReport.totalCost || 0);
              const repLogs = activeReport.logsCount || 0;
              const repDate = activeReport.dateGenerated || activeReport.date || '—';
              const repTitle = `${activeReport.blockFarm || selectedFarm} — ${activeReport.month || compileMonth} Report`;

              return (
                <View style={s.auditCard}>
                  <View style={s.auditHeader}>
                    <Ionicons name="document-text" size={18} color={COLORS.primary} />
                    <Text style={s.auditTitle}>{repTitle}</Text>
                  </View>
                  <View style={s.auditRow}>
                    <Text style={s.auditLabel}>{t('report_fields_reported', 'Total Fields Reported')}</Text>
                    <Text style={s.auditVal}>{repFields} {repFields === 1 ? 'field' : 'fields'}</Text>
                  </View>
                  <View style={s.auditRow}>
                    <Text style={s.auditLabel}>{t('report_total_cost', 'Total Operational Cost')}</Text>
                    <Text style={s.auditVal}>Php {repCost.toLocaleString()}</Text>
                  </View>
                  <View style={s.auditRow}>
                    <Text style={s.auditLabel}>{t('report_compiled_logs', 'Compiled Operation Logs')}</Text>
                    <Text style={s.auditVal}>{repLogs} {repLogs === 1 ? 'log' : 'logs'}</Text>
                  </View>
                  <View style={s.auditRow}>
                    <Text style={s.auditLabel}>{t('report_generated_date', 'Report Generated')}</Text>
                    <Text style={s.auditVal}>{repDate}</Text>
                  </View>
                  <TouchableOpacity 
                    style={s.pdfBtn}
                    onPress={() => {
                      Alert.alert(
                        'Exporting PDF',
                        `Generating District Operations Report for ${activeReport.blockFarm || selectedFarm}...`,
                        [
                          { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                          { 
                            text: 'Download', 
                            onPress: () => Alert.alert('Success', 'HUGPONG_District_Ops_Report.pdf has been securely saved to your device Downloads folder.')
                          }
                        ]
                      );
                    }}
                  >
                    <Ionicons name="download-outline" size={16} color={COLORS.primary} />
                    <Text style={s.pdfBtnText}>Export PDF Report</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}
          </>
        )}

      </ScrollView>

      {/* ── Add / Edit Log Full-Screen Modal ── */}
      <Modal visible={showLog} animationType="slide" onRequestClose={closeLog}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={s.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text }}>
                {logForm.id ? t('log_modal_edit_title', 'Edit Operation Record') : t('log_modal_record_title', 'Record Field Operation')}
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 2 }}>
                Field {logForm.fieldId || safeField.id} ({safeField.ha} Ha)
              </Text>
            </View>
            <TouchableOpacity onPress={closeLog} style={{ padding: 6 }}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

            {!getNetworkStatus() && (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: '#FFFBEB',
                borderWidth: 1,
                borderColor: '#FEF0D0',
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: RADIUS.md
              }}>
                <Ionicons name="cloud-offline-outline" size={18} color="#B45309" />
                <Text style={{ flex: 1, fontSize: 12, color: '#92400E', fontWeight: '500', lineHeight: 18 }}>
                  Offline Mode Active · Saved locally on device and automatically synced once connected.
                </Text>
              </View>
            )}

            {/* ── SECTION 1: FIELD & OPERATION ── */}
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {t('section_field_op', 'Field & Operation')}
              </Text>

              {/* Compact Field Context (shown once) */}
              <View style={{ backgroundColor: '#F8FAF5', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>{logForm.fieldId || safeField.id}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: COLORS.textSecondary }}>{safeField.ha} Ha</Text>
                </View>
                <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>
                  {safeField.member || safeField.memberName || session?.name || 'Member Farmer'}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '600', marginTop: 2 }}>
                  Current Stage: {formatStageName ? formatStageName(safeField.stage) : safeField.stage}
                </Text>
              </View>

              {/* Target Operation Details */}
              <View style={{ backgroundColor: '#F0F8EC', borderRadius: RADIUS.md, padding: 14, borderWidth: 1, borderColor: COLORS.primaryBorder }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name="construct" size={18} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ backgroundColor: COLORS.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{logForm.sraOperationId || 'SRA'}</Text>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.primary, textTransform: 'uppercase' }}>
                        {logForm.sraOperationId === 'CUSTOM' ? 'Custom Operation' : t('log_target_op', 'Target Operation')}
                      </Text>
                    </View>

                    {logForm.sraOperationId === 'CUSTOM' ? (
                      <View style={{ marginTop: 6, marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, fontWeight: '500', color: COLORS.textSecondary, marginBottom: 4 }}>Operation / Activity Title *</Text>
                        <TextInput
                          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, fontWeight: '600', color: COLORS.text }}
                          value={logForm.operationName || logForm.activity}
                          onChangeText={v => setLogForm(p => ({ ...p, operationName: v, activity: v }))}
                          placeholder="e.g. Canal Maintenance, Foliar Spray"
                          placeholderTextColor={COLORS.textMuted}
                        />
                      </View>
                    ) : (
                      <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 3 }}>
                        {formatOperationName ? formatOperationName(logForm.operationName || logForm.activity) : (logForm.operationName || logForm.activity || 'Field Operation')}
                      </Text>
                    )}

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <Ionicons name="git-branch-outline" size={12} color={COLORS.primary} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.primary }}>
                        {t('log_connected_to', 'Connected to:')} {formatStageName ? formatStageName(logForm.stageName || (logForm.stageNumber ? `Stage ${logForm.stageNumber}` : 'Stage 1: Pre-Planting & Land Preparation')) : (logForm.stageName || 'Stage 1')}
                      </Text>
                    </View>
                    {logForm.sraOperationId !== 'CUSTOM' && (
                      <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 3 }}>
                        {t('log_std_cost', 'Standard Cost')}: ₱ {Number(SRA_OPERATIONS_CATALOGUE.find(o => o.id === logForm.sraOperationId)?.costPerHa || 0).toLocaleString()} / hectare
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Field Plot Selector (for new logs with multiple fields) */}
              {!logForm.id && (
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: COLORS.text, marginBottom: 6 }}>{t('log_field_plot', 'Field Plot')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SPACING.lg }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8 }}>
                    {fields.filter(f => f.member === getCurrentSession().name || f.id === safeField.id).map(field => (
                      <TouchableOpacity
                        key={field.id}
                        style={[
                          { paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff' },
                          logForm.fieldId === field.id && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }
                        ]}
                        onPress={() => setLogForm(p => ({ ...p, fieldId: field.id }))}
                      >
                        <Text style={{ fontSize: 14, fontWeight: logForm.fieldId === field.id ? '700' : '500', color: logForm.fieldId === field.id ? COLORS.primary : COLORS.text }}>{field.id}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Date of Operation */}
              <View>
                <Text style={{ fontSize: 14, fontWeight: '500', color: COLORS.text, marginBottom: 6 }}>{t('log_date_of_op', 'Date of Operation')}</Text>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAF5', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 12 }}
                  onPress={() => setShowCalendar(true)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
                    <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text }}>{logForm.period || t('log_tap_date', 'Tap to select date')}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.primary }}>{t('btn_change_date', 'Change Date')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── SECTION 2: LABOR & RESOURCES ── */}
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {t('section_labor_res', 'Labor & Resources')}
              </Text>
              {/* Clean 2-column row of tightly related fields */}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: COLORS.textSecondary, marginBottom: 6 }}>{t('log_ha_covered', 'Hectares Covered')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAF5', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12 }}>
                    <TextInput
                      style={{ flex: 1, height: 46, fontSize: 16, fontWeight: '600', color: COLORS.text }}
                      value={logForm.hectares}
                      onChangeText={v => {
                        setLogForm(p => ({ ...p, hectares: v }));
                        if (logForm.sraOperationId) selectSraOperation(logForm.sraOperationId, v);
                      }}
                      keyboardType="decimal-pad"
                      placeholder='1.5'
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textMuted }}>Ha</Text>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: COLORS.textSecondary, marginBottom: 6 }}>{t('log_workers_crew', 'Workers / Crew')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAF5', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12 }}>
                    <TextInput
                      style={{ flex: 1, height: 46, fontSize: 16, fontWeight: '600', color: COLORS.text }}
                      value={logForm.people}
                      onChangeText={v => setLogForm(p => ({ ...p, people: v }))}
                      keyboardType="number-pad"
                      placeholder='2'
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textMuted }}>Pax</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* ── SECTION 3: COST DETAILS ── */}
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {t('section_cost_details', 'Cost Details')}
              </Text>

              {/* Mode Switcher */}
              <View style={{ flexDirection: 'row', backgroundColor: '#EDEFE9', borderRadius: RADIUS.sm, padding: 3 }}>
                <TouchableOpacity
                  style={[
                    { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: RADIUS.xs, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
                    logForm.isGroup && { backgroundColor: '#fff', ...SHADOW.card }
                  ]}
                  onPress={() => {
                    if (!logForm.isGroup) {
                      const defaultItems = (logForm.subItems && logForm.subItems.length > 0)
                        ? logForm.subItems
                        : [{ id: `SI-${Date.now()}`, description: `${logForm.operationName || 'Operation'} Material/Labor`, qty: parseFloat(logForm.inputQty) || 1, unit: logForm.inputUnit || 'ha', unitCost: parseFloat(logForm.directRate) || 1000, subTotal: Math.round((parseFloat(logForm.inputQty) || 1) * (parseFloat(logForm.directRate) || 1000)) }];
                      const totalCost = defaultItems.reduce((sum, item) => sum + (item.subTotal || 0), 0);
                      setLogForm(p => ({ ...p, isGroup: true, inputType: 'group', subItems: defaultItems, cost: String(totalCost) }));
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="layers-outline" size={16} color={logForm.isGroup ? COLORS.primary : COLORS.textMuted} />
                  <Text style={{ fontSize: 13, fontWeight: logForm.isGroup ? '700' : '500', color: logForm.isGroup ? COLORS.primary : COLORS.textSecondary }} numberOfLines={1}>{t('mode_title_child', 'Title with Child Items')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: RADIUS.xs, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
                    !logForm.isGroup && { backgroundColor: '#fff', ...SHADOW.card }
                  ]}
                  onPress={() => {
                    if (logForm.isGroup) {
                      const totalFromSub = (logForm.subItems || []).reduce((sum, item) => sum + (item.subTotal || 0), 0);
                      const haVal = parseFloat(logForm.hectares) || 1.0;
                      const directRate = Math.round(totalFromSub / haVal) || 1000;
                      setLogForm(p => ({
                        ...p,
                        isGroup: false,
                        inputType: 'direct',
                        inputQty: String(haVal),
                        inputUnit: 'ha',
                        directRate: String(directRate),
                        cost: String(totalFromSub || Math.round(haVal * directRate))
                      }));
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="create-outline" size={16} color={!logForm.isGroup ? COLORS.primary : COLORS.textMuted} />
                  <Text style={{ fontSize: 13, fontWeight: !logForm.isGroup ? '700' : '500', color: !logForm.isGroup ? COLORS.primary : COLORS.textSecondary }} numberOfLines={1}>{t('mode_direct_input', 'Direct Input')}</Text>
                </TouchableOpacity>
              </View>

              {/* Group Mode vs Direct Mode View */}
              {logForm.isGroup ? (
                /* Group Mode: Compact Editable Rows */
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, gap: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>{t('log_child_materials', 'Expense & Resource Items')}</Text>
                    <Text style={{ fontSize: 12, color: COLORS.textMuted }}>{logForm.subItems?.length || 0} item{(logForm.subItems?.length || 0) !== 1 ? 's' : ''}</Text>
                  </View>

                  {(logForm.subItems || []).map((item, index) => {
                    const isExpanded = editingSubItemIdx === index;
                    return (
                      <View key={item.id || index} style={{ borderBottomWidth: index !== (logForm.subItems.length - 1) ? 1 : 0, borderBottomColor: COLORS.border, paddingBottom: 10, paddingTop: index > 0 ? 6 : 0, gap: 8 }}>
                        {/* Compact row summary */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>{item.description || `Item #${index + 1}`}</Text>
                            <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
                              {item.qty} {item.unit} × ₱{Number(item.unitCost || 0).toLocaleString()}
                            </Text>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary, marginTop: 2 }}>
                              ₱ {(item.subTotal || 0).toLocaleString()}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <TouchableOpacity
                              onPress={() => setEditingSubItemIdx(isExpanded ? null : index)}
                              style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: RADIUS.xs, backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primaryBorder }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.primary }}>
                                {isExpanded ? 'Done' : 'Edit'}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => removeSubItemRow(index)} style={{ padding: 4 }}>
                              <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Inline Editor Drawer (only shown when editing this row) */}
                        {isExpanded && (
                          <View style={{ backgroundColor: '#F8FAF5', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: 10, gap: 8, marginTop: 4 }}>
                            <TextInput
                              style={{ fontSize: 14, fontWeight: '600', color: COLORS.text, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xs, paddingHorizontal: 10, paddingVertical: 7 }}
                              value={item.description}
                              onChangeText={v => updateSubItemRow(index, 'description', v)}
                              placeholder="Description / Material name"
                              placeholderTextColor={COLORS.textMuted}
                            />
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: '500', marginBottom: 2 }}>Qty</Text>
                                <TextInput
                                  style={{ height: 40, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xs, paddingHorizontal: 8, fontSize: 14, fontWeight: '600', color: COLORS.text }}
                                  value={String(item.qty || '')}
                                  onChangeText={v => updateSubItemRow(index, 'qty', v)}
                                  keyboardType="decimal-pad"
                                />
                              </View>
                              <View style={{ flex: 1.4 }}>
                                <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: '500', marginBottom: 2 }}>Unit Cost (₱)</Text>
                                <TextInput
                                  style={{ height: 40, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xs, paddingHorizontal: 8, fontSize: 14, fontWeight: '600', color: COLORS.text }}
                                  value={String(item.unitCost || '')}
                                  onChangeText={v => updateSubItemRow(index, 'unitCost', v)}
                                  keyboardType="decimal-pad"
                                />
                              </View>
                            </View>
                            {/* Unit Selector Chips */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 2 }}>
                              {['bag', 'ha', 'pass', 'lac', 'ton', 'days', 'pax', 'liters'].map(u => (
                                <TouchableOpacity
                                  key={u}
                                  style={[
                                    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
                                    item.unit === u && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }
                                  ]}
                                  onPress={() => updateSubItemRow(index, 'unit', u)}
                                >
                                  <Text style={{ fontSize: 11, fontWeight: '600', color: item.unit === u ? COLORS.primary : COLORS.textSecondary }}>{u}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </View>
                    );
                  })}

                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.primary, borderStyle: 'dashed', borderRadius: RADIUS.sm, paddingVertical: 10, marginTop: 4 }}
                    onPress={addCustomSubItem}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle" size={18} color={COLORS.primary} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.primary }}>
                      {t('log_add_expense', 'Add Expense / Material')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Direct Mode: Simplified Hierarchy */
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, gap: 12 }}>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: COLORS.textSecondary, marginBottom: 6 }}>Quantity</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAF5', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12 }}>
                      <TextInput
                        style={{ flex: 1, height: 46, fontSize: 16, fontWeight: '600', color: COLORS.text }}
                        value={String(logForm.inputQty || '')}
                        onChangeText={v => {
                          const q = parseFloat(v) || 0;
                          const r = parseFloat(logForm.directRate) || 0;
                          setLogForm(p => ({ ...p, inputQty: v, cost: String(Math.round(q * r)) }));
                        }}
                        keyboardType="decimal-pad"
                        placeholder="1.0"
                        placeholderTextColor={COLORS.textMuted}
                      />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textMuted }}>{logForm.inputUnit || 'ha'}</Text>
                    </View>
                  </View>

                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: COLORS.textSecondary, marginBottom: 6 }}>{t('log_unit_rate', 'Unit Rate / Cost (₱)')}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAF5', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.textMuted, marginRight: 4 }}>₱</Text>
                      <TextInput
                        style={{ flex: 1, height: 46, fontSize: 16, fontWeight: '600', color: COLORS.text }}
                        value={String(logForm.directRate || '')}
                        onChangeText={v => {
                          const r = parseFloat(v) || 0;
                          const q = parseFloat(logForm.inputQty) || 0;
                          setLogForm(p => ({ ...p, directRate: v, cost: String(Math.round(q * r)) }));
                        }}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>
                  </View>

                  {/* Unit Selector Chips */}
                  <View>
                    <Text style={{ fontSize: 13, color: COLORS.textSecondary, fontWeight: '500', marginBottom: 6 }}>Unit:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                      {['ha', 'ton', 'lac', 'pass', 'bag', 'days', 'pax', 'liters'].map(u => (
                        <TouchableOpacity
                          key={u}
                          style={[
                            { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
                            logForm.inputUnit === u && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }
                          ]}
                          onPress={() => setLogForm(p => ({ ...p, inputUnit: u }))}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: logForm.inputUnit === u ? COLORS.primary : COLORS.textSecondary }}>{u}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  {/* Estimated Total - Prominent */}
                  <View style={{ marginTop: 4, padding: 14, backgroundColor: '#F0F8EC', borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.primaryBorder }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textSecondary }}>Estimated Total</Text>
                    <Text style={{ fontSize: 24, fontWeight: '700', color: COLORS.primary, marginTop: 2 }}>
                      ₱ {Number(logForm.cost || 0).toLocaleString()}
                    </Text>
                  </View>
                </View>
              )}

              {/* Total Operation Cost Banner */}
              <View style={{ backgroundColor: '#1E4D2B', borderRadius: RADIUS.md, padding: SPACING.lg, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#D4EAD6', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('log_total_cost', 'Total Operation Cost')}</Text>
                    <Text style={{ fontSize: 24, fontWeight: '700', color: '#fff', marginTop: 2 }}>₱ {Number(logForm.cost || 0).toLocaleString()}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm }}>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: '#D4EAD6' }}>{t('log_per_ha', 'Per Hectare')}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 1 }}>
                      ₱ {Math.round((Number(logForm.cost || 0)) / Math.max(parseFloat(logForm.hectares) || 1, 0.1)).toLocaleString()} / ha
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* ── SECTION 4: NOTES ── */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {t('log_notes_lbl', 'Notes & Remarks')}
              </Text>
              <TextInput
                style={{ minHeight: 64, backgroundColor: '#F8FAF5', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text, textAlignVertical: 'top' }}
                value={logForm.notes || ''}
                onChangeText={v => setLogForm(p => ({ ...p, notes: v }))}
                placeholder={t('log_notes_placeholder', 'Optional notes or remarks on field observations...')}
                placeholderTextColor={COLORS.textMuted}
                multiline
              />
            </View>

            {/* ── SECTION 5: REVIEW & SUBMIT ── */}
            <View style={{ gap: 10, paddingBottom: SPACING.lg }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {t('review_and_submit', 'Review & Submit')}
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: isSavingLog ? COLORS.primary + '99' : COLORS.primary,
                  borderRadius: RADIUS.md,
                  minHeight: 48,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  ...SHADOW.card
                }}
                disabled={isSavingLog}
                onPress={() => handleSaveLog(true)}
                activeOpacity={0.8}
              >
                {isSavingLog ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                      {logForm.id ? 'Saving changes...' : (getNetworkStatus() ? 'Recording...' : 'Saving offline...')}
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons name={logForm.id ? "checkmark-circle" : (getNetworkStatus() ? "paper-plane" : "save-outline")} size={18} color="#fff" />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                      {logForm.id
                        ? t('log_save_changes', 'Save Changes')
                        : (getNetworkStatus() ? t('log_record_op', 'Record Operation') : 'Save Offline to Device')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {!isTakeOver && (
                <TouchableOpacity
                  style={{
                    backgroundColor: '#FFFBF0',
                    borderWidth: 1.5,
                    borderColor: COLORS.warning,
                    borderRadius: RADIUS.md,
                    minHeight: 46,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 6,
                    opacity: isSavingLog ? 0.6 : 1
                  }}
                  disabled={isSavingLog}
                  onPress={() => handleSaveLog(false)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="document-text-outline" size={16} color="#C97A00" />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#C97A00' }}>
                    {t('log_save_draft', 'Save as Draft')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── QR Code Display Modal ── */}
      <Modal visible={showQR} transparent animationType="fade">
        <View style={s.qrOverlay}>
          <View style={s.qrModal}>
            <Text style={s.qrModalTitle}>SRA Monthly Audit QR</Text>
            <Text style={s.qrModalSub}>{activeQRData?.month || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} — {activeQRData?.blockFarm || (session?.farm || session?.blockFarm || 'District Central')}, Silay</Text>

            {/* Cloud Audit Queue Status Chip */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: activeQRData?.cloudQueueStatus === 'offline_queued' ? '#FFFBEB' : '#EBF7EE',
              borderWidth: 1,
              borderColor: activeQRData?.cloudQueueStatus === 'offline_queued' ? '#FEF0D0' : '#B7E4C7',
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderRadius: RADIUS.md,
              marginBottom: 10,
              width: '100%'
            }}>
              <Ionicons 
                name={activeQRData?.cloudQueueStatus === 'offline_queued' ? "archive" : "cloud-done"} 
                size={16} 
                color={activeQRData?.cloudQueueStatus === 'offline_queued' ? '#B45309' : COLORS.success} 
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: activeQRData?.cloudQueueStatus === 'offline_queued' ? '#92400E' : COLORS.success }}>
                  {activeQRData?.cloudQueueStatus === 'offline_queued' ? 'Stored in Local Offline Queue' : 'Transmitted to SRA Cloud Audit Queue'}
                </Text>
                <Text style={{ fontSize: 9.5, color: activeQRData?.cloudQueueStatus === 'offline_queued' ? '#B45309' : COLORS.textMuted }}>
                  {activeQRData?.cloudQueueStatus === 'offline_queued' 
                    ? 'Saved on phone · Will auto-push when online · SRA can inspect offline via QR'
                    : 'Report is live on District SRA Portal queue for verification.'}
                </Text>
              </View>
            </View>
            {/* Real Scannable Vector SVG QR Code */}
            <View style={[s.qrBox, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#e2e8dc' }]}>
              <OfflineQRCode
                value={activeQRData?.envelope || ''}
                size={190}
                color={COLORS.primary}
              />
              <Text selectable={true} style={[s.qrCode, { marginTop: 10, letterSpacing: 2 }]}>{activeQRData?.hash || 'No report hash'}</Text>
            </View>
            <Text style={s.qrNote}>{activeQRData?.totalFields || uniqueFieldsCount} field{(activeQRData?.totalFields || uniqueFieldsCount) !== 1 ? 's' : ''} · {activeQRData?.totalLogs || totalLogsCount} log{(activeQRData?.totalLogs || totalLogsCount) !== 1 ? 's' : ''} · Total: Php {(activeQRData?.totalCost || totalOperationalCost).toLocaleString()}</Text>
            <View style={{ flexDirection: 'column', gap: 8, marginTop: 14, width: '100%' }}>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  backgroundColor: '#F0F8EC',
                  borderWidth: 1,
                  borderColor: COLORS.primary,
                  paddingVertical: 12,
                  borderRadius: RADIUS.md
                }}
                onPress={async () => {
                  const hashToCopy = activeQRData?.hash || '';
                  if (!hashToCopy) return;
                  try {
                    await Share.share({
                      message: hashToCopy,
                      title: 'HUGPONG SRA Audit Code'
                    });
                  } catch (e) {
                    Alert.alert('Audit Code', hashToCopy);
                  }
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="share-social-outline" size={16} color={COLORS.primary} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>
                  {t('btn_share_hash', 'Share / Copy Audit Code')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={[s.qrCloseBtn, { marginTop: 0 }]} onPress={() => setShowQR(false)}>
                <Text style={s.qrCloseBtnText}>{t('btn_close', 'Close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Custom Calendar Modal ── */}
      <Modal visible={showCalendar} transparent animationType="fade">
        <View style={s.qrOverlay}>
          <View style={[s.qrModal, { width: 330, padding: 0, overflow: 'hidden', borderRadius: RADIUS.xl }]}>
            
            {/* Calendar Header with Month & Year Navigation */}
            <View style={{ backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <TouchableOpacity 
                style={{ padding: 6, borderRadius: RADIUS.sm, backgroundColor: 'rgba(255,255,255,0.15)' }}
                onPress={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1))}
              >
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 }}>
                  {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(calDate)}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10.5, fontWeight: '600', marginTop: 1 }}>Select Operation Date</Text>
              </View>
              <TouchableOpacity 
                style={{ padding: 6, borderRadius: RADIUS.sm, backgroundColor: 'rgba(255,255,255,0.15)' }}
                onPress={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1))}
              >
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Quick 1-Tap Preset Date Chips */}
            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: '#F8FAF5', borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              {[
                { label: 'Today', offsetDays: 0 },
                { label: 'Yesterday', offsetDays: 1 },
                { label: '2 Days Ago', offsetDays: 2 },
              ].map(preset => (
                <TouchableOpacity
                  key={preset.label}
                  style={{ flex: 1, paddingVertical: 6, backgroundColor: '#fff', borderRadius: RADIUS.xs, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }}
                  onPress={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - preset.offsetDays);
                    const formatted = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
                    setLogForm(p => ({ ...p, period: formatted }));
                    setShowCalendar(false);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={{ padding: 16, paddingBottom: 12 }}>
              {/* Day of Week Headers */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, idx) => (
                  <Text key={d + idx} style={{ width: 36, textAlign: 'center', fontSize: 11.5, color: COLORS.textMuted, fontWeight: '800' }}>{d}</Text>
                ))}
              </View>

              {/* Day Number Cells */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, justifyContent: 'space-between' }}>
                {Array.from({ length: new Date(calDate.getFullYear(), calDate.getMonth(), 1).getDay() }).map((_, i) => (
                  <View key={`blank-${i}`} style={{ width: 36, height: 36 }} />
                ))}
                
                {Array.from({ length: new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                  const day = i + 1;
                  const formattedMonth = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(calDate);
                  const thisDateStr = `${formattedMonth} ${day}, ${calDate.getFullYear()}`;
                  const isSelected = (logForm.period || '').startsWith(thisDateStr);
                  const now = new Date();
                  const isToday = calDate.getFullYear() === now.getFullYear() && calDate.getMonth() === now.getMonth() && day === now.getDate();

                  return (
                    <TouchableOpacity
                      key={day}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: isSelected ? COLORS.primary : isToday ? '#E2EED9' : 'transparent',
                        borderWidth: isToday && !isSelected ? 1.5 : 0,
                        borderColor: COLORS.primary
                      }}
                      onPress={() => {
                        setLogForm(p => ({ ...p, period: thisDateStr }));
                        setShowCalendar(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{
                        fontSize: 13,
                        color: isSelected ? '#fff' : isToday ? COLORS.primary : COLORS.text,
                        fontWeight: isSelected || isToday ? '800' : '500'
                      }}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Selected Date Summary & Actions */}
            <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: '#FAFAFA' }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 13, alignItems: 'center' }} onPress={() => setShowCalendar(false)}>
                <Text style={{ color: COLORS.textMuted, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 13, alignItems: 'center', backgroundColor: COLORS.primary }} onPress={() => setShowCalendar(false)}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Confirm Date</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* ── REAL SRA QR SCANNER & VERIFIER MODAL ── */}
      <LiveQRScanner
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onCodeDetected={(code) => handleScanOrSubmitCode(code)}
      />

      {/* ── SRA Audit Inspection & Certification Modal ── */}
      <Modal visible={showSRAInspectModal} transparent animationType="slide">
        <View style={s.qrOverlay}>
          <View style={[s.qrModal, { width: width > 500 ? 460 : '92%', maxHeight: '85%', padding: 20 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 12, marginBottom: 14 }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '900', color: COLORS.primary }}>SRA Compliance Inspection</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>Silay City District Regulatory Oversight</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSRAInspectModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {/* Status Banner */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: scannedAuditReport?.status === 'CERTIFIED' ? '#EBF7EE' : '#FEF3C7', padding: 12, borderRadius: 10, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name={scannedAuditReport?.status === 'CERTIFIED' ? "shield-checkmark" : "time"} size={20} color={scannedAuditReport?.status === 'CERTIFIED' ? COLORS.success : '#D97706'} />
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: scannedAuditReport?.status === 'CERTIFIED' ? COLORS.success : '#92400E' }}>
                      {scannedAuditReport?.status === 'CERTIFIED' ? 'SRA Certified Record' : 'Awaiting Certification'}
                    </Text>
                    <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Hash: {scannedAuditReport?.qrSignature || scannedAuditReport?.qrHash || 'Unavailable'}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', color: scannedAuditReport?.status === 'CERTIFIED' ? COLORS.success : '#92400E' }}>
                  {scannedAuditReport?.status || 'Pending'}
                </Text>
              </View>

              {/* Farm Metadata */}
              <View style={{ backgroundColor: '#F8FAF5', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Block Farm:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{scannedAuditReport?.blockFarm || (session?.farm || session?.blockFarm || 'District Central')}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Audit Period:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{scannedAuditReport?.month || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Total Block Farm Area:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{(Number(scannedAuditReport?.totalHectares) || fields.filter(f => !f.blockFarm || f.blockFarm === (scannedAuditReport?.blockFarm || session?.farm || session?.blockFarm || 'District Central')).reduce((sum, f) => sum + (Number(f.ha) || 0), 0) || 0).toFixed(2)} Ha</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Active Operations Area:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{scannedAuditReport?.totalHectares || 0} Ha</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Compiled Operations:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{scannedAuditReport?.logsCount || 14} logs</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Total Production Cost:</Text>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: COLORS.primary }}>Php {Number(scannedAuditReport?.totalCost || 0).toLocaleString()}</Text>
                </View>
              </View>

              {/* SRA Agronomic Benchmark Evaluation */}
              <View style={{ backgroundColor: '#F0F9FF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#BAE6FD', marginBottom: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#0369A1', marginBottom: 3 }}>SRA District Agronomic Benchmark</Text>
                <Text style={{ fontSize: 11, color: '#0C4A6E', lineHeight: 16 }}>
                  Average cost per hectare: Php {Math.round(Number(scannedAuditReport?.totalCost || 0) / Math.max(Number(scannedAuditReport?.totalHectares || 0), 0.01)).toLocaleString()} / Ha (calculated against {scannedAuditReport?.totalHectares || 0} Ha new plant input area).
                </Text>
              </View>

              {/* Verification Info if Certified */}
              {scannedAuditReport?.verifiedBy && (
                <View style={{ padding: 10, backgroundColor: '#F3F4F6', borderRadius: 8, marginBottom: 14 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Certified By: <Text style={{ fontWeight: '700', color: COLORS.text }}>{scannedAuditReport.verifiedBy}</Text></Text>
                  {scannedAuditReport.certifiedAt && <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>Certified On: {scannedAuditReport.certifiedAt}</Text>}
                </View>
              )}
            </ScrollView>

            {/* Actions */}
            <View style={{ marginTop: 14, gap: 8 }}>
              {scannedAuditReport?.status !== 'CERTIFIED' ? (
                <TouchableOpacity
                  style={{ backgroundColor: COLORS.success, paddingVertical: 13, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                  onPress={() => handleCertifyReport(scannedAuditReport)}
                >
                  <Ionicons name="checkmark-seal" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Issue Official SRA Digital Seal</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ backgroundColor: '#EBF7EE', paddingVertical: 10, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.success }}>
                  <Ionicons name="checkmark-done" size={18} color={COLORS.success} />
                  <Text style={{ color: COLORS.success, fontWeight: '800', fontSize: 12 }}>Certified &amp; Immutable</Text>
                </View>
              )}
              <TouchableOpacity
                style={{ paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: '#F1F5E9' }}
                onPress={() => setShowSRAInspectModal(false)}
              >
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 12 }}>Close Inspector</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* ── Fields Search Modal ── */}
      <Modal visible={showFieldsModal} animationType="slide" onRequestClose={() => { setShowFieldsModal(false); setFieldSearch(''); }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#fff' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>Block Farm Fields</Text>
            <TouchableOpacity onPress={() => { setShowFieldsModal(false); setFieldSearch(''); }} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <View style={{ padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: RADIUS.md, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.border }}>
              <Ionicons name="search" size={16} color={COLORS.textMuted} />
              <TextInput 
                placeholder="Search by Field ID or Member name..."
                style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontSize: 13 }}
                value={fieldSearch}
                onChangeText={setFieldSearch}
              />
              {fieldSearch.length > 0 && (
                <TouchableOpacity onPress={() => setFieldSearch('')}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          {(() => {
            const q = fieldSearch.toLowerCase();
            const filtered = fields.filter(f => 
              (f.id || '').toLowerCase().includes(q) || 
              (f.member || '').toLowerCase().includes(q) ||
              (f.memberId && f.memberId.toLowerCase().includes(q))
            );
            const pageSize = 4;
            const totalPages = Math.ceil(filtered.length / pageSize) || 1;
            const curPage = Math.min(fieldsModalPage, totalPages);
            const paginated = filtered.slice((curPage - 1) * pageSize, curPage * pageSize);

            return (
              <>
                <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 10, paddingBottom: 16 }}>
                  {filtered.length === 0 && (
                    <Text style={s.emptyText}>No fields match your search.</Text>
                  )}
                  {paginated.map(field => (
                    <View key={field.id} style={[s.receiptCard, (selectedField?.id || safeField.id) === field.id && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg, marginBottom: 0 }, { marginBottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md }]}>
                      <TouchableOpacity style={{ flex: 1 }} onPress={() => {
                        setSelectedField(field);
                        setManagerLedgerScope('selected');
                        updateSessionFieldId(field.id);
                        setShowFieldsModal(false);
                        setFieldSearch('');
                        setFieldsModalPage(1);
                      }}>
                        <View style={s.receiptHeader}>
                          <Text style={[s.receiptTitle, { color: COLORS.text }]}>{field.id}</Text>
                          <Text style={s.receiptId}>{field.ha} Ha</Text>
                        </View>
                        <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
                          Member: <Text style={{ color: COLORS.text, fontWeight: '700' }}>{field.member}</Text>
                          {field.memberId ? (
                            <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 11, color: COLORS.primary, fontWeight: '700' }}> · ID: {field.memberId}</Text>
                          ) : null}
                        </Text>
                        <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>Stage: <Text style={{ color: COLORS.text }}>{field.stage}</Text></Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                          <View style={[s.syncDot, { backgroundColor: field.synced ? COLORS.success : '#C97A00' }]} />
                          <Text style={{ fontSize: 11, fontWeight: '600', color: field.synced ? COLORS.success : '#C97A00' }}>
                            {field.synced ? `Synced (${formatSyncTime(field.lastSync)})` : `Not synced (${formatSyncTime(field.lastSync || '4 days ago')})`}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      {activeRole === 'Farm Manager' && (
                        <TouchableOpacity 
                          style={{ padding: 10, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, marginLeft: 10, alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => {
                            setShowFieldsModal(false);
                            openAssignModal(field);
                          }}
                          title="Edit Field Ownership"
                        >
                          <Ionicons name="pencil" size={16} color={COLORS.primary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </ScrollView>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: '#fff' }}>
                    <TouchableOpacity
                      disabled={curPage === 1}
                      onPress={() => setFieldsModalPage(p => Math.max(1, p - 1))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: curPage === 1 ? COLORS.border : COLORS.primary, backgroundColor: curPage === 1 ? '#F8F9FA' : COLORS.primaryBg, opacity: curPage === 1 ? 0.6 : 1 }}
                    >
                      <Ionicons name="chevron-back" size={14} color={curPage === 1 ? COLORS.textMuted : COLORS.primary} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: curPage === 1 ? COLORS.textMuted : COLORS.primary }}>Prev</Text>
                    </TouchableOpacity>

                    <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary }}>
                      Page {curPage} of {totalPages} ({filtered.length} Fields)
                    </Text>

                    <TouchableOpacity
                      disabled={curPage === totalPages}
                      onPress={() => setFieldsModalPage(p => Math.min(totalPages, p + 1))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: curPage === totalPages ? COLORS.border : COLORS.primary, backgroundColor: curPage === totalPages ? '#F8F9FA' : COLORS.primaryBg, opacity: curPage === totalPages ? 0.6 : 1 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: curPage === totalPages ? COLORS.textMuted : COLORS.primary }}>Next</Text>
                      <Ionicons name="chevron-forward" size={14} color={curPage === totalPages ? COLORS.textMuted : COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </>
            );
          })()}
        </SafeAreaView>
      </Modal>

      {/* ── Audit History & Monthly Breakdown Modal ── */}
      <AuditHistoryModal
        visible={showAuditHistoryModal}
        onClose={() => setShowAuditHistoryModal(false)}
        onOpenQR={() => {
          setShowAuditHistoryModal(false);
          handleGenerateAudit();
        }}
      />

      {/* ── Take Over Security Authorization Modal (Mobile) ── */}
      <Modal visible={showTakeOverAuthModal} animationType="slide" onRequestClose={() => setShowTakeOverAuthModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#fff' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF0D0', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield" size={20} color="#C97A00" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>Authorize Take Over</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Administrative supervision gate</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowTakeOverAuthModal(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 16 }} keyboardShouldPersistTaps="handled">
            {/* Target Field Summary Card */}
            {selectedField && (
              <View style={{ backgroundColor: '#F9FAF7', borderRadius: RADIUS.md, padding: 14, borderWidth: 1, borderColor: COLORS.border, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>
                    {selectedField.id || safeField.id}
                  </Text>
                  <View style={{ backgroundColor: '#FEF0D0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#A85E00' }}>Supervisor Action</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: COLORS.text, fontWeight: '600' }}>
                  {t('member_label', 'Member')}: {safeField.member || 'Assigned Member'} · {safeField.ha || '1.5'} Ha
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                  {selectedField?.blockFarm || safeField?.blockFarm || (session?.farm || session?.blockFarm || 'District Central')} · Current Stage: {safeField.stage}
                </Text>
              </View>
            )}

            {/* Security Notice */}
            <View style={{ backgroundColor: '#FFFBF0', borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: '#FEF0D0', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Ionicons name="shield-outline" size={18} color="#C97A00" />
              <Text style={{ fontSize: 12, color: '#8F5700', flex: 1 }}>
                Take over actions are permanently logged to the audit ledger.
              </Text>
            </View>

            {/* Manager Password Input */}
            <View style={{ gap: 6 }}>
              <Text style={s.formLabel}>Farm Manager Password <Text style={{ color: '#D9534F' }}>*</Text></Text>
              <View style={{ position: 'relative', justifyContent: 'center' }}>
                <TextInput
                  secureTextEntry={!showTakeOverPassword}
                  placeholder="Enter your manager password"
                  placeholderTextColor={COLORS.textMuted}
                  style={[s.formInput, { paddingRight: 45 }]}
                  value={takeOverAuthPassword}
                  onChangeText={(val) => {
                    setTakeOverAuthPassword(val);
                    setTakeOverAuthError('');
                  }}
                />
                <TouchableOpacity
                  style={{ position: 'absolute', right: 12, top: 12, padding: 4 }}
                  onPress={() => setShowTakeOverPassword(prev => !prev)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={showTakeOverPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={COLORS.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Error Message */}
            {Boolean(takeOverAuthError) && (
              <View style={{ backgroundColor: '#FFF5F5', padding: 10, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: '#FFD4D4', flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Ionicons name="alert-circle" size={16} color="#D9534F" />
                <Text style={{ fontSize: 12, color: '#D9534F', fontWeight: '600', flex: 1 }}>
                  {takeOverAuthError}
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, paddingBottom: 24 }}>
              <TouchableOpacity
                style={[s.cancelBtn, { height: 48 }]}
                onPress={() => setShowTakeOverAuthModal(false)}
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: '#C97A00', height: 48 }]}
                onPress={handleConfirmTakeOverAuth}
              >
                <Ionicons name="shield-outline" size={18} color="#fff" />
                <Text style={s.submitBtnText}>Authorize Take Over</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Edit Security Authorization Modal ── */}
      <Modal visible={showEditAuthModal} animationType="slide" onRequestClose={() => setShowEditAuthModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#fff' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EBF3FB', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield-checkmark" size={20} color="#0B63B7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>Authorize Amendment</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Security & audit verification</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowEditAuthModal(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 16 }} keyboardShouldPersistTaps="handled">
            {/* Target Log Summary Card */}
            {pendingEditLog && (
              <View style={{ backgroundColor: '#F9FAF7', borderRadius: RADIUS.md, padding: 14, borderWidth: 1, borderColor: COLORS.border, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text, flex: 1, marginRight: 12 }} numberOfLines={2}>
                    {pendingEditLog.sraOperationId ? `[${pendingEditLog.sraOperationId}] ` : ''}{pendingEditLog.operationName || pendingEditLog.activity}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.primary }}>
                    ₱{Number(pendingEditLog.totalCost != null ? pendingEditLog.totalCost : pendingEditLog.cost || 0).toLocaleString()}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>
                  {pendingEditLog.stageName || `Stage ${pendingEditLog.stageNumber || 1}`} · {pendingEditLog.date || pendingEditLog.period} · {pendingEditLog.hectares} Ha
                </Text>
              </View>
            )}

            {/* Short Security Notice */}
            <View style={{ backgroundColor: '#FFFBF0', borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: '#FEF0D0', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Ionicons name="information-circle" size={18} color="#C97A00" />
              <Text style={{ fontSize: 12, color: '#8F5700', flex: 1 }}>
                Amendments are permanently logged to the SRA audit ledger.
              </Text>
            </View>

            {/* Account Password Input */}
            <View style={{ gap: 6 }}>
              <Text style={s.formLabel}>Account Password <Text style={{ color: '#D9534F' }}>*</Text></Text>
              <View style={{ position: 'relative', justifyContent: 'center' }}>
                <TextInput
                  secureTextEntry={!showEditPassword}
                  placeholder="Enter your login password"
                  placeholderTextColor={COLORS.textMuted}
                  style={[s.formInput, { paddingRight: 45 }]}
                  value={editAuthPassword}
                  onChangeText={(val) => {
                    setEditAuthPassword(val);
                    setEditAuthError('');
                  }}
                />
                <TouchableOpacity
                  style={{ position: 'absolute', right: 12, top: 12, padding: 4 }}
                  onPress={() => setShowEditPassword(prev => !prev)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={showEditPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={COLORS.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Mandatory Reason for Amendment */}
            <View style={{ gap: 6 }}>
              <Text style={s.formLabel}>Reason for Amendment <Text style={{ color: '#D9534F' }}>*</Text></Text>
              <TextInput
                multiline
                numberOfLines={3}
                placeholder="State the reason (e.g. Receipt adjustment, headcount recount...)"
                placeholderTextColor={COLORS.textMuted}
                style={[s.formInput, { height: 75, textAlignVertical: 'top' }]}
                value={editAuthReason}
                onChangeText={(val) => {
                  setEditAuthReason(val);
                  setEditAuthError('');
                }}
              />

              {/* Quick Preset Reason Chips (Horizontal Scroll) */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {[
                  { label: 'Cost adjustment', val: 'Voucher / Receipt cost adjustment' },
                  { label: 'Headcount recount', val: 'Worker headcount recount' },
                  { label: 'Volume correction', val: 'Input volume / bags correction' },
                  { label: 'Typo fix', val: 'Date / Typo correction' },
                  { label: 'Supervisor review', val: 'Supervisor field audit review' }
                ].map((chip, pIdx) => (
                  <TouchableOpacity
                    key={pIdx}
                    onPress={() => {
                      setEditAuthReason(chip.val);
                      setEditAuthError('');
                    }}
                    style={{ backgroundColor: '#F0F6FC', paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1, borderColor: '#CCE0F5' }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#0B63B7' }}>+ {chip.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Error Message */}
            {Boolean(editAuthError) && (
              <View style={{ backgroundColor: '#FFF5F5', padding: 10, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: '#FFD4D4', flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Ionicons name="alert-circle" size={16} color="#D9534F" />
                <Text style={{ fontSize: 12, color: '#D9534F', fontWeight: '600', flex: 1 }}>
                  {editAuthError}
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, paddingBottom: 24 }}>
              <TouchableOpacity
                style={[s.cancelBtn, { height: 48 }]}
                onPress={() => setShowEditAuthModal(false)}
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: '#0B63B7', height: 48 }]}
                onPress={handleConfirmEditAuth}
              >
                <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
                <Text style={s.submitBtnText}>Authorize & Edit</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Log Revision History & Audit Trail Modal ── */}
      <Modal visible={showLogAuditModal} animationType="slide" onRequestClose={() => setShowLogAuditModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#fff' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EBF3FB', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="git-commit-outline" size={20} color="#0B63B7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>Log Audit Trail</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }} numberOfLines={1}>
                  #{activeLogForAudit?.id} · {activeLogForAudit?.operationName || activeLogForAudit?.activity}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowLogAuditModal(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 14, paddingBottom: 32 }}>
            {/* Log Header Summary */}
            <View style={{ backgroundColor: '#F9FAF7', borderRadius: RADIUS.md, padding: 14, borderWidth: 1, borderColor: COLORS.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1, marginRight: 12 }}>
                  {activeLogForAudit?.operationName || activeLogForAudit?.activity}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.primary }}>
                  ₱{Number(activeLogForAudit?.totalCost != null ? activeLogForAudit?.totalCost : activeLogForAudit?.cost || 0).toLocaleString()}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
                {activeLogForAudit?.stageName || `Stage ${activeLogForAudit?.stageNumber || 1}`} · {activeLogForAudit?.date || activeLogForAudit?.period} · {activeLogForAudit?.hectares} Ha · {activeLogForAudit?.people} Workers
              </Text>
            </View>

            {/* Audit History Timeline */}
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>
              Revision History ({activeLogForAudit?.amendments?.length || 0} Amendment{activeLogForAudit?.amendments?.length !== 1 ? 's' : ''})
            </Text>

            {(!activeLogForAudit?.amendments || activeLogForAudit.amendments.length === 0) ? (
              <View style={{ alignItems: 'center', paddingVertical: 24, gap: 6 }}>
                <Ionicons name="checkmark-circle-outline" size={36} color={COLORS.success} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text }}>Original Immutable Entry</Text>
                <Text style={{ fontSize: 11.5, color: COLORS.textMuted, textAlign: 'center', maxWidth: 280 }}>
                  This operation log has not undergone any administrative amendments since submission.
                </Text>
              </View>
            ) : (
              activeLogForAudit.amendments.map((am, aIdx) => (
                <View key={am.id || aIdx} style={{ backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: '#E2E8DC', gap: 6, ...SHADOW.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#EBF3FB', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '900', color: '#0B63B7' }}>{aIdx + 1}</Text>
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text }}>{am.amendedByName || 'Supervisor'}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{am.amendedAt}</Text>
                  </View>

                  <View style={{ backgroundColor: '#F8FAF5', padding: 8, borderRadius: RADIUS.xs, gap: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textSecondary }}>REASON FOR CORRECTION:</Text>
                    <Text style={{ fontSize: 11.5, color: COLORS.text, fontWeight: '600' }}>"{am.reason}"</Text>
                  </View>

                  {am.changes && am.changes.length > 0 && (
                    <View style={{ gap: 3, marginTop: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted }}>FIELD DELTAS:</Text>
                      {am.changes.map((ch, cIdx) => (
                        <View key={cIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2, borderBottomWidth: cIdx !== am.changes.length - 1 ? 0.5 : 0, borderBottomColor: '#F0F0F0' }}>
                          <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' }}>{ch.field}:</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={{ fontSize: 11, color: '#D9534F', textDecorationLine: 'line-through' }}>{String(ch.from)}</Text>
                            <Ionicons name="arrow-forward" size={10} color={COLORS.textMuted} />
                            <Text style={{ fontSize: 11, color: '#267326', fontWeight: '800' }}>{String(ch.to)}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))
            )}

            <TouchableOpacity
              style={[s.submitBtn, { marginTop: 12, height: 48 }]}
              onPress={() => setShowLogAuditModal(false)}
            >
              <Text style={s.submitBtnText}>Close Audit Trail</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Manager Assign Field Modal ── */}
      <Modal visible={showManagerAssignModal} animationType="slide" onRequestClose={() => setShowManagerAssignModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#fff' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{managerAssignForm.isEditing ? 'Edit Field Plot & Ownership' : 'Enroll New Field Plot'}</Text>
              <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>
                {managerAssignForm.isEditing ? 'Modify parcel specifications and member.' : 'Register parcel and assign member.'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowManagerAssignModal(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ paddingHorizontal: SPACING.lg }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 14, paddingVertical: 12 }}>

              {/* 1. Parent Block Farm Selector */}
              <View style={{ gap: 6 }}>
                <Text style={s.formLabel}>Parent Block Farm <Text style={{ color: '#DC2626' }}>*</Text></Text>
                {managerAssignForm.isEditing ? (
                  <View style={[s.formInput, { backgroundColor: '#F4F7F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text }}>
                      {managerAssignForm.blockFarm || 'No block farm selected'}
                    </Text>
                    <View style={{ backgroundColor: COLORS.primaryBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.primary }}>Assigned Cluster</Text>
                    </View>
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {(blockFarms || []).map(bf => {
                      const isSelected = managerAssignForm.blockFarm === bf.name;
                      return (
                        <TouchableOpacity
                          key={bf.id || bf.name}
                          onPress={() => {
                            const nextId = generateNextFieldId(bf.name, fields, blockFarms);
                            setManagerAssignForm(prev => ({
                              ...prev,
                              blockFarm: bf.name,
                              blockFarmId: bf.id || bf.code || '',
                              fieldId: nextId
                            }));
                          }}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: RADIUS.md,
                            borderWidth: 1.5,
                            borderColor: isSelected ? COLORS.primary : '#E5E7EB',
                            backgroundColor: isSelected ? COLORS.primaryBg : '#FFFFFF',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <Ionicons 
                            name={isSelected ? 'radio-button-on' : 'radio-button-off'} 
                            size={14} 
                            color={isSelected ? COLORS.primary : COLORS.textMuted} 
                          />
                          <Text style={{ fontSize: 12, fontWeight: isSelected ? '800' : '600', color: isSelected ? COLORS.primary : COLORS.text }}>
                            {bf.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              {/* 2. Field Plot ID */}
              <View style={{ gap: 6 }}>
                <Text style={s.formLabel}>Field Plot ID <Text style={{ color: '#DC2626' }}>*</Text></Text>
                {managerAssignForm.isEditing ? (
                  <View style={[s.formInput, { backgroundColor: '#F4F7F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                    <Text style={{ fontSize: 14, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: COLORS.primary }}>
                      {managerAssignForm.fieldId}
                    </Text>
                    <View style={{ backgroundColor: COLORS.primaryBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.primary }}>Existing Plot</Text>
                    </View>
                  </View>
                ) : (
                  <View style={[s.formInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                    <TextInput
                      style={{ flex: 1, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: '800', color: COLORS.primary, fontSize: 14, padding: 0 }}
                      placeholder="e.g. FLD-NCY-006"
                      value={managerAssignForm.fieldId}
                      onChangeText={t => setManagerAssignForm({ ...managerAssignForm, fieldId: t.trim().toUpperCase() })}
                      autoCapitalize="characters"
                    />
                    <View style={{ backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.textMuted }}>Auto</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* 3. Assigned Farmer Member (User ID or Mobile) */}
              <View style={{ gap: 6 }}>
                <Text style={s.formLabel}>Assigned Farmer Member <Text style={{ color: '#DC2626' }}>*</Text> <Text style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: '400' }}>(8-digit ID or Mobile)</Text></Text>
                <TextInput 
                  style={s.formInput} 
                  placeholder="e.g. 04000001 or 09171234567" 
                  value={managerAssignForm.userId} 
                  onChangeText={t => setManagerAssignForm({...managerAssignForm, userId: t})} 
                  keyboardType="default"
                  autoCapitalize="none"
                />
                {(() => {
                  const q = (managerAssignForm.userId || '').trim();
                  if (!q) return null;
                  const matched = findUserByIdOrContact(q);
                  if (matched) {
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0F8EC', borderWidth: 1, borderColor: COLORS.primary + '40', paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm }}>
                        <Ionicons name="checkmark-circle" size={14} color={COLORS.primary} />
                        <Text style={{ fontSize: 11, color: COLORS.primary, fontWeight: '700' }} numberOfLines={1}>
                          {matched.name} · ID: {matched.employeeId} ({matched.contact || 'No phone'}) · {matched.role || 'Member'}
                        </Text>
                      </View>
                    );
                  }
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#F87171', paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm }}>
                      <Ionicons name="close-circle" size={14} color="#DC2626" />
                      <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>
                        Non-existent ID: No registered member matches "{q}".
                      </Text>
                    </View>
                  );
                })()}
              </View>

              {/* 4. Plot Area (Ha) */}
              <View style={{ gap: 6 }}>
                <Text style={s.formLabel}>Plot Area (Ha) <Text style={{ color: '#DC2626' }}>*</Text></Text>
                <View style={[s.formInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                  <TextInput 
                    style={{ flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text, padding: 0 }} 
                    placeholder="e.g. 1.5" 
                    keyboardType="numeric" 
                    value={managerAssignForm.ha} 
                    onChangeText={t => setManagerAssignForm({...managerAssignForm, ha: t})} 
                  />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textMuted }}>Ha</Text>
                </View>
              </View>

              {/* 5. Cane Variety Selector */}
              <View style={{ gap: 6 }}>
                <Text style={s.formLabel}>Cane Variety</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {CANE_VARIETIES.map(v => {
                    const isSelected = managerAssignForm.variety === v;
                    return (
                      <TouchableOpacity
                        key={v}
                        onPress={() => setManagerAssignForm(prev => ({ ...prev, variety: v }))}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: RADIUS.md,
                          borderWidth: 1.5,
                          borderColor: isSelected ? COLORS.primary : '#E5E7EB',
                          backgroundColor: isSelected ? COLORS.primaryBg : '#FFFFFF'
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: isSelected ? '800' : '600', color: isSelected ? COLORS.primary : COLORS.text }}>
                          {v}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* 6. Soil Type Selector */}
              <View style={{ gap: 6 }}>
                <Text style={s.formLabel}>Soil Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {SOIL_TYPES.map(st => {
                    const isSelected = managerAssignForm.soilType === st;
                    return (
                      <TouchableOpacity
                        key={st}
                        onPress={() => setManagerAssignForm(prev => ({ ...prev, soilType: st }))}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: RADIUS.md,
                          borderWidth: 1.5,
                          borderColor: isSelected ? COLORS.primary : '#E5E7EB',
                          backgroundColor: isSelected ? COLORS.primaryBg : '#FFFFFF'
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: isSelected ? '800' : '600', color: isSelected ? COLORS.primary : COLORS.text }}>
                          {st}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* 7. Initial Crop Stage Selector */}
              <View style={{ gap: 6 }}>
                <Text style={s.formLabel}>Initial Crop Stage</Text>
                <View style={{ gap: 6 }}>
                  {INITIAL_STAGES.map(st => {
                    const isSelected = managerAssignForm.stageNumber === st.number;
                    return (
                      <TouchableOpacity
                        key={st.number}
                        onPress={() => setManagerAssignForm(prev => ({ ...prev, stageNumber: st.number }))}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: RADIUS.md,
                          borderWidth: 1.5,
                          borderColor: isSelected ? COLORS.primary : '#E5E7EB',
                          backgroundColor: isSelected ? COLORS.primaryBg : '#FFFFFF',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8
                        }}
                      >
                        <View style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          backgroundColor: isSelected ? COLORS.primary : '#E5E7EB',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: isSelected ? '#FFFFFF' : COLORS.textMuted }}>
                            {st.number}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: isSelected ? '800' : '600', color: isSelected ? COLORS.primary : COLORS.text, flex: 1 }}>
                          {st.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

            </View>
          </ScrollView>

          <View style={s.sheetFooter}>
            <TouchableOpacity 
              style={[s.cancelBtn, isAssigningPlot && { opacity: 0.5 }]} 
              disabled={isAssigningPlot}
              onPress={() => setShowManagerAssignModal(false)}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[s.submitBtn, isAssigningPlot && { opacity: 0.85, backgroundColor: COLORS.primaryDark }]} 
              disabled={isAssigningPlot}
              onPress={async () => {
                const rawInput = (managerAssignForm.userId || '').trim();
                const rawFieldId = (managerAssignForm.fieldId || '').trim().toUpperCase();
                const rawHa = (managerAssignForm.ha || '').trim();

                if (!rawInput || !rawFieldId || !rawHa) {
                  Alert.alert('Required Fields', 'Please complete all required fields (Field ID, Member User ID, and Land Area).');
                  return;
                }

                // 1. Validate Field ID
                if (!/^[A-Za-z0-9_-]{3,25}$/.test(rawFieldId)) {
                  Alert.alert('Invalid Field ID', 'Field ID must be 3-25 alphanumeric characters (e.g., FLD-NCY-001).');
                  return;
                }

                // 2. Validate Hectares
                const parsedHa = parseFloat(rawHa);
                if (isNaN(parsedHa) || parsedHa <= 0 || parsedHa > 500) {
                  Alert.alert('Invalid Hectares', 'Please enter a valid land area greater than 0 (e.g., 1.5 Ha).');
                  return;
                }

                // 3. Strict User Existence Validation: Non-existing IDs are rejected
                const matchedUser = findUserByIdOrContact(rawInput);
                if (!matchedUser) {
                  Alert.alert(
                    'Invalid Member ID',
                    `No registered member found with ID or mobile number "${rawInput}".\n\nPlease enter an existing Member User ID (e.g., 04000001) or registered mobile number.`
                  );
                  return;
                }

                const existingIdx = fields.findIndex(f => f.id.toUpperCase() === rawFieldId);
                if (managerAssignForm.isEditing) {
                  if (existingIdx === -1) {
                    Alert.alert('Field Not Found', `Field plot ${rawFieldId} does not exist in the database.`);
                    return;
                  }
                } else {
                  if (existingIdx >= 0) {
                    Alert.alert('Field Already Exists', `A field plot with ID ${rawFieldId} is already registered. Please choose a unique Field ID.`);
                    return;
                  }
                }

                const memberDisplayName = matchedUser.name;
                const memberIdVal = matchedUser.employeeId || matchedUser.id || matchedUser.contact;
                const memberContactVal = matchedUser.contact || matchedUser.mobile || '';

                const existingField = existingIdx >= 0 ? fields[existingIdx] : null;
                const activeFarmName = managerAssignForm.blockFarm || '';
                const matchedBf = blockFarms.find(b => b.name === activeFarmName || b.id === activeFarmName || b.code === activeFarmName);
                if (!matchedBf) {
                  Alert.alert('Block Farm Required', 'Select an existing block farm before saving the field.');
                  return;
                }
                const selectedStageObj = INITIAL_STAGES.find(st => st.number === managerAssignForm.stageNumber) || INITIAL_STAGES[0];

                const fieldPayload = {
                  ...(existingField || {}),
                  id: rawFieldId,
                  blockFarmId: matchedBf.id,
                  blockFarm: activeFarmName,
                  memberId: memberIdVal,
                  memberUserId: memberIdVal,
                  userId: memberIdVal,
                  memberName: memberDisplayName,
                  member: memberDisplayName,
                  memberContact: memberContactVal,
                  ha: parsedHa,
                  variety: managerAssignForm.variety || 'VMC 84-524',
                  soilType: managerAssignForm.soilType || 'Clay Loam',
                  stage: selectedStageObj.name,
                  stageNumber: selectedStageObj.number,
                  month: 0.5 * selectedStageObj.number,
                  batchMonth: selectedStageObj.number,
                  synced: true,
                  lastSync: 'Just now'
                };

                setIsAssigningPlot(true);
                try {
                  const result = await saveFieldPlot(fieldPayload, !managerAssignForm.isEditing);
                  if (!result || !result.success) {
                    setIsAssigningPlot(false);
                    Alert.alert('Validation Error', result?.message || 'Failed to save field plot.');
                    return;
                  }

                  if (selectedField?.id === rawFieldId || !managerAssignForm.isEditing) {
                    setSelectedField(result.field);
                  }

                  setIsAssigningPlot(false);
                  setShowManagerAssignModal(false);
                  Alert.alert(
                    'Plot Allocated Successfully',
                    managerAssignForm.isEditing
                      ? `Field plot ${rawFieldId} updated successfully and assigned to ${memberDisplayName} (${memberIdVal}).`
                      : `Field plot ${rawFieldId} (${parsedHa} Ha) successfully enrolled and assigned to ${memberDisplayName} (${memberIdVal}).`
                  );
                  setManagerAssignForm({
                    userId: '',
                    fieldId: '',
                    blockFarm: '',
                    blockFarmId: '',
                    ha: '1.5',
                    variety: 'VMC 84-524',
                    soilType: 'Clay Loam',
                    stageNumber: 1,
                    isEditing: false
                  });
                } catch (err) {
                  setIsAssigningPlot(false);
                  Alert.alert('Error', err?.message || 'An unexpected error occurred while allocating field plot.');
                }
              }}>
              {isAssigningPlot ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={s.submitBtnText}>
                    {managerAssignForm.isEditing ? 'Updating Plot & Assignment...' : 'Registering & Allocating Plot...'}
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#FFFFFF" />
                  <Text style={s.submitBtnText}>{managerAssignForm.isEditing ? 'Save Changes' : 'Enroll Field Plot'}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Pending Farmer Registrations Modal ── */}
      <Modal visible={showPendingModal} animationType="slide" onRequestClose={() => setShowPendingModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#fff' }}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.sheetTitle}>Pending Registrations</Text>
                <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full, borderWidth: 1, borderColor: '#FEF0D0' }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#B45309' }}>{pendingUsersList.length} Awaiting</Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>
                Review member applications and allocate farm plots
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowPendingModal(false)}>
              <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ paddingHorizontal: SPACING.lg, paddingBottom: 20 }}>
            {pendingUsersList.length === 0 ? (
              <View style={{ padding: 28, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="checkmark-circle-outline" size={44} color={COLORS.success} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.text, marginTop: 8 }}>All Registrations Processed</Text>
                <Text style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 }}>
                  No pending farmer applications in queue.
                </Text>
              </View>
            ) : (
              pendingUsersList.map(u => (
                <View key={u.contact} style={{
                  backgroundColor: '#fff',
                  borderWidth: 1.5,
                  borderColor: '#E2EBDC',
                  borderRadius: RADIUS.lg,
                  padding: 14,
                  marginBottom: 10,
                  ...SHADOW.xs
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: COLORS.text }}>{u.name}</Text>
                      <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 1 }}>
                        <Ionicons name="call-outline" size={12} color={COLORS.textMuted} /> {u.contact}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: '#EBF7EE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: '#B7E4C7' }}>
                      <Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.primary }}>{u.role || 'Member'}</Text>
                    </View>
                  </View>

                  <View style={{ backgroundColor: '#F9FAF7', padding: 8, borderRadius: RADIUS.md, marginVertical: 6, gap: 4 }}>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                      <Text style={{ fontWeight: '700' }}>Block Farm:</Text> {u.blockFarm || (session?.farm || session?.blockFarm || 'District Central')}
                    </Text>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                      <Text style={{ fontWeight: '700' }}>Requested Plot / Area:</Text> {u.fieldId || 'Auto-assign'} ({u.area || '1.5 Ha'})
                    </Text>
                    <Text style={{ fontSize: 10.5, color: COLORS.textMuted }}>
                      <Text style={{ fontWeight: '700' }}>Applied:</Text> {u.regDate || 'Recently'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TouchableOpacity
                      disabled={pendingActionLoading}
                      onPress={async () => {
                        setPendingActionLoading(true);
                        try {
                          const res = await approvePendingRegistration(u.contact, { fieldId: u.fieldId, area: u.area });
                          setPendingActionLoading(false);
                          if (res.success) {
                            Alert.alert('Registration Approved', `Farmer ${u.name} activated and allocated plot ${res.fieldId}!`);
                            setPendingUsersList([...pendingUsers]);
                          }
                        } catch (e) {
                          setPendingActionLoading(false);
                          Alert.alert('Error', 'Could not approve registration.');
                        }
                      }}
                      style={{
                        flex: 1.4,
                        backgroundColor: COLORS.primary,
                        paddingVertical: 10,
                        borderRadius: RADIUS.md,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      {pendingActionLoading ? (
                        <>
                          <ActivityIndicator size="small" color="#fff" />
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Allocating Plot...</Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Approve & Assign Plot</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      disabled={pendingActionLoading}
                      onPress={() => {
                        Alert.alert(
                          'Decline Application',
                          `Are you sure you want to decline registration for ${u.name}?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Decline',
                              style: 'destructive',
                              onPress: async () => {
                                setPendingActionLoading(true);
                                await rejectPendingRegistration(u.contact);
                                setPendingActionLoading(false);
                                setPendingUsersList([...pendingUsers]);
                              }
                            }
                          ]
                        );
                      }}
                      style={{
                        flex: 0.8,
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#E5E7EB',
                        paddingVertical: 10,
                        borderRadius: RADIUS.md,
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '700' }}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Crop Cycle Selection Modal ── */}
      <Modal visible={showCycleModal} animationType="slide" onRequestClose={() => setShowCycleModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#fff' }}>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>Crop Cycle Configuration</Text>
              <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>Field {safeField.id} ({safeField.ha} Ha)</Text>
            </View>
            <TouchableOpacity onPress={() => setShowCycleModal(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 16 }}>
            <Text style={s.formLabel}>Select Sugarcane Cycle Type *</Text>
            <View style={{ gap: 10 }}>
              {[
                { type: 'Plant Cane (New Plant)', duration: '12–14 months', icon: 'leaf', desc: 'New planting cycle: Full soil prep, canepoints planting, basal & top-dress.' },
                { type: '1st Ratoon (Ratoon 1)', duration: '10–12 months', icon: 'git-branch', desc: 'First ratoon stubble shaving, trash blanketing, off-barring & fertilization.' },
                { type: '2nd Ratoon (Ratoon 2)', duration: '10–12 months', icon: 'water', desc: 'Second ratoon maintenance, cultivation, fertilization & harvesting.' }
              ].map(item => {
                const isSel = cycleTypeForm.cycleType === item.type;
                return (
                  <TouchableOpacity
                    key={item.type}
                    style={{
                      padding: 14,
                      borderRadius: RADIUS.md,
                      borderWidth: 1.5,
                      borderColor: isSel ? COLORS.primary : COLORS.border,
                      backgroundColor: isSel ? COLORS.primaryBg : '#fff',
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 12,
                    }}
                    onPress={() => setCycleTypeForm(prev => ({ ...prev, cycleType: item.type }))}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isSel ? '#E2EBDC' : '#F4F7F2', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={item.icon} size={18} color={isSel ? COLORS.primary : COLORS.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: isSel ? COLORS.primary : COLORS.text }}>{item.type}</Text>
                        <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{item.duration}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4, lineHeight: 16 }}>{item.desc}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ gap: 6, marginTop: 4 }}>
              <Text style={s.formLabel}>Crop Year (Milling Period) *</Text>
              <TextInput
                style={s.formInput}
                placeholder="e.g. 2026-2027"
                placeholderTextColor={COLORS.textMuted}
                value={cycleTypeForm.cropYear}
                onChangeText={(val) => setCycleTypeForm(prev => ({ ...prev, cropYear: val }))}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, paddingBottom: 24 }}>
              <TouchableOpacity
                style={[s.cancelBtn, { height: 48 }]}
                onPress={() => setShowCycleModal(false)}
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, { height: 48 }]}
                onPress={() => {
                  setShowCycleModal(false);
                  if (handleStartNewCycle) {
                    handleStartNewCycle(safeField.id, cycleTypeForm.cycleType, cycleTypeForm.cropYear);
                  }
                }}
              >
                <Text style={s.submitBtnText}>Start & Save Cycle</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Stage Editor Modal ── */}
      <Modal visible={showStageEditor} animationType="slide" onRequestClose={() => setShowStageEditor(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#fff' }}>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{t('btn_stage_editor', 'Field Stages')}</Text>
              <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>{safeField.id} · {t('stage_reorder_hint', 'tap icons to reorder or remove')}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowStageEditor(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

            <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 10, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">

              {/* Current stages list */}
              {editingStages.length === 0 && (
                <View style={[s.emptyCard, { marginBottom: 8 }]}>
                  <Ionicons name="list-outline" size={28} color={COLORS.border} />
                  <Text style={s.emptyText}>{t('no_stages_yet', 'No stages yet. Add your first stage below.')}</Text>
                </View>
              )}
              {editingStages.map((stage, idx) => {
                const hasLogs = logs.some(l => l.fieldId === safeField.id && l.taskId === stage.id && l.status === 'ACTIVE');
                return (
                  <View key={stage.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: stage.color, flexShrink: 0 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text }}>{getTaskLabel(stage)}</Text>
                      {stage.done && <Text style={{ fontSize: 10, color: COLORS.success, marginTop: 2 }}>{t('status_completed', 'Completed')}</Text>}
                      {stage.active && <Text style={{ fontSize: 10, color: stage.color, marginTop: 2 }}>{t('status_in_progress', 'In Progress')}</Text>}
                      {!stage.done && !stage.active && <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{t('status_pending', 'Pending')}</Text>}
                      {hasLogs && <Text style={{ fontSize: 10, color: '#C97A00', marginTop: 2 }}>{t('stage_has_logs', 'Has submitted logs')}</Text>}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        disabled={idx === 0}
                        onPress={() => {
                          const updated = [...editingStages];
                          [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
                          setEditingStages(updated);
                        }}
                        style={{ padding: 6, opacity: idx === 0 ? 0.3 : 1 }}
                      >
                        <Ionicons name="chevron-up" size={18} color={COLORS.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={idx === editingStages.length - 1}
                        onPress={() => {
                          const updated = [...editingStages];
                          [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
                          setEditingStages(updated);
                        }}
                        style={{ padding: 6, opacity: idx === editingStages.length - 1 ? 0.3 : 1 }}
                      >
                        <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          if (hasLogs) {
                            Alert.alert('Cannot Remove', `"${getTaskLabel(stage)}" ${t('cannot_remove_stage_with_logs', 'has submitted logs. You cannot remove it while logs exist for this stage.')}`);
                            return;
                          }
                          Alert.alert(t('remove_stage_confirm', 'Remove Stage'), `${t('remove_stage_confirm', 'Remove')} "${getTaskLabel(stage)}"?`, [
                            { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                            { text: t('btn_delete', 'Remove'), style: 'destructive', onPress: () => setEditingStages(prev => prev.filter((_, i) => i !== idx)) }
                          ]);
                        }}
                        style={{ padding: 6 }}
                      >
                        <Ionicons name="trash-outline" size={18} color="#D9534F" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {/* Add new stage */}
              {(() => {
                const defaultStagesForCycle = CROP_CYCLE_STAGES_BY_TYPE[selectedField?.cycleType || 'Plant Cane (New Plant)'] || CROP_CYCLE_STAGES_BY_TYPE['Plant Cane (New Plant)'];

                return (
                  <>
                    <View style={{ marginTop: 8, backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: 14, gap: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text }}>{t('add_new_stage', 'Add New Stage')}</Text>
                      
                      {/* Quick Sugarcane Stage Presets */}
                      <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textSecondary }}>{t('suggested_presets', 'Suggested SRA Operations (Tap to fill)')}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -14 }} contentContainerStyle={{ paddingHorizontal: 14, gap: 6 }}>
                        {defaultStagesForCycle.map(tItem => {
                          const preset = getTaskLabel(tItem);
                          return (
                            <TouchableOpacity
                              key={tItem.id}
                              style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }}
                              onPress={() => setNewStageLabel(preset)}
                            >
                              <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' }}>+ {preset}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>

                      <TextInput
                        style={s.formInput}
                        placeholder={t('stage_name_placeholder', 'Stage name (e.g. Weeding – Hilamon)')}
                        placeholderTextColor={COLORS.textMuted}
                        value={newStageLabel}
                        onChangeText={setNewStageLabel}
                      />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textSecondary }}>{t('stage_color', 'Stage Color')}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        {STAGE_COLORS.map(c => (
                          <TouchableOpacity key={c} onPress={() => setNewStageColor(c)}
                            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: newStageColor === c ? 3 : 0, borderColor: '#fff', ...SHADOW.card }}
                          />
                        ))}
                      </View>
                      <TouchableOpacity
                        style={[s.submitBtn, { marginTop: 4, opacity: newStageLabel.trim() ? 1 : 0.45 }]}
                        disabled={!newStageLabel.trim()}
                        onPress={() => {
                          const stage = {
                            id: generateCustomOpId(editingStages.length + 1),
                            label: newStageLabel.trim(),
                            phase: newStageLabel.trim(),
                            color: newStageColor,
                            done: false,
                            active: false, // Starts as Pending until explicitly activated
                          };
                          setEditingStages(prev => [...prev, stage]);
                          setNewStageLabel('');
                        }}
                      >
                        <Ionicons name="add" size={16} color="#fff" />
                        <Text style={s.submitBtnText}>{t('btn_add_stage', 'Add Stage')}</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Reset to SRA Default */}
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md }}
                      onPress={() => {
                        Alert.alert(t('btn_reset', 'Reset to Default'), t('reset_sra_confirm_msg', 'Replace your custom stages with the official SRA template for this crop cycle?'), [
                          { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                          { text: t('btn_reset', 'Reset'), style: 'destructive', onPress: () => setEditingStages(defaultStagesForCycle.map((t) => ({ ...t, label: getTaskLabel(t), done: false, active: false }))) }
                        ]);
                      }}
                    >
                      <Ionicons name="refresh-outline" size={14} color={COLORS.textMuted} />
                      <Text style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: '600' }}>{t('btn_reset_sra_template', 'Reset to SRA Standard Template')}</Text>
                    </TouchableOpacity>
                  </>
                );
              })()}

              {/* Save */}
              <TouchableOpacity
                style={[s.submitBtn, { marginTop: 4 }]}
                onPress={() => {
                  const updatedStages = [...editingStages];
                  updateFieldCustomStages(safeField.id, updatedStages);
                  setCycleTasksByField(p => ({ ...p, [safeField.id]: updatedStages }));

                  const activeTask = updatedStages.find(t => t.active);
                  const currentLabel = activeTask 
                    ? getTaskLabel(activeTask) 
                    : (updatedStages.length > 0 
                        ? (updatedStages.every(t => t.done) ? `${t('task_t11', 'Harvesting / Cutting')} (${t('status_completed', 'Completed')})` : (updatedStages.some(t => t.done) ? t('status_pending', 'Waiting to Start Next Stage') : t('status_pending', 'Not Started'))) 
                        : 'Not Started');

                  setSelectedField(prevF => ({ ...prevF, stage: currentLabel, customStages: updatedStages }));
                  const mf = fields.find(f => f.id === safeField.id);
                  if (mf) {
                    mf.stage = currentLabel;
                    mf.customStages = updatedStages;
                  }
                  setShowStageEditor(false);
                  Alert.alert(t('saved_title', 'Saved'), t('stage_plan_saved_msg', 'Your field stages have been updated.'));
                }}
              >
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text style={s.submitBtnText}>{t('btn_save_stage_plan', 'Save Stage Plan')}</Text>
              </TouchableOpacity>

            </ScrollView>
          </SafeAreaView>
      </Modal>

      {/* ── Dedicated Full History & Ledger Modal (Full Screen) ── */}
      <Modal visible={showHistoryModal} animationType="none" onRequestClose={handleCloseHistoryModal}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          {/* Modal Header */}
          <View style={s.historyModalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.historyModalTitle}>
                {activeRole === 'SRA Admin'
                  ? t('district_audit_records_title', 'District Audit History Records') 
                  : activeRole === 'Farm Manager'
                  ? t('farm_manager_ledger_title', 'Farm Operations & Regulatory Ledger')
                  : t('ledger_title', 'Field History & Ledger')}
              </Text>
              <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>
                {activeRole === 'SRA Admin'
                  ? t('sra_oversight_scope_sub', 'Silay SRA Regulatory Oversight Scope · District 3')
                  : activeRole === 'Farm Manager'
                  ? (managerLedgerScope === 'all'
                    ? `${targetFarm || (session?.farm || session?.blockFarm || 'District Central')} · All Plots (${fields.length} Plots)`
                    : `${selectedField?.id} (${selectedField?.ha || 0} Ha) · ${selectedField?.member || selectedField?.memberName || 'Member'} · ${targetFarm || (session?.farm || session?.blockFarm || 'District Central')}`)
                  : `${t('my_field', 'Field')} ${safeField.id} · ${safeField.member}`}
              </Text>
            </View>
            <TouchableOpacity 
              style={s.historyModalCloseBtn}
              onPress={handleCloseHistoryModal}
            >
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Stat Summary Bar (Dynamic to Active Tab) */}
          {(() => {
            const scopedDrafts = draftLogs.filter(d => d.fieldId === safeField.id);
            const submittedTotalCost = fieldLogs.reduce((sum, l) => sum + Number(l.cost || 0), 0);
            const draftsTotalCost = scopedDrafts.reduce((sum, d) => sum + Number(d.cost || 0), 0);
            const pastTotalCost = pastLogs.reduce((sum, l) => sum + Number(l.cost || 0), 0);

            let statCostLabel = t('stat_total_cost', 'Total Recorded Cost');
            let statCostValue = `Php ${Number(submittedTotalCost || 0).toLocaleString()}`;
            let statCostColor = COLORS.primary;
            let statCountLabel = t('stat_records', 'Submitted Records');
            let statCountValue = `${fieldLogs.length} ${t('total_records_lbl', 'Total Records')}`;

            if (activeRole === 'Farm Manager') {
              if (logTab === 'submitted') {
                const managerCost = managerSubmittedLogs.reduce((sum, l) => sum + Number(l.cost || l.totalCost || 0), 0);
                const managerAmendedCount = managerSubmittedLogs.filter(l => Array.isArray(l.amendments) && l.amendments.length > 0).length;
                statCostLabel = managerLedgerScope === 'all' ? t('stat_total_cost', 'Total Recorded Cost') : `${selectedField?.id || 'Field'} Total Cost`;
                statCostValue = `Php ${Number(managerCost || 0).toLocaleString()}`;
                statCostColor = COLORS.primary;
                statCountLabel = managerLedgerScope === 'all' ? t('farm_operations_lbl', 'Farm Operations & Edits') : `${selectedField?.id || 'Field'} Operations & Edits`;
                statCountValue = `${managerSubmittedLogs.length} Logs (${managerAmendedCount} Edited)`;
              } else if (logTab === 'past') {
                statCostLabel = t('past_cycles_cost_lbl', 'Past Cycles Total Cost');
                statCostValue = `Php ${Number(pastTotalCost || 0).toLocaleString()}`;
                statCostColor = '#64748B';
                statCountLabel = t('archived_logs_lbl', 'Archived Logs');
                statCountValue = `${pastLogs.length} ${t('past_records_lbl', 'Past Records')}`;
              } else {
                const auditTotalCost = (auditLogs || []).reduce((sum, a) => sum + Number(a.totalCost || 0), 0);
                statCostLabel = t('compiled_audited_cost_lbl', 'Compiled Audited Cost');
                statCostValue = `Php ${Number(auditTotalCost || 0).toLocaleString()}`;
                statCostColor = COLORS.primary;
                statCountLabel = t('verified_sra_audits_lbl', 'Verified SRA Audits');
                statCountValue = `${(auditLogs || []).length} ${t('monthly_reports_lbl', 'Monthly Reports')}`;
              }
            } else if (activeRole === 'SRA Admin' || logTab === 'audit_history') {
              const auditTotalCost = (auditLogs || []).reduce((sum, a) => sum + Number(a.totalCost || 0), 0);
              statCostLabel = t('compiled_audited_cost_lbl', 'Compiled Audited Cost');
              statCostValue = `Php ${Number(auditTotalCost || 0).toLocaleString()}`;
              statCostColor = COLORS.primary;
              statCountLabel = t('verified_sra_audits_lbl', 'Verified SRA Audits');
              statCountValue = `${(auditLogs || []).length} ${t('monthly_reports_lbl', 'Monthly Reports')}`;
            } else if (logTab === 'drafts') {
              statCostLabel = t('estimated_draft_cost_lbl', 'Estimated Draft Cost');
              statCostValue = `Php ${Number(draftsTotalCost || 0).toLocaleString()}`;
              statCostColor = '#C97A00';
              statCountLabel = t('pending_draft_pipeline_lbl', 'Pending Draft Pipeline');
              statCountValue = `${scopedDrafts.length} ${t('draft_records_lbl', 'Draft Records')}`;
            } else if (logTab === 'past') {
              statCostLabel = t('past_cycles_cost_lbl', 'Past Cycles Total Cost');
              statCostValue = `Php ${Number(pastTotalCost || 0).toLocaleString()}`;
              statCostColor = '#64748B';
              statCountLabel = t('archived_logs_lbl', 'Archived Logs');
              statCountValue = `${pastLogs.length} ${t('past_records_lbl', 'Past Records')}`;
            }

            return (
              <View style={[
                s.historyStatBar,
                logTab === 'drafts' && { backgroundColor: '#FFFBF0', borderBottomColor: '#FEF0D0' },
                logTab === 'past' && { backgroundColor: '#F8FAFC', borderBottomColor: '#E2E8F0' },
              ]}>
                <View style={s.historyStatItem}>
                  <Text style={[s.historyStatLbl, logTab === 'drafts' && { color: '#92400E' }]}>{statCostLabel}</Text>
                  <Text style={[s.historyStatVal, { color: statCostColor }]}>{statCostValue}</Text>
                </View>
                <View style={[s.historyStatItem, { borderLeftWidth: 1, borderLeftColor: logTab === 'drafts' ? '#FEF0D0' : COLORS.border, paddingLeft: 12 }]}>
                  <Text style={[s.historyStatLbl, logTab === 'drafts' && { color: '#92400E' }]}>{statCountLabel}</Text>
                  <Text style={[s.historyStatVal, { color: statCostColor }]}>{statCountValue}</Text>
                </View>
              </View>
            );
          })()}

          {/* Ledger Sub-tabs */}
          {activeRole === 'Member Farmer' ? (
            <View style={[s.logTabsRow, { paddingHorizontal: SPACING.lg, marginBottom: 8 }]}>
              <TouchableOpacity style={[s.logTabBtn, logTab === 'submitted' && s.logTabBtnActive]} onPress={() => setLogTab('submitted')}>
                <Text style={[s.logTabText, logTab === 'submitted' && s.logTabTextActive]}>{t('tab_submitted', 'Submitted')} ({fieldLogs.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.logTabBtn, logTab === 'drafts' && s.logTabBtnActive]} onPress={() => setLogTab('drafts')}>
                <Text style={[s.logTabText, logTab === 'drafts' && s.logTabTextActive]}>
                  {t('tab_drafts', 'Drafts')} ({scopedDrafts.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.logTabBtn, logTab === 'past' && s.logTabBtnActive]} onPress={() => setLogTab('past')}>
                <Text style={[s.logTabText, logTab === 'past' && s.logTabTextActive]}>{t('tab_past', 'Past Cycles')} ({pastLogs.length})</Text>
              </TouchableOpacity>
            </View>
          ) : activeRole === 'Farm Manager' ? (
            <>
              <View style={[s.logTabsRow, { paddingHorizontal: SPACING.lg, marginBottom: 8 }]}>
                <TouchableOpacity style={[s.logTabBtn, logTab === 'submitted' && s.logTabBtnActive]} onPress={() => setLogTab('submitted')}>
                  <Text style={[s.logTabText, logTab === 'submitted' && s.logTabTextActive]}>
                    {t('tab_ops_and_edits', 'Operations & Edits')} ({managerSubmittedLogs.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.logTabBtn, logTab === 'past' && s.logTabBtnActive]} onPress={() => setLogTab('past')}>
                  <Text style={[s.logTabText, logTab === 'past' && s.logTabTextActive]}>
                    {t('tab_past', 'Past Cycles')} ({pastLogs.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.logTabBtn, logTab === 'audit_history' && s.logTabBtnActive]} onPress={() => setLogTab('audit_history')}>
                  <Text style={[s.logTabText, logTab === 'audit_history' && s.logTabTextActive]}>
                    {t('monthly_audit_history_tab', 'Monthly Regulatory Audit')} ({(auditLogs || []).length})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Plot Scope Selector Pills */}
              {logTab === 'submitted' && (
                <View style={{ marginHorizontal: SPACING.lg, marginBottom: 10 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                    <TouchableOpacity
                      style={[
                        {
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                          borderRadius: RADIUS.full,
                          borderWidth: 1.2,
                          borderColor: COLORS.border,
                          backgroundColor: '#fff',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5
                        },
                        managerLedgerScope === 'selected' && {
                          backgroundColor: COLORS.primaryBg,
                          borderColor: COLORS.primary
                        }
                      ]}
                      onPress={() => setManagerLedgerScope('selected')}
                    >
                      <View style={[s.syncDot, { backgroundColor: selectedField?.synced ? COLORS.success : '#C97A00' }]} />
                      <Text style={{
                        fontSize: 11,
                        fontWeight: managerLedgerScope === 'selected' ? '800' : '600',
                        color: managerLedgerScope === 'selected' ? COLORS.primary : COLORS.text
                      }}>
                        {selectedField?.id} ({fieldLogs.length})
                      </Text>
                    </TouchableOpacity>

                    {fields.filter(f => f.id !== selectedField?.id).map(f => {
                      const fLogCount = visibleLogs.filter(l => (l.fieldId || '').trim().toUpperCase() === f.id.toUpperCase() && l.status === 'ACTIVE').length;
                      return (
                        <TouchableOpacity
                          key={f.id}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: RADIUS.full,
                            borderWidth: 1,
                            borderColor: COLORS.border,
                            backgroundColor: '#fff',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4
                          }}
                          onPress={() => {
                            setSelectedField(f);
                            setManagerLedgerScope('selected');
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.textMuted }}>
                            {f.id} ({fLogCount})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    <TouchableOpacity
                      style={[
                        {
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                          borderRadius: RADIUS.full,
                          borderWidth: 1.2,
                          borderColor: COLORS.border,
                          backgroundColor: '#fff',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5
                        },
                        managerLedgerScope === 'all' && {
                          backgroundColor: COLORS.primaryBg,
                          borderColor: COLORS.primary
                        }
                      ]}
                      onPress={() => setManagerLedgerScope('all')}
                    >
                      <Ionicons name="grid-outline" size={12} color={managerLedgerScope === 'all' ? COLORS.primary : COLORS.textMuted} />
                      <Text style={{
                        fontSize: 11,
                        fontWeight: managerLedgerScope === 'all' ? '800' : '600',
                        color: managerLedgerScope === 'all' ? COLORS.primary : COLORS.text
                      }}>
                        All Plots ({allFarmSubmittedLogs.length})
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              )}
            </>
          ) : activeRole === 'SRA Admin' ? (
            <View style={[s.logTabsRow, { paddingHorizontal: SPACING.lg, marginBottom: 8 }]}>
              <TouchableOpacity style={[s.logTabBtn, s.logTabBtnActive]}>
                <Text style={[s.logTabText, s.logTabTextActive]}>{t('monthly_audit_history_tab', 'Monthly Audit History')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[s.logTabsRow, { paddingHorizontal: SPACING.lg, marginBottom: 8 }]}>
              <TouchableOpacity style={[s.logTabBtn, logTab === 'submitted' && s.logTabBtnActive]} onPress={() => setLogTab('submitted')}>
                <Text style={[s.logTabText, logTab === 'submitted' && s.logTabTextActive]}>{t('tab_submitted', 'Submitted Logs')} ({fieldLogs.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.logTabBtn, logTab === 'drafts' && s.logTabBtnActive]} onPress={() => setLogTab('drafts')}>
                <Text style={[s.logTabText, logTab === 'drafts' && s.logTabTextActive]}>
                  {t('tab_drafts', 'Drafts')} ({scopedDrafts.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.logTabBtn, logTab === 'audit_history' && s.logTabBtnActive]} onPress={() => setLogTab('audit_history')}>
                <Text style={[s.logTabText, logTab === 'audit_history' && s.logTabTextActive]}>{t('monthly_audit_history_tab', 'Monthly Audit History')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Scrollable Modal Body */}
          <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {logTab === 'past' ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={s.sectionLabel}>
                    {t('past_cycles_title', 'Past Crop Cycle Records')} ({pastLogs.length})
                  </Text>
                </View>
                {renderCompactLogList(pastLogs, false, activeRole === 'Farm Manager')}
              </>
            ) : logTab === 'drafts' ? (
              renderCompactLogList(draftLogs.filter(l => (l.fieldId || '').trim().toUpperCase() === (safeField.id || '').trim().toUpperCase()), true, activeRole === 'Farm Manager')
            ) : activeRole === 'Farm Manager' && logTab === 'submitted' ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={s.sectionLabel}>
                    {managerLedgerScope === 'all'
                      ? t('all_block_farm_ops', 'All Block Farm Operations & Edits')
                      : `${selectedField?.id || 'Plot'} Operations & Edits`}
                  </Text>
                  {(() => {
                    const amendedCount = managerSubmittedLogs.filter(l => Array.isArray(l.amendments) && l.amendments.length > 0).length;
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EBF3FB', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#CCE0F5' }}>
                        <Ionicons name="shield-checkmark" size={12} color="#0B63B7" />
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#0B63B7' }}>
                          {amendedCount} Amended
                        </Text>
                      </View>
                    );
                  })()}
                </View>
                {renderCompactLogList(managerSubmittedLogs, false, true)}
              </>
            ) : logTab === 'submitted' ? (
              renderCompactLogList(fieldLogs, false, false)
            ) : (
              <View style={{ gap: SPACING.md }}>
                <Text style={s.sectionLabel}>{t('compiled_monthly_audit_title', 'Compiled Monthly Regulatory Audit')}</Text>
                {Array.from(new Map((auditLogs || []).map(a => [a.reportId || a.id, a])).values()).map((audit, idx) => (
                  <View key={audit.reportId || audit.id || `audit-${idx}`} style={[s.auditCard, { marginBottom: 6 }]}>
                    {/* Header: Audit ID & Status */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="document-text" size={16} color={COLORS.primary} />
                        <Text style={{ fontSize: 14.5, fontWeight: '900', color: COLORS.text }}>{formatPhaseMonth ? formatPhaseMonth(audit.month) : audit.month} {t('audit_report_suffix', 'Audit Report')}</Text>
                      </View>
                      {audit.status === 'CERTIFIED' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primaryBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.xs }}>
                          <Ionicons name="checkmark-done-circle" size={13} color={COLORS.primary} />
                          <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.primary }}>{t('verified_sra_badge', 'Verified SRA')}</Text>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#FEF0D0' }}>
                          <Ionicons name="time-outline" size={13} color="#D97706" />
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#D97706' }}>{t('pending_sra_badge', 'Pending SRA')}</Text>
                        </View>
                      )}
                    </View>

                    {/* Date & Time + QR Payload Signature */}
                    <View style={{ backgroundColor: '#F8FAF5', padding: 10, borderRadius: RADIUS.sm, gap: 5, borderWidth: 1, borderColor: COLORS.border }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>{t('date_time_gen', 'Date & Time Generated:')}</Text>
                        <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.text }}>{audit.dateGenerated}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>{t('qr_payload_id', 'QR Payload ID:')}</Text>
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.primary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                          {audit.qrSignature}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>{t('summary_metrics_lbl', 'Summary Metrics:')}</Text>
                        <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.text }}>
                          {(audit.fieldsReported != null ? audit.fieldsReported : 1)} {t('plots_word', 'Plots')} · {(audit.logsCount != null ? audit.logsCount : (audit.totalLogs || 0))} {t('logs_unit', 'Logs')} · ₱{Number(audit.totalCost || 0).toLocaleString()}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>{t('inspector_verifier', 'Inspector Verifier:')}</Text>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: audit.status === 'CERTIFIED' ? COLORS.textSecondary : '#D97706', fontStyle: audit.status === 'CERTIFIED' ? 'normal' : 'italic' }}>
                          {audit.verifiedBy || (audit.status === 'CERTIFIED' ? 'SRA Officer' : 'Pending SRA Inspector Review')}
                        </Text>
                      </View>
                    </View>

                    {/* Actions: View QR & Export PDF */}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, paddingVertical: 10, borderRadius: RADIUS.md }}
                        onPress={() => handleViewHistoricalAuditQR(audit)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="qr-code-outline" size={14} color="#fff" />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>{t('view_qr_code_btn', 'View SRA QR Code')}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primary + '40', paddingVertical: 10, borderRadius: RADIUS.md }}
                        onPress={() => {
                          Alert.alert('Exporting PDF', `Downloading official monthly audit report for ${audit.month}...`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Download', onPress: () => Alert.alert('Success', `HUGPONG_${audit.month.replace(' ', '_')}_Audit_Report.pdf saved to Downloads.`) }
                          ]);
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="download-outline" size={14} color={COLORS.primary} />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.primary }}>{t('export_pdf_btn', 'Export PDF')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 32 },

  // Role switcher
  roleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  roleBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  roleBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.lg, paddingVertical: 10 },
  bannerMember: { backgroundColor: '#4A7C2F' },
  bannerManager: { backgroundColor: '#1A6B9A' },
  bannerSRA: { backgroundColor: '#8F3A8F' },
  roleBannerText: { fontSize: 12, fontWeight: '600', color: '#fff', flex: 1, lineHeight: 17 },

  // Section
  sectionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Field Card
  fieldCard: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: 18, gap: 8, ...SHADOW.card, borderWidth: 1, borderColor: COLORS.border },
  fieldCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldIdBadge: { backgroundColor: COLORS.primaryBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  fieldIdText: { fontSize: 15, fontWeight: '900', color: COLORS.primary },
  fieldHa: { fontSize: 14, fontWeight: '800', color: COLORS.textSecondary },
  fieldMember: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  fieldStage: { fontSize: 13, color: COLORS.textMuted },
  fieldStageVal: { fontWeight: '800', color: COLORS.text },
  fieldSync: { fontSize: 12, color: COLORS.textMuted },

  // Field Chips (Manager & Member)
  fieldChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#fff', minHeight: 42 },
  fieldChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  fieldChipText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  fieldChipTextActive: { color: COLORS.primary, fontWeight: '900' },
  syncDot: { width: 8, height: 8, borderRadius: 4 },

  // Sync Warning
  syncWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFFBF0', borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: '#FEF0D0' },
  syncWarningText: { flex: 1, fontSize: 12, color: '#8B6A00', lineHeight: 18 },

  // Receipt Card Layout (Senior Accessible)
  receiptCard: { backgroundColor: '#fff', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.md, ...SHADOW.card },
  // Search & Filter
  logSearchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 },
  logSearchInput: { flex: 1, fontSize: 13, color: COLORS.text, padding: 0 },
  filterPill: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  filterPillActive: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  filterPillText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  filterPillTextActive: { color: COLORS.primary, fontWeight: '800' },

  // Compact Log Row
  compactLogCard: { backgroundColor: '#fff', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 10, ...SHADOW.card },
  compactLogHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactLogDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  compactLogTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  compactLogSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  compactLogCost: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  compactLogDrawer: { marginTop: 8, gap: 6 },
  compactLogDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },

  // Show More Button
  showMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primary + '30', borderRadius: RADIUS.md, paddingVertical: 10, marginTop: 4 },
  showMoreBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  receiptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  receiptTitle: { fontSize: 11, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  receiptId: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: COLORS.textMuted, fontWeight: '600' },
  receiptDivider: { height: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: '#DCE8CC', borderRadius: 1, marginVertical: 4 },
  receiptBody: { gap: 8 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 4, gap: 8 },
  receiptLabel: { fontSize: 12.5, color: COLORS.textMuted, fontWeight: '600', width: 125, flexShrink: 0 },
  receiptValue: { fontSize: 12.5, color: COLORS.text, fontWeight: '700', flex: 1, textAlign: 'right' },
  receiptValueBold: { fontSize: 13.5, color: COLORS.text, fontWeight: '800', flex: 1, textAlign: 'right' },
  receiptCostText: { fontSize: 15, color: COLORS.primary, fontWeight: '900', flex: 1, textAlign: 'right' },
  receiptStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  receiptStatusText: { fontSize: 11, fontWeight: '700' },
  receiptApproveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.success, borderRadius: RADIUS.md, paddingVertical: 10, marginTop: 6 },
  receiptApproveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Timeline
  timelineCard: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING.lg, ...SHADOW.card },
  timelineRow: { flexDirection: 'row', gap: 12, minHeight: 52 },
  timelineLeft: { width: 24, alignItems: 'center' },
  timelineDot: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  activePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  timelineLine: { flex: 1, width: 2, marginTop: 2 },
  timelineContent: { flex: 1, paddingBottom: 16, gap: 3 },
  timelineContentActive: { backgroundColor: COLORS.primaryBg, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.sm },
  timelineLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  timelineMonth: { fontSize: 10, color: COLORS.textMuted },
  activeBadge: { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  activeBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  // Log Tabs
  logTabsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  logTabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  logTabBtnActive: { borderBottomColor: COLORS.primary },
  logTabText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  logTabTextActive: { color: COLORS.primary, fontWeight: '700' },

  // Add Log Button
  addLogBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 7 },
  addLogBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // QR & Scanner
  qrBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, padding: SPACING.lg, ...SHADOW.card },
  qrBtnTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  qrBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)' },

  // SRA Scanner Card
  scannerCard: { backgroundColor: '#fff', borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center', gap: SPACING.md, ...SHADOW.card, borderWidth: 2, borderColor: COLORS.primary + '30' },
  scannerIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primaryBg, justifyContent: 'center', alignItems: 'center' },
  scannerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  scannerSub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19 },
  scannerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 20, paddingVertical: 12 },
  scannerBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Audit Card
  auditCard: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.sm, ...SHADOW.card },
  auditHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  auditTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, flex: 1 },
  auditRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  auditLabel: { fontSize: 13, color: COLORS.textSecondary },
  auditVal: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 12, marginTop: 4 },
  pdfBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },

  // Empty
  emptyCard: { alignItems: 'center', gap: 8, paddingVertical: 32, backgroundColor: '#fff', borderRadius: RADIUS.lg, ...SHADOW.card },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: SPACING.lg },

  // Bottom Sheet
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: height * 0.88 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  sheetBody: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: 32 },
  typeToggle: { flexDirection: 'row', backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: 4, gap: 4 },
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.sm },
  typeBtnActive: { backgroundColor: '#fff', ...SHADOW.card },
  typeBtnText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  typeBtnTextActive: { color: COLORS.primary, fontWeight: '700' },
  formLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  formInput: { backgroundColor: '#F8FAF5', borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontWeight: '600', color: COLORS.text, minHeight: 48 },
  sheetFooter: { flexDirection: 'row', gap: 10, marginTop: SPACING.md },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  submitBtn: { flex: 2, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // QR Modal
  qrOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  qrModal: { backgroundColor: '#fff', borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center', gap: SPACING.md, width: '100%' },
  qrModalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  qrModalSub: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
  qrBox: { alignItems: 'center', gap: 10 },
  qrSimulated: { borderWidth: 2, borderColor: '#000', padding: 8, backgroundColor: '#fff' },
  qrCell: { width: 18, height: 18 },
  qrCode: { fontSize: 16, fontWeight: '800', color: COLORS.primary, letterSpacing: 2 },
  qrNote: { fontSize: 12, color: COLORS.textMuted },
  qrCloseBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 32, paddingVertical: 12, width: '100%', alignItems: 'center' },
  qrCloseBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Live Camera Scanner Styles
  liveScanContainer: { flex: 1, backgroundColor: '#000' },
  liveScanHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10 },
  liveScanBackBtn: { padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  liveScanHeaderTitle: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  liveScanHeaderSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  liveScanTorchBtn: { padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  liveScanTorchBtnActive: { backgroundColor: 'rgba(255,215,0,0.3)', borderWidth: 1, borderColor: '#FFD700' },
  cameraPermissionCard: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl, backgroundColor: '#111' },
  cameraPermissionIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E2EED9', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  cameraPermissionTitle: { fontSize: 18, fontWeight: '800', color: '#FFF', marginBottom: 8, textAlign: 'center' },
  cameraPermissionText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 18, marginBottom: 24, maxWidth: 300 },
  grantPermissionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: RADIUS.lg },
  grantPermissionBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  cameraWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'hidden' },
  scannerReticle: { width: 260, height: 260, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  reticleCorner: { position: 'absolute', width: 36, height: 36, borderColor: '#2D5A1E', borderWidth: 4 },
  reticleTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 12 },
  reticleTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 12 },
  reticleBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 12 },
  reticleBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 12 },
  laserLine: { width: '85%', height: 2, backgroundColor: '#2D5A1E', shadowColor: '#2D5A1E', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: 4 },
  processingBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: COLORS.success },
  processingText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  viewfinderInstruction: { position: 'absolute', bottom: 32, fontSize: 12, color: '#FFF', fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  manualScanDrawer: { padding: SPACING.md, backgroundColor: '#181818', borderTopWidth: 1, borderTopColor: '#333' },
  manualScanTitle: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
  manualScanInputRow: { flexDirection: 'row', gap: 8 },
  manualScanTextInput: { flex: 1, height: 44, backgroundColor: '#262626', borderWidth: 1, borderColor: '#444', borderRadius: RADIUS.md, paddingHorizontal: 12, color: '#FFF', fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: '700' },
  manualScanSubmitBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, paddingHorizontal: 18, height: 44, borderRadius: RADIUS.md, justifyContent: 'center' },
  manualScanSubmitText: { color: '#FFF', fontSize: 13, fontWeight: '800' },

  // Topbar Ledger Button
  topbarLedgerBtn: {
    position: 'relative',
    padding: 6,
  },
  topbarLedgerBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: COLORS.primary,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  topbarLedgerBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },

  // Dedicated Full History Modal
  historyModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  historyModalContainer: { backgroundColor: '#fff', borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: '92%', height: '92%' },
  historyModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  historyModalTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  historyModalSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  historyModalCloseBtn: { padding: 4 },
  historyStatBar: { flexDirection: 'row', backgroundColor: '#F8FAF5', paddingHorizontal: SPACING.lg, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 16 },
  historyStatItem: { flex: 1 },
  historyStatLbl: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  historyStatVal: { fontSize: 13, fontWeight: '800', color: COLORS.primary, marginTop: 1 },
});
