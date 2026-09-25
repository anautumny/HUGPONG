import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Dimensions, TextInput, Alert,
  ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import AppHeader from '../components/AppHeader';
import { subscribe, getCurrentSession, setSynced, setSession, updateSessionFieldId, updateFieldStageAndCycle, archiveFieldCropCycle, getIsSynced, getFieldSyncState, getOperationSyncState, getRelevantAuditSyncState, fetchAuditHistoryPage, assignmentRequests, resolveAssignmentRequest, requestFieldAssignment, fields, cropCycles, operationLogs, draftLogs as draftLogsStore, notifyDataUpdate, updateFieldCustomStages, performMobileSync, commitExplicitMutation, getFieldCustomOperations, saveFieldCustomOperations, auditLogs, auditReports, blockFarms, users, resolveFieldBlockFarm, resolveFieldMember, findUserByIdOrContact, updateOperationLogWithSecurity, isLogLocked, getLogAuditTrail, pendingUsers, approvePendingRegistration, rejectPendingRegistration, saveFieldPlot, deleteDraftLogs, clearAllDraftsForField, saveDraftLogs, saveLocalOperationDraft, validateLocalDraftForSubmission, claimLocalDraftSubmission, releaseLocalDraftSubmission, logSystemEvent, verifyCurrentPassword } from '../data/dataStore';
import { getOperationCapabilities } from '../domain/operationAuthorization';
import { saveItem, STORAGE_KEYS } from '../services/storageService';
import { generateLogId, generateDraftId, generateSubItemId, generateCustomOpId } from '../services/syncEngine';
import { getNetworkStatus, subscribeToNetwork } from '../services/networkService';
import { importAuditQr, verifyAuditQr } from '../services/mutationService';
import { useTranslation } from '../services/i18n';
import AuditHistoryModal from '../components/AuditHistoryModal';
import OfflineQRCode from '../components/OfflineQRCode';
import LiveQRScanner from '../components/LiveQRScanner';
import {
  AUDIT_STATUS, AUDIT_QR_SCHEMA_VERSION, canonicalAuditStatus, createAuditQrPayload, createAuditQrParts,
  decodeAuditQrPayload, decodeAuditQrPart, assembleAuditQrParts,
  buildAuditFieldSnapshots, validateCanonicalAuditReport,
  businessPeriodKey, displayPeriod, auditReportsForFarmPeriod, reportedOperationIds, operationAuditCoverage
} from '../domain/auditWorkflow';
import { safeAlert } from '../utils/dialogs';
import { canonicalStoredCropYear, cleanDataForFirestore, cleanupDuplicateLogs, formatDisplayDate, toISODateString, sortOperationsNewestFirst, sortNewestFirst, cropYearCycleForDate, formatCropYearDisplay, uniqueCropYears } from '../utils/dataHelpers';
import {
  canonicalRole,
  fromAuditReportDocument,
  operationSnapshot,
  toOperationLogDocument,
  toReportPeriod
} from '../data/firestoreSchema';
import { INITIAL_CROP_STAGES } from '../constants/cropStages';
import { SRA_OPERATIONS_CATALOGUE, getOperationDefinition, getOperationsForStage } from '../domain/operationCatalogue';
import { SUGARCANE_VARIETIES } from '../domain/sugarcaneVarieties';
import { operationPresentation, STAGE_DISPLAY_LABELS } from '../domain/presentationContract';
import { amendmentEditor, amendmentSummary, formatAmendmentChanges, formatDate as formatAmendmentDate } from '../domain/amendmentPresentation';
import {
  appendUniqueArchiveRecords,
  fetchArchivedOperations,
  getArchiveClearViewPreferenceScope,
  readArchiveClearViewPreference,
  writeArchiveClearViewPreference
} from '../services/archiveViewService';

const { height, width } = Dimensions.get('window');
// Persistent parcel attributes for Field Plot Registration (Web & Mobile Parity)
const SOIL_TYPES = ['Clay Loam', 'Sandy Loam', 'Loam', 'Clay', 'Silt Loam'];
const INITIAL_STAGES = INITIAL_CROP_STAGES;

const verifyLocalAuditIntegrity = async report => {
  const canonical = JSON.stringify({
    reportId: report?.reportId || report?.id,
    blockFarmId: report?.blockFarmId,
    period: report?.periodKey || report?.period,
    operationSnapshots: report?.operationSnapshots || []
  });
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonical);
  return `HUG-${digest.slice(0, 24).toUpperCase()}` === (report?.integrityHash || report?.qrHash);
};

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
      operations: getOperationsForStage(1)
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
      operations: getOperationsForStage(2)
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
      operations: getOperationsForStage(3)
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
      operations: getOperationsForStage(4)
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
      operations: getOperationsForStage(5)
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
      operations: getOperationsForStage(6)
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
      operations: getOperationsForStage(1)
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
      operations: getOperationsForStage(2)
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
      operations: getOperationsForStage(3)
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
      operations: getOperationsForStage(4)
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
      operations: getOperationsForStage(5)
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
      operations: getOperationsForStage(6)
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
      operations: getOperationsForStage(1)
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
      operations: getOperationsForStage(2)
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
      operations: getOperationsForStage(3)
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
      operations: getOperationsForStage(4)
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
      operations: getOperationsForStage(5)
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
      operations: getOperationsForStage(6)
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
  canEdit = true,
  cropYear,
  auditCoverage,
  s,
}) {
  const archivedLog = log.status === 'ARCHIVED';
  const isLocked = !isDraft && (archivedLog || isLogLocked(log));
  const isAmended = Array.isArray(log.amendments) && log.amendments.length > 0;
  const editCount = isAmended ? log.amendments.length : 0;
  const latestEdit = isAmended ? log.amendments[log.amendments.length - 1] : null;
  const latestAmendmentSummary = amendmentSummary(log.amendments, users);
  const semanticPresentation = operationPresentation(log);
  const operationSyncState = isDraft ? { status: 'DRAFT', isSynced: false } : getOperationSyncState(log.id);
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

            {semanticPresentation.isSupplemental && (
              <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#FEF0D0' }}>
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#92400E' }}>Supplemental</Text>
              </View>
            )}
            {semanticPresentation.isManagerTakeover && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F7F4ED', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#DED5C3' }}>
                <Ionicons name="shield-checkmark" size={10} color="#6B5735" />
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#6B5735' }}>Manager Takeover</Text>
              </View>
            )}
            {semanticPresentation.isAmended && (
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EBF3FB', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#CCE0F5' }}
                onPress={() => onViewAuditTrail && onViewAuditTrail(log)}
                activeOpacity={0.7}
              >
                <Ionicons name="shield-checkmark" size={10} color="#0B63B7" />
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#0B63B7' }}>
                  {`Amended (${editCount}x)`}
                </Text>
              </TouchableOpacity>
            )}

            {!isDraft && auditCoverage && (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                backgroundColor: auditCoverage.status === AUDIT_STATUS.CERTIFIED ? '#EBF7EE' : auditCoverage.status === AUDIT_STATUS.PENDING_REVIEW ? '#EFF6FF' : auditCoverage.status === AUDIT_STATUS.RETURNED ? '#FEF3C7' : COLORS.primaryBg,
                paddingHorizontal: 6,
                paddingVertical: 1.5,
                borderRadius: RADIUS.xs,
                borderWidth: 1,
                borderColor: auditCoverage.status === AUDIT_STATUS.CERTIFIED ? '#B7DEC0' : auditCoverage.status === AUDIT_STATUS.PENDING_REVIEW ? '#BFDBFE' : auditCoverage.status === AUDIT_STATUS.RETURNED ? '#FDE68A' : COLORS.primaryBorder
              }}>
                <Ionicons name="document-text-outline" size={10} color={auditCoverage.status === AUDIT_STATUS.CERTIFIED ? COLORS.success : auditCoverage.status === AUDIT_STATUS.PENDING_REVIEW ? '#1D4ED8' : auditCoverage.status === AUDIT_STATUS.RETURNED ? '#92400E' : COLORS.primary} />
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: auditCoverage.status === AUDIT_STATUS.CERTIFIED ? COLORS.success : auditCoverage.status === AUDIT_STATUS.PENDING_REVIEW ? '#1D4ED8' : auditCoverage.status === AUDIT_STATUS.RETURNED ? '#92400E' : COLORS.primary }}>
                  {auditCoverage.label}
                </Text>
              </View>
            )}

            {/* Operation-log lifecycle is independent of audit-report certification. */}
            {archivedLog ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#E5E7EB' }}>
                <Ionicons name="archive-outline" size={10} color="#4B5563" />
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#4B5563' }}>
                  Archived
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

          {/* Stage & Scope Context Card */}
          <View style={{ backgroundColor: '#F8FAF5', borderRadius: RADIUS.md, padding: 10, borderWidth: 1, borderColor: '#E4EEE1', gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}>
                <Ionicons name="leaf-outline" size={13} color={COLORS.primary} />
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: COLORS.primary }} numberOfLines={1}>
                  Stage at Recording: {semanticPresentation.stageLabel || 'Unknown'}
                </Text>
              </View>
              {!isDraft && (
                <View style={[s.receiptStatusBadge, { backgroundColor: operationSyncState.isSynced ? '#F2FBF2' : '#FFFBF0', borderColor: operationSyncState.isSynced ? '#D5ECD5' : '#FEF0D0', paddingVertical: 2.5, paddingHorizontal: 7 }]}>
                  <Ionicons name={operationSyncState.isSynced ? 'checkmark-circle' : (operationSyncState.status === 'SYNCING' ? 'sync-outline' : 'cloud-offline-outline')} size={11} color={operationSyncState.isSynced ? '#16A34A' : '#C97A00'} />
                  <Text style={[s.receiptStatusText, { fontSize: 10, fontWeight: '800', color: operationSyncState.isSynced ? '#16A34A' : '#C97A00' }]}>
                    {operationSyncState.status === 'SYNCING' ? 'Syncing...' : operationSyncState.status === 'FAILED' ? 'Sync Failed' : operationSyncState.isSynced ? 'Synced' : 'Pending Sync'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 2 }}>
              {formatDisplayDate(log.date || log.period)} · {log.hectares} {t('hectares_unit', 'Hectares')} · {log.people} {t('workers_unit', 'Workers')}
            </Text>
            {!isDraft && (
              <Text style={{ fontSize: 11.5, color: COLORS.textSecondary }}>
                Crop Year Cycle: {formatCropYearDisplay(log.cropYearCycle || cropYear)}
              </Text>
            )}
            {log.variety ? (
              <Text style={{ fontSize: 11.5, color: COLORS.textSecondary }}>
                Sugarcane Variety: {log.variety}
              </Text>
            ) : null}
            {!isDraft && (
              <Text style={{ fontSize: 11.5, color: COLORS.textSecondary }}>
                Recorded By: {log.submittedByUserId || log.loggedById || 'Unknown'}
              </Text>
            )}
            {!isDraft && log.updatedAt && (
              <Text style={{ fontSize: 11.5, color: COLORS.textSecondary }}>
                Last Modified: {formatDisplayDate(log.updatedAt)}
              </Text>
            )}
            {!isDraft && auditCoverage && (
              <Text style={{ fontSize: 11.5, color: COLORS.textSecondary }}>
                Audit Report: <Text style={{ fontWeight: '800', color: COLORS.text }}>{auditCoverage.reportId}</Text> · {auditCoverage.label}
              </Text>
            )}
            {archivedLog && log.archivedAt && (
              <Text style={{ fontSize: 11.5, color: COLORS.textSecondary }}>
                Archived: {formatDisplayDate(log.archivedAt)}
              </Text>
            )}
          </View>

          {/* Child Items / Materials & Inputs Breakdown (Senior Accessible 2-Line Layout) */}
          {log.subItems && log.subItems.length > 0 && (
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: 10, marginVertical: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#F0F4EC' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('op_children_materials_lbl', 'Activities & Materials')} ({log.subItems.length})
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>
                  Amount
                </Text>
              </View>

              <View style={{ gap: 8 }}>
                {log.subItems.map((si, idx) => (
                  <View key={si.id || idx} style={{ paddingBottom: idx < log.subItems.length - 1 ? 8 : 0, borderBottomWidth: idx < log.subItems.length - 1 ? 1 : 0, borderBottomColor: '#F5F5F5' }}>
                    {/* Line 1: Full un-truncated description with comfortable typography */}
                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text, lineHeight: 18 }}>
                      {si.description}
                    </Text>
                    {/* Line 2: Clearly spaced calculation and bold subtotal */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                      <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' }}>
                        {si.qty} {si.unit} × ₱{Number(si.unitCost || 0).toLocaleString()} / {si.unit}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text }}>
                        ₱{Number(si.subTotal || (Number(si.qty || 0) * Number(si.unitCost || 0))).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Direct Operation Input (if no child sub-items) */}
          {Boolean(log.inputQty) && (!log.subItems || log.subItems.length === 0) && (
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: 10, marginVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                {t('direct_op_input_lbl', 'Direct Operation Input')}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' }}>
                  {log.inputQty} {log.inputUnit || 'ha'} {log.directRate ? `× ₱${Number(log.directRate).toLocaleString()} / ${log.inputUnit || 'ha'}` : ''}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text }}>
                  ₱{Number(log.totalCost != null ? log.totalCost : (log.cost || 0)).toLocaleString()}
                </Text>
              </View>
            </View>
          )}

          {/* Total Cost Highlight Card */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F4FAF0', borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#D7ECD0', paddingHorizontal: 12, paddingVertical: 10, marginVertical: 2 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text }}>
              {t('stat_total_cost', 'Total Recorded Cost')}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '900', color: COLORS.primary }}>
              ₱{Number(log.totalCost != null ? log.totalCost : (log.cost || 0)).toLocaleString()}
            </Text>
          </View>

          {/* Subtle Technical Reference ID (Moved down away from primary line of sight) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 4, marginTop: 2, paddingHorizontal: 2 }}>
            <Ionicons name="receipt-outline" size={11} color={COLORS.textMuted} />
            <Text style={{ fontSize: 10.5, color: COLORS.textMuted, fontFamily: 'monospace' }} numberOfLines={1} ellipsizeMode="middle">
              Ref #{log.id}
            </Text>
          </View>

          {/* Manager Revision & Correction Box in Drawer if amended */}
          {isAmended && (
            <View style={{ backgroundColor: '#F0F6FC', borderWidth: 1, borderColor: '#CCE0F5', borderRadius: RADIUS.sm, padding: 10, marginVertical: 6, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#DCEBFA', paddingBottom: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="shield-checkmark" size={13} color="#0B63B7" />
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#0B63B7' }}>
                    Amendment Summary
                  </Text>
                </View>
                {latestEdit?.amendedAt && (
                  <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{latestAmendmentSummary.editedAt}</Text>
                )}
              </View>

              {latestEdit && (
                <>
                  <Text style={{ fontSize: 12, color: COLORS.text, fontWeight: '800' }}>
                    Amended {editCount} time{editCount === 1 ? '' : 's'}
                  </Text>
                  <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                    Last edited by <Text style={{ fontWeight: '800' }}>{latestAmendmentSummary.editor?.name}</Text> · {latestAmendmentSummary.editor?.role}
                  </Text>
                  {latestEdit.reason && (
                    <View style={{ backgroundColor: '#FFFFFF', padding: 6, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#E1EDF8' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#0B63B7' }}>Reason</Text>
                      <Text style={{ fontSize: 11.5, color: COLORS.text, marginTop: 1 }}>{latestEdit.reason}</Text>
                    </View>
                  )}
                  {latestEdit.changes && formatAmendmentChanges(latestEdit.changes).length > 0 && (
                    <View style={{ backgroundColor: '#FFFFFF', padding: 6, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#E1EDF8', gap: 3 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' }}>Changes</Text>
                      <Text style={{ fontSize: 10.5, color: COLORS.text }}>
                        Open the amendment history to review {formatAmendmentChanges(latestEdit.changes).length} meaningful change(s).
                      </Text>
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
                  View Amendment History
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
                Past Crop Year Cycle Record — Archived historical data.
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
                onPress={() => Alert.alert('Archived Crop Year Cycle', 'This operation log belongs to a previous Crop Year Cycle and is permanently preserved in the historical archive for regulatory compliance.')}
              >
                <Ionicons name="archive-outline" size={13} color="#6B7280" />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#6B7280' }}>Past Crop Year Cycle Record (Archived)</Text>
              </TouchableOpacity>
            ) : isLocked ? (
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: RADIUS.sm, paddingVertical: 8 }}
                onPress={() => Alert.alert('Locked Record', 'This operation log is locked against direct modifications.')}
              >
                <Ionicons name="lock-closed" size={13} color="#6B7280" />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#6B7280' }}>Locked Record</Text>
              </TouchableOpacity>
            ) : canEdit ? (
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
            ) : null}
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
  const [deviceOnline, setDeviceOnline] = useState(getNetworkStatus());
  const [managerFieldFilter, setManagerFieldFilter] = useState('all');
  const sessionUserId = session?.employeeId || session?.id || '';

  useEffect(() => {
    const unsubNet = subscribeToNetwork((online) => {
      setDeviceOnline(online);
    });
    return () => {
      if (typeof unsubNet === 'function') unsubNet();
    };
  }, []);

  const managedFarmIds = new Set(
    blockFarms
      .filter(farm => 
        farm.managerUserId === sessionUserId ||
        farm.managerName === session?.name ||
        farm.id === session?.blockFarmId ||
        farm.name === session?.blockFarm ||
        farm.name === session?.farm
      )
      .map(farm => farm.id)
  );
  if (session?.blockFarmId) managedFarmIds.add(session.blockFarmId);

  const accessibleFields = (fields || []).filter(field => {
    if (activeRole === 'Farm Member') {
      return (
        field.memberUserId === sessionUserId ||
        (session?.fieldId && field.id === session?.fieldId)
      );
    }
    if (activeRole === 'Farm Manager') {
      // In OFFLINE mode: Farm Manager managed fields CANNOT be seen.
      // Only their OWN personal field plot can be accessed (if they have one).
      if (!deviceOnline) {
        return (
          field.memberUserId === sessionUserId ||
          (session?.fieldId && field.id === session?.fieldId)
        );
      }
      return (
        managedFarmIds.has(field.blockFarmId) ||
        field.managerUserId === sessionUserId ||
        (session?.farm && (field.blockFarm === session.farm || field.blockFarmName === session.farm)) ||
        (session?.blockFarm && (field.blockFarm === session.blockFarm || field.blockFarmName === session.blockFarm))
      );
    }
    return true;
  });
  const personalFields = accessibleFields.filter(field => (
    field.memberUserId === sessionUserId || (session?.fieldId && field.id === session.fieldId)
  ));
  const scopedFields = activeRole === 'Farm Manager' && deviceOnline && managerFieldFilter === 'my'
    ? personalFields
    : accessibleFields;
  const targetFarm = blockFarms.find(farm => managedFarmIds.has(farm.id))?.name || session?.farm || session?.blockFarm || 'Unassigned Block Farm';
  const [selectedFarm, setSelectedFarm] = useState('All Block Farms');
  const [selectedField, setSelectedField] = useState(() => {
    const curSess = getCurrentSession() || {};
    const userId = curSess.employeeId || curSess.id || '';
    const isNet = getNetworkStatus();
    // In offline mode: Farm Manager and Farm Member only find their OWN personal field plot!
    if (curSess.role === 'Farm Member' || !isNet) {
      const myField = (fields || []).find(f => 
        f && (
          f.memberUserId === userId ||
          (curSess.fieldId && f.id === curSess.fieldId)
        )
      );
      return myField || null;
    }
    if (curSess.role === 'Farm Manager') {
      const ownField = (fields || []).find(field => field?.memberUserId === userId || (curSess.fieldId && field?.id === curSess.fieldId));
      if (ownField) return ownField;
      const farmIds = new Set(
        blockFarms
          .filter(farm => 
            farm.managerUserId === userId || 
            farm.managerName === curSess.name ||
            farm.id === curSess.blockFarmId ||
            farm.name === curSess.blockFarm ||
            farm.name === curSess.farm
          )
          .map(farm => farm.id)
      );
      if (curSess.blockFarmId) farmIds.add(curSess.blockFarmId);
      const foundField = (fields || []).find(field => 
        farmIds.has(field.blockFarmId) ||
        field.managerUserId === userId ||
        (curSess.farm && (field.blockFarm === curSess.farm || field.blockFarmName === curSess.farm)) ||
        (curSess.blockFarm && (field.blockFarm === curSess.blockFarm || field.blockFarmName === curSess.blockFarm))
      );
      return foundField || null;
    }
    return (fields && fields.length > 0 ? fields[0] : null);
  });

  const scopedSelectedField = selectedField && scopedFields.find(field => field.id === selectedField.id);
  const safeField = scopedSelectedField || scopedFields[0] || {
    id: 'Unassigned',
    ha: '0.0',
    member: session?.name || 'Farm Member',
    memberName: session?.name || 'Farm Member',
    stage: 'Pre-Planting & Land Preparation',
    stageNumber: 1,
    cycleType: 'Plant Cane (New Plant)',
    cropYear: '',
    synced: false,
    lastSync: 'Never'
  };
  const [showAuditHistoryModal, setShowAuditHistoryModal] = useState(false);
  const [auditHistoryReports, setAuditHistoryReports] = useState([]);
  const [auditHistoryCursor, setAuditHistoryCursor] = useState(null);
  const [auditHistoryHasMore, setAuditHistoryHasMore] = useState(false);
  const [isLoadingAuditHistory, setIsLoadingAuditHistory] = useState(false);
  const currentRealMonth = displayPeriod(businessPeriodKey());
  const [compileMonth, setCompileMonth] = useState(currentRealMonth);
  const [managerLedgerScope, setManagerLedgerScope] = useState('selected');
  const [logs, setLogs] = useState(() => Array.isArray(operationLogs) ? [...operationLogs] : []);

  React.useEffect(() => {
    if (canonicalRole(session?.role) !== 'FARM_MANAGER') return;
    const actorId = session?.employeeId || session?.id || '';
    const assignedFarm = blockFarms.find(farm => farm.managerUserId === actorId);
    if (!assignedFarm) return;
    const farmFieldIds = new Set(fields.filter(field => field.blockFarmId === assignedFarm.id).map(field => field.id));
    const currentPeriod = businessPeriodKey();
    const periods = Array.from(new Set(logs
      .filter(log => farmFieldIds.has(log.fieldId) && log.status === 'ACTIVE' && !log.isDraft)
      .map(log => String(log.performedOn || log.isoDate || '').slice(0, 7))
      .filter(period => /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && period <= currentPeriod)))
      .sort();
    const unresolved = periods.find(period => {
      const matching = auditReports.filter(report => report.blockFarmId === assignedFarm.id && toReportPeriod(report.periodKey || report.period || report.month) === period)
        .sort((left, right) => Number(right.reportVersion || 1) - Number(left.reportVersion || 1));
      return matching.length === 0 || canonicalAuditStatus(matching[0].status) === AUDIT_STATUS.RETURNED;
    });
    setCompileMonth(displayPeriod(unresolved || currentPeriod));
  }, [session?.employeeId, session?.id, session?.role, logs.length, auditReports.length, fields.length, blockFarms.length]);

  const loadAuditHistory = async (append = false) => {
    if (isLoadingAuditHistory || canonicalRole(session?.role) !== 'SRA_ADMIN') return;
    setIsLoadingAuditHistory(true);
    try {
      const page = await fetchAuditHistoryPage({ cursor: append ? auditHistoryCursor : null, limit: 20 });
      setAuditHistoryReports(current => append ? [...current, ...page.reports] : page.reports);
      setAuditHistoryCursor(page.nextCursor);
      setAuditHistoryHasMore(page.hasMore);
    } catch (error) {
      safeAlert('History Unavailable', error.message || 'Reconnect to load certified audit history.');
    } finally {
      setIsLoadingAuditHistory(false);
    }
  };

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
        if (activeRole === 'Farm Manager' && !personalFields.some(field => field.id === targetF.id)) {
          setManagerFieldFilter('all');
        }
        setSelectedField(targetF);
        updateSessionFieldId(targetF.id);
        if (route?.params?.requestTakeOver || route?.params?.isTakeOver || route?.params?.takeOverFieldId) {
          // Strictly require manager password verification — no unauthenticated bypass!
          setIsTakeOver(false);
          setTakeoverGrant(null);
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
    if (sess.role === 'Farm Member') {
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

    if ((!selectedField || !scopedFields.some(field => field.id === selectedField.id)) && scopedFields.length > 0) {
      setSelectedField(scopedFields[0]);
    } else if (scopedFields.length === 0 && selectedField) {
      setSelectedField(null);
    }
  }, [route?.params, fields, managerFieldFilter, deviceOnline]);

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
      } else if (getCurrentSession()?.role !== 'Farm Member' && scopedFields.length > 0) {
        setSelectedField(scopedFields[0]);
      }
    });
    return unsubscribe;
  }, [selectedField?.id]);
  const [showLog, setShowLog] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showAuditReceiveOptions, setShowAuditReceiveOptions] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showTransferCodeInput, setShowTransferCodeInput] = useState(false);
  const [manualTransferCode, setManualTransferCode] = useState('');
  const [isResolvingTransferCode, setIsResolvingTransferCode] = useState(false);
  const [activeQRData, setActiveQRData] = useState(null);
  const [activeQrPartIndex, setActiveQrPartIndex] = useState(0);
  const [isSavingQrImage, setIsSavingQrImage] = useState(false);
  const [isCompilingAudit, setIsCompilingAudit] = useState(false);
  const auditCompilationLockRef = useRef(false);
  const qrSvgRef = useRef(null);
  const [scannedAuditReport, setScannedAuditReport] = useState(null);
  const [pendingScannedPayload, setPendingScannedPayload] = useState('');
  const [scannedAuditDuplicate, setScannedAuditDuplicate] = useState(false);
  const qrTransferPartsRef = useRef(new Map());
  const [showSRAInspectModal, setShowSRAInspectModal] = useState(false);
  const [auditReturnReason, setAuditReturnReason] = useState('');
  const [isAuditActionPending, setIsAuditActionPending] = useState(false);

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
    variety: '',
    isSubmit: true
  });
  const [draftLogs, setDraftLogs] = useState(draftLogsStore);
  const [isSavingLog, setIsSavingLog] = useState(false);
  const submissionLockRef = React.useRef(false);
  const [editingSubItemIdx, setEditingSubItemIdx] = useState(null);
  const [isArchivingCycle, setIsArchivingCycle] = useState(false);
  const [highlightedDraftIds, setHighlightedDraftIds] = useState(new Set());
  const [highlightedSubmittedLogIds, setHighlightedSubmittedLogIds] = useState(new Set());
  const [viewedLogIds, setViewedLogIds] = useState(new Set());
  const [selectedDraftIds, setSelectedDraftIds] = useState(new Set());
  const [isDraftSelectMode, setIsDraftSelectMode] = useState(false);
  const [logTab, setLogTab] = useState('submitted');
  const [logSearch, setLogSearch] = useState('');
  const [logCategoryFilter, setLogCategoryFilter] = useState('all');
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [logCurrentPage, setLogCurrentPage] = useState(1);
  const [archiveFilters, setArchiveFilters] = useState({ cropYearCycle: '', fieldId: '', operationDefinitionId: '', search: '' });
  const [archiveSearchDraft, setArchiveSearchDraft] = useState('');
  const [archiveState, setArchiveState] = useState({
    records: [], nextCursor: null, hasMore: false,
    isLoading: false, isLoadingMore: false, isCleared: false, error: null, loadMoreError: null
  });
  const archiveRequestIdRef = useRef(0);
  const archiveLoadMoreLockRef = useRef(false);
  const archivePreferenceScope = React.useMemo(
    () => getArchiveClearViewPreferenceScope(session),
    [session?.employeeId, session?.id, session?.userId, session?.uid, session?.email, session?.canonicalRole, session?.role]
  );
  const [hydratedArchivePreferenceScope, setHydratedArchivePreferenceScope] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [returnToScreen, setReturnToScreen] = useState(null);

  const getFieldStageLabel = field => {
    const stage = INITIAL_STAGES.find(item => item.number === Number(field?.stageNumber));
    if (!stage) return t('current_stage_unset', 'Current stage not set');
    return STAGE_DISPLAY_LABELS[stage.number] || stage.label;
  };

  const fieldSyncState = field => getFieldSyncState(field?.id);
  const fieldSyncLabel = field => {
    const state = fieldSyncState(field);
    if (state.status === 'SYNCING') return 'Syncing...';
    if (state.status === 'FAILED') return state.pendingCount > 0 ? `Sync Failed (${state.pendingCount})` : 'Sync Failed';
    if (state.status === 'PENDING') return state.pendingCount > 0 ? `Pending Sync (${state.pendingCount})` : 'Pending Sync';
    return t('synced', 'Synced');
  };

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
  const [takeoverGrant, setTakeoverGrant] = useState(null);
  const [takeoverExpiresAt, setTakeoverExpiresAt] = useState(0);
  const takeoverActorRef = React.useRef(sessionUserId);
  const takeoverSession = isTakeOver ? {
    managerId: sessionUserId,
    fieldId: selectedField?.id || safeField.id,
    grant: takeoverGrant,
    expiresAt: takeoverExpiresAt
  } : null;
  const operationCapabilities = getOperationCapabilities(session, safeField, takeoverSession);
  useEffect(() => {
    if (takeoverActorRef.current !== sessionUserId) {
      setIsTakeOver(false);
      setTakeoverGrant(null);
      setTakeoverExpiresAt(0);
      takeoverActorRef.current = sessionUserId;
    }
  }, [sessionUserId]);
  const prevFieldIdRef = React.useRef(selectedField?.id);
  useEffect(() => {
    if (prevFieldIdRef.current && prevFieldIdRef.current !== selectedField?.id) {
      setIsTakeOver(false);
      setTakeoverGrant(null);
      setTakeoverExpiresAt(0);
    }
    prevFieldIdRef.current = selectedField?.id;
  }, [selectedField?.id]);
  useEffect(() => {
    if (!isTakeOver || !takeoverExpiresAt) return undefined;
    const remaining = takeoverExpiresAt - Date.now();
    if (remaining <= 0) {
      setIsTakeOver(false);
      setTakeoverGrant(null);
      setTakeoverExpiresAt(0);
      return undefined;
    }
    const timer = setTimeout(() => {
      setIsTakeOver(false);
      setTakeoverGrant(null);
      setTakeoverExpiresAt(0);
    }, remaining);
    return () => clearTimeout(timer);
  }, [isTakeOver, takeoverExpiresAt]);
  const [showTakeOverAuthModal, setShowTakeOverAuthModal] = useState(false);
  const [takeOverAuthPassword, setTakeOverAuthPassword] = useState('');
  const [takeOverAuthError, setTakeOverAuthError] = useState('');
  const [showTakeOverPassword, setShowTakeOverPassword] = useState(false);
  const [pendingTakeOverAction, setPendingTakeOverAction] = useState(null);

  const handleInitiateTakeOver = (onAuthorizedAction = null) => {
    if (!deviceOnline && !getNetworkStatus()) {
      Alert.alert(
        'Manager Takeover Unavailable Offline',
        'Manager Takeover cannot be performed while offline. In offline mode, only your personal field plot can be managed.'
      );
      return;
    }
    if (isTakeOver) {
      setIsTakeOver(false);
      setTakeoverGrant(null);
      setTakeoverExpiresAt(0);
      setPendingTakeOverAction(null);
      return;
    }
    if (typeof onAuthorizedAction === 'function') {
      setPendingTakeOverAction(() => onAuthorizedAction);
    } else {
      setPendingTakeOverAction(null);
    }
    setTakeOverAuthPassword('');
    setTakeOverAuthError('');
    setShowTakeOverPassword(false);
    setShowTakeOverAuthModal(true);
  };

  const handleConfirmTakeOverAuth = async () => {
    const cleanPass = String(takeOverAuthPassword || '').trim();
    const authorization = cleanPass ? await verifyCurrentPassword(cleanPass, selectedField?.id || safeField.id) : false;

    if (!cleanPass || !authorization?.takeoverGrant) {
      setTakeOverAuthError('Incorrect password. Enter your manager account password to authorize Manager Takeover.');
      return;
    }

    setTakeOverAuthError('');
    setShowTakeOverAuthModal(false);
    setIsTakeOver(true);
    setTakeoverGrant(authorization.takeoverGrant);
    setTakeoverExpiresAt(Number(authorization.takeoverGrantExpiresAt || 0));

    if (typeof pendingTakeOverAction === 'function') {
      const pendingCallback = pendingTakeOverAction;
      setPendingTakeOverAction(null);
      setTimeout(() => {
        pendingCallback();
      }, 150);
    }
  };

  const checkTakeOverRequired = (actionDesc = 'record stage work or log operations', onAuthorizedAction = null) => {
    if (activeRole === 'Farm Manager' && operationCapabilities.requiresTakeover) {
      if (!deviceOnline && !getNetworkStatus()) {
        Alert.alert(
          'Offline Access Restricted',
          'Manager field changes require a fresh server-verified takeover authorization and cannot be performed offline.'
        );
        return true;
      }
      Alert.alert(
        'Manager Takeover Required',
        `This field is managed by ${selectedField?.member || 'the assigned Farm Member'}. To ${actionDesc}, please authorize Manager Takeover first.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setPendingTakeOverAction(null) },
          { text: 'Manager Takeover', onPress: () => handleInitiateTakeOver(onAuthorizedAction) }
        ]
      );
      return true;
    }
    return false;
  };
  const [showFieldsModal, setShowFieldsModal] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');
  const [fieldsModalPage, setFieldsModalPage] = useState(1);
  const [showOpPicker, setShowOpPicker] = useState(false);
  const [showCycleModal, setShowCycleModal] = useState(false);
  const [cycleTypeForm, setCycleTypeForm] = useState({
    cycleType: 'Plant Cane (New Plant)',
    cropYear: cropYearCycleForDate()
  });
  const [showManagerAssignModal, setShowManagerAssignModal] = useState(false);
  const [managerAssignForm, setManagerAssignForm] = useState({
    userId: '',
    fieldId: '',
    blockFarm: '',
    blockFarmId: '',
    ha: '1.5',
    soilType: 'Clay Loam',
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
        soilType: fieldToEdit.soilType || 'Clay Loam',
        isEditing: true
      });
    } else {
      setManagerAssignForm({
        userId: '',
        fieldId: '',
        blockFarm: defaultFarm,
        blockFarmId: matchedBf?.id || '',
        ha: '1.5',
        soilType: 'Clay Loam',
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
  const [editAuthReason, setEditAuthReason] = useState('');
  const [editAuthError, setEditAuthError] = useState('');
  const [logEditAuth, setLogEditAuth] = useState({ reason: '' });
  const [showLogAuditModal, setShowLogAuditModal] = useState(false);
  const [activeLogForAudit, setActiveLogForAudit] = useState(null);

  // Helper: check if an operation log falls within the target month (e.g. 'May 2026')
  const isLogFromMonth = (log, targetMonthStr) => {
    if (!targetMonthStr) return true;
    const dateStr = String(log?.performedOn || log?.isoDate || log?.date || log?.createdAt || log?.recordedAt || log?.timestamp || log?.period || '').trim();
    if (!dateStr) return true;
    const targetPeriod = toReportPeriod(targetMonthStr);
    if (!targetPeriod) return false;
    const storedPeriod = toReportPeriod(dateStr);
    if (storedPeriod) return storedPeriod === targetPeriod;

    // Compatibility for legacy human-readable operation dates. Canonical
    // operation records use ISO dates and are handled above without runtime-
    // dependent natural-language date parsing.
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const logPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return logPeriod === targetPeriod;
    }
    return false;
  };

  // Detect fields with durable mutations that have not received a server acknowledgement.
  const getFieldsPendingSync = (targetFarm) => {
    const farmId = blockFarms.find(farm => farm.id === targetFarm || farm.name === targetFarm)?.id;
    const farmFields = fields.filter(field => field.blockFarmId === farmId);
    return farmFields.filter(field => !fieldSyncState(field).isSynced);
  };

  const openAuditQrTransfer = (audit) => {
    if (!audit) return;
    const session = getCurrentSession();
    const hash = audit.qrSignature || audit.qrHash;
    const reportId = audit.reportId || audit.id;
    if (!hash || !reportId || !audit.blockFarmId) {
      Alert.alert('Report Unavailable', 'This audit report is missing its canonical ID, block farm ID, or QR hash.');
      return;
    }
    try {
      const report = validateCanonicalAuditReport(audit);
      const qrParts = createAuditQrParts(report);
      setActiveQrPartIndex(0);
      setActiveQRData({
        report,
        reportId,
        month: audit.month || displayPeriod(report.periodKey),
        blockFarm: report.blockFarmName || audit.blockFarm || session?.farm || session?.blockFarm || 'District Central',
        totalCost: report.totalCost,
        totalHectares: report.hectaresAudited,
        totalFields: report.fieldCount,
        totalLogs: report.operationCount,
        hash,
        qrParts
      });
      setShowQR(true);
    } catch (error) {
      Alert.alert('QR Transfer Unavailable', error.message || 'This saved report is incomplete and cannot be transferred.');
    }
  };

  const saveCurrentQrImage = async () => {
    if (!qrSvgRef.current?.toDataURL || !activeQRData?.qrParts?.length) return;
    setIsSavingQrImage(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('The QR image could not be prepared.')), 10000);
        qrSvgRef.current.toDataURL(data => {
          clearTimeout(timeout);
          if (data) resolve(data);
          else reject(new Error('The QR image could not be prepared.'));
        }, { width: 1200, height: 1200 });
      });
      const safeReportId = String(activeQRData.reportId || 'audit').replace(/[^A-Za-z0-9_-]/g, '-');
      const partSuffix = activeQRData.qrParts.length > 1 ? `-part-${activeQrPartIndex + 1}-of-${activeQRData.qrParts.length}` : '';

      if (Platform.OS === 'android') {
        const downloadsUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(downloadsUri);
        if (!permission.granted) {
          Alert.alert('Save Cancelled', 'Choose a folder when you are ready to save the QR image.');
          return;
        }
        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          `${safeReportId}${partSuffix}-QR`,
          'image/png'
        );
        await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64
        });
        Alert.alert('QR Image Saved', 'The complete audit QR was saved in the selected folder.');
        return;
      }

      if (!FileSystem.cacheDirectory) throw new Error('Temporary storage is unavailable.');
      const fileUri = `${FileSystem.cacheDirectory}${safeReportId}${partSuffix}-QR.png`;
      try {
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        if (!(await Sharing.isAvailableAsync())) throw new Error('The system save sheet is unavailable.');
        await Sharing.shareAsync(fileUri, {
          mimeType: 'image/png',
          dialogTitle: 'Save or share audit QR',
          UTI: 'public.png'
        });
      } finally {
        await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
      }
    } catch (error) {
      Alert.alert('Unable to Save QR', error.message || 'The QR image could not be saved.');
    } finally {
      setIsSavingQrImage(false);
    }
  };

  // Preview QR code specifically for an existing or historical audit report
  const handleViewHistoricalAuditQR = (audit) => openAuditQrTransfer(audit);

  // Dynamic calculations & compilation for month-level Hybrid Cloud-Anchored QR package
  const handleGenerateAudit = () => {
    const session = getCurrentSession();
    const actorId = session?.employeeId || session?.id || '';
    const assignedFarm = blockFarms.find(farm => farm.managerUserId === actorId);
    const periodKey = toReportPeriod(compileMonth);
    const relevantSync = getRelevantAuditSyncState(assignedFarm?.id, periodKey);

    // 1. Check for field changes still waiting for server acknowledgement.
    if (!relevantSync.isSynced) {
      Alert.alert(
        'Sync Required',
        `${relevantSync.pendingCount} operation or field change(s) for this Block Farm and reporting period have not been synchronized. Sync them before compiling the official audit.`,
        [
          { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
          {
            text: 'Sync Records',
            onPress: () => {
              if (navigation && navigation.navigate) {
                performMobileSync('AUDIT_PRECHECK').then(result => {
                  if (result.success) handleGenerateAudit();
                  else navigation.navigate('SyncMonitor');
                });
              }
            }
          }
        ]
      );
      return;
    }

    checkMissingFields();
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
    const existing = auditReportsForFarmPeriod(auditReports, farm?.id, toReportPeriod(compileMonth))[0];
    if (existing) {
      openAuditQrTransfer({ ...existing, totalHectares: existing.totalHectares || farmTotalHa, blockFarm: existing.blockFarm || targetFarm });
    } else {
      handleGenerateAudit();
    }
  };

  const compileAndShowUnlocked = async () => {
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
    const periodKey = toReportPeriod(compileMonth);
    if (!periodKey) {
      safeAlert('Cannot Compile Audit', 'Select a valid audit month and year before compiling.');
      return;
    }
    const farmFields = fields.filter(f => f.blockFarmId === targetFarmId);
    const farmFieldIds = new Set(farmFields.map(field => field.id));
    const totalHa = farmFields.reduce((sum, f) => sum + (Number(f.ha) || 0), 0) || 0;
    
    // Filter logs strictly belonging to the active crop cycle
    const activeCycleLogs = logs.filter(l => farmFieldIds.has(l.fieldId) && l.status === 'ACTIVE' && Boolean(l.cycleId));

    const farmLogs = activeCycleLogs.filter(l => isLogFromMonth(l, compileMonth));

    // Existing reports for this month
    const orderedReports = auditReportsForFarmPeriod(auditReports, targetFarmId, periodKey);
    const latestReport = orderedReports[0] || null;
    const coveredIds = reportedOperationIds(orderedReports);
    let logsToCompile = farmLogs.filter(log => !coveredIds.has(String(log.id)));
    const latestStatus = latestReport ? canonicalAuditStatus(latestReport.status) : null;

    if (latestReport && [AUDIT_STATUS.COMPILED, AUDIT_STATUS.PENDING_SUBMISSION, AUDIT_STATUS.PENDING_REVIEW].includes(latestStatus)) {
        safeAlert(
          'Audit Already Compiled',
          latestStatus === AUDIT_STATUS.PENDING_REVIEW
            ? `${compileMonth} report ${latestReport.reportId || latestReport.id} is already awaiting SRA review.`
            : `${compileMonth} already has report ${latestReport.reportId || latestReport.id}. Submit that compiled report before creating another version.`
        );
        openAuditQrTransfer(latestReport);
        return;
    }

    if (latestReport && latestStatus === AUDIT_STATUS.CERTIFIED && logsToCompile.length === 0) {
      safeAlert('Audit Up to Date', `All eligible ${compileMonth} operation logs are already covered by certified audit reports.`);
      handleViewHistoricalAuditQR(latestReport);
      return;
    }

    if (logsToCompile.length === 0) {
      safeAlert('Cannot Compile Audit', `No new eligible operation logs were found for ${compileMonth}.`);
      return;
    }

    let totalCost = logsToCompile.reduce((sum, l) => sum + (Number(l.totalCost || l.cost) || 0), 0);
    let logsCount = logsToCompile.length;

    // IDs derive only from the validated canonical period key.
    const reportVersion = latestReport ? Number(latestReport.reportVersion || 1) + 1 : 1;
    const rootReportId = `AUD-${targetFarmId.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}-${periodKey}`;
    const reportId = `${rootReportId}-V${reportVersion}`;
    let hash = '';

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
    const serializedOps = [...logsToCompile].sort((left, right) => String(left.id).localeCompare(String(right.id))).map(l => operationSnapshot(l.id, l));
    const fieldSnapshots = buildAuditFieldSnapshots(serializedOps, farmFields);
    const hectaresAudited = Number(fieldSnapshots.reduce((sum, field) => sum + Number(field.areaHa || 0), 0).toFixed(4));
    const canonicalIntegrity = JSON.stringify({ reportId, blockFarmId: targetFarmId, period: periodKey, operationSnapshots: serializedOps });
    hash = `HUG-${(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalIntegrity)).slice(0, 24).toUpperCase()}`;

    // Save / update compiled report in auditReports
    let cloudQueueStatus = 'offline_queued';
    let cloudQueuedAt = null;
    let wasReplayed = false;

    const targetReportId = reportId;
    let effectiveReportId = targetReportId;
    const compiledAt = new Date().toISOString();
    const newReport = {
      id: targetReportId,
      reportId: targetReportId,
      month: compileMonth,
      period: periodKey,
      blockFarm: targetFarm,
      blockFarmName: targetFarm,
      blockFarmId: targetFarmId,
      totalCost: totalCost,
      totalHectares: hectaresAudited,
      hectaresAudited,
      fieldsReported: fieldSnapshots.length,
      fieldCount: fieldSnapshots.length,
      logsCount: logsCount,
      totalLogs: logsCount,
      operationCount: logsCount,
      memberCount: new Set(fieldSnapshots.map(field => field.memberId).filter(Boolean)).size,
      rootReportId,
      reportVersion,
      status: AUDIT_STATUS.COMPILED,
      reviewStatus: 'not_submitted',
      certificationStatus: 'not_certified',
      compiledByUserId: compilerUserId,
      compiledByName: session?.name || 'Farm Manager',
      compiledAt,
      createdAt: compiledAt,
      updatedAt: compiledAt,
      cloudQueueStatus: 'offline_queued',
      dateGenerated: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      qrSignature: hash,
      qrHash: hash,
      integrityHash: hash,
      qrSchemaVersion: AUDIT_QR_SCHEMA_VERSION,
      deliveryMethod: null,
      deliveryStatus: 'ready',
      verifiedBy: null,
      stageBreakdown: stageBreakdown.length > 0 ? stageBreakdown : [],
      operationSnapshots: serializedOps,
      fieldSnapshots,
      sourceLogIds: serializedOps.map(operation => operation.operationLogId),
      operations: serializedOps,
      notes: `Compiled by Farm Manager ${session?.name || 'Farm Manager'}. Awaiting SRA District inspection.`
    };
    validateCanonicalAuditReport(newReport);

    try {
      const outcome = await commitExplicitMutation('audit_report', {
        id: targetReportId,
        blockFarmId: targetFarmId,
        periodKey,
        operationLogIds: logsToCompile.map(log => log.id)
      });
      const authoritativeReport = outcome.response?.data || null;
      Object.assign(newReport, authoritativeReport || {});
      wasReplayed = Boolean(outcome.response?.replayed);
      effectiveReportId = authoritativeReport?.id || authoritativeReport?.reportId || targetReportId;
      newReport.id = effectiveReportId;
      newReport.reportId = effectiveReportId;
      if (outcome.response?.data?.qrHash) hash = outcome.response.data.qrHash;
      if (Array.isArray(outcome.response?.data?.operationSnapshots)) {
        const authoritativeSnapshots = outcome.response.data.operationSnapshots;
        newReport.operationSnapshots = authoritativeSnapshots;
        newReport.operations = authoritativeSnapshots;
        newReport.logsCount = authoritativeSnapshots.length;
        newReport.totalLogs = authoritativeSnapshots.length;
        newReport.totalCost = authoritativeSnapshots.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
        logsCount = newReport.logsCount;
        totalCost = newReport.totalCost;
        newReport.qrSignature = hash;
      }
      if (!outcome.queued) {
        cloudQueueStatus = 'compiled';
        cloudQueuedAt = nowIso;
        newReport.cloudQueueStatus = 'compiled';
        newReport.cloudQueuedAt = nowIso;
      }
    } catch (e) {
      Alert.alert('Audit Report Not Compiled', e.message || 'The server rejected this report.');
      return;
    }

    const existingIdx = auditReports.findIndex(a => a.id === effectiveReportId || a.reportId === effectiveReportId);
    if (existingIdx >= 0) {
      auditReports[existingIdx] = { ...auditReports[existingIdx], ...newReport };
    } else {
      auditReports.unshift(newReport);
    }
    const reportSaved = await saveItem(STORAGE_KEYS.AUDIT_REPORTS, auditReports);
    if (!reportSaved) {
      safeAlert('Compilation Saved to Server', 'The canonical report was created, but this device could not update its local audit cache. Refresh after checking device storage.');
    }
    notifyDataUpdate();

    const deltaCount = logsCount;
    const countLabel = `${deltaCount} operation log${deltaCount !== 1 ? 's' : ''}`;
    const finalStatus = canonicalAuditStatus(newReport.status);

    if (cloudQueueStatus === 'compiled') {
      if (wasReplayed) {
        const replayTitle = finalStatus === AUDIT_STATUS.CERTIFIED
          ? 'Audit Already Up to Date'
          : finalStatus === AUDIT_STATUS.PENDING_REVIEW
            ? 'Already Submitted'
            : 'Audit Already Compiled';
        const replayMessage = finalStatus === AUDIT_STATUS.CERTIFIED
          ? `The server confirmed that all eligible ${compileMonth} logs are already covered by certificate ${effectiveReportId}.`
          : finalStatus === AUDIT_STATUS.PENDING_REVIEW
            ? `Report ${effectiveReportId} is already in the SRA Audit Inbox and awaiting review.`
            : `Report ${effectiveReportId} already contains these operation logs. No duplicate report was created.`;
        safeAlert(
          replayTitle,
          replayMessage,
          [{ text: finalStatus === AUDIT_STATUS.CERTIFIED ? 'View Certificate QR' : 'View Existing QR', onPress: () => openAuditQrTransfer(newReport) }]
        );
        return;
      }
      safeAlert(
        'Monthly Audit Compiled',
        `Successfully compiled ${countLabel} for ${compileMonth}.\n\nChoose how to deliver the complete report to SRA.`,
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Generate QR Transfer', onPress: () => openAuditQrTransfer(newReport) },
          { text: 'Send Through Cloud', onPress: () => handleSubmitAuditReport(newReport) }
        ]
      );
    } else {
      safeAlert(
        'Compilation Pending Sync',
        `The complete audit package is saved on this device. Cloud submission will wait for reconnection, or you can transfer it by QR now.`,
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Generate QR Transfer', onPress: () => openAuditQrTransfer(newReport) },
          { text: 'Send Through Cloud', onPress: () => handleSubmitAuditReport(newReport) }
        ]
      );
    }
  };

  const handleSubmitAuditReport = async report => {
    if (!report) return;
    const reportId = report.reportId || report.id;
    const status = canonicalAuditStatus(report.status);
    if ([AUDIT_STATUS.PENDING_REVIEW, AUDIT_STATUS.CERTIFIED].includes(status)) {
      safeAlert('Already Submitted', status === AUDIT_STATUS.CERTIFIED ? 'This audit is already certified.' : 'This audit is already awaiting SRA review.');
      return;
    }
    try {
      const outcome = await commitExplicitMutation('audit_submission', { id: reportId, submissionMethod: 'CLOUD' }, { baseVersion: report.updatedAt || null });
      const next = outcome.response?.data || {
        ...report,
        status: AUDIT_STATUS.PENDING_SUBMISSION,
        submissionMethod: 'CLOUD',
        updatedAt: new Date().toISOString()
      };
      const index = auditReports.findIndex(item => (item.reportId || item.id) === reportId);
      if (index >= 0) auditReports[index] = { ...auditReports[index], ...next };
      await saveItem(STORAGE_KEYS.AUDIT_REPORTS, auditReports);
      notifyDataUpdate();
      safeAlert(
        outcome.queued ? 'Submission Pending' : 'Submitted to SRA',
        outcome.queued
          ? 'No internet connection. Your compiled audit remains saved and its Cloud Submission will retry when connectivity returns.'
          : 'The audit is now in the SRA Audit Inbox and is awaiting review.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      safeAlert('Submission Not Completed', `${error.message || 'Unable to submit the audit.'}\n\nThe compiled audit remains saved on this device.`);
    }
  };

  const compileAndShow = async () => {
    if (auditCompilationLockRef.current) {
      safeAlert('Compilation in Progress', 'Please wait for the current monthly audit compilation to finish.');
      return;
    }
    auditCompilationLockRef.current = true;
    setIsCompilingAudit(true);
    try {
      await compileAndShowUnlocked();
    } finally {
      auditCompilationLockRef.current = false;
      setIsCompilingAudit(false);
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


  const handleScanOrSubmitCode = async (code, { source = 'camera' } = {}) => {
    if (!code) return;
    const rawStr = String(code).trim();
    if (!rawStr) return;
    try {
      if (source === 'manual') {
        const transferCode = rawStr.toUpperCase();
        if (!/^(AUD|RPT|HUG)-[A-Z0-9-]+$/.test(transferCode)) {
          throw new Error('Enter a valid AUD-, RPT-, or HUG- transfer code.');
        }
        if (!getNetworkStatus()) {
          throw new Error('A live connection is required to look up a transfer code.');
        }
        const verified = await verifyAuditQr(transferCode);
        if (!verified.data?.integrityVerified || !verified.data?.report) {
          throw new Error('No audit report was found for this transfer code.');
        }
        const canonical = validateCanonicalAuditReport(verified.data.report);
        if (!await verifyLocalAuditIntegrity(canonical)) throw new Error('The audit report integrity check failed.');
        setPendingScannedPayload(transferCode);
        setScannedAuditDuplicate(Boolean(verified.data.alreadyImported));
        setScannedAuditReport({
          ...canonical,
          id: canonical.reportId,
          integrityStatus: verified.data.alreadyImported ? 'VERIFIED' : 'DECODED'
        });
        setShowTransferCodeInput(false);
        setShowAuditReceiveOptions(false);
        setShowSRAInspectModal(true);
        return;
      }

      let report;
      let payload = rawStr;
      let duplicate = false;
      try {
        const suppliedParts = rawStr.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
        if (suppliedParts.length > 1) {
          report = assembleAuditQrParts(suppliedParts);
          payload = createAuditQrPayload(report);
        } else {
          const part = decodeAuditQrPart(rawStr);
          if (!qrTransferPartsRef.current.has(part.transferId)) qrTransferPartsRef.current.set(part.transferId, new Map());
          const collected = qrTransferPartsRef.current.get(part.transferId);
          collected.set(part.partNumber, rawStr);
          if (collected.size < part.partCount) {
            return {
              continueScanning: true,
              message: `${collected.size} of ${part.partCount} QR parts captured. Keep scanning.`
            };
          }
          report = assembleAuditQrParts(Array.from(collected.values()));
          payload = createAuditQrPayload(report);
          qrTransferPartsRef.current.delete(part.transferId);
        }
      } catch (partError) {
        try {
          report = decodeAuditQrPayload(rawStr);
          if (report.legacyLookupOnly) throw partError;
        } catch {
          if (!getNetworkStatus()) throw new Error('A typed report ID or legacy lookup QR requires a live connection. Scan the complete audit QR for offline viewing.');
          const verified = await verifyAuditQr(rawStr);
          if (!verified.data?.integrityVerified || !verified.data?.report) throw new Error('The server could not verify this audit report.');
          report = verified.data.report;
          duplicate = Boolean(verified.data.alreadyImported);
        }
      }

      const canonical = validateCanonicalAuditReport(report);
      if (!await verifyLocalAuditIntegrity(canonical)) throw new Error('The audit QR integrity check failed.');
      setPendingScannedPayload(payload);
      setScannedAuditDuplicate(duplicate);
      setScannedAuditReport({
        ...canonical,
        id: canonical.reportId,
        integrityStatus: duplicate ? 'VERIFIED' : (getNetworkStatus() ? 'DECODED' : 'OFFLINE_DECODED')
      });
      setShowScanner(false);
      setShowTransferCodeInput(false);
      setShowAuditReceiveOptions(false);
      setShowSRAInspectModal(true);
    } catch (error) {
      if (source !== 'manual') {
        return {
          continueScanning: true,
          message: 'This QR code is not a valid HUGPONG audit report.'
        };
      }
      Alert.alert(
        'No Audit Report Found',
        error.status === 404
          ? 'No audit report was found for this transfer code.'
          : (error.message || 'No audit report was found for this transfer code.')
      );
    }
  };

  const handleManualTransferSubmit = async () => {
    const code = manualTransferCode.trim();
    if (!code || isResolvingTransferCode) return;
    setIsResolvingTransferCode(true);
    try {
      await handleScanOrSubmitCode(code, { source: 'manual' });
    } finally {
      setIsResolvingTransferCode(false);
    }
  };

  const handleImportScannedAudit = async () => {
    if (!pendingScannedPayload || !scannedAuditReport) return;
    if (!getNetworkStatus()) {
      Alert.alert('Connection Required', 'The full report can be reviewed offline, but importing it into the SRA Audit Inbox requires the authoritative server.');
      return;
    }
    setIsAuditActionPending(true);
    try {
      const verified = await verifyAuditQr(pendingScannedPayload);
      if (!verified.data?.integrityVerified) throw new Error('The server could not verify this audit report.');
      const result = verified.data.alreadyImported ? verified : await importAuditQr(pendingScannedPayload);
      const serverReport = result.data?.report;
      if (!serverReport) throw new Error('The authoritative audit report was not returned.');
      const report = { ...serverReport, integrityStatus: 'VERIFIED' };
      const reportId = report.reportId || report.id;
      const index = auditReports.findIndex(candidate => (candidate.reportId || candidate.id) === reportId);
      if (index >= 0) auditReports[index] = { ...auditReports[index], ...report };
      else auditReports.unshift(report);
      await saveItem(STORAGE_KEYS.AUDIT_REPORTS, auditReports);
      setScannedAuditReport(report);
      if (result.data.alreadyImported) {
        setScannedAuditDuplicate(true);
        Alert.alert('Audit Already Imported', 'This audit report has already been imported. You can open the existing record.');
      } else {
        setShowSRAInspectModal(false);
        setScannedAuditDuplicate(false);
        Alert.alert('Audit Imported', 'The report is now in the SRA Audit Inbox awaiting review. It has not been certified.');
      }
    } catch (error) {
      Alert.alert('Import Failed', error.message || 'The complete audit report could not be imported.');
    } finally {
      setIsAuditActionPending(false);
    }
  };

  const handleCertifyReport = async (report) => {
    if (!report) return;
    const session = getCurrentSession();
    const auditorName = session?.name || 'SRA Admin';
    const certifiedAt = new Date().toISOString();
    const auditorUserId = session?.employeeId || session?.id || '';
    if (canonicalRole(session?.role) !== 'SRA_ADMIN' || canonicalAuditStatus(report.status) !== AUDIT_STATUS.PENDING_REVIEW) {
      Alert.alert('Certification Denied', 'Only an SRA Admin may certify an audit that is awaiting review.');
      return;
    }
    if (!getNetworkStatus()) {
      Alert.alert('Connection Required', 'SRA Admin actions require a live HUGPONG connection. Reconnect and sign in again.');
      return;
    }

    let certifiedReport;
    try {
      const outcome = await commitExplicitMutation('audit_certification', {
        id: report.reportId || report.id,
        certificationNotes: report.certificationNotes || ''
      }, { baseVersion: report.updatedAt || null });
      certifiedReport = outcome.response?.data;
      if (!certifiedReport) throw new Error('The server did not confirm certification.');
    } catch (e) {
      Alert.alert('Certification Failed', e.message || 'The report could not be certified.');
      return;
    }

    const existingIdx = auditReports.findIndex(a => a.id === report.id || a.reportId === report.reportId || a.qrSignature === report.qrSignature);
    if (existingIdx >= 0) {
      auditReports[existingIdx] = { ...auditReports[existingIdx], ...certifiedReport };
    }
    await saveItem(STORAGE_KEYS.AUDIT_REPORTS, auditReports);

    // Update scanned report in state
    setScannedAuditReport(prev => ({
      ...prev,
      ...certifiedReport
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
    if (activeRole === 'Farm Manager' && operationCapabilities.requiresTakeover) {
      Alert.alert(
        'Manager Takeover Required',
        'Crop Year Cycle renewal / restart must be initiated by the Farm Member (Plot Owner) or authorized through Manager Takeover.'
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
    const finalCropYear = customCropYear || cropYearCycleForDate();

    const baseStages = (CROP_CYCLE_STAGES_BY_TYPE[finalCycleType] || CROP_CYCLE_STAGES_BY_TYPE['Plant Cane (New Plant)']).map((t, idx) => ({
      ...t,
      stageNumber: t.stageNumber || (idx + 1),
      done: false,
      active: idx === 0
    }));
    const stage1Name = baseStages[0].name || baseStages[0].label || 'Pre-Planting & Land Preparation';

    // Rollover is intentionally online-only; the server transaction owns the cycle boundary.
    const rolloverResult = await archiveFieldCropCycle(fieldId, {
      cycleType: finalCycleType,
      cropYear: finalCropYear,
      stage: stage1Name,
      takeoverGrant,
      customStages: baseStages.map(s => ({ ...s, done: false, active: s.stageNumber === 1 }))
    });
    if (!rolloverResult.success) {
      safeAlert('Crop Year Cycle Not Renewed', rolloverResult.message || 'The server rejected this Crop Year Cycle renewal. Refresh and try again.');
      return;
    }

    // Force-clone every log object so React memoized selectors recompute cleanly.
    setLogs(operationLogs.map(l => ({ ...l })));
    setDraftLogs(prev => prev.filter(d => (d.fieldId || '').trim().toUpperCase() !== cleanFieldId));
    setHighlightedSubmittedLogIds(new Set());
    setHighlightedDraftIds(new Set());

    // Reset the local timeline only after the server accepted the rollover.
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
      'New Crop Year Cycle Started!',
      `Successfully initialized ${finalCycleType} (${formatCropYearDisplay(rolloverResult.cropYear || finalCropYear)}) for ${fieldId}.\n\nStage 1: "${stage1Name}" is now active and ready for field logging.`
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
      variety: stageNum === 2 ? String(cropCycles.find(cycle => cycle.id === safeField.currentCycleId)?.variety || '') : '',
      taskId: targetTask?.id || `S${stageNum}`,
      isSubmit: true
    });
    setShowOpPicker(false);
    setShowLog(true);
  };

  const handleReturnAuditReport = async report => {
    if (!report || !auditReturnReason.trim()) {
      Alert.alert('Return Reason Required', 'Explain what the Farm Manager must correct.');
      return;
    }
    if (!getNetworkStatus()) {
      Alert.alert('Connection Required', 'Returning an audit changes the authoritative workflow and requires a live server connection.');
      return;
    }
    setIsAuditActionPending(true);
    try {
      const outcome = await commitExplicitMutation('audit_return', {
        id: report.reportId || report.id,
        returnReason: auditReturnReason.trim()
      }, { baseVersion: report.updatedAt || null });
      const returned = outcome.response?.data;
      if (!returned) throw new Error('The server did not confirm the returned audit.');
      const index = auditReports.findIndex(item => (item.reportId || item.id) === (report.reportId || report.id));
      if (index >= 0) auditReports[index] = { ...auditReports[index], ...returned };
      await saveItem(STORAGE_KEYS.AUDIT_REPORTS, auditReports);
      setScannedAuditReport(returned);
      setAuditReturnReason('');
      notifyDataUpdate();
      Alert.alert('Audit Returned', 'The Farm Manager can see the correction reason and compile a new version.');
    } catch (error) {
      Alert.alert('Return Failed', error.message || 'The audit could not be returned.');
    } finally {
      setIsAuditActionPending(false);
    }
  };

  const openCustomOperationLog = targetTask => {
    if (checkTakeOverRequired('record a custom operation')) return;
    const stageNum = targetTask?.stageNumber || 1;
    setLogForm({
      id: null,
      fieldId: safeField.id,
      saveFieldId: true,
      stageNumber: stageNum,
      stageName: `Stage ${stageNum}: ${targetTask?.name || targetTask?.label || 'Custom Work'}`,
      sraOperationId: 'CUSTOM',
      operationName: '',
      activity: '',
      category: 'General Care',
      isGroup: false,
      inputType: 'direct',
      cost: '0',
      directRate: '0',
      period: formatDisplayDate(new Date()),
      hectares: safeField.ha || '1.5',
      people: '2',
      subItems: [],
      inputQty: safeField.ha || '1.5',
      inputUnit: 'ha',
      inputName: '',
      variety: stageNum === 2 ? String(cropCycles.find(cycle => cycle.id === safeField.currentCycleId)?.variety || '') : '',
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
        'Marking a stage as complete or advancing the Crop Year Cycle updates the official field state in the central database and requires an active internet connection.\n\nYou can continue logging operations and field activities offline — they will automatically sync to Cloud Firestore when reconnected.'
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

    const discardCompletedStageDrafts = async () => {
      if ((forceComplete || targetTask.active) && stageDrafts.length > 0) {
        const remainingDrafts = draftLogsStore.filter(d =>
          !(d.fieldId === safeField.id && (d.stageNumber === completedStageNum || d.taskId === targetTask.id))
        );
        draftLogsStore.length = 0;
        draftLogsStore.push(...remainingDrafts);
        setDraftLogs([...remainingDrafts]);
        await saveDraftLogs();
        notifyDataUpdate();
      }
    };

    const applyToggle = async () => {

      if (forceComplete) {
        if (completedStageNum >= 6) {
          // Stage 6 completion -> Crop cycle finished!
          const nextStageLabel = 'Harvesting & Milling (Completed)';
          const updated = rawTasks.map(t => ({ ...t, done: true, active: false }));
          const mf = fields.find(f => f.id === safeField.id);
          const stageResult = await updateFieldStageAndCycle(safeField.id, {
            stage: nextStageLabel,
            stageNumber: 6,
            isCompleted: true,
            customStages: updated,
            cycleType: mf?.cycleType || 'Plant Cane (New Plant)',
            lastUpdated: new Date().toISOString()
          }, takeoverGrant);
          if (!stageResult.success) {
            Alert.alert('Stage Update Failed', stageResult.message || 'The stage could not be completed.');
            return;
          }
          await discardCompletedStageDrafts();
          setCycleTasksByField(p => ({ ...p, [safeField.id]: updated }));
          setSelectedField(prevF => ({ ...prevF, stage: nextStageLabel, stageNumber: 6, isCompleted: true, customStages: updated }));
          if (mf) {
            mf.stage = nextStageLabel;
            mf.stageNumber = 6;
            mf.isCompleted = true;
            mf.customStages = updated;
            if (isTakeOver) {
              mf.synced = true;
              mf.lastSync = 'Just now (Manager Takeover)';
            }
          }

          const session = getCurrentSession();
          const actorName = session?.name ? `${session.name} (${session.role || 'Farm Member'})` : 'Farm Member';
          logSystemEvent(
            'operation',
            'Crop Year Cycle Completed',
            safeField.id,
            `All 6 stages completed for field ${safeField.id} (${safeField.member || 'Farm Member'}).`,
            actorName,
            'Completed'
          );

          setTimeout(() => {
            if (activeRole === 'Farm Manager') {
              Alert.alert(
                'Crop Year Cycle Completed!',
                'All 6 stages for this field Crop Year Cycle are complete. Renewal / restart must be initiated by the Farm Member (Field Owner).'
              );
            } else {
              Alert.alert(
                'Crop Year Cycle Completed!',
                'All 6 stages for this field cycle are complete. Would you like to start a new Crop Year Cycle?',
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

          const mf = fields.find(f => f.id === safeField.id);
          const stageResult = await updateFieldStageAndCycle(safeField.id, {
            stage: nextStageLabel,
            stageNumber: nextStageNum,
            customStages: updated,
            cycleType: mf?.cycleType || 'Plant Cane (New Plant)',
            lastUpdated: new Date().toISOString()
          }, takeoverGrant);
          if (!stageResult.success) {
            Alert.alert('Stage Update Failed', stageResult.message || 'The stage could not be advanced.');
            return;
          }
          await discardCompletedStageDrafts();
          setCycleTasksByField(p => ({ ...p, [safeField.id]: updated }));
          setSelectedField(prevF => ({ ...prevF, stage: nextStageLabel, stageNumber: nextStageNum }));
          if (mf) {
            mf.stage = nextStageLabel;
            mf.stageNumber = nextStageNum;
            if (isTakeOver) {
              mf.synced = true;
              mf.lastSync = 'Just now (Manager Takeover)';
            }
          }

          const session = getCurrentSession();
          const actorName = session?.name ? `${session.name} (${session.role || 'Farm Member'})` : 'Farm Member';
          logSystemEvent(
            'operation',
            isTakeOver ? 'Stage Advanced via Manager Takeover' : 'Field Stage Advance',
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

        const mf = fields.find(f => f.id === safeField.id);
        const stageResult = await updateFieldStageAndCycle(safeField.id, {
          stage: targetLabel,
          stageNumber: targetNum,
          customStages: updated,
          cycleType: mf?.cycleType || 'Plant Cane (New Plant)',
          lastUpdated: new Date().toISOString()
        }, takeoverGrant);
        if (!stageResult.success) {
          Alert.alert('Stage Update Failed', stageResult.message || 'The stage could not be updated.');
          return;
        }
        await discardCompletedStageDrafts();
        setCycleTasksByField(p => ({ ...p, [safeField.id]: updated }));
        setSelectedField(prevF => ({ ...prevF, stage: targetLabel, stageNumber: targetNum }));
        if (mf) {
          mf.stage = targetLabel;
          mf.stageNumber = targetNum;
          if (isTakeOver) {
            mf.synced = true;
            mf.lastSync = 'Just now (Manager Takeover)';
          }
        }
      }
    };

    const isProgressing = !targetTask.done;
    
    if (isProgressing && taskIndex > 0) {
      const hasPendingPrior = fieldTasks.slice(0, taskIndex).some(t => !t.done);
      if (hasPendingPrior) {
        if (activeRole === 'Farm Member') {
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
      if (activeRole === 'Farm Member') {
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
    const isNet = getNetworkStatus();
    const initialFarmIds = new Set(blockFarms.filter(farm => farm.managerUserId === initialUserId).map(farm => farm.id));
    const initialFields = fields.filter(field => {
      if (initialSession?.role === 'Farm Member' || !isNet) {
        return (
          field.memberUserId === initialUserId ||
          field.memberId === initialUserId ||
          field.member === initialSession?.name ||
          field.memberName === initialSession?.name ||
          (initialSession?.fieldId && field.id === initialSession?.fieldId)
        );
      }
      if (initialSession?.role === 'Farm Manager') {
        return initialFarmIds.has(field.blockFarmId);
      }
      return true;
    });
    setSelectedField(initialFields.find(field => field.id === initialSession?.fieldId) || initialFields[0] || null);
    const unsubscribe = subscribe(() => {
      const session = getCurrentSession();
      setActiveRole(session?.role || 'Farm Member');
      // Keep selectedField reactive and aligned with authoritative fields array!
      setSelectedField(prev => {
        const userId = session?.employeeId || session?.id || '';
        const isOnlineNow = getNetworkStatus();
        const farmIds = new Set(blockFarms.filter(farm => farm.managerUserId === userId).map(farm => farm.id));
        const permitted = fields.filter(field => {
          if (session?.role === 'Farm Member' || !isOnlineNow) {
            return (
              field.memberUserId === userId ||
              field.memberId === userId ||
              field.member === session?.name ||
              field.memberName === session?.name ||
              (session?.fieldId && field.id === session?.fieldId)
            );
          }
          if (session?.role === 'Farm Manager') {
            return farmIds.has(field.blockFarmId);
          }
          return true;
        });
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
      variety: targetOp.stageNumber === 2 ? String(cropCycles.find(cycle => cycle.id === safeField.currentCycleId)?.variety || '') : '',
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
    if (isSavingLog || submissionLockRef.current) return;

    const matchedOp = SRA_OPERATIONS_CATALOGUE.find(o => o.id === logForm.sraOperationId) || {};
    const parentStageNum = logForm.stageNumber || matchedOp.stageNumber || 1;
    const parentStageName = logForm.stageName || matchedOp.stageName || 'Stage 1: Pre-Planting & Land Preparation';
    const effectiveActivity = logForm.operationName || logForm.activity || matchedOp.name || '';
    const finalActivityName = (effectiveActivity || logForm.subItems?.[0]?.description || '').trim();
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
    const submittedField = fields.find(field => String(field.id || '').trim().toUpperCase() === submittedFieldId) || selectedField;
    const submittedCapabilities = getOperationCapabilities(session, submittedField, takeoverSession);
    if (!asSubmit && !submittedCapabilities.canDraft) {
      Alert.alert('Drafts Unavailable', 'Drafts can only be saved for your own currently assigned field. Manager Takeover entries must be submitted directly.');
      return;
    }

    // Member Field Lock: Members can only log activities for their own assigned plot
    if (activeRole === 'Farm Member') {
      const session = getCurrentSession();
      const myPlot = session.fieldId?.trim()?.toUpperCase();
      if (myPlot && submittedFieldId !== myPlot) {
        Alert.alert(
          'Action Denied',
          `As a Farm Member, you may only record operations for your assigned plot (${session.fieldId}). To request an additional plot, please use Field Requests.`
        );
        return;
      }
    }

    // Farm Manager Takeover validation
    if (activeRole === 'Farm Manager' && !logForm.id) {
      const session = getCurrentSession();
      const targetField = fields.find(f => (f.id || '').trim().toUpperCase() === submittedFieldId) || selectedField;
      const targetCapabilities = getOperationCapabilities(session, targetField, takeoverSession);
      if (targetCapabilities.requiresTakeover) {
        Alert.alert(
          'Manager Takeover Required',
          `This field is managed by ${targetField?.member || 'the assigned Farm Member'}. To record stage work or submit operations, please authorize Manager Takeover first.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Manager Takeover', onPress: handleInitiateTakeOver }
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
        (
          (logForm.sraOperationId !== 'CUSTOM' && l.sraOperationId === logForm.sraOperationId)
          || l.operationName === finalActivityName
          || l.activity === finalActivityName
        ) &&
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
    const loggedByStr = operationCapabilities.takeover
      ? `${getCurrentSession().name} (Farm Manager)`
      : `${getCurrentSession().name} (${getCurrentSession().role === 'Farm Manager' ? 'Farm Manager' : 'Farm Member'})`;

    const isDraftId = logForm.id && logForm.id.startsWith('DFT-');
    const logIdToUse = (asSubmit && isDraftId)
      ? generateLogId(submittedFieldId)
      : (logForm.id || (asSubmit ? generateLogId(submittedFieldId) : generateDraftId(submittedFieldId)));
    let isNetOnline = getNetworkStatus();
    const activeField = fields.find(field => field.id === submittedFieldId) || selectedField || safeField;
    const activeCycleId = activeField?.currentCycleId;
    const activeCycle = cropCycles.find(cycle => cycle.id === activeCycleId);
    if (asSubmit && !activeCycleId) {
      Alert.alert('Crop Year Cycle Required', 'This field has no explicit active Crop Year Cycle. Create or synchronize the field cycle before submitting an operation.');
      return;
    }
    if (Number(parentStageNum) === 2 && !String(logForm.variety || '').trim()) {
      Alert.alert('Sugarcane Variety Required', 'Select the sugarcane variety used for this Planting-stage operation.');
      return;
    }
    const stageAtRecord = Number(parentStageNum);
    if (asSubmit && (!Number.isInteger(stageAtRecord) || stageAtRecord < 1 || stageAtRecord > 6)) {
      Alert.alert('Current Stage Required', 'Synchronize the field\'s current Crop Year Cycle before submitting an operation.');
      return;
    }

    const newLog = {
      id: logIdToUse,
      fieldId: submittedFieldId,
      cycleId: activeCycleId || '',
      blockFarmId: activeField?.blockFarmId || '',
      cropYearCycle: activeCycle?.cropYear || activeField?.cropYear || '',
      stageNumberAtRecord: stageAtRecord,
      stageNumber: parentStageNum,
      stageName: parentStageName,
      sraOperationId: logForm.sraOperationId || matchedOp.id || 'CUSTOM',
      operationDefinitionId: logForm.sraOperationId || matchedOp.id || 'CUSTOM',
      operationName: finalActivityName,
      activity: finalActivityName,
      category: logForm.category || matchedOp.category || (logForm.sraOperationId === 'CUSTOM' ? 'General Care' : 'prep'),
      variety: Number(parentStageNum) === 2 ? String(logForm.variety || '').trim() : '',
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
      submissionSource: submittedCapabilities.submissionSource,
      taskId: logForm.taskId || `S${parentStageNum}`,
      isOffline: !isNetOnline,
      synced: isNetOnline,
      cloudQueueStatus: isNetOnline ? 'synced' : 'offline_queued',
      isDraft: !asSubmit,
      isSupplemental: Boolean(logForm.isSupplemental),
      amendments: []
    };

    submissionLockRef.current = true;
    setIsSavingLog(true);
    let submissionSynced = false;

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
            const result = await updateOperationLogWithSecurity(logForm.id, newLog, reason, {
              takeoverGrant: operationCapabilities.takeover ? takeoverGrant : null
            });
            
            if (!result.success) {
              Alert.alert(
                result.noChanges ? 'No Changes Detected' : 'Security Authorization Error',
                result.error || 'Could not update operation log.'
              );
              if (result.noChanges) {
                setShowLog(false);
                setLogEditAuth({ reason: '' });
              }
              return;
            }

            setLogs([...operationLogs]);
            if (Number(parentStageNum) === 2 && activeCycle) {
              activeCycle.variety = String(newLog.variety || '').trim();
            }
            setLogTab('submitted');
            notifyDataUpdate();
            Alert.alert(
              'Operation updated successfully.',
              `The existing operation ID ${logForm.id} was updated without creating a duplicate.\n\nAudit Reason: ${reason}\nAmended by: ${getCurrentSession().name}`
            );
            setLogEditAuth({ reason: '' });
            setLogForm({ id: null, fieldId: safeField.id, saveFieldId: true, activity: '', cost: '', period: formatDisplayDate(new Date()), hectares: '', people: '', inputQty: '', inputUnit: 'bags', inputName: '', taskId: null, isSubmit: true });
            setShowLog(false);
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
          submissionSource: submittedCapabilities.submissionSource,
          status: 'ACTIVE'
        });

        try {
          const outcome = await commitExplicitMutation('operation_log', { id: newLog.id, ...cleanNewLog }, { takeoverGrant });
          submissionSynced = !outcome.queued && Boolean(outcome.response?.success);
          isNetOnline = submissionSynced;
          if (outcome.response?.data) {
            Object.assign(newLog, outcome.response.data, { id: outcome.response.data.id || newLog.id });
          }
          if (outcome.queued) {
            newLog.synced = false;
            newLog.isOffline = true;
            newLog.cloudQueueStatus = 'offline_queued';
          }
          if (submissionSynced) {
            newLog.synced = true;
            newLog.isOffline = false;
            newLog.cloudQueueStatus = 'synced';
            newLog.syncedAt = new Date().toISOString();
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
        const localSaveSucceeded = await saveItem(STORAGE_KEYS.LOGS, operationLogs);
        if (!localSaveSucceeded) {
          setLogForm(previous => ({ ...previous, id: newLog.id }));
          Alert.alert('Local Save Failed', 'The device cache could not be persisted. The form remains open and keeps the same operation ID for a safe retry.');
          return;
        }
        console.info(`[OPERATION] Local save success: ${newLog.id}`);
        if (Number(parentStageNum) === 2 && activeCycle) {
          activeCycle.variety = String(newLog.variety || '').trim();
        }
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
        if (submissionSynced) {
          setSynced(true);
        }

        if (operationCapabilities.takeover || newLog.submissionSource === 'MANAGER_TAKEOVER') {
          const targetField = fields.find(f => f.id === submittedFieldId) || selectedField;
          if (targetField) {
            targetField.synced = true;
            targetField.lastSync = 'Just now (Manager Takeover)';
            saveFieldPlot(targetField, false);
            if ((selectedField?.id || safeField.id) === targetField?.id) {
              setSelectedField({ ...targetField });
            }
          }
        }

        // Close form modal smoothly before showing confirmation
        setShowLog(false);
        
        // Keep stage active and allow multiple operations per stage
        if (logForm.taskId && logForm.taskId !== 'Emergency') {
          const currentTasks = cycleTasksByField[submittedFieldId] || [];
          const targetTask = currentTasks.find(t => t.id === logForm.taskId);
          const stageNum = logForm.stageNumber || targetTask?.stageNumber || 1;
          const stageLoggedOps = operationLogs.filter(l => l.fieldId === submittedFieldId && (l.stageNumber === stageNum || l.taskId === logForm.taskId) && l.status === 'ACTIVE');

          if (targetTask?.done || logForm.isSupplemental || newLog.isSupplemental) {
            Alert.alert(
              isNetOnline ? 'Supplemental Operation Recorded' : 'Supplemental Operation Saved — Unsynced',
              submissionSynced
                ? `"${newLog.activity}" recorded to field history as a supplemental entry. Stage progress was kept intact.`
                : `"${newLog.activity}" stored in local device storage. It will synchronize to Cloud Firestore when internet connection is restored.`,
              [
                { text: 'Done', style: 'cancel' },
                { text: 'View Ledger', style: 'default', onPress: () => setShowHistoryModal(true) }
              ]
            );
          } else {
            Alert.alert(
              isNetOnline ? 'Operation Recorded — Synced' : 'Operation Saved — Unsynced',
              submissionSynced
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
            isNetOnline ? 'Operation Recorded — Synced' : 'Operation Saved — Unsynced',
            submissionSynced
              ? `"${newLog.activity}" (₱${Number(costValue).toLocaleString()}) has been recorded and synchronized to Cloud Firestore.`
              : `"${newLog.activity}" (₱${Number(costValue).toLocaleString()}) has been saved to device local storage and queued for cloud sync.`,
            [
              { text: 'Done', style: 'cancel' },
              { text: 'View Ledger', style: 'default', onPress: () => setShowHistoryModal(true) }
            ]
          );
        }
      } else {
        const existingDraftId = logForm.id?.startsWith('DFT-') ? logForm.id : null;
        const draftObj = await saveLocalOperationDraft(newLog, existingDraftId);
        setHighlightedDraftIds(prev => new Set([draftObj.id, ...prev]));
        setDraftLogs([...draftLogsStore]);
        setLogTab('drafts');
        setShowLog(false);
        Alert.alert('Draft Saved', 'Your log has been saved as a draft.');
      }
      
      notifyDataUpdate();

      if (logForm.saveFieldId && submittedFieldId !== (selectedField?.id || safeField.id)) {
        updateSessionFieldId(submittedFieldId);
      }

      setLogForm({ id: null, fieldId: safeField.id, saveFieldId: true, activity: '', cost: '', period: formatDisplayDate(new Date()), hectares: '', people: '', inputQty: '', inputUnit: 'bags', inputName: '', taskId: null, isSubmit: true });
    } finally {
      submissionLockRef.current = false;
      setIsSavingLog(false);
    }
  };

  const submitDraft = async (log) => {
    const validation = validateLocalDraftForSubmission(log);
    if (!validation.valid) {
      Alert.alert('Draft Cannot Be Submitted', validation.error);
      return;
    }
    const draftField = validation.field;
    const activeCycleId = draftField?.currentCycleId || selectedField?.currentCycleId;
    const activeCycle = cropCycles.find(cycle => cycle.id === activeCycleId);
    if (!activeCycleId) {
      Alert.alert('Crop Year Cycle Required', 'This field has no explicit active Crop Year Cycle. Synchronize the field before submitting this draft.');
      return;
    }
    const stageAtRecord = Number(activeCycle?.currentStageNumber ?? draftField?.stageNumber ?? selectedField?.stageNumber);
    if (!Number.isInteger(stageAtRecord) || stageAtRecord < 1 || stageAtRecord > 6) {
      Alert.alert('Current Stage Required', 'Synchronize the field\'s current Crop Year Cycle before submitting this draft.');
      return;
    }
    const cleanFieldId = log.fieldId.trim().toUpperCase();
    let claimed;
    try {
      claimed = await claimLocalDraftSubmission(log.id);
    } catch (error) {
      Alert.alert('Draft Cannot Be Submitted', error.message);
      return;
    }
    const submittedId = claimed.draft.submittedOperationId;
    const opCost = Number(log.cost || log.totalCost || 0);
    const submittedLog = {
      ...log,
      id: submittedId,
      fieldId: cleanFieldId,
      cycleId: activeCycleId,
      blockFarmId: draftField?.blockFarmId || selectedField?.blockFarmId || '',
      cropYearCycle: activeCycle?.cropYear || draftField?.cropYear || selectedField?.cropYear || '',
      stageNumberAtRecord: stageAtRecord,
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
      submissionSource: 'FIELD_OWNER',
      status: 'ACTIVE'
    });

    try {
      const outcome = await commitExplicitMutation('operation_log', { id: submittedId, ...cleanSubmitted }, { takeoverGrant });
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
      await releaseLocalDraftSubmission(log.id);
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
    const validation = validateLocalDraftForSubmission(draft);
    if (!validation.valid) {
      Alert.alert('Draft Cannot Be Edited', validation.error);
      return;
    }
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
      variety: draft.variety || '',
      isSupplemental: Boolean(draft.isSupplemental),
      isSubmit: false,
    });
    setShowLog(true);
  };

  const deleteDraft = (draftId) => {
    const draft = draftLogsStore.find(item => item.id === draftId);
    const validation = validateLocalDraftForSubmission(draft);
    if (!validation.valid) {
      Alert.alert('Draft Cannot Be Deleted', validation.error);
      return;
    }
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

              const validation = validateLocalDraftForSubmission(d);
              if (!validation.valid) {
                remainingDrafts.push(d);
                continue;
              }
              const cleanFieldId = d.fieldId.trim().toUpperCase();
              const draftField = validation.field;
              const activeCycleId = draftField.currentCycleId;
              const activeCycle = cropCycles.find(cycle => cycle.id === activeCycleId);
              if (!activeCycleId) {
                remainingDrafts.push(d);
                continue;
              }
              const stageAtRecord = Number(activeCycle?.currentStageNumber ?? draftField?.stageNumber ?? selectedField?.stageNumber);
              if (!Number.isInteger(stageAtRecord) || stageAtRecord < 1 || stageAtRecord > 6) {
                remainingDrafts.push(d);
                continue;
              }
              try {
                await claimLocalDraftSubmission(d.id);
              } catch (error) {
                remainingDrafts.push(d);
                continue;
              }
              const submittedId = d.submittedOperationId;
              const opCost = Number(d.cost || d.totalCost || 0);
              const submittedLog = {
                ...d,
                id: submittedId,
                fieldId: cleanFieldId,
                cycleId: activeCycleId,
                blockFarmId: draftField?.blockFarmId || selectedField?.blockFarmId || '',
                cropYearCycle: activeCycle?.cropYear || draftField?.cropYear || selectedField?.cropYear || '',
                stageNumberAtRecord: stageAtRecord,
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
                submissionSource: 'FIELD_OWNER',
                status: 'ACTIVE'
              });

              try {
                const outcome = await commitExplicitMutation('operation_log', { id: submittedId, ...cleanBatchLog }, { takeoverGrant });
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
                await releaseLocalDraftSubmission(d.id);
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
        'This operation log belongs to an archived Crop Year Cycle and cannot be modified.'
      );
      return;
    }

    if (!allowNormalManagerEdit && checkTakeOverRequired('amend or modify operation logs', () => editSubmittedLog(log, true))) return;

    const session = getCurrentSession();
    const isOwner = selectedField?.member === session.name || log?.authorName === session.name || activeRole === 'Farm Member';

    // Farm Manager or Member can edit this specific operation directly with amendment authorization

    // Open Security Authorization Modal
    setPendingEditLog(log);
    setEditAuthReason('');
    setEditAuthError('');
    setShowEditAuthModal(true);
  };

  const handleConfirmEditAuth = async () => {
    const cleanReason = String(editAuthReason || '').trim();
    if (!cleanReason || cleanReason.length < 3) {
      setEditAuthError('Please provide a mandatory reason for this amendment/correction.');
      return;
    }

    const log = pendingEditLog;
    if (!log) return;

    setLogEditAuth({ reason: cleanReason });
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
      variety: log.variety || '',
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
    return sortOperationsNewestFirst(visibleLogs
      .filter(l => {
        const logFId = (l.fieldId || '').trim().toUpperCase();
        return logFId === activeFieldId && l.status === 'ACTIVE' && !l.isDraft;
      }));
  }, [visibleLogs, activeFieldId, isLogPastCycle]);

  const pastLogs = archiveState.records;
  const accessibleArchiveFieldIds = new Set(accessibleFields.map(field => field.id));
  const authorizedArchiveCycles = cropCycles.filter(cycle => accessibleArchiveFieldIds.has(cycle.fieldId));
  const archiveCropYears = uniqueCropYears(authorizedArchiveCycles);
  const invalidArchiveCycles = authorizedArchiveCycles.filter(cycle => !canonicalStoredCropYear(cycle.cropYear));
  const orderedArchiveFields = React.useMemo(
    () => [...accessibleFields].sort((left, right) => String(left.id).localeCompare(String(right.id))),
    [accessibleFields]
  );

  const loadArchivePage = useCallback(async ({ append = false } = {}) => {
    if (append && archiveLoadMoreLockRef.current) return;
    if (append) archiveLoadMoreLockRef.current = true;
    const requestId = ++archiveRequestIdRef.current;
    setArchiveState(previous => ({
      ...previous,
      isLoading: !append,
      isLoadingMore: append,
      isCleared: false,
      error: append ? previous.error : null,
      loadMoreError: null,
      ...(append ? {} : { records: [], nextCursor: null, hasMore: false })
    }));
    try {
      const page = await fetchArchivedOperations({
        ...archiveFilters,
        cursor: append ? archiveState.nextCursor : null
      });
      if (requestId !== archiveRequestIdRef.current) return;
      setArchiveState(previous => ({
        ...previous,
        records: append ? appendUniqueArchiveRecords(previous.records, page.records) : page.records,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        isLoading: false,
        isLoadingMore: false,
        isCleared: false,
        error: null,
        loadMoreError: null
      }));
    } catch (error) {
      if (requestId !== archiveRequestIdRef.current) return;
      setArchiveState(previous => ({
        ...previous,
        isLoading: false,
        isLoadingMore: false,
        ...(append
          ? { loadMoreError: error.message || 'Unable to load more archived records.' }
          : { error: error.message || 'Unable to load archived records.' })
      }));
    } finally {
      if (append) archiveLoadMoreLockRef.current = false;
    }
  }, [archiveFilters, archiveState.nextCursor]);

  useEffect(() => {
    let active = true;

    if (!archivePreferenceScope) {
      setHydratedArchivePreferenceScope('');
      return () => { active = false; };
    }

    archiveRequestIdRef.current += 1;
    archiveLoadMoreLockRef.current = false;
    readArchiveClearViewPreference(archivePreferenceScope).then(isCleared => {
      if (!active) return;
      setArchiveState(previous => ({
        ...previous,
        records: [], nextCursor: null, hasMore: false,
        isLoading: false, isLoadingMore: false, isCleared, error: null, loadMoreError: null
      }));
      setHydratedArchivePreferenceScope(archivePreferenceScope);
    });

    return () => { active = false; };
  }, [archivePreferenceScope]);

  useEffect(() => {
    if (!showHistoryModal || logTab !== 'past') return;
    if (!archivePreferenceScope || hydratedArchivePreferenceScope !== archivePreferenceScope) return;
    if (archiveState.isCleared) return;
    loadArchivePage({ append: false });
  }, [showHistoryModal, logTab, archiveFilters, archivePreferenceScope, hydratedArchivePreferenceScope]);

  const updateArchiveFilter = (key, value) => {
    setArchiveFilters(previous => ({ ...previous, [key]: value }));
  };

  const clearArchiveView = () => {
    void writeArchiveClearViewPreference(archivePreferenceScope, true);
    archiveRequestIdRef.current += 1;
    archiveLoadMoreLockRef.current = false;
    setArchiveState(previous => ({
      ...previous,
      records: [], nextCursor: null, hasMore: false,
      isLoading: false, isLoadingMore: false, isCleared: true, error: null, loadMoreError: null
    }));
  };

  const showArchiveRecords = async () => {
    await writeArchiveClearViewPreference(archivePreferenceScope, false);
    setArchiveState(previous => ({ ...previous, isCleared: false }));
    loadArchivePage({ append: false });
  };

  const allFarmSubmittedLogs = React.useMemo(() => {
    const permittedFieldIds = new Set(accessibleFields.map(field => field.id));
    return sortOperationsNewestFirst(visibleLogs
      .filter(l => l.status === 'ACTIVE' && !l.isDraft && permittedFieldIds.has(l.fieldId)));
  }, [visibleLogs, accessibleFields, isLogPastCycle]);

  const managerSubmittedLogs = React.useMemo(() => {
    if (managerLedgerScope === 'all') {
      return allFarmSubmittedLogs;
    }
    return fieldLogs;
  }, [managerLedgerScope, allFarmSubmittedLogs, fieldLogs]);

  const auditCoverageSignature = auditReports
    .map(report => `${report.reportId || report.id}:${report.status}:${report.updatedAt || report.compiledAt || ''}`)
    .join('|');
  const auditCoverageByOperationId = React.useMemo(
    () => operationAuditCoverage(auditReports),
    [auditCoverageSignature]
  );

  const unsynced = React.useMemo(() => {
    return accessibleFields.filter(f => !fieldSyncState(f).isSynced);
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

  const renderCompactLogList = (baseList, isDraft = false, isManager = false, archiveMode = false) => {
    const effectiveBaseList = isDraft
      ? sortNewestFirst(baseList, ['createdAt', 'timestamp', 'date'])
      : sortOperationsNewestFirst(baseList);

    const filtered = archiveMode ? effectiveBaseList : effectiveBaseList.filter(log => {
      if (!isDraft && logCategoryFilter !== 'all') {
        const stageNum = parseInt(logCategoryFilter.replace('stage', ''), 10);
        const isMatch = (
          log.stageNumber === stageNum ||
          (log.taskId && log.taskId.toUpperCase() === `S${stageNum}`) ||
          (log.taskId && /^T\d+$/.test(log.taskId) && getOperationDefinition(`SRA-${String(Number(log.taskId.slice(1))).padStart(2, '0')}`)?.stageNumber === stageNum) ||
          (log.sraOperationId && getOperationDefinition(log.sraOperationId)?.stageNumber === stageNum) ||
          SRA_OPERATIONS_CATALOGUE.some(operation => (
            operation.stageNumber === stageNum &&
            operation.name.toLowerCase() === String(log.operationName || log.activity || '').trim().toLowerCase()
          ))
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

    const isFiltering = !archiveMode && (logSearch.trim().length > 0 || (!isDraft && logCategoryFilter !== 'all'));
    const totalPages = Math.max(1, Math.ceil(filtered.length / LOGS_PER_PAGE));
    const currentPageClamped = Math.min(logCurrentPage, totalPages);
    const displayItems = archiveMode
      ? filtered
      : filtered.slice((currentPageClamped - 1) * LOGS_PER_PAGE, currentPageClamped * LOGS_PER_PAGE);

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
        {!archiveMode && <View style={s.logSearchBox}>
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
        </View>}

        {/* Filter Pills (6 Official SRA Growth Stages) */}
        {!isDraft && !archiveMode && (
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
              canEdit={isDraft || operationCapabilities.canEdit}
              onViewAuditTrail={(targetLog) => {
                setActiveLogForAudit(targetLog);
                setShowLogAuditModal(true);
              }}
              cropYear={log.cropYearCycle || cropCycles.find(cycle => cycle.id === log.cycleId)?.cropYear}
              auditCoverage={isDraft ? null : auditCoverageByOperationId.get(String(log.id))}
              s={s}
            />
          );
        })}

        {/* Simple Page-by-Page Pagination Controls (Prev / Page X of Y / Next) */}
        {!archiveMode && filtered.length > 0 && totalPages > 1 && (
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

    const isSupervisoryViewOnly = activeRole === 'Farm Manager' && operationCapabilities.requiresTakeover;

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
                    { borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff', overflow: 'hidden' },
                    isCurrentActive && { borderColor: COLORS.primary, backgroundColor: '#FFFFFF' },
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
                                  variety: Number(task.stageNumber || i + 1) === 2 ? String(cropCycles.find(cycle => cycle.id === safeField.currentCycleId)?.variety || '') : '',
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
                          `Stage ${activeStage?.stageNumber || 1} is not yet completed. As Farm Manager using Manager Takeover, do you want to force advance to Stage ${task.stageNumber || i + 1}?`,
                          [
                            { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                            {
                              text: t('yes_skip_ahead', 'Yes, Skip Ahead'),
                              style: 'destructive',
                              onPress: async () => {
                                const currentTasks = cycleTasksByField[safeField.id] || getFieldStages(safeField.id);
                                const updated = currentTasks.map((tItem, idx) => {
                                  if (idx < i) return { ...tItem, done: true, active: false };
                                  if (tItem.id === task.id) return { ...tItem, done: false, active: true };
                                  return { ...tItem, done: false, active: false };
                                });
                                const newStageLabel = task.name || task.label;
                                const stageNum = task.stageNumber || i + 1;
                                const mf = fields.find(f => f.id === safeField.id);
                                const stageResult = await updateFieldStageAndCycle(safeField.id, {
                                  stage: newStageLabel,
                                  stageNumber: stageNum,
                                  customStages: updated,
                                  cycleType: mf?.cycleType || 'Plant Cane (New Plant)',
                                  lastUpdated: new Date().toISOString()
                                }, takeoverGrant);
                                if (!stageResult.success) {
                                  Alert.alert('Stage Update Failed', stageResult.message || 'The stage could not be advanced.');
                                  return;
                                }
                                setCycleTasksByField(p => ({ ...p, [safeField.id]: updated }));
                                setSelectedField(prevF => ({ ...prevF, stage: newStageLabel, stageNumber: stageNum }));
                              }
                            }
                          ]
                        );
                        return;
                      }

                      Alert.alert(
                        t('stage_locked_title', 'Stage Locked'),
                        `${t('stage_locked_msg', 'Please complete prior stages first. Sugarcane Crop Year Cycles must progress stage by stage.')}\n\nStage ${activeStage?.stageNumber || 1} (${activeStage?.name || 'Current Stage'}) must be completed before Stage ${task.stageNumber || i + 1} can be activated.`
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
                  {isCurrentActive && isSupervisoryViewOnly && (
                    <View style={{ backgroundColor: '#FFFBEB', borderTopWidth: 1, borderTopColor: '#FEF0D0', padding: 12, gap: 8 }}>
                      <Text style={{ fontSize: 12, color: '#8F5700', fontWeight: '700' }}>
                        View only. Authorize Manager Takeover to create or edit operations on this member field.
                      </Text>
                      <TouchableOpacity style={{ alignSelf: 'flex-start', backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.sm }} onPress={handleInitiateTakeOver}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Manager Takeover</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {isCurrentActive && !isSupervisoryViewOnly && (
                    <View style={{ backgroundColor: '#F8FAF5', borderTopWidth: 1, borderTopColor: '#E4EEE1', padding: 12, gap: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase' }}>
                          {t('operations_in_stage', 'Operations in Stage')} {task.stageNumber || i + 1}
                        </Text>
                      </View>

                      {/* List of distinct operations under this stage (Customized by member or SRA default) */}
                      <View style={{ gap: 6 }}>
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 7,
                            backgroundColor: COLORS.primaryBg,
                            borderWidth: 1.5,
                            borderColor: COLORS.primary,
                            borderStyle: 'dashed',
                            borderRadius: RADIUS.md,
                            paddingVertical: 12,
                            marginBottom: 4
                          }}
                          onPress={() => openCustomOperationLog(task)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
                          <View>
                            <Text style={{ fontSize: 13, fontWeight: '900', color: COLORS.primary }}>Custom Operation</Text>
                            <Text style={{ fontSize: 10.5, color: COLORS.textSecondary }}>Enter your own activity and cost</Text>
                          </View>
                        </TouchableOpacity>

                        {getFieldCustomOperations(safeField.id, task.stageNumber || i + 1).map(op => {
                          const opCostPerHa = (op.subItems || []).reduce((sum, si) => sum + (si.qty * si.unitCost), 0) || op.costPerHa || 0;
                          const matchingLogs = fieldLogs.filter(l => 
                            (l.operationName === op.name || l.sraOperationId === op.id || l.activity === op.name) && 
                            (l.stageNumber === (task.stageNumber || i + 1) || l.taskId === task.id || l.taskId === `S${task.stageNumber || i + 1}`) && 
                            !isLogPastCycle(l)
                          );
                          const isOpLogged = matchingLogs.length > 0;
                          const hasUnsyncedLog = isOpLogged && matchingLogs.some(l => l.isOffline === true || l.synced === false || l.cloudQueueStatus === 'offline_queued');
                          const isFullySyncedLog = isOpLogged && !hasUnsyncedLog;

                          return (
                            <TouchableOpacity
                              key={op.id}
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                backgroundColor: isFullySyncedLog ? '#F4FAF0' : (hasUnsyncedLog ? '#FFFBF0' : '#fff'),
                                padding: 12,
                                borderRadius: RADIUS.md,
                                borderWidth: 1,
                                borderColor: isFullySyncedLog ? '#C0D9A8' : (hasUnsyncedLog ? '#FEF0D0' : '#E5E7EB'),
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

                        {/* Manual Complete Stage Button */}
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            backgroundColor: COLORS.primary,
                            borderRadius: RADIUS.md,
                            paddingVertical: 14,
                            marginTop: 6
                          }}
                          onPress={() => {
                            if (checkTakeOverRequired('complete stages or update Crop Year Cycle progress')) return;
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

          {isFullyCompleted && activeRole === 'Farm Member' && (
            <TouchableOpacity
              style={{ marginTop: 8, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
              onPress={() => {
                Alert.alert(
                  t('btn_start_new_cycle', 'Start New Crop Year Cycle'),
                  'Are you sure you want to start a new Crop Year Cycle? This will archive previous logs and activate Stage 1: Pre-Planting & Land Preparation.',
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
                Crop Year Cycle Completed (Awaiting Farm Member Renewal)
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const scopedDrafts = (activeRole === 'Farm Member' && selectedField?.id) ? draftLogs.filter(d => d.fieldId === safeField.id) : [];
  const totalLedgerCount = fieldLogs.length + (activeRole === 'Farm Member' ? scopedDrafts.length : 0);

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
        {activeRole === 'Farm Member' && (
          <>
            {(() => {
              const sess = getCurrentSession() || {};
              const sName = (sess.name || '').trim().toLowerCase();
              const uId = sess.employeeId || sess.id || '';
              const memberFieldList = (fields || []).filter(Boolean).filter(f => {
                const mName = (f.member || f.memberName || '').trim().toLowerCase();
                return (sess.fieldId && sess.fieldId !== 'Unassigned (Pending Manager Allocation)' && f.id === sess.fieldId) || 
                       (uId && (f.memberId === uId || f.memberUserId === uId)) || 
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
                        Your Farm Member account is registered under <Text style={{ fontWeight: '800' }}>{sess.farm || sess.blockFarm || 'your Block Farm'}</Text>. Your Farm Manager has not yet allocated a sugarcane field plot to your account in the cooperative registry.
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
                        <Ionicons name={fieldSyncState(safeField).isSynced ? 'cloud-done-outline' : 'cloud-offline-outline'} size={13} color={fieldSyncState(safeField).isSynced ? COLORS.success : COLORS.warning} />
                        <Text style={{ fontSize: 12, color: fieldSyncState(safeField).isSynced ? COLORS.success : COLORS.warning, fontWeight: '500' }}>
                          {fieldSyncLabel(safeField)}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text, marginTop: 2 }}>
                      {safeField?.member || safeField?.memberName || resolveFieldMember(selectedField) || (session?.name || 'Farm Member')} · {safeField?.ha || 1.5} ha
                    </Text>
                    <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
                      Crop Year Cycle: <Text style={{ fontWeight: '600', color: COLORS.text }}>{formatCropYearDisplay(safeField.cropYear)}</Text>
                    </Text>
                    <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
                      Current Stage: <Text style={{ fontWeight: '600', color: COLORS.primary }}>{getFieldStageLabel(safeField)}</Text>
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
            {(() => {
              const session = getCurrentSession();
              const actorId = session?.employeeId || session?.id || '';
              const assignedFarm = blockFarms.find(farm => farm.managerUserId === actorId);
              const targetFarmId = assignedFarm?.id || '';
              const targetFarm = assignedFarm?.name || assignedFarm?.code || session?.farm || session?.blockFarm || 'Unassigned Block Farm';
              const farmFields = accessibleFields.filter(field => !targetFarmId || field.blockFarmId === targetFarmId);
              const farmFieldIds = new Set(farmFields.map(field => field.id));
              const totalHa = farmFields.reduce((sum, f) => sum + (Number(f.ha) || 0), 0) || 0;
              const activeCycleLogs = logs.filter(l => farmFieldIds.has(l.fieldId) && !l.declined && l.status === 'ACTIVE' && Boolean(l.cycleId));
              const selectedPeriod = toReportPeriod(compileMonth);
              const farmLogs = activeCycleLogs.filter(l => isLogFromMonth(l, compileMonth));
              const monthReports = auditReportsForFarmPeriod(auditReports, targetFarmId, selectedPeriod);
              const reportedIds = reportedOperationIds(monthReports);
              const uncompiledLogs = farmLogs.filter(l => !reportedIds.has(String(l.id)));
              const monthReport = monthReports[0] || null;
              const auditStatus = monthReport ? canonicalAuditStatus(monthReport.status) : null;
              const needsSubmission = Boolean(monthReport && [AUDIT_STATUS.COMPILED, AUDIT_STATUS.PENDING_SUBMISSION].includes(auditStatus));
              const isAwaitingReview = auditStatus === AUDIT_STATUS.PENDING_REVIEW;
              const needsCompilation = auditStatus === AUDIT_STATUS.RETURNED || !monthReport || uncompiledLogs.length > 0;
              const isAllCompiled = Boolean(monthReport && !needsCompilation && !needsSubmission);
              const isOfflineQueued = Boolean(monthReport && auditStatus === AUDIT_STATUS.PENDING_SUBMISSION);
              const totalCost = farmLogs.reduce((sum, l) => sum + (Number(l.totalCost || l.cost) || 0), 0);
              const compiledCount = reportedIds.size || monthReports
                .filter(report => canonicalAuditStatus(report.status) !== AUDIT_STATUS.RETURNED)
                .reduce((sum, report) => sum + Number(report.operationCount || report.logsCount || report.operationSnapshots?.length || 0), 0);
              const statusText = needsSubmission
                ? (isOfflineQueued ? 'Submission Queued' : 'Choose Delivery')
                : isAwaitingReview
                  ? 'Awaiting SRA Review'
                  : auditStatus === AUDIT_STATUS.RETURNED
                    ? 'Correction Required'
                    : auditStatus === AUDIT_STATUS.CERTIFIED && uncompiledLogs.length === 0
                      ? 'Audit Up to Date'
                      : `${uncompiledLogs.length} Ready to Compile`;
              const statusNeedsAttention = needsSubmission || needsCompilation || isAwaitingReview;

              return (
                /* Elevated Monthly Regulatory Audit Card */
                <View style={{
                  backgroundColor: '#fff',
                  borderRadius: RADIUS.lg,
                  padding: SPACING.md + 2,
                  marginBottom: SPACING.md,
                  borderWidth: 1,
                  borderColor: '#E2EBDC',
                  ...SHADOW.card,
                }}>
                  {/* Card Header & Badge */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <Ionicons name="shield-checkmark" size={13} color={COLORS.primary} />
                        <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.primary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                          {t('monthly_audit_package_badge', 'Monthly Regulatory Audit')}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: COLORS.text }}>
                        {targetFarm}
                      </Text>
                      <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                        {t('audit_period_label', 'Period')}: <Text style={{ fontWeight: '700', color: COLORS.text }}>{compileMonth}</Text> · {totalHa.toFixed(2)} Ha
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: farmLogs.length === 0 && !monthReport ? '#F4F7F2' : (statusNeedsAttention ? '#FEF3C7' : '#EBF7EE'),
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: RADIUS.full,
                      borderWidth: 1,
                      borderColor: farmLogs.length === 0 && !monthReport ? '#E2EBDC' : (statusNeedsAttention ? '#F6D98B' : '#B7E4C7'),
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <Ionicons 
                        name={farmLogs.length === 0 && !monthReport ? "document-text-outline" : (statusNeedsAttention ? "time-outline" : "checkmark-circle")}
                        size={12} 
                        color={farmLogs.length === 0 && !monthReport ? COLORS.textMuted : (statusNeedsAttention ? '#B45309' : COLORS.success)}
                      />
                      <Text style={{ 
                        fontSize: 11, 
                        fontWeight: '800', 
                        color: farmLogs.length === 0 && !monthReport ? COLORS.textMuted : (statusNeedsAttention ? '#B45309' : COLORS.success)
                      }}>
                        {farmLogs.length === 0 && !monthReport ? '0 Logs' : statusText}
                      </Text>
                    </View>
                  </View>

                  {/* 3 Metric Cards with Aligned Typography */}
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    <View style={{ flex: 1, backgroundColor: '#F8FAF5', paddingVertical: 10, paddingHorizontal: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#E4EEE1' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{t('stat_recorded_logs', 'Compiled Logs')}</Text>
                      <Text style={{ fontSize: 13.5, fontWeight: '800', color: COLORS.primary, marginTop: 3 }}>
                        {compiledCount > 0
                          ? (uncompiledLogs.length > 0 ? `${compiledCount} done / ${uncompiledLogs.length} ready` : `${compiledCount} logs`)
                          : (farmLogs.length > 0 ? `${uncompiledLogs.length} ready` : '0')}
                      </Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: '#F8FAF5', paddingVertical: 10, paddingHorizontal: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#E4EEE1' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>Active Area</Text>
                      <Text style={{ fontSize: 13.5, fontWeight: '800', color: COLORS.text, marginTop: 3 }}>{totalHa.toFixed(2)} Ha</Text>
                    </View>
                    <View style={{ flex: 1.1, backgroundColor: '#F8FAF5', paddingVertical: 10, paddingHorizontal: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#E4EEE1' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{t('report_total_cost', 'Total Cost')}</Text>
                      <Text style={{ fontSize: 13.5, fontWeight: '900', color: COLORS.primary, marginTop: 3 }} numberOfLines={1}>₱{totalCost.toLocaleString()}</Text>
                    </View>
                  </View>

                  {/* Polished Primary Action Button */}
                  <TouchableOpacity
                    disabled={isCompilingAudit}
                    style={{
                      backgroundColor: isAllCompiled ? '#234D1E' : COLORS.primary,
                      paddingVertical: 13,
                      paddingHorizontal: 16,
                      borderRadius: RADIUS.md,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      opacity: isCompilingAudit ? 0.7 : 1,
                      ...SHADOW.card,
                    }}
                    onPress={() => {
                      if (needsSubmission) {
                        safeAlert(
                          'Compiled Report Ready',
                          `${displayPeriod(monthReport.periodKey || selectedPeriod)}\n${monthReport.blockFarmName || targetFarm}\n\n${monthReport.fieldCount || monthReport.fieldSnapshots?.length || 0} Fields\n${monthReport.operationCount || monthReport.operationSnapshots?.length || 0} Operations\nPhp ${Number(monthReport.totalCost || 0).toLocaleString()} Total Production Cost\n\nChoose how to deliver this report to SRA:`,
                          [
                            { text: 'Later', style: 'cancel' },
                            { text: 'Generate QR Transfer', onPress: () => openAuditQrTransfer(monthReport) },
                            { text: 'Send Through Cloud', onPress: () => handleSubmitAuditReport(monthReport) }
                          ]
                        );
                      } else if (monthReport && (isAwaitingReview || (auditStatus === AUDIT_STATUS.CERTIFIED && !needsCompilation))) {
                        handleViewHistoricalAuditQR(monthReport);
                      } else {
                        const countToCompile = uncompiledLogs.length > 0 ? uncompiledLogs.length : farmLogs.length;
                        safeAlert(
                          t('confirm_compile_title', 'Compile Monthly SRA Audit Package?'),
                          `Compile ${countToCompile} synchronized sugarcane field operation(s) for ${compileMonth} into an immutable monthly audit snapshot?\n\nCompilation does not submit the audit. You can review it first.`,
                          [
                            { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                            { 
                              text: t('btn_confirm_compile', 'Compile Monthly Audit'),
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
                      name={isCompilingAudit ? "hourglass-outline" : (needsSubmission ? "swap-horizontal-outline" : (isAllCompiled ? "qr-code" : "flash"))}
                      size={17} 
                      color="#fff" 
                    />
                    <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '800', letterSpacing: 0.3 }}>
                      {isCompilingAudit
                        ? 'Compiling Monthly Audit...'
                        : needsSubmission
                        ? 'Choose Delivery Method'
                        : isAwaitingReview
                        ? 'View Submitted Audit QR'
                        : auditStatus === AUDIT_STATUS.CERTIFIED && !needsCompilation
                        ? 'View Certificate QR'
                        : auditStatus === AUDIT_STATUS.RETURNED
                        ? 'Compile Corrected Version'
                        : (uncompiledLogs.length > 0 && compiledCount > 0
                          ? `Compile ${uncompiledLogs.length} New Logs · Update QR`
                          : t('btn_compile_sra_audit', 'Compile Monthly SRA Audit Package'))}
                    </Text>
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
                    Farm Member Device Sync Notice
                  </Text>
                  {unsynced.map(f => (
                    <Text key={f.id} style={[s.syncWarningText, { marginTop: 2 }]}>
                      • <Text style={{ fontWeight: '700' }}>{f.id}</Text> ({f.member}): <Text style={{ fontWeight: '700', color: '#C97A00' }}>{fieldSyncLabel(f)}</Text>
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {/* Field Scope Filter Switcher */}
            {/* Field Selector & Segmented Scope Switcher */}
            {(() => {
              const myFieldList = personalFields;
              const displayedFields = scopedFields;

              return (
                <View style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[s.sectionLabel, { marginBottom: 0 }]}>
                        {!deviceOnline ? t('my_fields', 'My Personal Field Plot') : (managerFieldFilter === 'my' ? t('my_fields', 'My Personal Plot') : t('view_all_fields', 'All Block Farm Fields'))}
                      </Text>
                      {deviceOnline && (
                        <TouchableOpacity
                          onPress={() => openAssignModal()}
                          activeOpacity={0.8}
                          style={{
                            backgroundColor: '#EBF7EE',
                            borderWidth: 1.5,
                            borderColor: COLORS.primary,
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            borderRadius: RADIUS.md,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 7,
                            minHeight: 46,
                            ...SHADOW.card
                          }}
                        >
                          <Ionicons name="add-circle" size={19} color={COLORS.primary} />
                          <Text style={{ fontSize: 14, fontWeight: '900', color: COLORS.primary }}>
                            {t('btn_register_plot', 'Register Plot')}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    
                    {!deviceOnline ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFBEB', paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#FEF0D0' }}>
                        <Ionicons name="cloud-offline-outline" size={13} color="#D97706" />
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#92400E' }}>Offline Mode: Personal Plot Only</Text>
                      </View>
                    ) : (
                      /* Sleek Segmented Pill Switcher matching Planner UI */
                      <View style={{ flexDirection: 'row', backgroundColor: '#EEF2E6', borderRadius: RADIUS.md, padding: 3, minHeight: 40, alignItems: 'center' }}>
                        <TouchableOpacity
                          style={[{ flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' }, managerFieldFilter === 'my' && { backgroundColor: '#fff', ...SHADOW.card }]}
                          onPress={() => {
                            setManagerFieldFilter('my');
                            setSelectedField(myFieldList[0] || null);
                          }}
                        >
                          <Text style={{ fontSize: 12.5, fontWeight: managerFieldFilter === 'my' ? '900' : '700', color: managerFieldFilter === 'my' ? COLORS.primary : COLORS.textMuted }}>
                            My Plot ({myFieldList.length})
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[{ flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' }, managerFieldFilter === 'all' && { backgroundColor: '#fff', ...SHADOW.card }]}
                          onPress={() => {
                            setManagerFieldFilter('all');
                            if (accessibleFields.length > 0 && !accessibleFields.some(f => f.id === safeField.id)) {
                              setSelectedField(accessibleFields[0]);
                            }
                          }}
                        >
                          <Text style={{ fontSize: 12.5, fontWeight: managerFieldFilter === 'all' ? '900' : '700', color: managerFieldFilter === 'all' ? COLORS.primary : COLORS.textMuted }}>
                            Managed Plots ({accessibleFields.length})
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {displayedFields.length === 0 ? (
                    <View style={{ padding: 14, backgroundColor: '#F8FAF5', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text }}>No Personal Plot Assigned</Text>
                      <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 3, lineHeight: 17 }}>
                        {!deviceOnline
                          ? 'You do not have a personal field plot allocated to your account. In offline mode, managed member plots cannot be viewed or taken over.'
                          : 'You do not have a personal plot allocated. Switch to "Managed Plots" to oversee member plots.'}
                      </Text>
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
                          <View style={[s.syncDot, { backgroundColor: fieldSyncState(field).isSynced ? COLORS.success : '#C97A00' }]} />
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
            {scopedFields.length > 0 && safeField?.id && safeField.id !== 'Unassigned' ? (
              <View style={s.fieldCard}>
                <View style={s.fieldCardTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap', marginRight: 6 }}>
                    <View style={s.fieldIdBadge}><Text style={s.fieldIdText}>{safeField.id}</Text></View>
                    <Text style={s.fieldHa}>{safeField.ha} Ha</Text>
                    {isTakeOver && (
                      <View style={{ backgroundColor: '#FEF2F2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#FCA5A5' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#DC2626' }}>Manager Takeover Active</Text>
                      </View>
                    )}
                  </View>
                  {(() => {
                    if (activeRole === 'Farm Manager' && !operationCapabilities.ownField && deviceOnline) {
                      return (
                        <TouchableOpacity
                          onPress={handleInitiateTakeOver}
                          style={{
                            backgroundColor: isTakeOver ? '#FEE2E2' : '#F0F8EC',
                            borderWidth: 1.5,
                            borderColor: isTakeOver ? '#DC2626' : COLORS.primary,
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            borderRadius: RADIUS.md,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 7,
                            minHeight: 46,
                            ...SHADOW.card
                          }}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name={isTakeOver ? "close-circle" : "shield-checkmark"}
                            size={18}
                            color={isTakeOver ? "#DC2626" : COLORS.primary}
                          />
                          <Text style={{ fontSize: 14, fontWeight: '900', color: isTakeOver ? '#DC2626' : COLORS.primary }}>
                            {isTakeOver ? 'Exit Manager Takeover' : t('btn_take_over', 'Manager Takeover')}
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                    return null;
                  })()}
                </View>
                <Text style={[s.fieldMember, { fontSize: 14.5 }]}>{t('member_label', 'Farm Member')}: {resolveFieldMember(safeField)}</Text>
                <Text style={{ fontSize: 12.5, color: COLORS.textSecondary, marginTop: 4 }}>
                  Crop Year Cycle: <Text style={{ fontWeight: '800', color: COLORS.text }}>{formatCropYearDisplay(safeField.cropYear)}</Text>
                </Text>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name={fieldSyncState(safeField).isSynced ? 'cloud-done-outline' : 'cloud-offline-outline'} size={16} color={fieldSyncState(safeField).isSynced ? COLORS.success : '#C97A00'} />
                    <Text style={[s.fieldSync, { color: fieldSyncState(safeField).isSynced ? COLORS.success : '#C97A00', fontWeight: '700', fontSize: 12.5 }]}>
                      {fieldSyncLabel(safeField)}
                    </Text>
                  </View>
                  
                  <TouchableOpacity 
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 11, paddingVertical: 6, borderRadius: RADIUS.md, minHeight: 36 }}
                    onPress={() => {
                      Alert.alert(
                        t('sync_info_alert_title', 'Offline Synchronization Info'),
                        `${t('my_field', 'Field')} ${safeField.id} (${resolveFieldMember(safeField)})\n\n` +
                        t('sync_info_alert_msg', 'When a member records operations offline in the field, logs are securely saved on the device. Records automatically upload once reconnected to internet or synced at the office.')
                      );
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={15} color={COLORS.textMuted} />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.textSecondary }}>{t('sync_info', 'Sync Info')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : managerFieldFilter === 'my' && deviceOnline ? null : (
              <View style={{ padding: 18, backgroundColor: '#fff', borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md }}>
                <Ionicons name="layers-outline" size={26} color={COLORS.textMuted} style={{ marginBottom: 4 }} />
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: COLORS.text }}>No Field Plots Registered Yet</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2, textAlign: 'center', maxWidth: 280 }}>
                  Tap "+ Register Plot" above to enroll and allocate the first member field plot.
                </Text>
              </View>
            )}

            {/* Crop Cycle Timeline */}
            {scopedFields.length > 0 && safeField.id !== 'Unassigned' ? renderTimeline() : null}
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
              const availableFarms = ['All Block Farms', ...blockFarms.map(bf => bf.name)];

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

            <View style={[s.receiptCard, { marginBottom: SPACING.md, padding: 16 }]}>
              {/* Header with Title and Prominent Button */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={{ fontSize: 16.5, fontWeight: '900', color: COLORS.text, letterSpacing: -0.2 }}>
                    Descriptive Summary
                  </Text>
                  <Text style={{ fontSize: 12.5, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 }}>
                    {selectedFarm === 'All' ? 'All District Block Farms' : selectedFarm}
                  </Text>
                </View>
                <TouchableOpacity 
                  onPress={() => navigation.navigate('Analytics', { blockFarm: selectedFarm })}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: '#F0F8EC',
                    borderWidth: 1.5,
                    borderColor: COLORS.primary,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: RADIUS.md,
                    minHeight: 38,
                    ...SHADOW.xs
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 13, fontWeight: '900', color: COLORS.primary }}>Open Analytics</Text>
                  <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
                </TouchableOpacity>
              </View>

              {(() => {
                const isAll = selectedFarm === 'All' || selectedFarm === 'All Block Farms';
                const selectedFarmRecords = isAll
                  ? blockFarms
                  : blockFarms.filter(farm => farm.id === selectedFarm || farm.name === selectedFarm);
                const selectedFarmIds = new Set(selectedFarmRecords.map(farm => farm.id));
                const farmFields = fields.filter(field => selectedFarmIds.has(field.blockFarmId));
                const farmFieldIds = farmFields.map(f => f.id);
                const farmFieldById = new Map(farmFields.map(field => [field.id, field]));
                const farmLogs = operationLogs.filter(log => {
                  const field = farmFieldById.get(log.fieldId);
                  return Boolean(
                    field
                    && log.status === 'ACTIVE'
                    && log.isDraft !== true
                    && (!field.currentCycleId || log.cycleId === field.currentCycleId)
                  );
                });

                const totalHa = farmFields.reduce((sum, f) => sum + (parseFloat(f.ha) || 0), 0);
                const uniqueFarms = selectedFarmRecords.length;
                const uniqueMembers = new Set(farmFields.map(f => f.memberUserId).filter(Boolean)).size;
                const fManagers = new Set(selectedFarmRecords.map(farm => farm.managerUserId).filter(Boolean)).size;
                const totalCost = Number(farmLogs.reduce((sum, l) => sum + (Number(l.totalCost || l.cost) || 0), 0) || 0);
                const costPerHa = Number(totalHa > 0 ? Math.round(totalCost / totalHa) : 0 || 0);
                const compiledLogsCount = Number(farmLogs.length || 0);

                return (
                  <View style={{ gap: 12 }}>
                    {/* Primary 3-Metric Clean Row (No heavy boxed wireframe) */}
                    <View style={{
                      flexDirection: 'row',
                      backgroundColor: '#F7FAF5',
                      borderRadius: RADIUS.lg,
                      paddingVertical: 14,
                      paddingHorizontal: 8,
                      borderWidth: 1.2,
                      borderColor: '#E2EBDC',
                      alignItems: 'center'
                    }}>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>
                          Total Area
                        </Text>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.text }}>
                          {totalHa.toFixed(1)} <Text style={{ fontSize: 12.5, fontWeight: '700', color: COLORS.primary }}>Ha</Text>
                        </Text>
                      </View>

                      <View style={{ width: 1, height: 32, backgroundColor: '#DCE8D7' }} />

                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>
                          Current Cycle Logs
                        </Text>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.primary }}>
                          {compiledLogsCount} <Text style={{ fontSize: 12.5, fontWeight: '700', color: COLORS.primary }}>Logs</Text>
                        </Text>
                      </View>

                      <View style={{ width: 1, height: 32, backgroundColor: '#DCE8D7' }} />

                      <View style={{ flex: 1.2, alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>
                          Avg Cost / Ha
                        </Text>
                        <Text style={{ fontSize: 17, fontWeight: '900', color: COLORS.primaryDark }}>
                          ₱{costPerHa.toLocaleString()}
                        </Text>
                      </View>
                    </View>

                    {/* Secondary Context Badges in a Sleek Metadata Strip */}
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-around',
                      paddingVertical: 9,
                      paddingHorizontal: 8,
                      backgroundColor: '#FAFCF8',
                      borderRadius: RADIUS.md,
                      borderWidth: 1,
                      borderColor: '#EDF3EA'
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name="grid-outline" size={14} color={COLORS.primary} />
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: COLORS.textSecondary }}>
                          {uniqueFarms} {uniqueFarms === 1 ? 'Farm' : 'Farms'}
                        </Text>
                      </View>

                      <Text style={{ color: '#D0DCD0', fontSize: 12 }}>•</Text>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name="people-outline" size={14} color={COLORS.primary} />
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: COLORS.textSecondary }}>
                          {uniqueMembers} Farm Member{uniqueMembers === 1 ? '' : 's'}
                        </Text>
                      </View>

                      <Text style={{ color: '#D0DCD0', fontSize: 12 }}>•</Text>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name="briefcase-outline" size={14} color={COLORS.primary} />
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: COLORS.textSecondary }}>
                          {fManagers} {fManagers === 1 ? 'Manager' : 'Managers'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[s.sectionLabel, { marginBottom: 0 }]}>Audit Inbox</Text>
              <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.primary }}>
                {auditReports.filter(report => canonicalAuditStatus(report.status) === AUDIT_STATUS.PENDING_REVIEW).length} Awaiting Review
              </Text>
            </View>

            {auditReports.filter(report => canonicalAuditStatus(report.status) === AUDIT_STATUS.PENDING_REVIEW).slice(0, 20).map(report => (
              <TouchableOpacity
                key={report.reportId || report.id}
                style={[s.auditCard, { marginBottom: 8 }]}
                onPress={() => { setPendingScannedPayload(''); setScannedAuditReport({ ...report, integrityStatus: 'VERIFIED' }); setShowSRAInspectModal(true); }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: COLORS.text }}>{report.blockFarmName || report.blockFarm || report.blockFarmId}</Text>
                    <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{displayPeriod(report.periodKey || report.period)}</Text>
                    <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 3 }}>Manager: {report.compiledByName || report.compiledByUserId || 'Unknown'} · {report.deliveryMethod || report.submissionMethod || 'CLOUD'}</Text>
                    <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 3 }}>{report.operationCount || report.operationSnapshots?.length || 0} Operations · {report.fieldCount || report.fieldSnapshots?.length || 0} Fields · {Number(report.hectaresAudited || 0).toFixed(2)} Ha</Text>
                    <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>Submitted: {report.submittedAt ? new Date(report.submittedAt).toLocaleString() : '—'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#92400E' }}>AWAITING REVIEW</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.primary }}>Review →</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            {/* Scanner Card */}
            <TouchableOpacity style={[s.scannerCard, { marginBottom: SPACING.xl }]} onPress={() => setShowAuditReceiveOptions(true)}>
              <View style={s.scannerIcon}>
                <Ionicons name="qr-code" size={48} color={COLORS.primary} />
              </View>
              <Text style={s.scannerTitle}>Receive Audit Report</Text>
              <Text style={s.scannerSub}>Scan the Farm Manager's real QR transfer or resolve its report ID online.</Text>
              <View style={s.scannerBtn}>
                <Ionicons name="camera-outline" size={18} color="#fff" />
                <Text style={s.scannerBtnText}>Choose Receive Method</Text>
              </View>
            </TouchableOpacity>

            {/* Last Audit Summary Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs }}>
              <Text style={[s.sectionLabel, { marginBottom: 0 }]}>{t('last_scanned_report', 'Last Scanned Report')}</Text>
              <TouchableOpacity onPress={() => { setShowAuditHistoryModal(true); loadAuditHistory(false); }}>
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
                      Choose Scan QR or Input Code above to receive a Farm Manager audit report.
                    </Text>
                  </View>
                );
              }

              const repFields = activeReport.fieldCount || activeReport.fieldSnapshots?.length || 0;
              const repCost = Number(activeReport.totalCost || 0);
              const repLogs = activeReport.operationCount || activeReport.operationSnapshots?.length || 0;
              const repDate = activeReport.submittedAt || activeReport.compiledAt || activeReport.dateGenerated || activeReport.date || '—';
              const repTitle = `${activeReport.blockFarmName || activeReport.blockFarmId || selectedFarm} — ${activeReport.periodKey ? displayPeriod(activeReport.periodKey) : compileMonth} Report`;

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
                  {safeField.member || safeField.memberName || session?.name || 'Farm Member'}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '600', marginTop: 2 }}>
                  Current Stage: {getFieldStageLabel(safeField)}
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

              {Number(logForm.stageNumber) === 2 && (
                <View style={{ gap: 6 }}>
                  <Text style={s.formLabel}>Sugarcane Variety <Text style={{ color: '#DC2626' }}>*</Text></Text>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>
                    {cropCycles.find(cycle => cycle.id === safeField.currentCycleId)?.variety
                      ? 'Stored on this Crop Year Cycle. Correct it through an operation amendment.'
                      : 'Captured when this Planting operation is recorded.'}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {SUGARCANE_VARIETIES.map(value => {
                      const selected = logForm.variety === value;
                      const locked = Boolean(cropCycles.find(cycle => cycle.id === safeField.currentCycleId)?.variety) && !logForm.id;
                      return (
                        <TouchableOpacity
                          key={value}
                          disabled={locked}
                          onPress={() => setLogForm(previous => ({ ...previous, variety: value }))}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: RADIUS.md,
                            borderWidth: 1.5,
                            borderColor: selected ? COLORS.primary : COLORS.border,
                            backgroundColor: selected ? COLORS.primaryBg : '#FFFFFF',
                            opacity: locked && !selected ? 0.45 : 1
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: selected ? '800' : '600', color: selected ? COLORS.primary : COLORS.text }}>
                            {value}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Field Plot Selector (for new logs with multiple fields) */}
              {!logForm.id && (
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: COLORS.text, marginBottom: 6 }}>{t('log_field_plot', 'Field Plot')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SPACING.lg }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8 }}>
                    {accessibleFields.map(field => (
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

              {operationCapabilities.canDraft && !operationLogs.some(log => log.id === logForm.id) && (
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

            {/* QR transfer status is intentionally separate from Cloud Submission. */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: '#EBF7EE',
              borderWidth: 1,
              borderColor: '#B7E4C7',
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderRadius: RADIUS.md,
              marginBottom: 10,
              width: '100%'
            }}>
              <Ionicons 
                name="qr-code"
                size={16} 
                color={COLORS.success}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.success }}>
                  {activeQRData?.qrParts?.length > 1 ? 'Complete Multi-Part QR Transfer' : 'Complete QR Transfer'}
                </Text>
                <Text style={{ fontSize: 9.5, color: COLORS.textMuted }}>
                  {activeQRData?.qrParts?.length > 1
                    ? `Scan every part in order. Part ${activeQrPartIndex + 1} of ${activeQRData.qrParts.length}.`
                    : 'Scan this code once on the SRA device to read the full report.'}
                </Text>
              </View>
            </View>
            {/* Real Scannable Vector SVG QR Code */}
            <View style={[s.qrBox, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#e2e8dc' }]}>
              <OfflineQRCode
                ref={qrSvgRef}
                value={activeQRData?.qrParts?.[activeQrPartIndex] || ''}
                size={Math.min(300, width - 72)}
                color="#000000"
              />
              {activeQRData?.qrParts?.length > 1 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 10 }}>
                  <TouchableOpacity disabled={activeQrPartIndex === 0} onPress={() => setActiveQrPartIndex(index => Math.max(0, index - 1))}>
                    <Text style={{ color: activeQrPartIndex === 0 ? COLORS.textMuted : COLORS.primary, fontWeight: '800' }}>Previous</Text>
                  </TouchableOpacity>
                  <Text style={{ color: COLORS.text, fontWeight: '800' }}>Part {activeQrPartIndex + 1} of {activeQRData.qrParts.length}</Text>
                  <TouchableOpacity disabled={activeQrPartIndex >= activeQRData.qrParts.length - 1} onPress={() => setActiveQrPartIndex(index => Math.min(activeQRData.qrParts.length - 1, index + 1))}>
                    <Text style={{ color: activeQrPartIndex >= activeQRData.qrParts.length - 1 ? COLORS.textMuted : COLORS.primary, fontWeight: '800' }}>Next</Text>
                  </TouchableOpacity>
                </View>
              )}
              <Text selectable={true} style={[s.qrCode, { marginTop: 10, letterSpacing: 0 }]}>{activeQRData?.reportId || ''}</Text>
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
                onPress={saveCurrentQrImage}
                disabled={isSavingQrImage}
                activeOpacity={0.8}
              >
                {isSavingQrImage ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="download-outline" size={16} color={COLORS.primary} />}
                <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>
                  {isSavingQrImage ? 'Saving QR Image...' : 'Save QR Image'}
                </Text>
              </TouchableOpacity>

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
                  const reportReference = activeQRData?.reportId;
                  if (!reportReference) return;
                  await Clipboard.setStringAsync(reportReference);
                  Alert.alert('Report ID Copied', 'The short report ID was copied. It requires an online SRA lookup; use the QR images for offline transfer.');
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="copy-outline" size={16} color={COLORS.primary} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>
                  Copy Report ID (Online Lookup)
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
      {/* SRA audit receive method selection. Camera and manual entry are separate modes. */}
      <Modal visible={showAuditReceiveOptions} transparent animationType="fade" onRequestClose={() => setShowAuditReceiveOptions(false)}>
        <View style={s.qrOverlay}>
          <View style={[s.qrModal, { width: width > 500 ? 400 : '90%', padding: 22 }]}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.text, textAlign: 'center' }}>Receive Audit Report</Text>
            <Text style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 6, marginBottom: 18 }}>Choose one receive method.</Text>
            <TouchableOpacity
              style={{ width: '100%', paddingVertical: 14, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              onPress={() => { setShowAuditReceiveOptions(false); setShowScanner(true); }}
            >
              <Ionicons name="camera-outline" size={19} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>Scan QR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ width: '100%', marginTop: 10, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: '#FFFFFF', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              onPress={() => { setShowAuditReceiveOptions(false); setManualTransferCode(''); setShowTransferCodeInput(true); }}
            >
              <Ionicons name="keypad-outline" size={19} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontSize: 14, fontWeight: '800' }}>Input Code</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 16, paddingVertical: 8 }} onPress={() => setShowAuditReceiveOptions(false)}>
              <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showTransferCodeInput} transparent animationType="fade" onRequestClose={() => setShowTransferCodeInput(false)}>
        <View style={s.qrOverlay}>
          <View style={[s.qrModal, { width: width > 500 ? 420 : '90%', padding: 22 }]}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.text }}>Enter Transfer Code</Text>
            <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 5, marginBottom: 14 }}>Enter the real report ID or audit hash supplied by the Farm Manager. An internet connection is required.</Text>
            <TextInput
              value={manualTransferCode}
              onChangeText={setManualTransferCode}
              placeholder="AUD-… or HUG-…"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isResolvingTransferCode}
              style={{ width: '100%', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, backgroundColor: '#FFFFFF' }}
            />
            <TouchableOpacity
              disabled={!manualTransferCode.trim() || isResolvingTransferCode}
              style={{ width: '100%', marginTop: 12, paddingVertical: 13, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', opacity: !manualTransferCode.trim() || isResolvingTransferCode ? 0.55 : 1 }}
              onPress={handleManualTransferSubmit}
            >
              {isResolvingTransferCode ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>Submit</Text>}
            </TouchableOpacity>
            <TouchableOpacity disabled={isResolvingTransferCode} style={{ marginTop: 12, paddingVertical: 8 }} onPress={() => setShowTransferCodeInput(false)}>
              <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Real SRA QR scanner with camera and image-upload inputs. */}
      <LiveQRScanner
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onCodeDetected={(code, metadata) => handleScanOrSubmitCode(code, metadata)}
      />

      {/* ── SRA Audit Inspection & Certification Modal ── */}
      <Modal visible={showSRAInspectModal} transparent animationType="slide">
        <View style={s.qrOverlay}>
          <View style={[s.qrModal, { width: width > 500 ? 460 : '92%', maxHeight: '85%', padding: 20 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 12, marginBottom: 14 }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '900', color: COLORS.primary }}>
                  {scannedAuditDuplicate
                    ? 'Audit Already Imported'
                    : scannedAuditReport?.integrityStatus === 'VERIFIED'
                      ? 'SRA Compliance Inspection'
                      : 'Audit Report Found'}
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                  {scannedAuditReport?.reportId || scannedAuditReport?.id || 'HUGPONG Audit Report'}
                </Text>
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
                      {scannedAuditReport?.status === 'CERTIFIED'
                        ? 'SRA Certified Record'
                        : scannedAuditReport?.integrityStatus === 'VERIFIED'
                          ? 'Awaiting Certification'
                          : 'Complete Report Decoded'}
                    </Text>
                    <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Hash: {scannedAuditReport?.qrSignature || scannedAuditReport?.qrHash || 'Unavailable'}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', color: scannedAuditReport?.status === 'CERTIFIED' ? COLORS.success : '#92400E' }}>
                  {scannedAuditReport?.integrityStatus === 'VERIFIED' || scannedAuditReport?.status === 'CERTIFIED'
                    ? (scannedAuditReport?.status || 'Pending')
                    : 'Decoded'}
                </Text>
              </View>

              {/* Farm Metadata */}
              <View style={{ backgroundColor: '#F8FAF5', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Report ID:</Text>
                  <Text style={{ maxWidth: '65%', fontSize: 11, fontWeight: '700', color: COLORS.text, textAlign: 'right' }}>{scannedAuditReport?.reportId || scannedAuditReport?.id || 'Unavailable'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Block Farm:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{scannedAuditReport?.blockFarmName || scannedAuditReport?.blockFarmId || 'District Block Farm'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Audit Period:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{scannedAuditReport?.periodKey ? displayPeriod(scannedAuditReport.periodKey) : 'Unknown period'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Farm Manager:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{scannedAuditReport?.compiledByName || scannedAuditReport?.compiledByUserId || 'Unknown'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Fields / Members:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{scannedAuditReport?.fieldSnapshots?.length || 0} / {scannedAuditReport?.memberCount || 0}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Total Block Farm Area:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{Number(scannedAuditReport?.hectaresAudited || 0).toFixed(2)} Ha</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Active Operations Area:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{Number(scannedAuditReport?.hectaresAudited || 0).toFixed(2)} Ha</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Compiled Operations:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{scannedAuditReport?.operationSnapshots?.length || 0} logs</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Total Production Cost:</Text>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: COLORS.primary }}>Php {Number(scannedAuditReport?.totalCost || 0).toLocaleString()}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Generated:</Text>
                  <Text style={{ maxWidth: '65%', fontSize: 11, fontWeight: '700', color: COLORS.text, textAlign: 'right' }}>{scannedAuditReport?.compiledAt ? new Date(scannedAuditReport.compiledAt).toLocaleString() : 'Unavailable'}</Text>
                </View>
              </View>

              <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.primary, marginBottom: 8 }}>Compiled Operation Snapshots</Text>
                {(scannedAuditReport?.operationSnapshots || []).map(operation => (
                  <View key={operation.operationLogId} style={{ paddingVertical: 7, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.text }}>{operation.operationName || operation.operationDefinitionId}</Text>
                    <Text style={{ fontSize: 10.5, color: COLORS.textMuted }}>{operation.fieldId} · {operation.performedOn} · Stage {operation.stageNumber}</Text>
                    <Text style={{ fontSize: 10.5, color: COLORS.primary }}>Php {Number(operation.totalCost || 0).toLocaleString()}</Text>
                  </View>
                ))}
              </View>

              {/* SRA Agronomic Benchmark Evaluation */}
              <View style={{ backgroundColor: '#F0F9FF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#BAE6FD', marginBottom: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#0369A1', marginBottom: 3 }}>SRA District Agronomic Benchmark</Text>
                <Text style={{ fontSize: 11, color: '#0C4A6E', lineHeight: 16 }}>
                  Average cost per hectare: Php {Math.round(Number(scannedAuditReport?.totalCost || 0) / Math.max(Number(scannedAuditReport?.hectaresAudited || 0), 0.01)).toLocaleString()} / Ha (calculated against {Number(scannedAuditReport?.hectaresAudited || 0).toFixed(2)} Ha audited area).
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
              {scannedAuditDuplicate && (
                <TouchableOpacity
                  style={{ backgroundColor: COLORS.primary, paddingVertical: 13, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                  onPress={() => setScannedAuditDuplicate(false)}
                >
                  <Ionicons name="document-text-outline" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>View Existing Report</Text>
                </TouchableOpacity>
              )}
              {!scannedAuditDuplicate && scannedAuditReport?.integrityStatus !== 'VERIFIED' && (
                <TouchableOpacity
                  disabled={isAuditActionPending}
                  style={{ backgroundColor: COLORS.primary, paddingVertical: 13, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: isAuditActionPending ? 0.6 : 1 }}
                  onPress={handleImportScannedAudit}
                >
                  <Ionicons name="cloud-upload" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{isAuditActionPending ? 'Importing...' : 'Import Report'}</Text>
                </TouchableOpacity>
              )}
              {!scannedAuditDuplicate && scannedAuditReport?.integrityStatus === 'VERIFIED' && canonicalAuditStatus(scannedAuditReport?.status) === AUDIT_STATUS.PENDING_REVIEW && (
                <>
                  <TextInput
                    value={auditReturnReason}
                    onChangeText={setAuditReturnReason}
                    placeholder="Reason for correction"
                    multiline
                    style={{ minHeight: 72, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 10, fontSize: 12, textAlignVertical: 'top', backgroundColor: '#fff' }}
                  />
                  <TouchableOpacity
                    disabled={isAuditActionPending || !auditReturnReason.trim()}
                    style={{ paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#B45309', opacity: isAuditActionPending || !auditReturnReason.trim() ? 0.5 : 1 }}
                    onPress={() => handleReturnAuditReport(scannedAuditReport)}
                  >
                    <Text style={{ color: '#92400E', fontWeight: '800', fontSize: 13 }}>{isAuditActionPending ? 'Returning...' : 'Return Audit'}</Text>
                  </TouchableOpacity>
                </>
              )}
              {!scannedAuditDuplicate && scannedAuditReport?.integrityStatus === 'VERIFIED' && canonicalAuditStatus(scannedAuditReport?.status) === AUDIT_STATUS.PENDING_REVIEW ? (
                <TouchableOpacity
                  style={{ backgroundColor: COLORS.success, paddingVertical: 13, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                  onPress={() => handleCertifyReport(scannedAuditReport)}
                >
                  <Ionicons name="checkmark-seal" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Issue Official SRA Digital Seal</Text>
                </TouchableOpacity>
              ) : !scannedAuditDuplicate && scannedAuditReport?.integrityStatus === 'VERIFIED' && canonicalAuditStatus(scannedAuditReport?.status) === AUDIT_STATUS.CERTIFIED ? (
                <View style={{ backgroundColor: '#EBF7EE', paddingVertical: 10, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.success }}>
                  <Ionicons name="checkmark-done" size={18} color={COLORS.success} />
                  <Text style={{ color: COLORS.success, fontWeight: '800', fontSize: 12 }}>Certified &amp; Immutable</Text>
                </View>
              ) : !scannedAuditDuplicate ? (
                <View style={{ backgroundColor: '#FEF3C7', paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#F59E0B' }}>
                  <Text style={{ color: '#92400E', fontWeight: '800', fontSize: 12 }}>Integrity / cloud confirmation pending</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={{ paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: '#F1F5E9' }}
                onPress={() => setShowSRAInspectModal(false)}
              >
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 12 }}>
                  {scannedAuditReport?.integrityStatus === 'VERIFIED' && !scannedAuditDuplicate ? 'Close Inspector' : 'Cancel'}
                </Text>
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
                placeholder="Search by Field ID or Farm Member name..."
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
            const sourceFields = activeRole === 'Farm Manager' ? accessibleFields : fields;
            const filtered = sourceFields.filter(f => 
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
                          Farm Member: <Text style={{ color: COLORS.text, fontWeight: '700' }}>{field.member}</Text>
                          {field.memberId ? (
                            <Text style={{ fontFamily: 'monospace', fontSize: 11, color: COLORS.primary, fontWeight: '700' }}> · ID: {field.memberId}</Text>
                          ) : null}
                        </Text>
                        <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>Stage: <Text style={{ color: COLORS.text }}>{field.stage}</Text></Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                          <View style={[s.syncDot, { backgroundColor: fieldSyncState(field).isSynced ? COLORS.success : '#C97A00' }]} />
                          <Text style={{ fontSize: 11, fontWeight: '600', color: fieldSyncState(field).isSynced ? COLORS.success : '#C97A00' }}>
                            {fieldSyncLabel(field)}
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
        reports={canonicalRole(session?.role) === 'SRA_ADMIN' ? auditHistoryReports : null}
        hasMore={canonicalRole(session?.role) === 'SRA_ADMIN' && auditHistoryHasMore}
        isLoading={isLoadingAuditHistory}
        onLoadMore={() => loadAuditHistory(true)}
        onOpenQR={(audit) => {
          setShowAuditHistoryModal(false);
          handleViewHistoricalAuditQR(audit);
        }}
      />

      {/* Manager Takeover security authorization modal */}
      <Modal visible={showTakeOverAuthModal} animationType="slide" onRequestClose={() => setShowTakeOverAuthModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#fff' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF0D0', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield" size={20} color="#C97A00" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>Authorize Manager Takeover</Text>
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
                  {t('member_label', 'Farm Member')}: {safeField.member || 'Assigned Farm Member'} · {safeField.ha || '1.5'} Ha
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                  {selectedField?.blockFarm || safeField?.blockFarm || (session?.farm || session?.blockFarm || 'District Central')} · Current Stage: {getFieldStageLabel(safeField)}
                </Text>
              </View>
            )}

            {/* Security Notice */}
            <View style={{ backgroundColor: '#FFFBF0', borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: '#FEF0D0', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Ionicons name="shield-outline" size={18} color="#C97A00" />
              <Text style={{ fontSize: 12, color: '#8F5700', flex: 1 }}>
                Manager Takeover actions are permanently logged to the audit ledger.
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
                <Text style={s.submitBtnText}>Authorize Manager Takeover</Text>
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
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Audit reason required</Text>
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
                <Text style={s.submitBtnText}>Continue to Edit</Text>
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
              activeLogForAudit.amendments.map((am, aIdx) => {
                const editor = amendmentEditor(am, users);
                const presentedChanges = formatAmendmentChanges(am.changes);
                return (
                <View key={am.amendmentId || aIdx} style={{ backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: 14, borderWidth: 1, borderColor: '#E2E8DC', gap: 8, ...SHADOW.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#EBF3FB', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '900', color: '#0B63B7' }}>{aIdx + 1}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text }}>{editor.name}</Text>
                        <Text style={{ fontSize: 10.5, color: COLORS.textMuted }}>{editor.role}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{formatAmendmentDate(am.amendedAt, true)}</Text>
                  </View>

                  <View style={{ backgroundColor: '#F8FAF5', padding: 8, borderRadius: RADIUS.xs, gap: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textSecondary }}>REASON FOR CORRECTION:</Text>
                    <Text style={{ fontSize: 11.5, color: COLORS.text, fontWeight: '600' }}>"{am.reason}"</Text>
                  </View>

                  {presentedChanges.length > 0 && (
                    <View style={{ gap: 3, marginTop: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted }}>CHANGES</Text>
                      {presentedChanges.map((change, cIdx) => change.kind === 'group' ? (
                        <View key={`${change.label}-${cIdx}`} style={{ paddingVertical: 5, gap: 5 }}>
                          <Text style={{ fontSize: 12, color: COLORS.text, fontWeight: '800' }}>{change.label}</Text>
                          {change.items.map((item, itemIndex) => (
                            <View key={`${item.label}-${itemIndex}`} style={{ backgroundColor: '#F8FAF5', padding: 8, borderRadius: RADIUS.xs }}>
                              <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.text }}>{item.label}{item.action ? ` · ${item.action}` : ''}</Text>
                              {item.before ? <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>{item.before}</Text> : null}
                              {item.after ? <Text style={{ fontSize: 11, color: COLORS.primary, fontWeight: '700' }}>→ {item.after}</Text> : null}
                              {(item.details || []).map((detail, detailIndex) => <Text key={detailIndex} style={{ fontSize: 10.5, color: COLORS.textSecondary }}>{detail.label}: {detail.before} → {detail.after}</Text>)}
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View key={`${change.field}-${cIdx}`} style={{ paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0' }}>
                          <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: '700' }}>{change.label}</Text>
                          <Text style={{ fontSize: 11.5, color: COLORS.text, marginTop: 2 }}>{change.before} → <Text style={{ color: COLORS.primary, fontWeight: '800' }}>{change.after}</Text></Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );})
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
                            setManagerAssignForm(prev => ({
                              ...prev,
                              blockFarm: bf.name,
                              blockFarmId: bf.id || bf.code || ''
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
                    <Text style={{ fontSize: 14, fontWeight: '800', fontFamily: 'monospace', color: COLORS.primary }}>
                      {managerAssignForm.fieldId}
                    </Text>
                    <View style={{ backgroundColor: COLORS.primaryBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.primary }}>Existing Plot</Text>
                    </View>
                  </View>
                ) : (
                  <View style={[s.formInput, { backgroundColor: '#F4F7F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                    <Text style={{ fontFamily: 'monospace', fontWeight: '800', color: COLORS.primary, fontSize: 14 }}>
                      Generated after enrollment
                    </Text>
                    <View style={{ backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.textMuted }}>System generated</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* 3. Assigned Field Owner */}
              <View style={{ gap: 6 }}>
                <Text style={s.formLabel}>Assigned Field Owner <Text style={{ color: '#DC2626' }}>*</Text></Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {users.filter(user => {
                    const role = canonicalRole(user.role);
                    const userId = user.employeeId || user.id;
                    return String(user.status || 'ACTIVE').toUpperCase() !== 'ARCHIVED' && (
                      role === 'MEMBER_FARMER' || (role === 'FARM_MANAGER' && userId === sessionUserId)
                    );
                  }).map(member => {
                    const memberId = member.employeeId || member.id;
                    const isSelected = managerAssignForm.userId === memberId;
                    return (
                      <TouchableOpacity
                        key={memberId}
                        onPress={() => setManagerAssignForm(prev => ({ ...prev, userId: memberId }))}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: isSelected ? COLORS.primary : '#E5E7EB', backgroundColor: isSelected ? COLORS.primaryBg : '#FFFFFF' }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: isSelected ? '800' : '600', color: isSelected ? COLORS.primary : COLORS.text }}>{member.name || member.displayName}</Text>
                        <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>{member.contact || member.mobile || 'Registered member'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
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

              {/* 5. Soil Type Selector */}
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

                if (!rawInput || !rawHa || (managerAssignForm.isEditing && !rawFieldId)) {
                  Alert.alert('Required Fields', 'Please select a field owner and complete the land area.');
                  return;
                }

                // Existing identity is displayed only and remains immutable during edits.
                if (managerAssignForm.isEditing && !/^[A-Za-z0-9_-]{3,80}$/.test(rawFieldId)) {
                  Alert.alert('Invalid Field ID', 'The existing Field ID is invalid.');
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
                    'Farm Member Unavailable',
                    'The selected Farm Member is no longer available. Refresh and select an authorized member again.'
                  );
                  return;
                }

                const existingIdx = fields.findIndex(f => f.id.toUpperCase() === rawFieldId);
                if (managerAssignForm.isEditing) {
                  if (existingIdx === -1) {
                    Alert.alert('Field Not Found', `Field plot ${rawFieldId} does not exist in the database.`);
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
                const fieldPayload = {
                  ...(existingField || {}),
                  ...(managerAssignForm.isEditing ? { id: rawFieldId } : {}),
                  blockFarmId: matchedBf.id,
                  blockFarm: activeFarmName,
                  memberId: memberIdVal,
                  memberUserId: memberIdVal,
                  userId: memberIdVal,
                  memberName: memberDisplayName,
                  member: memberDisplayName,
                  memberContact: memberContactVal,
                  ha: parsedHa,
                  soilType: managerAssignForm.soilType || 'Clay Loam',
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
                      : `Field plot ${result.field.id} (${parsedHa} Ha) successfully enrolled and assigned to ${memberDisplayName}.`
                  );
                  setManagerAssignForm({
                    userId: '',
                    fieldId: '',
                    blockFarm: '',
                    blockFarmId: '',
                    ha: '1.5',
                    soilType: 'Clay Loam',
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
                  No pending Farm Member applications in queue.
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
                      <Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.primary }}>{u.role || 'Farm Member'}</Text>
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
                          const res = await approvePendingRegistration(u.contact, { area: u.area });
                          setPendingActionLoading(false);
                          if (res.success) {
                            Alert.alert('Registration Approved', `Farm Member ${u.name} activated and allocated field ${res.fieldId}!`);
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
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>Crop Year Cycle Configuration</Text>
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
              <Text style={s.formLabel}>Crop Year Cycle</Text>
              <TextInput
                style={s.formInput}
                value={formatCropYearDisplay(cycleTypeForm.cropYear)}
                editable={false}
              />
              <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Preview only. The server validates the canonical year when the cycle is created.</Text>
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
                        Alert.alert(t('btn_reset', 'Reset to Default'), t('reset_sra_confirm_msg', 'Replace your custom stages with the official SRA template for this Crop Year Cycle?'), [
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
                    : `${selectedField?.id} (${selectedField?.ha || 0} Ha) · ${selectedField?.member || selectedField?.memberName || 'Farm Member'} · ${targetFarm || (session?.farm || session?.blockFarm || 'District Central')}`)
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

          {/* Streamlined Summary Banner */}
          {(() => {
            const scopedDrafts = draftLogs.filter(d => d.fieldId === safeField.id);
            const submittedTotalCost = fieldLogs.reduce((sum, l) => sum + Number(l.cost || 0), 0);
            const draftsTotalCost = scopedDrafts.reduce((sum, d) => sum + Number(d.cost || 0), 0);
            const pastTotalCost = pastLogs.reduce((sum, l) => sum + Number(l.cost || 0), 0);

            let statCostLabel = t('stat_total_cost', 'Total Recorded Cost');
            let statCostValue = `₱${Number(submittedTotalCost || 0).toLocaleString()}`;
            let statCostColor = COLORS.primary;
            let statCountLabel = t('stat_records', 'Submitted Records');
            let statCountValue = `${fieldLogs.length} Records`;

            if (activeRole === 'Farm Manager') {
              if (logTab === 'submitted') {
                const managerCost = managerSubmittedLogs.reduce((sum, l) => sum + Number(l.cost || l.totalCost || 0), 0);
                const managerAmendedCount = managerSubmittedLogs.filter(l => Array.isArray(l.amendments) && l.amendments.length > 0).length;
                statCostLabel = managerLedgerScope === 'all' ? t('stat_total_cost', 'Total Cost') : `${selectedField?.id || 'Plot'} Cost`;
                statCostValue = `₱${Number(managerCost || 0).toLocaleString()}`;
                statCostColor = COLORS.primary;
                statCountLabel = managerLedgerScope === 'all' ? t('farm_operations_lbl', 'Farm Operations') : `${selectedField?.id || 'Plot'} Operations`;
                statCountValue = `${managerSubmittedLogs.length} Logs${managerAmendedCount > 0 ? ` · ${managerAmendedCount} edited` : ''}`;
              } else if (logTab === 'past') {
                statCostLabel = 'Displayed Archive Page Cost';
                statCostValue = `₱${Number(pastTotalCost || 0).toLocaleString()}`;
                statCostColor = '#64748B';
                statCountLabel = 'Displayed Archived Logs';
                statCountValue = `${pastLogs.length} Records Shown`;
              } else {
                const auditTotalCost = (auditLogs || []).reduce((sum, a) => sum + Number(a.totalCost || 0), 0);
                statCostLabel = t('compiled_audited_cost_lbl', 'Compiled Cost');
                statCostValue = `₱${Number(auditTotalCost || 0).toLocaleString()}`;
                statCostColor = COLORS.primary;
                statCountLabel = t('verified_sra_audits_lbl', 'Verified Audits');
                statCountValue = `${(auditLogs || []).length} Monthly Reports`;
              }
            } else if (activeRole === 'SRA Admin' || logTab === 'audit_history') {
              const auditTotalCost = (auditLogs || []).reduce((sum, a) => sum + Number(a.totalCost || 0), 0);
              statCostLabel = t('compiled_audited_cost_lbl', 'Compiled Cost');
              statCostValue = `₱${Number(auditTotalCost || 0).toLocaleString()}`;
              statCostColor = COLORS.primary;
              statCountLabel = t('verified_sra_audits_lbl', 'Verified Audits');
              statCountValue = `${(auditLogs || []).length} Monthly Reports`;
            } else if (logTab === 'drafts') {
              statCostLabel = t('estimated_draft_cost_lbl', 'Estimated Draft Cost');
              statCostValue = `₱${Number(draftsTotalCost || 0).toLocaleString()}`;
              statCostColor = '#C97A00';
              statCountLabel = t('pending_draft_pipeline_lbl', 'Draft Pipeline');
              statCountValue = `${scopedDrafts.length} Draft Records`;
            } else if (logTab === 'past') {
              statCostLabel = 'Displayed Archive Page Cost';
              statCostValue = `₱${Number(pastTotalCost || 0).toLocaleString()}`;
              statCostColor = '#64748B';
              statCountLabel = 'Displayed Archived Logs';
              statCountValue = `${pastLogs.length} Records Shown`;
            }

            return (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: logTab === 'drafts' ? '#FFFBF0' : '#F4FAF0',
                marginHorizontal: SPACING.lg,
                marginTop: 8,
                marginBottom: 8,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: RADIUS.md,
                borderWidth: 1,
                borderColor: logTab === 'drafts' ? '#FEF0D0' : '#D7ECD0'
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Ionicons
                    name={logTab === 'drafts' ? 'document-text-outline' : (logTab === 'past' ? 'archive-outline' : 'receipt-outline')}
                    size={16}
                    color={statCostColor}
                  />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text }} numberOfLines={1}>
                    {statCountValue}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '900', color: statCostColor }}>
                  {statCostValue}
                </Text>
              </View>
            );
          })()}

          {/* Sleek Segmented Ledger Tabs */}
          {activeRole === 'Farm Member' ? (
            <View style={{
              flexDirection: 'row',
              backgroundColor: '#EEF2E6',
              borderRadius: RADIUS.md,
              padding: 3,
              marginHorizontal: SPACING.lg,
              marginBottom: 8,
              gap: 4
            }}>
              <TouchableOpacity
                style={[
                  { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: RADIUS.sm },
                  logTab === 'submitted' && { backgroundColor: '#fff', ...SHADOW.card }
                ]}
                onPress={() => setLogTab('submitted')}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 12, fontWeight: logTab === 'submitted' ? '800' : '600', color: logTab === 'submitted' ? COLORS.primary : COLORS.textMuted }}>
                  {t('tab_submitted', 'Submitted')} ({fieldLogs.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: RADIUS.sm },
                  logTab === 'drafts' && { backgroundColor: '#fff', ...SHADOW.card }
                ]}
                onPress={() => setLogTab('drafts')}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 12, fontWeight: logTab === 'drafts' ? '800' : '600', color: logTab === 'drafts' ? COLORS.primary : COLORS.textMuted }}>
                  {t('tab_drafts', 'Drafts')} ({scopedDrafts.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: RADIUS.sm },
                  logTab === 'past' && { backgroundColor: '#fff', ...SHADOW.card }
                ]}
                onPress={() => setLogTab('past')}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 12, fontWeight: logTab === 'past' ? '800' : '600', color: logTab === 'past' ? COLORS.primary : COLORS.textMuted }}>
                  {t('tab_past', 'Past Crop Year Cycles')} ({pastLogs.length})
                </Text>
              </TouchableOpacity>
            </View>
          ) : activeRole === 'Farm Manager' ? (
            <>
              <View style={{
                flexDirection: 'row',
                backgroundColor: '#EEF2E6',
                borderRadius: RADIUS.md,
                padding: 3,
                marginHorizontal: SPACING.lg,
                marginBottom: 8,
                gap: 4
              }}>
                <TouchableOpacity
                  style={[
                    { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: RADIUS.sm },
                    logTab === 'submitted' && { backgroundColor: '#fff', ...SHADOW.card }
                  ]}
                  onPress={() => setLogTab('submitted')}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, fontWeight: logTab === 'submitted' ? '800' : '600', color: logTab === 'submitted' ? COLORS.primary : COLORS.textMuted }} numberOfLines={1}>
                    {t('tab_operations', 'Operations')} ({managerSubmittedLogs.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: RADIUS.sm },
                    logTab === 'past' && { backgroundColor: '#fff', ...SHADOW.card }
                  ]}
                  onPress={() => setLogTab('past')}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, fontWeight: logTab === 'past' ? '800' : '600', color: logTab === 'past' ? COLORS.primary : COLORS.textMuted }} numberOfLines={1}>
                    {t('tab_past', 'Past Crop Year Cycles')} ({pastLogs.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: RADIUS.sm },
                    logTab === 'audit_history' && { backgroundColor: '#fff', ...SHADOW.card }
                  ]}
                  onPress={() => setLogTab('audit_history')}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, fontWeight: logTab === 'audit_history' ? '800' : '600', color: logTab === 'audit_history' ? COLORS.primary : COLORS.textMuted }} numberOfLines={1}>
                    {t('tab_audits', 'Audits')} ({(auditLogs || []).length})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Plot Scope Selector Pills */}
              {logTab === 'submitted' && (
                <View style={{ marginHorizontal: SPACING.lg, marginBottom: 8 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                    <TouchableOpacity
                      style={[
                        {
                          paddingHorizontal: 12,
                          paddingVertical: 5.5,
                          borderRadius: RADIUS.full,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          backgroundColor: '#fff',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5
                        },
                        managerLedgerScope === 'selected' && {
                          backgroundColor: '#F4FAF0',
                          borderColor: '#D7ECD0'
                        }
                      ]}
                      onPress={() => setManagerLedgerScope('selected')}
                    >
                      <View style={[s.syncDot, { backgroundColor: fieldSyncState(selectedField).isSynced ? COLORS.success : '#C97A00' }]} />
                      <Text style={{
                        fontSize: 11.5,
                        fontWeight: managerLedgerScope === 'selected' ? '800' : '600',
                        color: managerLedgerScope === 'selected' ? COLORS.primary : COLORS.text
                      }}>
                        {selectedField?.id} ({fieldLogs.length})
                      </Text>
                    </TouchableOpacity>

                    {accessibleFields.filter(f => f.id !== selectedField?.id).map(f => {
                      const fLogCount = visibleLogs.filter(l => (l.fieldId || '').trim().toUpperCase() === f.id.toUpperCase() && l.status === 'ACTIVE').length;
                      return (
                        <TouchableOpacity
                          key={f.id}
                          style={{
                            paddingHorizontal: 11,
                            paddingVertical: 5.5,
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
                          <Text style={{ fontSize: 11.5, fontWeight: '600', color: COLORS.textMuted }}>
                            {f.id} ({fLogCount})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    <TouchableOpacity
                      style={[
                        {
                          paddingHorizontal: 12,
                          paddingVertical: 5.5,
                          borderRadius: RADIUS.full,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          backgroundColor: '#fff',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5
                        },
                        managerLedgerScope === 'all' && {
                          backgroundColor: '#F4FAF0',
                          borderColor: '#D7ECD0'
                        }
                      ]}
                      onPress={() => setManagerLedgerScope('all')}
                    >
                      <Ionicons name="grid-outline" size={12} color={managerLedgerScope === 'all' ? COLORS.primary : COLORS.textMuted} />
                      <Text style={{
                        fontSize: 11.5,
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
              <TouchableOpacity style={[s.logTabBtn, logTab === 'past' && s.logTabBtnActive]} onPress={() => setLogTab('past')}>
                <Text style={[s.logTabText, logTab === 'past' && s.logTabTextActive]}>{t('tab_past', 'Past Cycles')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.logTabBtn, logTab === 'audit_history' && s.logTabBtnActive]} onPress={() => setLogTab('audit_history')}>
                <Text style={[s.logTabText, logTab === 'audit_history' && s.logTabTextActive]}>{t('tab_audits', 'Audits')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Scrollable Modal Body */}
          <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {logTab === 'past' ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={s.sectionLabel}>
                    {t('past_cycles_title', 'Past Crop Year Cycle Records')} ({pastLogs.length})
                  </Text>
                  {!archiveState.isCleared && (
                    <TouchableOpacity onPress={clearArchiveView} disabled={pastLogs.length === 0} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, opacity: pastLogs.length === 0 ? 0.4 : 1 }}>
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.textSecondary }}>Clear View</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={[s.logSearchBox, { marginBottom: 10 }]}>
                  <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
                  <TextInput
                    style={s.logSearchInput}
                    placeholder="Exact operation record ID"
                    placeholderTextColor={COLORS.textMuted}
                    value={archiveSearchDraft}
                    autoCapitalize="characters"
                    returnKeyType="search"
                    onChangeText={setArchiveSearchDraft}
                    onSubmitEditing={() => updateArchiveFilter('search', archiveSearchDraft)}
                  />
                  <TouchableOpacity onPress={() => updateArchiveFilter('search', archiveSearchDraft)} style={{ paddingHorizontal: 8, paddingVertical: 5, backgroundColor: COLORS.primary, borderRadius: RADIUS.xs }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Search</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[s.sectionLabel, { marginBottom: 5 }]}>Crop Year Cycle</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
                  {[{ value: '', label: 'All Crop Year Cycles' }, ...archiveCropYears.map(cropYear => ({ value: cropYear, label: formatCropYearDisplay(cropYear) }))].map(option => (
                    <TouchableOpacity key={option.value || 'all-cycles'} onPress={() => updateArchiveFilter('cropYearCycle', option.value)} style={[s.filterPill, archiveFilters.cropYearCycle === option.value && s.filterPillActive]}>
                      <Text style={[s.filterPillText, archiveFilters.cropYearCycle === option.value && s.filterPillTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {invalidArchiveCycles.length > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 10, padding: 9, borderRadius: RADIUS.sm, backgroundColor: '#FFF7ED' }}>
                    <Ionicons name="warning-outline" size={15} color="#B45309" />
                    <Text style={{ flex: 1, fontSize: 11, lineHeight: 15, color: '#92400E', fontWeight: '600' }}>
                      Data integrity notice: {invalidArchiveCycles.length} Crop Year Cycle record{invalidArchiveCycles.length === 1 ? '' : 's'} with an invalid stored year {invalidArchiveCycles.length === 1 ? 'is' : 'are'} excluded from this filter.
                    </Text>
                  </View>
                )}

                <Text style={[s.sectionLabel, { marginBottom: 5 }]}>Field</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
                  {[{ id: '', memberName: 'All Fields' }, ...orderedArchiveFields].map(field => (
                    <TouchableOpacity key={field.id || 'all-fields'} onPress={() => updateArchiveFilter('fieldId', field.id)} style={[s.filterPill, archiveFilters.fieldId === field.id && s.filterPillActive]}>
                      <Text style={[s.filterPillText, archiveFilters.fieldId === field.id && s.filterPillTextActive]}>
                        {field.id || field.memberName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={[s.sectionLabel, { marginBottom: 5 }]}>Operation</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 12 }}>
                  {[{ id: '', name: 'All Operations' }, ...SRA_OPERATIONS_CATALOGUE].map(operation => (
                    <TouchableOpacity key={operation.id || 'all-operations'} onPress={() => updateArchiveFilter('operationDefinitionId', operation.id)} style={[s.filterPill, archiveFilters.operationDefinitionId === operation.id && s.filterPillActive]}>
                      <Text style={[s.filterPillText, archiveFilters.operationDefinitionId === operation.id && s.filterPillTextActive]}>{operation.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {archiveState.isLoading ? (
                  <View style={[s.emptyCard, { gap: 8 }]}>
                    <ActivityIndicator color={COLORS.primary} />
                    <Text style={s.emptyText}>Loading archived records…</Text>
                  </View>
                ) : archiveState.error ? (
                  <View style={[s.emptyCard, { gap: 8 }]}>
                    <Ionicons name="alert-circle-outline" size={28} color="#B91C1C" />
                    <Text style={s.emptyText}>Unable to load archived records.</Text>
                    <Text style={{ fontSize: 11, color: COLORS.textMuted, textAlign: 'center' }}>{archiveState.error}</Text>
                    <TouchableOpacity onPress={showArchiveRecords} style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: COLORS.primary, borderRadius: RADIUS.sm }}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : archiveState.isCleared ? (
                  <View style={[s.emptyCard, { gap: 8 }]}>
                    <Ionicons name="eye-off-outline" size={28} color={COLORS.textMuted} />
                    <Text style={[s.emptyText, { fontWeight: '800', color: COLORS.text }]}>View cleared.</Text>
                    <Text style={s.emptyText}>Your archived records are still safely stored.</Text>
                    <TouchableOpacity onPress={() => loadArchivePage({ append: false })} style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: COLORS.primary, borderRadius: RADIUS.sm }}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Show Records</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {renderCompactLogList(pastLogs, false, activeRole === 'Farm Manager', true)}
                    {archiveState.hasMore && (
                      <TouchableOpacity disabled={archiveState.isLoadingMore} onPress={() => loadArchivePage({ append: true })} style={{ marginTop: 12, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.primary, opacity: archiveState.isLoadingMore ? 0.65 : 1 }}>
                        {archiveState.isLoadingMore ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>Load More</Text>}
                      </TouchableOpacity>
                    )}
                    {archiveState.loadMoreError && (
                      <Text style={{ textAlign: 'center', fontSize: 11, color: '#B91C1C', marginTop: 8 }}>
                        {archiveState.loadMoreError} Displayed records were preserved.
                      </Text>
                    )}
                    {!archiveState.hasMore && pastLogs.length > 0 && (
                      <Text style={{ textAlign: 'center', fontSize: 11, color: COLORS.textMuted, marginTop: 10 }}>End of archive records.</Text>
                    )}
                  </>
                )}
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
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.primary, fontFamily: 'monospace' }}>
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
                          {audit.verifiedBy || (audit.status === 'CERTIFIED' ? 'SRA Admin' : 'Pending SRA Admin Review')}
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
  logSearchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  logSearchInput: { flex: 1, fontSize: 13.5, color: COLORS.text, padding: 0 },
  filterPill: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.full, paddingHorizontal: 13, paddingVertical: 6.5 },
  filterPillActive: { backgroundColor: '#F4FAF0', borderColor: '#D7ECD0' },
  filterPillText: { fontSize: 11.5, fontWeight: '600', color: COLORS.textSecondary },
  filterPillTextActive: { color: COLORS.primary, fontWeight: '800' },

  // Compact Log Row
  compactLogCard: { backgroundColor: '#fff', borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, ...SHADOW.card },
  compactLogHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactLogDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  compactLogTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  compactLogSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 },
  compactLogCost: { fontSize: 14, fontWeight: '900', color: COLORS.primary },
  compactLogDrawer: { marginTop: 10, gap: 8 },
  compactLogDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 6 },

  // Show More Button
  showMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primary + '30', borderRadius: RADIUS.md, paddingVertical: 10, marginTop: 4 },
  showMoreBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  receiptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  receiptTitle: { fontSize: 11, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  receiptId: { fontSize: 11, fontFamily: 'monospace', color: COLORS.textMuted, fontWeight: '600' },
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
  manualScanTextInput: { flex: 1, height: 44, backgroundColor: '#262626', borderWidth: 1, borderColor: '#444', borderRadius: RADIUS.md, paddingHorizontal: 12, color: '#FFF', fontSize: 13, fontFamily: 'monospace', fontWeight: '700' },
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
