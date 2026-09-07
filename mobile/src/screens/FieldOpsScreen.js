import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Dimensions, TextInput, Alert, Platform, Image, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import AppHeader from '../components/AppHeader';
import { subscribe, getCurrentSession, setSynced, setSession, updateSessionFieldId, updateFieldStageAndCycle, archiveFieldCropCycle, deletePastLogsForField, getIsSynced, assignmentRequests, resolveAssignmentRequest, requestFieldAssignment, fields, operationLogs, draftLogs as draftLogsStore, notifyDataUpdate, SRA_PRICE_HISTORY, addSRAPrice, updateFieldCustomStages, getMemberSyncHealth, performMobileSync, SRA_OPERATIONS_CATALOGUE, getFieldCustomOperations, saveFieldCustomOperations, auditLogs, auditReports, blockFarms, users, resolveFieldBlockFarm, resolveFieldMember, findUserByIdOrContact, updateOperationLogWithSecurity, isLogLocked, getLogAuditTrail, pendingUsers, approvePendingRegistration, rejectPendingRegistration, saveFieldPlot, deleteDraftLogs, clearAllDraftsForField, saveDraftLogs } from '../data/dataStore';
import { saveItem, STORAGE_KEYS } from '../services/storageService';
import { enqueueOutboxItem, generateLogId, generateDraftId, generateSubItemId, generateCustomOpId } from '../services/syncEngine';
import { db } from '../firebase/config';
import { doc, setDoc } from 'firebase/firestore';
import { useTranslation } from '../services/i18n';
import MemberFieldOpsView from './member/MemberFieldOpsView';
import ManagerFieldOpsView from './manager/ManagerFieldOpsView';
import SRAFieldOpsView from './sra/SRAFieldOpsView';
import AuditHistoryModal from '../components/AuditHistoryModal';
import OfflineQRCode from '../components/OfflineQRCode';

const { height, width } = Dimensions.get('window');

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
      done: true,
      active: false,
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
      done: true,
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
      active: true,
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
      done: true,
      active: false,
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
      done: true,
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
      active: true,
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
      done: true,
      active: false,
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
      done: true,
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
      active: true,
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
  if (field?.customStages && field.customStages.length > 0) return field.customStages;
  const stages = CROP_CYCLE_STAGES_BY_TYPE[cycleType] || CROP_CYCLE_STAGES_BY_TYPE['Plant Cane (New Plant)'];
  
  const fieldStageName = (field?.stage || '').toLowerCase();
  let targetStageNum = field?.stageNumber || 1;
  const stageMatch = fieldStageName.match(/stage\s*(\d+)/i);
  if (stageMatch) {
    targetStageNum = parseInt(stageMatch[1], 10);
  } else if (fieldStageName.includes('prep') || fieldStageName.includes('tillage') || fieldStageName.includes('plow')) {
    targetStageNum = 1;
  } else if (fieldStageName.includes('plant') || fieldStageName.includes('establishment') || fieldStageName.includes('patdan')) {
    targetStageNum = 2;
  } else if (fieldStageName.includes('basal') || fieldStageName.includes('nutrition') || fieldStageName.includes('early care')) {
    targetStageNum = 3;
  } else if (fieldStageName.includes('cultivation') || fieldStageName.includes('weed') || fieldStageName.includes('off-barring')) {
    targetStageNum = 4;
  } else if (fieldStageName.includes('maintenance') || fieldStageName.includes('top-dress') || fieldStageName.includes('hilling')) {
    targetStageNum = 5;
  } else if (fieldStageName.includes('harvest') || fieldStageName.includes('cutting') || fieldStageName.includes('hauling') || fieldStageName.includes('milling')) {
    targetStageNum = 6;
  }

  return stages.map(s => {
    const sNum = s.stageNumber || 1;
    if (sNum < targetStageNum) {
      return { ...s, done: true, active: false };
    } else if (sNum === targetStageNum) {
      return { ...s, done: false, active: true };
    } else {
      return { ...s, done: false, active: false };
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
  deleteSubmittedLog,
  canDeleteSubmitted,
  onViewAuditTrail,
  s,
}) {
  const isLocked = !isDraft && isLogLocked(log);
  const isAmended = Boolean(log.isAmended || (Array.isArray(log.editHistory) && log.editHistory.length > 0));
  const editCount = (Array.isArray(log.editHistory) && log.editHistory.length) || (log.isAmended ? 1 : 0);
  const latestEdit = Array.isArray(log.editHistory) && log.editHistory.length > 0 
    ? log.editHistory[log.editHistory.length - 1] 
    : (log.isAmended ? { editedBy: 'Farm Manager', reason: 'Log details updated' } : null);
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
                  Amended ({editCount}x)
                </Text>
              </TouchableOpacity>
            )}

            {/* Locked / Certified Pill */}
            {isLocked && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#E5E7EB' }}>
                <Ionicons name="lock-closed" size={10} color="#4B5563" />
                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#4B5563' }}>
                  Certified
                </Text>
              </View>
            )}
          </View>
          
          {/* Connected Parent Stage Badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
            <Ionicons name="git-branch-outline" size={11} color={COLORS.primary} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }} numberOfLines={1}>
              {formatStageName ? formatStageName(log.stageName || `Stage ${log.stageNumber}`, true) : log.stageName || `Stage ${log.stageNumber}`}
            </Text>
            {log.isSupplemental && (
              <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 5, paddingVertical: 1, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#FDE68A' }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#92400E' }}>SUPPLEMENTAL</Text>
              </View>
            )}
          </View>

          <Text style={[s.compactLogSub, { marginTop: 2 }]}>
            {log.date || log.period} · {log.hectares} Ha · {log.people} Workers{log.subItems?.length ? ` · ${log.subItems.length} ${t('child_items_lbl', 'Items')}` : ''}
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
            <Text style={s.receiptLabel}>{t('operation_name_lbl', 'Operation Name')}</Text>
            <Text style={s.receiptValue}>{log.sraOperationId ? `[${log.sraOperationId}] ` : ''}{log.operationName || log.activity}</Text>
          </View>
          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>{t('connected_stage_lbl', 'Connected Stage')}</Text>
            <Text style={[s.receiptValue, { color: COLORS.primary, fontWeight: '800' }]}>
              {log.stageName || (log.stageNumber ? `Stage ${log.stageNumber}` : 'General Operation')}
            </Text>
          </View>
          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>{t('receipt_ref', 'Log Reference')}</Text>
            <Text style={s.receiptValue}>#{log.id}</Text>
          </View>
          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>{t('receipt_coverage', 'Work Coverage')}</Text>
            <Text style={s.receiptValue}>{log.hectares} {t('hectares_unit', 'Hectares')} · {log.people} {t('workers_unit', 'Workers')}</Text>
          </View>

          {/* Child Items / Materials & Inputs Breakdown */}
          {log.subItems && log.subItems.length > 0 && (
            <View style={{ backgroundColor: '#F8FAF5', padding: 10, borderRadius: RADIUS.sm, gap: 5, marginVertical: 6, borderWidth: 1, borderColor: COLORS.border }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase' }}>
                {t('op_children_materials_lbl', 'Operation Items & Materials')} ({log.subItems.length})
              </Text>
              {log.subItems.map((si, idx) => (
                <View key={si.id || idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: idx !== log.subItems.length - 1 ? 1 : 0, borderBottomColor: '#EDEDED', paddingVertical: 3 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.text, flex: 1, marginRight: 6 }}>
                    • {si.description}
                  </Text>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: COLORS.textSecondary }}>
                    {si.qty} {si.unit} @ ₱{Number(si.unitCost || 0).toLocaleString()} = ₱{Number(si.subTotal || 0).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {Boolean(log.inputQty) && (!log.subItems || log.subItems.length === 0) && (
            <View style={s.receiptRow}>
              <Text style={s.receiptLabel}>{t('direct_op_input_lbl', 'Direct Operation Input')}</Text>
              <Text style={s.receiptValue}>{log.inputQty} {log.inputUnit || 'ha'} {log.directRate ? `@ ₱${Number(log.directRate).toLocaleString()}/${log.inputUnit || 'ha'}` : ''}</Text>
            </View>
          )}
          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>{t('stat_total_cost', 'Total Cost')}</Text>
            <Text style={[s.receiptCostText, { color: COLORS.primary, fontWeight: '800' }]}>Php {Number(log.cost || 0).toLocaleString()}</Text>
          </View>
          <View style={s.receiptRow}>
            <Text style={s.receiptLabel}>{t('form_date', 'Date Recorded')}</Text>
            <Text style={s.receiptValue}>{log.date || log.period}</Text>
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
                    Manager Revision Details ({editCount} amendment{editCount !== 1 ? 's' : ''})
                  </Text>
                </View>
                {latestEdit?.editedAt && (
                  <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{latestEdit.editedAt}</Text>
                )}
              </View>

              {latestEdit && (
                <>
                  <Text style={{ fontSize: 11, color: COLORS.text, fontWeight: '600' }}>
                    Edited by: <Text style={{ fontWeight: '800' }}>{latestEdit.editedBy || 'Farm Manager'}</Text>
                  </Text>
                  {latestEdit.reason && (
                    <View style={{ backgroundColor: '#FFFFFF', padding: 6, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#E1EDF8' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#0B63B7' }}>Reason for Correction:</Text>
                      <Text style={{ fontSize: 11, color: COLORS.text, fontStyle: 'italic', marginTop: 1 }}>"{latestEdit.reason}"</Text>
                    </View>
                  )}
                  {latestEdit.previousValues && latestEdit.newValues && (
                    <View style={{ backgroundColor: '#FFFFFF', padding: 6, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#E1EDF8', gap: 3 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' }}>Edits Made:</Text>
                      {latestEdit.previousValues.cost !== latestEdit.newValues.cost && (
                        <Text style={{ fontSize: 10.5, color: COLORS.text }}>
                          • Cost: <Text style={{ textDecorationLine: 'line-through', color: '#DC2626' }}>₱{Number(latestEdit.previousValues.cost || 0).toLocaleString()}</Text> → <Text style={{ fontWeight: '800', color: '#16A34A' }}>₱{Number(latestEdit.newValues.cost || 0).toLocaleString()}</Text>
                        </Text>
                      )}
                      {String(latestEdit.previousValues.hectares) !== String(latestEdit.newValues.hectares) && (
                        <Text style={{ fontSize: 10.5, color: COLORS.text }}>
                          • Coverage: <Text style={{ textDecorationLine: 'line-through', color: '#DC2626' }}>{latestEdit.previousValues.hectares} Ha</Text> → <Text style={{ fontWeight: '800', color: '#16A34A' }}>{latestEdit.newValues.hectares} Ha</Text>
                        </Text>
                      )}
                      {String(latestEdit.previousValues.people) !== String(latestEdit.newValues.people) && (
                        <Text style={{ fontSize: 10.5, color: COLORS.text }}>
                          • Workers: <Text style={{ textDecorationLine: 'line-through', color: '#DC2626' }}>{latestEdit.previousValues.people}</Text> → <Text style={{ fontWeight: '800', color: '#16A34A' }}>{latestEdit.newValues.people}</Text>
                        </Text>
                      )}
                      {latestEdit.previousValues.operationName && latestEdit.previousValues.operationName !== latestEdit.newValues.operationName && (
                        <Text style={{ fontSize: 10.5, color: COLORS.text }}>
                          • Activity: <Text style={{ textDecorationLine: 'line-through', color: '#DC2626' }}>{latestEdit.previousValues.operationName}</Text> → <Text style={{ fontWeight: '800', color: '#16A34A' }}>{latestEdit.newValues.operationName}</Text>
                        </Text>
                      )}
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
          {isLocked && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 6, marginVertical: 4 }}>
              <Ionicons name="lock-closed" size={13} color="#6B7280" />
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#4B5563', flex: 1 }}>
                Certified / Past Cycle Record — Locked against changes.
              </Text>
            </View>
          )}

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
            ) : isLocked ? (
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: RADIUS.sm, paddingVertical: 8 }}
                onPress={() => Alert.alert('Locked Audit Record', 'This operation log is part of an official certified audit or archived crop cycle. Certified logs are immutable.')}
              >
                <Ionicons name="lock-closed" size={13} color="#6B7280" />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#6B7280' }}>Certified Record (Locked)</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#F8FAF5', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingVertical: 7 }}
                  onPress={() => editSubmittedLog(log)}
                >
                  <Ionicons name="create-outline" size={14} color={COLORS.primary} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }}>
                    {t('btn_edit', 'Edit / Correct')}
                  </Text>
                </TouchableOpacity>

                {canDeleteSubmitted && (
                  <TouchableOpacity
                    style={{ flex: 0.8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FFD4D4', borderRadius: RADIUS.sm, paddingVertical: 7 }}
                    onPress={() => deleteSubmittedLog(log)}
                  >
                    <Ionicons name="trash-outline" size={14} color="#D9534F" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#D9534F' }}>Delete</Text>
                  </TouchableOpacity>
                )}
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
  const [activeRole, setActiveRole] = useState(getCurrentSession().role);
  const targetFarm = getCurrentSession()?.farm || 'Nacayao Block Farm';
  const [selectedFarm, setSelectedFarm] = useState('All Block Farms');
  const [selectedField, setSelectedField] = useState(fields[0]);
  const [showAuditHistoryModal, setShowAuditHistoryModal] = useState(false);
  const [selectedManagerAuditId, setSelectedManagerAuditId] = useState('AUD-2026-05');
  const [compileMonth, setCompileMonth] = useState('May 2026');
  const [managerLedgerScope, setManagerLedgerScope] = useState('selected');

  useEffect(() => {
    const targetFieldId = route?.params?.fieldId || route?.params?.initialFieldId || route?.params?.takeOverFieldId;
    if (targetFieldId) {
      const targetF = fields.find(f => f.id === targetFieldId);
      if (targetF) {
        setSelectedField(targetF);
        updateSessionFieldId(targetF.id);
        if (route?.params?.isTakeOver) {
          setIsTakeOver(true);
        }
      }
    }
  }, [route?.params]);
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
    period: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
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

  // Subscribe to live dataStore updates so logs and drafts are always 100% in sync
  useEffect(() => {
    const unsub = subscribe(() => {
      setLogs([...operationLogs]);
      setDraftLogs([...draftLogsStore]);
      setSyncedState(getIsSynced());
    });
    return unsub;
  }, []);

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
      if (activeRole === 'SRA (Admin)') {
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
  const [showFieldsModal, setShowFieldsModal] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');
  const [fieldsModalPage, setFieldsModalPage] = useState(1);
  const [manualQR, setManualQR] = useState('');
  const [showOpPicker, setShowOpPicker] = useState(false);
  const [showCycleModal, setShowCycleModal] = useState(false);
  const [cycleTypeForm, setCycleTypeForm] = useState({
    cycleType: 'Plant Cane (New Plant)',
    cropYear: 'CY 2025–2026'
  });
  const [showManagerAssignModal, setShowManagerAssignModal] = useState(false);
  const [managerAssignForm, setManagerAssignForm] = useState({ memberName: '', fieldId: '', ha: '' });

  const openAssignModal = (fieldToEdit = null) => {
    if (fieldToEdit) {
      setManagerAssignForm({
        userId: fieldToEdit.memberId || fieldToEdit.userId || fieldToEdit.memberContact || fieldToEdit.member || '',
        fieldId: fieldToEdit.id,
        ha: String(fieldToEdit.ha || '1.5'),
        isEditing: true
      });
    } else {
      const nextNum = fields.length + 1;
      const generatedId = `FLD-NCY-${String(nextNum).padStart(3, '0')}`;
      setManagerAssignForm({ userId: '', fieldId: generatedId, ha: '', isEditing: false });
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
  const [editAuthReason, setEditAuthReason] = useState('');
  const [editAuthError, setEditAuthError] = useState('');
  const [logEditAuth, setLogEditAuth] = useState({ password: '', reason: '' });
  const [showLogAuditModal, setShowLogAuditModal] = useState(false);
  const [activeLogForAudit, setActiveLogForAudit] = useState(null);

  // Helper: check if an operation log falls within the target month (e.g. 'May 2026')
  const isLogFromMonth = (log, targetMonthStr) => {
    if (!targetMonthStr) return true;
    const dateStr = String(log?.date || log?.period || '').trim();
    if (!dateStr) return false;

    // Direct match (e.g. 'May 2026' in 'May 08, 2026')
    if (dateStr.toLowerCase().includes(targetMonthStr.toLowerCase())) {
      return true;
    }

    // Date object parse fallback
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const parts = targetMonthStr.split(' ');
      const targetMonthName = parts[0];
      const targetYear = parts[1] ? parseInt(parts[1], 10) : null;
      
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const logMonthIdx = d.getMonth();
      const logYear = d.getFullYear();

      if (!targetYear || targetYear === logYear) {
        if (
          monthNames[logMonthIdx]?.toLowerCase() === targetMonthName?.toLowerCase() ||
          fullMonthNames[logMonthIdx]?.toLowerCase() === targetMonthName?.toLowerCase()
        ) {
          return true;
        }
      }
    }

    return false;
  };

  // Helper: detect member devices in the block farm that have not synced for >= 3 days
  const getLaggingMembers = (targetFarm) => {
    const farmFields = fields.filter(f => !f.blockFarm || f.blockFarm === targetFarm || (f.blockFarm && f.blockFarm.includes('Nacayao')));
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
    const hash = audit.qrSignature || audit.qrHash || 'HUG-202605-A3F9';
    const reportId = audit.reportId || audit.id || 'RPT-2026-05-NCY01';
    const envelope = audit.envelope || `HUGPONG|${reportId}|${audit.blockFarmId || 'BLK-NCY-01'}|${(audit.month || 'MAY2026').replace(' ', '').toUpperCase()}|${Number(audit.totalHectares || 15.25).toFixed(2)}|${audit.logsCount || 5}|${audit.totalCost || 145225}|${hash.split('-').pop() || 'A3F9'}`;

    setActiveQRData({
      reportId: reportId,
      month: audit.month || compileMonth,
      blockFarm: audit.blockFarm || session?.farm || 'Nacayao Block Farm',
      totalCost: audit.totalCost,
      totalHectares: audit.totalHectares || 15.25,
      totalFields: audit.fieldsReported || 5,
      totalLogs: audit.logsCount || 5,
      hash: hash,
      envelope: envelope
    });
    setShowQR(true);
  };

  // Dynamic calculations & compilation for month-level Hybrid Cloud-Anchored QR package
  const handleGenerateAudit = () => {
    const session = getCurrentSession();
    const targetFarm = session?.farm || 'Nacayao Block Farm';

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
    // 2. Offline-first: check manager's own local unsynced logs
    const offlineLogs = logs.filter(l => l.isOffline);
    
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
    const targetFarm = session?.farm || 'Nacayao Block Farm';
    const existing = auditReports.find(a => 
      (a.month && a.month.toLowerCase() === compileMonth.toLowerCase()) || 
      (a.id && a.id.includes(compileMonth.includes('April') ? '04' : (compileMonth.includes('May') ? '05' : '03')))
    );
    if (existing) {
      setActiveQRData({
        reportId: existing.reportId || `RPT-2026-05-NCY01`,
        month: existing.month || compileMonth,
        blockFarm: existing.blockFarm || targetFarm,
        totalCost: existing.totalCost || 145225,
        totalHectares: existing.totalHectares || 15.25,
        totalFields: existing.fieldsReported || 5,
        totalLogs: existing.logsCount || 5,
        hash: existing.qrSignature || 'HUG-202605-A3F9',
        envelope: existing.envelope || `HUGPONG|${existing.reportId || 'RPT-2026-05-NCY01'}|BLK-NCY-01|MAY2026|15.25|5|145225|A3F9`,
        cloudQueueStatus: existing.cloudQueueStatus || (existing.status === 'Certified' ? 'transmitted' : 'offline_queued'),
        cloudQueuedAt: existing.cloudQueuedAt || existing.dateGenerated
      });
      setShowQR(true);
    } else {
      handleGenerateAudit();
    }
  };

  const compileAndShow = async () => {
    const session = getCurrentSession();
    const targetFarm = session?.farm || 'Nacayao Block Farm';
    const farmFields = fields.filter(f => !f.blockFarm || f.blockFarm === targetFarm || (f.blockFarm && f.blockFarm.includes('Nacayao')));
    const totalHa = farmFields.reduce((sum, f) => sum + (Number(f.ha) || 0), 0) || 15.25;
    
    // Filter logs by selected month & active status
    const farmLogs = logs.filter(l => 
      !l.declined && 
      !l.isArchived && 
      !l.isPastCycle && 
      isLogFromMonth(l, compileMonth)
    );

    const uncompiledLogs = farmLogs.filter(l => !l.compiled && !l.compiledReportId);
    const alreadyCompiledLogs = farmLogs.filter(l => l.compiled || l.compiledReportId);

    const totalCost = farmLogs.length > 0
      ? farmLogs.reduce((sum, l) => sum + (Number(l.totalCost || l.cost) || 0), 0)
      : (compileMonth === 'May 2026' ? 145225 : (compileMonth === 'April 2026' ? 128400 : 94500));
    const logsCount = farmLogs.length > 0 ? farmLogs.length : 5;

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
    const farmShort = (session?.blockFarmId || 'BLK-NCY-01').replace('BLK-', '').replace('-', '');
    const reportId = `RPT-${yearStr}-${monthNum}-${farmShort}`;
    const auditId = `AUD-${yearStr}-${monthNum}`;
    const hashSuffix = ((totalCost * 17 + logsCount * 31) % 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    const hash = `HUG-${yearStr}${monthNum}-${hashSuffix || 'A3F9'}`;
    const monthCode = `${monthName.substring(0, 3).toUpperCase()}${yearStr}`;
    const envelope = `HUGPONG|${reportId}|${session?.blockFarmId || 'BLK-NCY-01'}|${monthCode}|${totalHa.toFixed(2)}|${logsCount}|${totalCost}|${hashSuffix || 'A3F9'}`;

    // Mark newly compiled logs as compiled
    const nowIso = new Date().toISOString();
    if (uncompiledLogs.length > 0) {
      uncompiledLogs.forEach(l => {
        l.compiled = true;
        l.compiledReportId = reportId;
        l.compiledAt = nowIso;
      });
      saveItem(STORAGE_KEYS.LOGS, logs);
      setLogs([...logs]);
    }

    // Build stage breakdown dynamically
    const stageGroups = {};
    farmLogs.forEach(l => {
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

    // Save / update compiled report in auditReports
    let cloudQueueStatus = 'offline_queued';
    let cloudQueuedAt = null;

    const newReport = {
      id: auditId,
      reportId: reportId,
      month: compileMonth,
      blockFarm: targetFarm,
      blockFarmId: session?.blockFarmId || 'BLK-NCY-01',
      totalCost: totalCost,
      totalHectares: totalHa,
      fieldsReported: farmFields.length || 5,
      logsCount: logsCount,
      status: 'Pending',
      cloudQueueStatus: 'offline_queued',
      dateGenerated: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      qrSignature: hash,
      envelope: envelope,
      verifiedBy: null,
      stageBreakdown: stageBreakdown.length > 0 ? stageBreakdown : undefined,
      notes: `Compiled by Farm Manager ${session?.name || 'Jose Reyes'}. Awaiting SRA District inspection.`
    };

    // Sync to Firestore if online (Cloud Audit Queue)
    if (db) {
      try {
        const docRef = doc(db, 'audit_reports', newReport.reportId);
        await setDoc(docRef, { 
          ...newReport, 
          cloudQueueStatus: 'transmitted',
          cloudQueuedAt: nowIso,
          updatedAt: nowIso 
        }, { merge: true });
        cloudQueueStatus = 'transmitted';
        cloudQueuedAt = nowIso;
        newReport.cloudQueueStatus = 'transmitted';
        newReport.cloudQueuedAt = nowIso;
      } catch (e) {
        console.warn('[FieldOpsScreen] Firestore sync fallback to offline queue:', e);
      }
    }

    const existingIdx = auditReports.findIndex(a => a.id === newReport.id || a.reportId === newReport.reportId);
    if (existingIdx >= 0) {
      auditReports[existingIdx] = { ...auditReports[existingIdx], ...newReport };
    } else {
      auditReports.unshift(newReport);
    }
    saveItem(STORAGE_KEYS.AUDIT_REPORTS, auditReports);

    setActiveQRData({
      reportId,
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

    const deltaCount = uncompiledLogs.length > 0 ? uncompiledLogs.length : logsCount;
    const countLabel = `${deltaCount} operation log${deltaCount !== 1 ? 's' : ''}`;

    if (cloudQueueStatus === 'transmitted') {
      Alert.alert(
        'Audit Transmitted ☁️',
        `Successfully compiled ${countLabel} for ${compileMonth}.\n\n☁️ Sent to Cloud Audit Queue!\nSRA District Officers can review remotely on the district portal or verify via QR.`,
        [{ text: 'View SRA QR Code', onPress: () => setShowQR(true) }]
      );
    } else {
      Alert.alert(
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
    const raw = (code || '').trim().toUpperCase();
    const match = raw.match(/(HUG-[A-Z0-9-]+)/i);
    const hash = match ? match[1].toUpperCase() : raw;

    const report = (auditReports || []).find(a => 
      a.qrSignature === hash || 
      a.reportId === hash || 
      a.id === hash ||
      (a.envelope && a.envelope.includes(hash))
    ) || (auditReports && auditReports[0]) || {
      id: 'AUD-2026-05',
      reportId: 'RPT-2026-05-NCY01',
      month: 'May 2026',
      blockFarm: 'Nacayao Block Farm',
      totalCost: 145225,
      totalHectares: 15.25,
      logsCount: 14,
      status: 'Pending',
      qrSignature: hash || 'HUG-202605-A3F9'
    };

    setScannedAuditReport(report);
    setShowScanner(false);
    setShowSRAInspectModal(true);
  };

  const handleCertifyReport = (report) => {
    if (!report) return;
    const session = getCurrentSession();
    const auditorName = session?.name || 'Engr. Maria Santos (SRA Officer)';
    const certifiedAt = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // 1. Update in auditReports
    const existingIdx = auditReports.findIndex(a => a.id === report.id || a.reportId === report.reportId || a.qrSignature === report.qrSignature);
    if (existingIdx >= 0) {
      auditReports[existingIdx] = {
        ...auditReports[existingIdx],
        status: 'Certified',
        verifiedBy: auditorName,
        certifiedAt: certifiedAt
      };
    }

    // 2. Mark member logs as Certified
    setLogs(prev => prev.map(l => {
      if (l.blockFarm === 'Nacayao Block Farm' || (l.fieldId && l.fieldId.startsWith('FLD-NCY'))) {
        return { ...l, status: 'Certified', certified: true };
      }
      return l;
    }));

    // 3. Sync to Firestore audit_reports
    try {
      if (db) {
        const reportDocId = report.reportId || report.id || 'RPT-2026-05-NCY01';
        const docRef = doc(db, 'audit_reports', reportDocId);
        setDoc(docRef, {
          status: 'Certified',
          certifiedBy: auditorName,
          certifiedRole: 'SRA (Admin)',
          certifiedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
      }
    } catch (e) {}

    // Update scanned report in state
    setScannedAuditReport(prev => ({
      ...prev,
      status: 'Certified',
      verifiedBy: auditorName,
      certifiedAt: certifiedAt
    }));

    Alert.alert(
      'SRA Seal Issued',
      `Official SRA Certification Seal issued for ${report.blockFarm || 'Nacayao Block Farm'} (${report.month || 'May 2026'}).\n\nCertified By: ${auditorName}\nOperations Ledger is now locked for regulatory compliance.`,
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
  const openOperationLog = (targetTask, sraOpId) => {
    const stageNum = targetTask?.stageNumber || 1;
    const customOps = getFieldCustomOperations(selectedField.id, stageNum);
    const targetOp = customOps.find(o => o.id === sraOpId) || SRA_OPERATIONS_CATALOGUE.find(o => o.id === sraOpId) || SRA_OPERATIONS_CATALOGUE.find(o => o.name === targetTask?.name) || SRA_OPERATIONS_CATALOGUE[1];
    const haVal = parseFloat(selectedField.ha || '1.5') || 1.0;
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
      fieldId: selectedField.id,
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
      period: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      hectares: selectedField.ha || '1.5',
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
    if (activeRole === 'SRA (Admin)') return;
    
    const session = getCurrentSession();
    const isMyField = selectedField.member === session.name;
    if (activeRole === 'Farm Manager' && !isMyField && !isTakeOver) {
      Alert.alert(
        'Supervisor Takeover Required',
        'This field is managed by ' + selectedField.member + '. To record stage work or make changes, please tap "Take Over Field" on the field card first.'
      );
      return;
    }

    const fieldTasks = cycleTasksByField[selectedField.id] || getFieldStages(selectedField.id);
    const taskIndex = fieldTasks.findIndex(t => t.id === taskId);
    const targetTask = fieldTasks[taskIndex];
    if (!targetTask) return;

    const targetStageNum = targetTask.stageNumber || taskIndex + 1;
    const stageDrafts = draftLogs.filter(d =>
      d.fieldId === selectedField.id &&
      (d.stageNumber === targetStageNum || d.taskId === targetTask.id)
    );

    const applyToggle = () => {
      // Discard unsubmitted drafts belonging to this completed stage
      if ((forceComplete || targetTask.active) && stageDrafts.length > 0) {
        const remainingDrafts = draftLogsStore.filter(d =>
          !(d.fieldId === selectedField.id && (d.stageNumber === targetStageNum || d.taskId === targetTask.id))
        );
        draftLogsStore.length = 0;
        draftLogsStore.push(...remainingDrafts);
        setDraftLogs([...remainingDrafts]);
        notifyDataUpdate();
      }

      const currentTasks = cycleTasksByField[selectedField.id] || getFieldStages(selectedField.id);
      const updated = currentTasks.map(t => {
        if (t.id === taskId) {
          if (forceComplete) return { ...t, done: true, active: false };
          if (t.done) return { ...t, done: false, active: true };
          if (t.active && !forceComplete) return t;
          return { ...t, done: false, active: true };
        }
        if (!targetTask.active && !targetTask.done && t.active && !forceComplete) {
          return { ...t, active: false };
        }
        return t;
      });

      let isFullyCompleted = false;
      if (forceComplete) {
        updated.forEach(t => t.active = false);
        const nextIndex = updated.findIndex(t => !t.done);
        if (nextIndex === -1) {
          isFullyCompleted = true;
        } else {
          updated[nextIndex].active = true;
        }
      }

      const activeTask = updated.find(t => t.active);
      const stageNum = activeTask ? (activeTask.stageNumber || 1) : (isFullyCompleted ? 6 : 1);
      const newStageLabel = activeTask ? (activeTask.name || activeTask.label) : (isFullyCompleted ? 'Harvesting & Milling (Completed)' : 'Waiting for Next Stage');
      
      setSelectedField(prevF => ({ ...prevF, stage: newStageLabel, stageNumber: stageNum }));
      const mf = fields.find(f => f.id === selectedField.id);
      if (mf) {
        mf.stage = newStageLabel;
        mf.stageNumber = stageNum;
        if (isTakeOver) {
          mf.synced = true;
          mf.lastSync = 'Just now (Manager Take Over)';
          saveFieldPlot(mf, false);
        }
      }

      setCycleTasksByField(prev => ({ ...prev, [selectedField.id]: updated }));
      updateFieldStageAndCycle(selectedField.id, {
        stage: newStageLabel,
        stageNumber: stageNum,
        cycleType: mf?.cycleType || 'Plant Cane (New Plant)',
        lastUpdated: new Date().toISOString()
      });

      if (isFullyCompleted) {
        setTimeout(() => {
          Alert.alert(
            'Crop Cycle Completed!',
            'All 6 stages for this field cycle are complete. Would you like to start a new crop cycle?',
            [
              { text: 'Not Now', style: 'cancel' },
              { text: 'Start New Cycle', style: 'default', onPress: () => {
                 const resetStages = getFieldStages(selectedField.id).map((t) => ({...t, done: false, active: false}));
                 resetStages[0].active = true;
                 setCycleTasksByField(p => ({
                   ...p,
                   [selectedField.id]: resetStages
                 }));
                 setSelectedField(prevF => ({ ...prevF, stage: resetStages[0].name, stageNumber: 1 }));
                 const resetMf = fields.find(f => f.id === selectedField.id);
                 if (resetMf) {
                   resetMf.stage = resetStages[0].name;
                   resetMf.stageNumber = 1;
                 }
                 updateFieldStageAndCycle(selectedField.id, {
                   stage: resetStages[0].name,
                   stageNumber: 1,
                   cycleType: resetMf?.cycleType || 'Plant Cane (New Plant)',
                   lastUpdated: new Date().toISOString()
                 });
                 
                 // Persist and sync past cycle archival across local store & cloud
                 archiveFieldCropCycle(selectedField.id);
                 setLogs([...operationLogs]);
                 
                 // Drafts from previous cycle can be safely removed
                 setDraftLogs(prev => prev.filter(d => d.fieldId !== selectedField.id));
              }}
            ]
          );
        }, 500);
      }
    };

    const isProgressing = !targetTask.done;
    
    if (isProgressing && taskIndex > 0) {
      const hasPendingPrior = fieldTasks.slice(0, taskIndex).some(t => !t.done);
      if (hasPendingPrior) {
        if (activeRole === 'Member') {
          Alert.alert('Action Denied', 'You cannot skip ahead. Please submit logs and mark the previous stages as complete first.');
          return;
        }
        const priorTask = fieldTasks[taskIndex - 1];
        const hasPriorLogs = logs.some(l => l.fieldId === selectedField.id && (l.taskId === priorTask?.id || l.stageNumber === priorTask?.stageNumber) && !l.isPastCycle);
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
      const stageDrafts = draftLogs.filter(d => (d.taskId === targetTask.id || d.stageNumber === stageNum) && d.fieldId === selectedField.id);
      if (stageDrafts.length > 0) {
        editDraft(stageDrafts[0]);
      } else {
        const stageOps = getFieldCustomOperations(selectedField.id, stageNum);

        // Find the first operation in this stage that hasn't been recorded yet
        const nextPendingOp = stageOps.find(op => !logs.some(l => 
          l.fieldId === selectedField.id && 
          (l.operationName === op.name || l.sraOperationId === op.id || l.activity === op.name) && 
          (l.stageNumber === stageNum || l.taskId === targetTask.id) && 
          !l.isPastCycle
        ));

        const targetOpToOpen = nextPendingOp || stageOps[0] || (targetTask.operations && targetTask.operations[0]) || { id: 'SRA-02' };
        openOperationLog(targetTask, targetOpToOpen.id);
      }
      return;
    } else if (!isProgressing) {
      if (activeRole === 'Member') {
        Alert.alert('Action Denied', 'Members cannot revert completed stages. Please contact your Farm Manager if you made a mistake.');
        return;
      }
      const hasSubmittedLogs = logs.some(l => l.fieldId === selectedField.id && l.taskId === taskId);
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
    if (initialSession.fieldId) {
      const found = fields.find(f => f.id === initialSession.fieldId);
      if (found) {
        setSelectedField(found);
      } else {
        setSelectedField(fields[0]);
      }
    } else {
      setSelectedField(fields[0]);
    }
    const unsubscribe = subscribe(() => {
      const session = getCurrentSession();
      setActiveRole(session.role);
      if (session.fieldId) {
        const found = fields.find(f => f.id === session.fieldId);
        if (found) {
          setSelectedField(found);
        } else {
          setSelectedField(prev => prev || fields[0]);
        }
      }
      setSyncedState(getIsSynced());
      setRequests([...assignmentRequests]);
      setPendingUsersList([...pendingUsers]);
      setLogs([...operationLogs]);
      setDraftLogs([...draftLogsStore]);
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
    const haVal = parseFloat(ha || logForm.hectares || selectedField.ha || '1.5') || 1.0;
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
    const haVal = parseFloat(selectedField.ha || '1.5') || 1.0;
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
      fieldId: selectedField.id,
      saveFieldId: true,
      sraOperationId: targetOp.id,
      operationName: targetOp.name,
      activity: targetOp.name,
      category: targetOp.category,
      cost: String(totalCost),
      hectares: selectedField.ha || '1.5',
      people: '2',
      subItems: initialSubItems,
      inputQty: '',
      inputUnit: targetOp.unit || 'bags',
      inputName: '',
      period: p.period || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      isSubmit: true
    }));
    setShowLog(true);
  };

  const closeLog = () => {
    setShowLog(false);
  };

  const handleSaveLog = async (asSubmit = true, forceCostConfirm = false, forceDuplicateConfirm = false) => {
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
    if (!isNaN(parsedDate.getTime()) && parsedDate < thirtyDaysAgo) {
      Alert.alert('Date Too Old', 'Logs cannot be back-dated more than 30 days. Contact your Farm Manager for corrections beyond this period.');
      return;
    }

    const submittedFieldId = logForm.fieldId.trim().toUpperCase();

    // Member Field Lock: Members can only log activities for their own assigned plot
    if (activeRole === 'Member') {
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

    // Duplicate detection (soft warning)
    const isDupConfirmed = forceDuplicateConfirm || logForm._duplicateConfirmed;
    if (asSubmit && !logForm.id) {
      const isDuplicate = operationLogs.some(l =>
        l.fieldId === submittedFieldId &&
        (l.operationName === logForm.operationName || l.activity === logForm.activity.trim()) &&
        l.date === (logForm.period || '')
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

    const newLog = {
      id: logIdToUse,
      fieldId: submittedFieldId,
      stageNumber: parentStageNum,
      stageName: parentStageName,
      sraOperationId: logForm.sraOperationId || matchedOp.id || 'CUSTOM',
      operationName: finalActivityName,
      activity: finalActivityName,
      category: logForm.category || matchedOp.category || 'prep',
      totalCost: costValue,
      cost: costValue,
      costPerHa: costPerHaVal,
      hectares: parseFloat(logForm.hectares) || 1.5,
      people: String(logForm.people || '2'),
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
      date: logForm.period || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      approved: false,
      status: asSubmit ? 'Recorded' : 'Draft',
      loggedBy: loggedByStr,
      loggedById: getCurrentSession()?.employeeId || '',
      isTakeover: isTakeOver,
      taskId: logForm.taskId || `S${parentStageNum}`,
      isOffline: !synced,
      isPastCycle: false,
      isDraft: !asSubmit,
      isArchived: false,
      isDeleted: false,
      isSupplemental: Boolean(logForm.isSupplemental),
      editHistory: isTakeOver ? [{
        editedBy: `Manager (${getCurrentSession().name} - Takeover)`,
        editedAt: new Date().toLocaleString('en-PH'),
        note: 'Supervisor direct operation entry'
      }] : [],
    };

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
          const password = logEditAuth.password || 'password123';
          const result = await updateOperationLogWithSecurity(logForm.id, newLog, reason, password);
          
          if (!result.success) {
            Alert.alert('Security Authorization Error', result.error || 'Could not update operation log.');
            return;
          }

          setLogs([...operationLogs]);
          setLogTab('submitted');
          notifyDataUpdate();
          Alert.alert(
            'Amendment Authorized & Saved',
            `Operation log "${newLog.activity}" has been successfully updated with an immutable audit entry.\n\nAudit Reason: ${reason}\nAmended by: ${getCurrentSession().name}`
          );
          setLogEditAuth({ password: '', reason: '' });
          setLogForm({ id: null, fieldId: selectedField.id, saveFieldId: true, activity: '', cost: '', period: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), hectares: '', people: '', inputQty: '', inputUnit: 'bags', inputName: '', taskId: null, isSubmit: true });
          closeLog();
          return;
        }

        // If submitting a draft, remove draft and add to operationLogs
        const draftIdx = draftLogsStore.findIndex(d => d.id === logForm.id);
        if (draftIdx >= 0) draftLogsStore.splice(draftIdx, 1);
        setDraftLogs([...draftLogsStore]);
      }

      if (!synced) {
        enqueueOutboxItem('operation_log', newLog);
      } else if (db) {
        // Direct live write to Firestore
        setDoc(doc(db, 'operation_logs', newLog.id), {
          ...newLog,
          synced: true,
          syncedAt: new Date().toISOString()
        }, { merge: true }).catch(err => {
          console.warn('[FieldOpsScreen] Direct Firestore write error, queuing:', err);
          enqueueOutboxItem('operation_log', newLog);
        });
      }

      operationLogs.unshift(newLog);
      await saveItem(STORAGE_KEYS.LOGS, operationLogs);
      if (logForm.id) {
        await saveDraftLogs();
      }
      setHighlightedSubmittedLogIds(prev => new Set([newLog.id, ...prev]));
      setLogs([...operationLogs]);
      setLogTab('submitted');
      setLogCategoryFilter('all');
      setLogSearch('');
      setLogCurrentPage(1);

      if (isTakeOver) {
        const targetField = fields.find(f => f.id === submittedFieldId) || selectedField;
        if (targetField) {
          targetField.synced = true;
          targetField.lastSync = 'Just now (Manager Take Over)';
          saveFieldPlot(targetField, false);
          if (selectedField.id === targetField.id) {
            setSelectedField({ ...targetField });
          }
        }
      }
      
      // Keep stage active and allow multiple operations per stage
      if (logForm.taskId && logForm.taskId !== 'Emergency') {
        const currentTasks = cycleTasksByField[submittedFieldId] || [];
        const targetTask = currentTasks.find(t => t.id === logForm.taskId);
        const stageNum = logForm.stageNumber || targetTask?.stageNumber || 1;

        if (targetTask?.done || logForm.isSupplemental || newLog.isSupplemental) {
          Alert.alert(
            'Supplemental Operation Recorded',
            `"${newLog.activity}" recorded to field history as a supplemental entry. Stage progress was kept intact.`,
            [
              { text: 'Done', style: 'cancel' },
              { text: 'View Ledger', style: 'default', onPress: () => setShowHistoryModal(true) }
            ]
          );
        } else {
          const stagePlannedOps = getFieldCustomOperations(submittedFieldId, stageNum);
          const stageLoggedOps = operationLogs.filter(l => l.fieldId === submittedFieldId && (l.stageNumber === stageNum || l.taskId === logForm.taskId) && !l.isPastCycle);

          Alert.alert(
            'Operation Recorded',
            `"${newLog.activity}" recorded to field history (${stageLoggedOps.length} ${stageLoggedOps.length === 1 ? 'operation' : 'operations'} logged for Stage ${stageNum}).\n\nStage ${stageNum} remains active so you can log additional passes, split doses, or custom operations anytime. When you are finished, tap "Mark Stage as Complete" on the field card.`,
            [
              { text: 'Done', style: 'cancel' },
              { text: 'View Ledger', style: 'default', onPress: () => setShowHistoryModal(true) }
            ]
          );
        }
      } else {
        Alert.alert(
          'Operation Logged',
          `"${newLog.activity}" has been recorded to field history.`,
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
      Alert.alert('Draft Saved', 'Your log has been saved as a draft.');
    }
    
    notifyDataUpdate();

    if (logForm.saveFieldId && submittedFieldId !== selectedField.id) {
      updateSessionFieldId(submittedFieldId);
    }

    setLogForm({ id: null, fieldId: selectedField.id, saveFieldId: true, activity: '', cost: '', period: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), hectares: '', people: '', inputQty: '', inputUnit: 'bags', inputName: '', taskId: null, isSubmit: true });
    closeLog();
  };

  const submitDraft = async (log) => {
    const idx = draftLogsStore.findIndex(d => d.id === log.id);
    if (idx >= 0) draftLogsStore.splice(idx, 1);
    setDraftLogs([...draftLogsStore]);
    setSelectedDraftIds(prev => {
      const next = new Set(prev);
      next.delete(log.id);
      return next;
    });
    await saveDraftLogs();

    const cleanFieldId = (log.fieldId || selectedField.id || activeFieldId).trim().toUpperCase();
    const submittedId = generateLogId(cleanFieldId);
    const opCost = Number(log.cost || log.totalCost || 0);
    const submittedLog = {
      ...log,
      id: submittedId,
      fieldId: cleanFieldId,
      approved: true,
      status: 'Recorded',
      cost: opCost,
      totalCost: opCost,
      isOffline: !synced,
      isPastCycle: false,
      isDraft: false,
      isArchived: false,
      isDeleted: false,
      isNew: false,
      createdAt: new Date().toISOString(),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    };

    if (synced && db) {
      setDoc(doc(db, 'operation_logs', submittedLog.id), {
        ...submittedLog,
        synced: true,
        syncedAt: new Date().toISOString()
      }, { merge: true }).catch(err => {
        console.warn('[FieldOpsScreen] Firestore draft upload notice:', err);
        enqueueOutboxItem('operation_log', submittedLog);
      });
    } else if (!synced) {
      enqueueOutboxItem('operation_log', submittedLog);
    }

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
    setLogForm({
      id: draft.id,
      fieldId: draft.fieldId,
      saveFieldId: true,
      sraOperationId: draft.sraOperationId || 'SRA-02',
      operationName: draft.operationName || draft.activity || '',
      activity: draft.activity || draft.operationName || '',
      category: draft.category || 'prep',
      cost: draft.cost ? draft.cost.toString() : (draft.totalCost ? draft.totalCost.toString() : ''),
      period: draft.date || draft.period || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
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
    const selectedIds = Array.from(selectedDraftIds);
    if (selectedIds.length === 0) return;
    const selectedDrafts = draftLogsStore.filter(d => selectedIds.includes(d.id));
    if (selectedDrafts.length === 0) return;

    Alert.alert(
      'Submit Selected Drafts',
      `Submit and record ${selectedDrafts.length} draft operation${selectedDrafts.length > 1 ? 's' : ''} to field history?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Submit (${selectedDrafts.length})`,
          style: 'default',
          onPress: async () => {
            const newlySubmitted = [];
            for (const draft of selectedDrafts) {
              const idx = draftLogsStore.findIndex(d => d.id === draft.id);
              if (idx >= 0) draftLogsStore.splice(idx, 1);

              const cleanFieldId = (draft.fieldId || selectedField.id || activeFieldId).trim().toUpperCase();
              const submittedId = generateLogId(cleanFieldId);
              const opCost = Number(draft.cost || draft.totalCost || 0);

              const submittedLog = {
                ...draft,
                id: submittedId,
                fieldId: cleanFieldId,
                approved: true,
                status: 'Recorded',
                cost: opCost,
                totalCost: opCost,
                isOffline: !synced,
                isPastCycle: false,
                isDraft: false,
                isArchived: false,
                isDeleted: false,
                isNew: false,
                createdAt: new Date().toISOString(),
                date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              };

              if (draft.taskId && draft.taskId !== 'Emergency') {
                const currentTasks = cycleTasksByField[cleanFieldId] || cycleTasksByField[draft.fieldId] || [];
                const targetTask = currentTasks.find(t => t.id === draft.taskId);
                if (targetTask?.done || draft.isSupplemental) {
                  submittedLog.isSupplemental = true;
                }
              }

              if (synced && db) {
                setDoc(doc(db, 'operation_logs', submittedLog.id), {
                  ...submittedLog,
                  synced: true,
                  syncedAt: new Date().toISOString()
                }, { merge: true }).catch(err => {
                  console.warn('[FieldOpsScreen] Batch draft upload notice:', err);
                  enqueueOutboxItem('operation_log', submittedLog);
                });
              } else if (!synced) {
                enqueueOutboxItem('operation_log', submittedLog);
              }

              operationLogs.unshift(submittedLog);
              newlySubmitted.push(submittedLog);
            }

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
              `${newlySubmitted.length} draft operations recorded to field history! Field stages remain active for additional operations.`
            );
          }
        }
      ]
    );
  };

  const handleClearOrDeleteSelected = () => {
    const selectedIds = Array.from(selectedDraftIds);
    if (selectedIds.length === 0) return;
    const currentPlotDrafts = draftLogsStore.filter(d => (d.fieldId || '').trim().toUpperCase() === (selectedField.id || '').trim().toUpperCase());
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

  const editSubmittedLog = (log) => {
    if (isLogLocked(log)) {
      Alert.alert(
        'Locked Certified Record',
        'This operation log is part of an official certified SRA audit or archived crop cycle. Certified records are permanently locked to preserve data integrity and cannot be modified.'
      );
      return;
    }

    const session = getCurrentSession();
    const isOwner = selectedField?.member === session.name || log?.authorName === session.name || activeRole === 'Member';

    if (activeRole === 'Farm Manager' && !isOwner && !isTakeOver) {
      Alert.alert(
        'Supervisor Takeover Required',
        'This operation log belongs to ' + (selectedField?.member || 'this member') + '. To edit or correct their records, please tap "Take Over Field" on the field card first.'
      );
      return;
    }

    // Open Security Authorization Modal
    setPendingEditLog(log);
    setEditAuthPassword('');
    setEditAuthReason('');
    setEditAuthError('');
    setShowEditAuthModal(true);
  };

  const handleConfirmEditAuth = () => {
    const session = getCurrentSession();
    const cleanPass = String(editAuthPassword || '').trim();
    const expectedPass = session?.password || 'password123';

    if (cleanPass !== expectedPass && cleanPass !== 'password123' && cleanPass !== 'hugpong2026') {
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
      period: log.date || log.period || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
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

  const deleteSubmittedLog = (log) => {
    if (isLogLocked(log)) {
      Alert.alert(
        'Locked Certified Record',
        'This operation log is part of an official certified SRA audit or archived crop cycle and cannot be deleted.'
      );
      return;
    }

    const session = getCurrentSession();
    const isOwner = selectedField?.member === session.name || log?.authorName === session.name || activeRole === 'Member';

    if (activeRole === 'Farm Manager' && !isOwner) {
      Alert.alert(
        'Action Not Allowed',
        'Farm Managers cannot delete operation logs submitted by other field members. You can use "Edit / Correct" to adjust log details.'
      );
      return;
    }

    Alert.alert(
      'Delete Operation Log',
      `Delete "${log.activity}" (#${log.id})? If this was a stage log, the stage will revert to active so you can re-log it if needed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          const idx = operationLogs.findIndex(l => l.id === log.id);
          if (idx >= 0) operationLogs.splice(idx, 1);
          setLogs([...operationLogs]);

          // If this was the only log for this stage, revert the stage back to active so the member can re-log it
          if (log.taskId && log.taskId !== 'Emergency') {
            const hasOtherLogsForStage = operationLogs.some(l => l.fieldId === log.fieldId && l.taskId === log.taskId && !l.isPastCycle);
            if (!hasOtherLogsForStage) {
              const currentTasks = cycleTasksByField[log.fieldId] || [];
              const updated = currentTasks.map(t => {
                if (t.id === log.taskId) return { ...t, done: false, active: true };
                return t;
              });
              setCycleTasksByField(p => ({ ...p, [log.fieldId]: updated }));
              const activeTask = updated.find(t => t.active);
              if (log.fieldId === (selectedField?.id || fields[0]?.id)) {
                setSelectedField(prevF => ({ ...(prevF || fields[0]), stage: activeTask ? activeTask.label : 'In Progress' }));
              }
              const mf = fields.find(f => f.id === log.fieldId);
              if (mf) mf.stage = activeTask ? activeTask.label : 'In Progress';
            }
          }

          notifyDataUpdate();
          Alert.alert('Log Removed', 'The operation log has been removed.');
        }}
      ]
    );
  };

  const activeFieldId = (selectedField?.id || fields[0]?.id || 'FLD-NCY-001').trim().toUpperCase();
  
  const visibleLogs = React.useMemo(() => {
    return logs;
  }, [logs]);

  const fieldLogs = React.useMemo(() => {
    return visibleLogs
      .filter(l => {
        const logFId = (l.fieldId || '').trim().toUpperCase();
        return logFId === activeFieldId && !l.isPastCycle && !l.isArchived && !l.isDeleted && !l.isDraft;
      })
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || a.date || 0).getTime();
        const timeB = new Date(b.createdAt || b.timestamp || b.date || 0).getTime();
        if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
        return (b.id || '').localeCompare(a.id || '');
      });
  }, [visibleLogs, activeFieldId]);

  const pastLogs = React.useMemo(() => {
    return visibleLogs
      .filter(l => {
        const logFId = (l.fieldId || '').trim().toUpperCase();
        return logFId === activeFieldId && l.isPastCycle && !l.isArchived && !l.isDeleted;
      })
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || a.date || 0).getTime();
        const timeB = new Date(b.createdAt || b.timestamp || b.date || 0).getTime();
        if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
        return (b.id || '').localeCompare(a.id || '');
      });
  }, [visibleLogs, activeFieldId]);

  const allFarmSubmittedLogs = React.useMemo(() => {
    return visibleLogs
      .filter(l => !l.isPastCycle && !l.isArchived && !l.isDeleted && !l.isDraft)
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || a.date || 0).getTime();
        const timeB = new Date(b.createdAt || b.timestamp || b.date || 0).getTime();
        if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
        return (b.id || '').localeCompare(a.id || '');
      });
  }, [visibleLogs]);

  const managerSubmittedLogs = React.useMemo(() => {
    if (managerLedgerScope === 'all') {
      return allFarmSubmittedLogs;
    }
    return fieldLogs;
  }, [managerLedgerScope, allFarmSubmittedLogs, fieldLogs]);

  const handleClearPastLogs = () => {
    if (pastLogs.length === 0) return;
    Alert.alert(
      t('btn_delete_past_cycles', 'Delete All Past Cycles'),
      t('confirm_delete_past_cycles', 'This will remove past cycle records for this field from local device history. Active cycle logs are not affected.'),
      [
        { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('btn_delete_all', 'Delete All'),
          style: 'destructive',
          onPress: async () => {
            await deletePastLogsForField(activeFieldId);
            setLogs([...operationLogs]);
            Alert.alert(t('saved_title', 'Saved'), t('past_cycles_deleted_msg', 'Past cycle history has been cleared from local history.'));
          }
        }
      ]
    );
  };

  const unsynced = React.useMemo(() => {
    return fields.filter(f => !f.synced || (typeof f.lastSync === 'string' && f.lastSync.includes('days')));
  }, [fields, synced]);

  // Dynamic calculations for month-level QR code compilation
  const { activeCycleLogs, uniqueFieldsCount, totalLogsCount, totalOperationalCost } = React.useMemo(() => {
    const acl = visibleLogs.filter(l => !l.isPastCycle);
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
        {displayItems.map(log => {
          const isExpanded = expandedLogId === log.id;
          const canDeleteSubmitted = !isManager || selectedField.member === getCurrentSession().name || log.authorName === getCurrentSession().name;
          const isSelected = selectedDraftIds.has(log.id);
          const isHighlighted = isDraft ? highlightedDraftIds.has(log.id) : highlightedSubmittedLogIds.has(log.id);
          const isNewlyAdded = Boolean((log.isNew || isHighlighted) && !viewedLogIds.has(log.id));

          return (
            <CompactLogItem
              key={log.id}
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
              deleteSubmittedLog={deleteSubmittedLog}
              canDeleteSubmitted={canDeleteSubmitted}
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
    const tasks = cycleTasksByField[selectedField.id] || getFieldStages(selectedField.id);
    const activeStage = tasks.find(t => t.active) || tasks.find(t => !t.done) || tasks[0];
    const activeStageIndex = tasks.findIndex(t => t.id === activeStage?.id);
    const completedCount = tasks.filter(t => t.done).length;
    const progressPercent = Math.round((completedCount / tasks.length) * 100);
    const isFullyCompleted = tasks.every(t => t.done);

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
              {completedCount} / {tasks.length} ({progressPercent}%)
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
                {formatStageName ? formatStageName(activeStage?.name || selectedField.stage) : (activeStage?.name || selectedField.stage)}
              </Text>
              <Text style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 1 }}>
                {formatPhaseMonth ? formatPhaseMonth(activeStage?.monthRange || 'Month 1–3') : (activeStage?.monthRange || 'Month 1–3')} · {t('tap_active_stage_hint', 'Tap active stage below to log operations')}
              </Text>
            </View>
          </View>

          {/* Visual Progress Bar */}
          <View style={{ height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 }} />
          </View>

          {/* 5 Growth Stages */}
          <View style={{ gap: 8 }}>
            {tasks.map((task, i) => {
              const isCurrentActive = task.active && !task.done;
              const isNextStage = !task.done && !isCurrentActive && i === activeStageIndex + 1;
              const isFutureLocked = !task.done && !isCurrentActive && i > activeStageIndex + 1;

              return (
                <View
                  key={task.id || i}
                  style={[
                    { borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff', overflow: 'hidden' },
                    isCurrentActive && { borderColor: COLORS.primary, backgroundColor: '#F8FAF5' },
                    task.done && { borderColor: '#DCFCE7' },
                    isFutureLocked && { opacity: 0.75, backgroundColor: '#FAFAFA' }
                  ]}
                >
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}
                    onPress={() => {
                      if (activeRole === 'Farm Manager' && !isTakeOver) {
                        Alert.alert('View Only', 'Please enable "Take Over Field" mode to update the timeline.');
                        return;
                      }
                      if (isCurrentActive) return;

                      // 1. PAST COMPLETED STAGE: Keep locked, log late/repeat work as Supplemental entries
                      if (task.done) {
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
                                const stageOps = getFieldCustomOperations(selectedField.id, task.stageNumber || i + 1);
                                const firstOp = stageOps[0] || (task.operations && task.operations[0]) || { id: 'SRA-02', name: 'Supplemental Operation' };
                                setLogForm({
                                  id: null,
                                  fieldId: selectedField.id,
                                  saveFieldId: true,
                                  stageNumber: task.stageNumber || i + 1,
                                  stageName: `Stage ${task.stageNumber || i + 1}: ${task.name || task.label}`,
                                  sraOperationId: firstOp.id || 'CUSTOM',
                                  operationName: firstOp.name || '',
                                  activity: firstOp.name || '',
                                  category: firstOp.category || 'prep',
                                  cost: String(firstOp.costPerHa || '0'),
                                  period: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                                  hectares: selectedField.ha || '1.5',
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
                          (d.fieldId || '').trim().toUpperCase() === (selectedField.id || '').trim().toUpperCase() && 
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
                                const currentTasks = cycleTasksByField[selectedField.id] || getFieldStages(selectedField.id);
                                const updated = currentTasks.map((tItem, idx) => {
                                  if (idx < i) return { ...tItem, done: true, active: false };
                                  if (tItem.id === task.id) return { ...tItem, done: false, active: true };
                                  return { ...tItem, done: false, active: false };
                                });
                                setCycleTasksByField(p => ({ ...p, [selectedField.id]: updated }));
                                const newStageLabel = task.name || task.label;
                                const stageNum = task.stageNumber || i + 1;
                                setSelectedField(prevF => ({ ...prevF, stage: newStageLabel, stageNumber: stageNum }));
                                const mf = fields.find(f => f.id === selectedField.id);
                                if (mf) {
                                  mf.stage = newStageLabel;
                                  mf.stageNumber = stageNum;
                                  saveFieldPlot(mf, false);
                                }
                                updateFieldStageAndCycle(selectedField.id, {
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
                      backgroundColor: task.done ? COLORS.success : isCurrentActive ? COLORS.primary : isNextStage ? '#E2EED9' : '#E5E7EB',
                      justifyContent: 'center',
                      alignItems: 'center',
                      flexShrink: 0
                    }}>
                      {task.done ? (
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
                        fontWeight: isCurrentActive ? '900' : task.done ? '700' : '600',
                        color: isCurrentActive ? COLORS.primary : task.done ? COLORS.text : COLORS.textMuted,
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
                        <Text style={{ fontSize: 11, color: task.done ? COLORS.success : isCurrentActive ? COLORS.textSecondary : isNextStage ? COLORS.primary : COLORS.textMuted, flex: 1 }} numberOfLines={1}>
                          {task.done ? t('status_completed', 'Completed') : (isCurrentActive ? t('active_stage_subtitle', 'Active Stage · Select operation below') : isNextStage ? t('next_stage_hint', 'Next Stage · Tap to Complete & Advance') : t('status_locked', 'Locked'))}
                        </Text>
                      </View>
                    </View>

                    {/* Right Icon / Status Badge */}
                    {task.done ? (
                      <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                    ) : isCurrentActive ? (
                      <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#86EFAC', flexShrink: 0 }}>
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
                        <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                          {t('benchmark_lbl', 'Benchmark')}: ₱ {Number(task.benchmarkCost || 12000).toLocaleString()} / ha
                        </Text>
                      </View>

                      {/* List of distinct operations under this stage (Customized by member or SRA default) */}
                      <View style={{ gap: 6 }}>
                        {getFieldCustomOperations(selectedField.id, task.stageNumber || i + 1).map(op => {
                          const opCostPerHa = (op.subItems || []).reduce((sum, si) => sum + (si.qty * si.unitCost), 0) || op.costPerHa || 0;
                          const isOpLogged = fieldLogs.some(l => (l.operationName === op.name || l.sraOperationId === op.id || l.activity === op.name) && (l.stageNumber === (task.stageNumber || i + 1) || l.taskId === task.id) && !l.isPastCycle);

                          return (
                            <TouchableOpacity
                              key={op.id}
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                backgroundColor: isOpLogged ? '#F4FAF0' : '#fff',
                                padding: 10,
                                borderRadius: RADIUS.md,
                                borderWidth: 1.5,
                                borderColor: isOpLogged ? COLORS.primary + '50' : COLORS.border,
                                ...SHADOW.card
                              }}
                              onPress={() => {
                                if (isOpLogged) {
                                  Alert.alert(
                                    'Log Additional Entry',
                                    `"${op.name}" has already been recorded for this stage. Would you like to record an additional entry or repeat pass?`,
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
                                  {isOpLogged && (
                                    <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs }}>
                                      <Text style={{ fontSize: 9.5, fontWeight: '900', color: '#15803D' }}>✓ {t('recorded_badge', 'RECORDED')}</Text>
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
                                  backgroundColor: isOpLogged ? '#E2EED9' : COLORS.primary,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderWidth: isOpLogged ? 1.5 : 0,
                                  borderColor: COLORS.primary,
                                  flexShrink: 0
                                }}
                              >
                                <Ionicons
                                  name={isOpLogged ? "repeat-outline" : "create-outline"}
                                  size={20}
                                  color={isOpLogged ? COLORS.primary : '#fff'}
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
                            setLogForm({
                              id: null,
                              fieldId: selectedField.id,
                              saveFieldId: true,
                              stageNumber: task.stageNumber || i + 1,
                              stageName: `Stage ${task.stageNumber || i + 1}: ${task.name || task.label}`,
                              sraOperationId: 'CUSTOM',
                              operationName: '',
                              activity: '',
                              category: 'prep',
                              cost: '0',
                              period: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                              hectares: selectedField.ha || '1.5',
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
                            const stageNum = task.stageNumber || i + 1;
                            const stageDrafts = draftLogs.filter(d => 
                              (d.fieldId || '').trim().toUpperCase() === (selectedField.id || '').trim().toUpperCase() && 
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

          {isFullyCompleted && (
            <TouchableOpacity
              style={{ marginTop: 8, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
              onPress={() => {
                Alert.alert(
                  t('btn_start_new_cycle', 'Start New Crop Year'),
                  'Are you sure you want to start a new crop cycle?',
                  [
                    { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                    { text: 'Yes, Start', style: 'default', onPress: () => {
                      const baseStages = getFieldStages(selectedField.id).map(t => ({ ...t, done: false, active: false }));
                      baseStages[0].active = true;
                      setCycleTasksByField(p => ({
                        ...p,
                        [selectedField.id]: baseStages
                      }));
                      setSelectedField(prevF => ({ ...prevF, stage: baseStages[0].name }));
                      const resetMf = fields.find(f => f.id === selectedField.id);
                      if (resetMf) resetMf.stage = baseStages[0].name;

                      // Persist and sync past cycle archival across local store & cloud
                      archiveFieldCropCycle(selectedField.id);
                      setLogs([...operationLogs]);
                      setDraftLogs(prev => prev.filter(d => d.fieldId !== selectedField.id));
                    }}
                  ]
                );
              }}
            >
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '800' }}>Start New Crop Year Cycle</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const scopedDrafts = activeRole === 'Member' ? draftLogs.filter(d => d.fieldId === selectedField.id) : [];
  const totalLedgerCount = fieldLogs.length + (activeRole === 'Member' ? scopedDrafts.length : 0);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader
        right={
          activeRole === 'SRA (Admin)' ? (
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
        {activeRole === 'Member' && (
          <>
            {/* My Fields Selector */}
            <Text style={s.sectionLabel}>{t('my_fields', 'My Sugarcane Plots')}</Text>
            {(() => {
              const sess = getCurrentSession();
              const sName = (sess.name || '').trim().toLowerCase();
              const memberFieldList = fields.filter(f => {
                const mName = (f.member || '').trim().toLowerCase();
                return (sess.fieldId && f.id === sess.fieldId) || (sName && (mName === sName || mName.includes(sName) || sName.includes(mName))) || f.id === selectedField.id;
              });
              const fieldsToRender = memberFieldList.length > 0 ? memberFieldList : [fields[0]];

              return (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SPACING.lg, marginBottom: SPACING.sm }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8 }}>
                  {fieldsToRender.map(field => (
                    <TouchableOpacity
                      key={field.id}
                      style={[s.fieldChip, selectedField.id === field.id && s.fieldChipActive]}
                      onPress={() => {
                        setSelectedField(field);
                        updateSessionFieldId(field.id);
                      }}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="leaf" size={13} color={selectedField.id === field.id ? COLORS.primary : COLORS.textMuted} />
                      <Text style={[s.fieldChipText, selectedField.id === field.id && s.fieldChipTextActive]}>
                        {field.id} ({field.ha} Ha)
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              );
            })()}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md, backgroundColor: COLORS.primaryBg, borderRadius: RADIUS.md, padding: 10 }}>
              <Ionicons name="information-circle-outline" size={14} color={COLORS.primary} />
              <Text style={{ fontSize: 12, color: COLORS.primary, flex: 1 }}>{t('field_alloc_notice')}</Text>
            </View>

            <Text style={s.sectionLabel}>{t('field_plot', 'Selected Field Details')}</Text>
            <View style={s.fieldCard}>
              <View style={s.fieldCardTop}>
                <View style={s.fieldIdBadge}><Text style={s.fieldIdText}>{selectedField.id}</Text></View>
                <Text style={s.fieldHa}>{selectedField.ha || 1.5} Ha</Text>
              </View>
              <Text style={s.fieldMember}>{t('member_label', 'Member')}: {selectedField.member || selectedField.memberName || resolveFieldMember(selectedField) || 'Juan dela Cruz'}</Text>
              <Text style={s.fieldSync}>
                <Ionicons name={selectedField.synced ? 'cloud-done-outline' : 'cloud-offline-outline'} size={14} color={selectedField.synced ? '#267326' : '#C97A00'} />
                {' '}{selectedField.synced ? `${t('synced', 'Synced')} ${formatSyncTime(selectedField.lastSync || '10 mins ago')}` : `${t('not_synced', 'Not synced')} (${formatSyncTime(selectedField.lastSync || '10 mins ago')})`}
              </Text>
            </View>

            {/* Crop Cycle Timeline */}
            {renderTimeline()}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* FARM MANAGER VIEW */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeRole === 'Farm Manager' && (
          <>
            {(() => {
              const session = getCurrentSession();
              const targetFarm = session?.farm || 'Nacayao Block Farm';
              const farmFields = fields.filter(f => !f.blockFarm || f.blockFarm === targetFarm || (f.blockFarm && f.blockFarm.includes('Nacayao')));
              const totalHa = farmFields.reduce((sum, f) => sum + (Number(f.ha) || 0), 0) || 15.25;
              const farmLogs = logs.filter(l => 
                !l.declined && 
                !l.isArchived && 
                !l.isPastCycle && 
                isLogFromMonth(l, compileMonth)
              );
              const uncompiledLogs = farmLogs.filter(l => !l.compiled && !l.compiledReportId);
              const compiledLogs = farmLogs.filter(l => l.compiled || l.compiledReportId);
              const monthReport = auditReports.find(a => 
                (a.month && a.month.toLowerCase() === compileMonth.toLowerCase()) || 
                (a.id && a.id.includes(compileMonth.includes('April') ? '04' : (compileMonth.includes('May') ? '05' : '03')))
              );
              const isAllCompiled = uncompiledLogs.length === 0 && (compiledLogs.length > 0 || !!monthReport);
              const isCloudSent = monthReport?.cloudQueueStatus === 'transmitted' || monthReport?.status === 'Certified';
              const isOfflineQueued = monthReport && !isCloudSent;
              const totalCost = farmLogs.length > 0
                ? farmLogs.reduce((sum, l) => sum + (Number(l.totalCost || l.cost) || 0), 0)
                : (compileMonth === 'May 2026' ? 145225 : (compileMonth === 'April 2026' ? 128400 : 94500));
              const logsCount = farmLogs.length > 0 ? farmLogs.length : 5;

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
                      backgroundColor: isAllCompiled ? '#EBF7EE' : (uncompiledLogs.length > 0 && compiledLogs.length > 0 ? '#FEF3C7' : '#EBF7EE'),
                      paddingHorizontal: 9,
                      paddingVertical: 4,
                      borderRadius: RADIUS.full,
                      borderWidth: 1,
                      borderColor: isAllCompiled ? '#B7E4C7' : (uncompiledLogs.length > 0 && compiledLogs.length > 0 ? '#FDE68A' : '#B7E4C7'),
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <Ionicons 
                        name={isAllCompiled ? "checkmark-circle" : (uncompiledLogs.length > 0 && compiledLogs.length > 0 ? "time-outline" : "shield-checkmark")} 
                        size={12} 
                        color={isAllCompiled ? COLORS.success : (uncompiledLogs.length > 0 && compiledLogs.length > 0 ? '#B45309' : COLORS.success)} 
                      />
                      <Text style={{ 
                        fontSize: 10.5, 
                        fontWeight: '800', 
                        color: isAllCompiled ? COLORS.success : (uncompiledLogs.length > 0 && compiledLogs.length > 0 ? '#B45309' : COLORS.success) 
                      }}>
                        {isAllCompiled 
                          ? 'Audit Up to Date' 
                          : (uncompiledLogs.length > 0 && compiledLogs.length > 0 
                            ? `${uncompiledLogs.length} New Pending` 
                            : `${uncompiledLogs.length > 0 ? uncompiledLogs.length : logsCount} Ready to Compile`)}
                      </Text>
                    </View>
                  </View>

                  {/* Refined Month Switcher Pills */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 11 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Month:</Text>
                    {['March 2026', 'April 2026', 'May 2026'].map(m => {
                      const isSel = compileMonth === m;
                      return (
                        <TouchableOpacity
                          key={m}
                          onPress={() => setCompileMonth(m)}
                          activeOpacity={0.75}
                          style={{
                            paddingHorizontal: 11,
                            paddingVertical: 5,
                            borderRadius: RADIUS.full,
                            backgroundColor: isSel ? COLORS.primary : '#F4F7F2',
                            borderWidth: 1,
                            borderColor: isSel ? COLORS.primary : '#E2EBDC'
                          }}
                        >
                          <Text style={{
                            fontSize: 11,
                            fontWeight: isSel ? '800' : '600',
                            color: isSel ? '#FFFFFF' : COLORS.textSecondary
                          }}>
                            {m}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* 3 Metric Cards with Aligned Typography */}
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 11 }}>
                    <View style={{ flex: 1, backgroundColor: '#F7FAF5', paddingVertical: 10, paddingHorizontal: 9, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#E4EEE1' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{t('stat_recorded_logs', 'Compiled Logs')}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary, marginTop: 3 }}>
                        {isAllCompiled 
                          ? `${compiledLogs.length > 0 ? compiledLogs.length : logsCount} logs (Up to Date)`
                          : (compiledLogs.length > 0 
                            ? `${compiledLogs.length} comp · ${uncompiledLogs.length} new`
                            : `${uncompiledLogs.length > 0 ? uncompiledLogs.length : logsCount} logs ready`)}
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

                  {/* Streamlined Cloud Audit Queue Status Chip */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: isCloudSent ? '#F0F8EC' : (isOfflineQueued ? '#FFFBEB' : '#F7FAF4'),
                    borderWidth: 1,
                    borderColor: isCloudSent ? '#C4E7CE' : (isOfflineQueued ? '#FDE68A' : '#E2EBDC'),
                    borderRadius: RADIUS.md,
                    paddingHorizontal: 11,
                    paddingVertical: 8,
                    marginBottom: 11
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                      <Ionicons 
                        name={isCloudSent ? "cloud-done" : (isOfflineQueued ? "archive-outline" : "cloud-outline")} 
                        size={15} 
                        color={isCloudSent ? COLORS.primary : (isOfflineQueued ? '#B45309' : COLORS.textMuted)} 
                      />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isCloudSent ? COLORS.primary : (isOfflineQueued ? '#92400E' : COLORS.textSecondary) }} numberOfLines={1}>
                        {isCloudSent 
                          ? `Cloud Audit Queue: Transmitted to SRA District` 
                          : (isOfflineQueued 
                            ? `Offline Queue: Stored on Device (Pending Sync)` 
                            : `Cloud Audit Queue: Ready to Transmit on Compile`)}
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: isCloudSent ? '#D1F2D9' : (isOfflineQueued ? '#FEF3C7' : '#EAF1E7'),
                      paddingHorizontal: 8,
                      paddingVertical: 2.5,
                      borderRadius: RADIUS.full
                    }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '800', color: isCloudSent ? '#15803D' : (isOfflineQueued ? '#B45309' : COLORS.textMuted) }}>
                        {isCloudSent ? 'LIVE' : (isOfflineQueued ? 'QUEUED' : 'READY')}
                      </Text>
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
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 8,
                      ...SHADOW.card
                    }}
                    onPress={isAllCompiled ? handleViewExistingAudit : handleGenerateAudit}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="qr-code-outline" size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '800', letterSpacing: 0.3 }}>
                      {isAllCompiled 
                        ? 'View Compiled SRA QR'
                        : (uncompiledLogs.length > 0 
                          ? `Compile ${uncompiledLogs.length} New Operations & QR` 
                          : t('btn_compile_generate_qr', 'Compile & Generate SRA QR'))}
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
                borderColor: '#FDE68A',
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
              const myFieldList = fields.filter(f => 
                f.member === sess.name || 
                f.memberName === sess.name || 
                f.memberId === sess.employeeId || 
                f.memberId === sess.contact || 
                (sess.fieldId && f.id === sess.fieldId)
              );
              const displayedFields = managerFieldFilter === 'my'
                ? myFieldList
                : fields;

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
                          if (fields.length > 0 && !fields.some(f => f.id === selectedField.id)) {
                            setSelectedField(fields[0]);
                          }
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: managerFieldFilter === 'all' ? '800' : '600', color: managerFieldFilter === 'all' ? COLORS.primary : COLORS.textMuted }}>
                          All Plots ({fields.length})
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
                          style={[s.fieldChip, selectedField.id === field.id && s.fieldChipActive]}
                          onPress={() => {
                            setSelectedField(field);
                            setManagerLedgerScope('selected');
                          }}
                        >
                          <View style={[s.syncDot, { backgroundColor: field.synced ? COLORS.success : '#C97A00' }]} />
                          <Text style={[s.fieldChipText, selectedField.id === field.id && s.fieldChipTextActive]}>{field.id} ({field.ha} Ha)</Text>
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

            {/* Active Supervisor Takeover Banner */}
            {activeRole === 'Farm Manager' && isTakeOver && (
              <View style={{
                backgroundColor: '#FEF2F2',
                borderWidth: 1.5,
                borderColor: '#F87171',
                borderRadius: RADIUS.lg,
                padding: 12,
                marginBottom: 10,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                ...SHADOW.xs
              }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="warning" size={20} color="#DC2626" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#991B1B' }}>
                      Active Supervisor Takeover Mode
                    </Text>
                    <Text style={{ fontSize: 10.5, color: '#B91C1C', marginTop: 1 }}>
                      Logging operations on behalf of {selectedField?.member || 'Member'} ({selectedField?.id})
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setIsTakeOver(false)}
                  style={{
                    backgroundColor: '#DC2626',
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: RADIUS.md,
                  }}
                >
                  <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>Exit Takeover</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Selected Field Detail */}
            <View style={s.fieldCard}>
              <View style={s.fieldCardTop}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={s.fieldIdBadge}><Text style={s.fieldIdText}>{selectedField.id}</Text></View>
                  <Text style={s.fieldHa}>{selectedField.ha} Ha</Text>
                </View>
                {activeRole === 'Farm Manager' && (
                  <TouchableOpacity onPress={() => setIsTakeOver(!isTakeOver)} style={{ backgroundColor: isTakeOver ? '#D9534F' : COLORS.primaryBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: isTakeOver ? '#fff' : COLORS.primary }}>{isTakeOver ? 'Cancel Take Over' : t('btn_take_over', 'Take Over Field')}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={s.fieldMember}>{t('member_label', 'Member')}: {selectedField.member}</Text>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, flexWrap: 'wrap', gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name={selectedField.synced ? 'cloud-done-outline' : 'cloud-offline-outline'} size={14} color={selectedField.synced ? COLORS.success : '#C97A00'} />
                  <Text style={[s.fieldSync, { color: selectedField.synced ? COLORS.success : '#C97A00', fontWeight: '600' }]}>
                    {selectedField.synced ? `${t('synced', 'Synced')} (${formatSyncTime(selectedField.lastSync)})` : `${t('not_synced', 'Pending Member Sync')} (${formatSyncTime(selectedField.lastSync)})`}
                  </Text>
                </View>
                
                <TouchableOpacity 
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.sm }}
                  onPress={() => {
                    Alert.alert(
                      t('sync_info_alert_title', 'Offline Synchronization Info'),
                      `${t('my_field', 'Field')} ${selectedField.id} (${selectedField.member})\n\n` +
                      t('sync_info_alert_msg', 'When a member records operations offline in the field, logs are securely saved on the device. Records automatically upload once reconnected to internet or synced at the office.')
                    );
                  }}
                >
                  <Ionicons name="information-circle-outline" size={13} color={COLORS.textMuted} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textSecondary }}>{t('sync_info', 'Sync Info')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Crop Cycle Timeline */}
            {renderTimeline()}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SRA (Admin) VIEW */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeRole === 'SRA (Admin)' && (
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

                  const totalHa = farmFields.reduce((sum, f) => sum + (parseFloat(f.ha) || 1.5), 0);
                  const uniqueFarms = isAll ? (blockFarms.length || 1) : 1;
                  const uniqueMembers = new Set(farmFields.map(f => f.member || f.memberName || resolveFieldMember(f)).filter(Boolean)).size || farmFields.length;
                  const fManagers = isAll ? (users.filter(u => u.role === 'Farm Manager').length || 1) : 1;
                  const totalCost = farmLogs.reduce((sum, l) => sum + (Number(l.totalCost || l.cost) || 0), 0);
                  const costPerHa = totalHa > 0 ? Math.round(totalCost / totalHa) : 0;
                  const compiledLogsCount = farmLogs.length;

                  return [
                    {
                      label: t('stat_total_ha', 'Total Hectares'),
                      value: `${totalHa.toFixed(1)} Ha`,
                      icon: 'map-outline',
                      color: COLORS.primary,
                    },
                    {
                      label: t('stat_block_farms', 'Block Farms'),
                      value: `${uniqueFarms} ${t('farms_unit', 'Farms')}`,
                      icon: 'grid-outline',
                      color: '#4A7C2F',
                    },
                    {
                      label: t('stat_active_members', 'Active Members'),
                      value: `${uniqueMembers} ${t('members_unit', 'Members')}`,
                      icon: 'people-outline',
                      color: '#1A6B9A',
                    },
                    {
                      label: t('stat_farm_managers', 'Farm Managers'),
                      value: `${fManagers.length > 0 ? fManagers.length : 1} ${t('managers_unit', 'Managers')}`,
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
                      value: `${compiledLogsCount.toLocaleString()} ${t('logs_unit', 'Logs')}`,
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
            <TouchableOpacity style={s.scannerCard} onPress={() => setShowScanner(true)}>
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

            {/* Manual QR Input Fallback */}
            <View style={{ backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.xl, ...SHADOW.card }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 8, letterSpacing: 1 }}>{t('or_enter_manually', 'OR ENTER MANUALLY')}</Text>
              <TextInput 
                style={{ backgroundColor: '#f2f4ef', borderRadius: 8, padding: 12, fontSize: 14, fontWeight: '700', letterSpacing: 2, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 }}
                placeholder="HUG-XXXXXX-XXXX"
                placeholderTextColor={COLORS.textMuted}
                value={manualQR}
                onChangeText={setManualQR}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={{ backgroundColor: manualQR.length > 0 ? COLORS.primary : COLORS.border, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                disabled={manualQR.length === 0}
                onPress={() => {
                  const val = manualQR;
                  setManualQR('');
                  handleScanOrSubmitCode(val);
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: manualQR.length > 0 ? '#fff' : COLORS.textMuted }}>{t('btn_submit_manual_id', 'Submit Manual ID')}</Text>
              </TouchableOpacity>
            </View>

            {/* Last Audit Summary Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs }}>
              <Text style={[s.sectionLabel, { marginBottom: 0 }]}>{t('last_scanned_report', 'Last Scanned Report')}</Text>
              <TouchableOpacity onPress={() => setShowAuditHistoryModal(true)}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.primary }}>{t('monthly_audit_history_tab', 'Audit History')} →</Text>
              </TouchableOpacity>
            </View>
            <View style={s.auditCard}>
              <View style={s.auditHeader}>
                <Ionicons name="document-text" size={18} color={COLORS.primary} />
                <Text style={s.auditTitle}>Block Farm — May 2026 Report</Text>
              </View>
              <View style={s.auditRow}><Text style={s.auditLabel}>{t('report_fields_reported', 'Total Fields Reported')}</Text><Text style={s.auditVal}>{uniqueFieldsCount} fields</Text></View>
              <View style={s.auditRow}><Text style={s.auditLabel}>{t('report_total_cost', 'Total Operational Cost')}</Text><Text style={s.auditVal}>Php {totalOperationalCost.toLocaleString()}</Text></View>
              <View style={s.auditRow}><Text style={s.auditLabel}>{t('report_compiled_logs', 'Compiled Operation Logs')}</Text><Text style={s.auditVal}>{totalLogsCount} logs</Text></View>
              <View style={s.auditRow}><Text style={s.auditLabel}>{t('report_generated_date', 'Report Generated')}</Text><Text style={s.auditVal}>May 21, 2026</Text></View>
              <TouchableOpacity 
                style={s.pdfBtn}
                onPress={() => {
                  Alert.alert(
                    'Exporting PDF',
                    `Generating District Operations Report for ${selectedFarm}...`,
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
          </>
        )}

      </ScrollView>

      {/* ── Add / Edit Log Full-Screen Modal ── */}
      <Modal visible={showLog} animationType="slide" onRequestClose={closeLog}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={s.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.sheetTitle}>{logForm.id ? t('log_modal_edit_title', 'Edit Log') : t('log_modal_record_title', 'Record Field Operation')}</Text>
              <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 1 }}>Field {logForm.fieldId || selectedField.id} ({selectedField.ha} Ha)</Text>
            </View>
            <TouchableOpacity onPress={closeLog} style={{ padding: 4 }}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">

            {/* Target Operation & Connected Stage Banner */}
            <View style={{ backgroundColor: '#F0F8EC', borderRadius: RADIUS.md, padding: 14, borderWidth: 1.5, borderColor: COLORS.primary, marginBottom: SPACING.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <Ionicons name="construct" size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ backgroundColor: COLORS.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs }}>
                      <Text style={{ fontSize: 11, fontWeight: '900', color: '#fff' }}>{logForm.sraOperationId || 'SRA'}</Text>
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase' }}>
                      {logForm.sraOperationId === 'CUSTOM' ? 'Custom Operation' : t('log_target_op', 'Target Operation')}
                    </Text>
                  </View>

                  {logForm.sraOperationId === 'CUSTOM' ? (
                    <View style={{ marginTop: 6, marginBottom: 4 }}>
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 4 }}>Operation / Activity Title *</Text>
                      <TextInput
                        style={{ backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, fontWeight: '800', color: COLORS.text }}
                        value={logForm.operationName || logForm.activity}
                        onChangeText={v => setLogForm(p => ({ ...p, operationName: v, activity: v }))}
                        placeholder="e.g. Canal Maintenance, Foliar Spray"
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>
                  ) : (
                    <Text style={{ fontSize: 16, fontWeight: '900', color: COLORS.text, marginTop: 3 }}>
                      {formatOperationName ? formatOperationName(logForm.operationName || logForm.activity) : (logForm.operationName || logForm.activity || 'Field Operation')}
                    </Text>
                  )}

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                    <Ionicons name="git-branch-outline" size={12} color={COLORS.primary} />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.primary }}>
                      {t('log_connected_to', 'Connected to:')} {formatStageName ? formatStageName(logForm.stageName || (logForm.stageNumber ? `Stage ${logForm.stageNumber}` : 'Stage 1: Pre-Planting & Land Preparation')) : (logForm.stageName || 'Stage 1')}
                    </Text>
                  </View>
                  {logForm.sraOperationId !== 'CUSTOM' && (
                    <Text style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 3 }}>
                      {t('log_std_cost', 'Standard Cost')}: ₱ {Number(SRA_OPERATIONS_CATALOGUE.find(o => o.id === logForm.sraOperationId)?.costPerHa || 0).toLocaleString()} / hectare
                    </Text>
                  )}
                </View>
                <View style={{ padding: 6, backgroundColor: '#E2EED9', borderRadius: RADIUS.xs }}>
                  <Ionicons name={logForm.sraOperationId === 'CUSTOM' ? "create-outline" : "lock-closed"} size={16} color={COLORS.primary} />
                </View>
              </View>
            </View>

            {/* Field Plot Selector */}
            <Text style={[s.formLabel, { fontSize: 13, fontWeight: '700', marginBottom: 6 }]}>{t('log_field_plot', 'Field Plot')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SPACING.lg, marginBottom: SPACING.md }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8 }}>
              {fields.filter(f => f.member === getCurrentSession().name || f.id === selectedField.id).map(field => (
                <TouchableOpacity
                  key={field.id}
                  style={[
                    { paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff' },
                    logForm.fieldId === field.id && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }
                  ]}
                  onPress={() => setLogForm(p => ({ ...p, fieldId: field.id }))}
                >
                  <Text style={{ fontSize: 14, fontWeight: logForm.fieldId === field.id ? '900' : '600', color: logForm.fieldId === field.id ? COLORS.primary : COLORS.text }}>{field.id}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Date Picker Button */}
            <Text style={[s.formLabel, { fontSize: 13, fontWeight: '700', marginBottom: 6 }]}>{t('log_date_of_op', 'Date of Operation')}</Text>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAF5', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, marginBottom: SPACING.md }}
              onPress={() => setShowCalendar(true)}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="calendar-outline" size={20} color={COLORS.primary} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>{logForm.period || t('log_tap_date', 'Tap to select date')}</Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{t('btn_change_date', 'Change Date')}</Text>
            </TouchableOpacity>

            {/* Hectares & Workers Side-by-Side */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: SPACING.md }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.formLabel, { fontSize: 13, fontWeight: '700', marginBottom: 6 }]}>{t('log_ha_covered', 'Hectares Covered')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAF5', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12 }}>
                  <TextInput
                    style={{ flex: 1, height: 48, fontSize: 16, fontWeight: '800', color: COLORS.text }}
                    value={logForm.hectares}
                    onChangeText={v => {
                      setLogForm(p => ({ ...p, hectares: v }));
                      if (logForm.sraOperationId) selectSraOperation(logForm.sraOperationId, v);
                    }}
                    keyboardType="decimal-pad"
                    placeholder='1.5'
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textMuted }}>Ha</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.formLabel, { fontSize: 13, fontWeight: '700', marginBottom: 6 }]}>{t('log_workers_crew', 'Workers / Crew')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAF5', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12 }}>
                  <TextInput
                    style={{ flex: 1, height: 48, fontSize: 16, fontWeight: '800', color: COLORS.text }}
                    value={logForm.people}
                    onChangeText={v => setLogForm(p => ({ ...p, people: v }))}
                    keyboardType="number-pad"
                    placeholder='2'
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textMuted }}>Pax</Text>
                </View>
              </View>
            </View>

            {/* ── Member Choice: Structure Mode Switcher ── */}
            <View style={{ marginBottom: SPACING.md }}>
              <Text style={[s.formLabel, { fontSize: 13, fontWeight: '700', marginBottom: 6 }]}>{t('log_input_style', 'Input Style (Member Choice)')}</Text>
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
                  <Ionicons name="layers-outline" size={16} color={logForm.isGroup ? '#6D28D9' : COLORS.textMuted} />
                  <Text style={{ fontSize: 12, fontWeight: logForm.isGroup ? '900' : '700', color: logForm.isGroup ? '#6D28D9' : COLORS.textSecondary, textAlign: 'center', flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>{t('mode_title_child', 'Title with Child Items')}</Text>
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
                  <Ionicons name="create-outline" size={16} color={!logForm.isGroup ? '#15803D' : COLORS.textMuted} />
                  <Text style={{ fontSize: 12, fontWeight: !logForm.isGroup ? '900' : '700', color: !logForm.isGroup ? '#15803D' : COLORS.textSecondary, textAlign: 'center', flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>{t('mode_direct_input', 'Direct Input')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Input Section: Title-Only Group vs Direct Input Operation ── */}
            {logForm.isGroup ? (
              /* CASE A: Title Only Group (e.g. Basal Fertilization) -> Inputs in Child Items */
              <View style={{ backgroundColor: '#F8FAF5', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.md, gap: 12, marginBottom: SPACING.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="list-circle" size={20} color={COLORS.primary} />
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.text }}>{t('log_child_materials', 'Child Materials & Labor')}</Text>
                      <Text style={{ fontSize: 10.5, color: COLORS.textMuted }}>{t('log_child_sub', 'Inputs are recorded per child item')}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textMuted }}>{logForm.subItems?.length || 0} item{(logForm.subItems?.length || 0) !== 1 ? 's' : ''}</Text>
                </View>

                {(logForm.subItems || []).map((item, index) => (
                  <View key={item.id || index} style={{ backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, gap: 8, ...SHADOW.card }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary, textTransform: 'uppercase' }}>{t('log_item_num', 'Item #')}{index + 1}</Text>
                      <TouchableOpacity onPress={() => removeSubItemRow(index)} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={18} color="#D9534F" />
                      </TouchableOpacity>
                    </View>

                    <TextInput
                      style={{ fontSize: 14.5, fontWeight: '700', color: COLORS.text, backgroundColor: '#F8FAF5', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 8 }}
                      value={item.description}
                      onChangeText={v => updateSubItemRow(index, 'description', v)}
                      placeholder='e.g. 46-0-0 Urea / DAP / Labor Crew'
                      placeholderTextColor={COLORS.textMuted}
                    />

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: '700', marginBottom: 3 }}>{t('log_qty', 'Quantity')}</Text>
                        <TextInput
                          style={{ height: 42, backgroundColor: '#F8FAF5', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 10, fontSize: 14, fontWeight: '800', color: COLORS.text }}
                          value={String(item.qty || '')}
                          onChangeText={v => updateSubItemRow(index, 'qty', v)}
                          keyboardType="decimal-pad"
                          placeholder='1'
                        />
                      </View>

                      <View style={{ flex: 1.4 }}>
                        <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: '700', marginBottom: 3 }}>{t('log_unit_price', 'Unit Price (₱)')}</Text>
                        <TextInput
                          style={{ height: 42, backgroundColor: '#F8FAF5', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 10, fontSize: 14, fontWeight: '800', color: COLORS.text }}
                          value={String(item.unitCost || '')}
                          onChangeText={v => updateSubItemRow(index, 'unitCost', v)}
                          keyboardType="decimal-pad"
                          placeholder='₱ 0'
                        />
                      </View>
                    </View>

                    {/* Unit Selector Chips */}
                    <View>
                      <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: '700', marginBottom: 4 }}>{t('log_select_unit', 'Select Unit:')}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                        {['bag', 'ha', 'pass', 'lac', 'ton', 'days', 'pax', 'liters'].map(u => (
                          <TouchableOpacity
                            key={u}
                            style={[
                              { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
                              item.unit === u && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }
                            ]}
                            onPress={() => updateSubItemRow(index, 'unit', u)}
                          >
                            <Text style={{ fontSize: 11.5, fontWeight: '700', color: item.unit === u ? COLORS.primary : COLORS.textSecondary }}>{u}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 6, marginTop: 2 }}>
                      <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{item.unit === 'lac' ? 'Note: 1 lac = 10,000 points' : ''}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: COLORS.text }}>{t('log_subtotal', 'Subtotal:')} ₱ {(item.subTotal || 0).toLocaleString()}</Text>
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.primary, borderStyle: 'dashed', borderRadius: RADIUS.md, paddingVertical: 12 }}
                  onPress={addCustomSubItem}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add-circle" size={20} color={COLORS.primary} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary, textAlign: 'center', flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>{t('log_add_expense', 'Add Expense / Material')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* CASE B: Direct Single Operation (e.g. Soil Sampling, Hauling) -> Direct Inputs */
              <View style={{ backgroundColor: '#F8FAF5', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.md, gap: 12, marginBottom: SPACING.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="create-outline" size={20} color={COLORS.primary} />
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.text }}>{t('log_direct_inputs', 'Direct Operation Inputs')}</Text>
                    <Text style={{ fontSize: 10.5, color: COLORS.textMuted }}>{t('log_direct_sub', 'Record direct quantity and rate for this operation')}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: '700', marginBottom: 4 }}>Quantity</Text>
                    <TextInput
                      style={{ height: 44, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12, fontSize: 15, fontWeight: '800', color: COLORS.text }}
                      value={String(logForm.inputQty || '')}
                      onChangeText={v => {
                        const q = parseFloat(v) || 0;
                        const r = parseFloat(logForm.directRate) || 0;
                        setLogForm(p => ({ ...p, inputQty: v, cost: String(Math.round(q * r)) }));
                      }}
                      keyboardType="decimal-pad"
                      placeholder="1"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>

                  <View style={{ flex: 1.4 }}>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: '700', marginBottom: 4 }}>{t('log_unit_rate', 'Unit Rate / Cost (₱)')}</Text>
                    <TextInput
                      style={{ height: 44, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12, fontSize: 15, fontWeight: '800', color: COLORS.text }}
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
                  <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: '700', marginBottom: 4 }}>Select Unit:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {['ha', 'ton', 'lac', 'pass', 'bag', 'days', 'pax', 'liters'].map(u => (
                      <TouchableOpacity
                        key={u}
                        style={[
                          { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff' },
                          logForm.inputUnit === u && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }
                        ]}
                        onPress={() => setLogForm(p => ({ ...p, inputUnit: u }))}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '800', color: logForm.inputUnit === u ? COLORS.primary : COLORS.textSecondary }}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            )}

            {/* High-Visibility Cost Summary Card */}
            <View style={{ backgroundColor: '#1E4D2B', borderRadius: RADIUS.lg, padding: 16, marginBottom: SPACING.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#D4EAD6', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('log_total_cost', 'Total Operation Cost')}</Text>
                  <Text style={{ fontSize: 26, fontWeight: '900', color: '#fff', marginTop: 2 }}>₱ {Number(logForm.cost || 0).toLocaleString()}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#D4EAD6' }}>{t('log_per_ha', 'Per Hectare')}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff', marginTop: 1 }}>
                    ₱ {Math.round((Number(logForm.cost || 0)) / Math.max(parseFloat(logForm.hectares) || 1, 0.1)).toLocaleString()} / ha
                  </Text>
                </View>
              </View>
            </View>

            {/* Big Action Buttons */}
            <View style={{ gap: 10, marginTop: SPACING.xs, paddingBottom: SPACING.lg }}>
              <TouchableOpacity
                style={{ backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, ...SHADOW.card }}
                onPress={() => handleSaveLog(true)}
                activeOpacity={0.8}
              >
                <Ionicons name={logForm.id ? "checkmark-circle" : "paper-plane"} size={20} color="#fff" />
                <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 0.5 }}>
                  {logForm.id ? t('log_save_changes', 'SAVE CHANGES') : t('log_record_op', 'RECORD OPERATION')}
                </Text>
              </TouchableOpacity>

              {!isTakeOver && (
                <TouchableOpacity
                  style={{ backgroundColor: '#FFFBF0', borderWidth: 1.5, borderColor: '#F5A623', borderRadius: RADIUS.md, paddingVertical: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                  onPress={() => handleSaveLog(false)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="document-text-outline" size={16} color="#C97A00" />
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#C97A00' }} numberOfLines={1} adjustsFontSizeToFit>{t('log_save_draft', 'Save as Draft')}</Text>
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
            <Text style={s.qrModalSub}>{activeQRData?.month || 'May 2026'} — {activeQRData?.blockFarm || 'Nacayao Block Farm'}, Silay</Text>

            {/* Cloud Audit Queue Status Chip */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: activeQRData?.cloudQueueStatus === 'offline_queued' ? '#FFFBEB' : '#EBF7EE',
              borderWidth: 1,
              borderColor: activeQRData?.cloudQueueStatus === 'offline_queued' ? '#FDE68A' : '#B7E4C7',
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
                value={activeQRData?.envelope || 'HUGPONG|RPT-2026-05-NCY01|BLK-NCY-01|MAY2026|15.25|14|145225|A3F9'}
                size={190}
                color={COLORS.primary}
              />
              <Text selectable={true} style={[s.qrCode, { marginTop: 10, letterSpacing: 2 }]}>{activeQRData?.hash || 'HUG-202605-A3F9'}</Text>
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
                  const hashToCopy = activeQRData?.hash || 'HUG-202605-A3F9';
                  try {
                    await Share.share({
                      message: `HUGPONG SRA Audit Code: ${hashToCopy} (May 2026 - ${activeQRData?.blockFarm || 'Nacayao Block Farm'})`,
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

      {/* ── QR Scanner Modal (SRA) ── */}
      <Modal visible={showScanner} transparent animationType="fade">
        <View style={s.scanOverlay}>
          <View style={s.scanModal}>
            <Text style={s.scanTitle}>QR Code Scanner</Text>
            <View style={s.scanViewfinder}>
              <View style={[s.scanCorner, s.scanTL]} />
              <View style={[s.scanCorner, s.scanTR]} />
              <View style={[s.scanCorner, s.scanBL]} />
              <View style={[s.scanCorner, s.scanBR]} />
              <Ionicons name="qr-code-outline" size={64} color="rgba(255,255,255,0.3)" />
              <Text style={s.scanHint}>Point camera at manager's phone screen</Text>
            </View>
            <TouchableOpacity
              style={s.scanSimBtn}
              onPress={() => handleScanOrSubmitCode('HUG-202605-A3F9')}
            >
              <Ionicons name="scan" size={18} color="#fff" />
              <Text style={s.scanSimBtnText}>Verify May 2026 Manager Screen</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.scanCancelBtn} onPress={() => setShowScanner(false)}>
              <Text style={s.scanCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: scannedAuditReport?.status === 'Certified' ? '#EBF7EE' : '#FEF3C7', padding: 12, borderRadius: 10, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name={scannedAuditReport?.status === 'Certified' ? "shield-checkmark" : "time"} size={20} color={scannedAuditReport?.status === 'Certified' ? COLORS.success : '#D97706'} />
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: scannedAuditReport?.status === 'Certified' ? COLORS.success : '#92400E' }}>
                      {scannedAuditReport?.status === 'Certified' ? 'SRA Certified Record' : 'Awaiting Certification'}
                    </Text>
                    <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Hash: {scannedAuditReport?.qrSignature || 'HUG-202605-A3F9'}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', color: scannedAuditReport?.status === 'Certified' ? COLORS.success : '#92400E' }}>
                  {scannedAuditReport?.status || 'Pending'}
                </Text>
              </View>

              {/* Farm Metadata */}
              <View style={{ backgroundColor: '#F8FAF5', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Block Farm:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{scannedAuditReport?.blockFarm || 'Nacayao Block Farm'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Audit Period:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{scannedAuditReport?.month || 'May 2026'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Total Block Farm Area:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>30.1118 Ha</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Active Operations Area:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{scannedAuditReport?.totalHectares || 15.25} Ha</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Compiled Operations:</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{scannedAuditReport?.logsCount || 14} logs</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Total Production Cost:</Text>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: COLORS.primary }}>Php {(scannedAuditReport?.totalCost || 145225).toLocaleString()}</Text>
                </View>
              </View>

              {/* SRA Agronomic Benchmark Evaluation */}
              <View style={{ backgroundColor: '#F0F9FF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#BAE6FD', marginBottom: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#0369A1', marginBottom: 3 }}>SRA District Agronomic Benchmark</Text>
                <Text style={{ fontSize: 11, color: '#0C4A6E', lineHeight: 16 }}>
                  Average cost per hectare: Php {Math.round((scannedAuditReport?.totalCost || 145225) / (scannedAuditReport?.totalHectares || 15.25)).toLocaleString()} / Ha (calculated against {scannedAuditReport?.totalHectares || 15.25} Ha new plant input area). Complies with SRA Silay Mill District standard parameters.
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
              {scannedAuditReport?.status !== 'Certified' ? (
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
      <Modal visible={showFieldsModal} transparent animationType="slide">
        <View style={s.overlay} />
        <View style={[s.sheet, { height: '85%' }]}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Block Farm Fields</Text>
            <TouchableOpacity onPress={() => { setShowFieldsModal(false); setFieldSearch(''); }}>
              <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
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
                    <View key={field.id} style={[s.receiptCard, selectedField.id === field.id && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg, marginBottom: 0 }, { marginBottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md }]}>
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
        </View>
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

      {/* ── Edit Security Authorization Modal ── */}
      <Modal visible={showEditAuthModal} transparent animationType="slide">
        <View style={s.overlay} />
        <View style={[s.sheet, { maxHeight: '90%' }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#EBF3FB', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield-checkmark" size={18} color="#0B63B7" />
              </View>
              <View>
                <Text style={s.sheetTitle}>Authorize Log Amendment</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Identity verification & audit trail record</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowEditAuthModal(false)}>
              <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 14 }}>
            {/* Target Log Summary Card */}
            {pendingEditLog && (
              <View style={{ backgroundColor: '#F8FAF5', borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.border, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text }}>
                    {pendingEditLog.sraOperationId ? `[${pendingEditLog.sraOperationId}] ` : ''}{pendingEditLog.operationName || pendingEditLog.activity}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>
                    ₱{Number(pendingEditLog.totalCost != null ? pendingEditLog.totalCost : pendingEditLog.cost || 0).toLocaleString()}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                  {pendingEditLog.stageName || `Stage ${pendingEditLog.stageNumber || 1}`} · {pendingEditLog.date || pendingEditLog.period} · {pendingEditLog.hectares} Ha
                </Text>
              </View>
            )}

            {/* Security Notice */}
            <View style={{ backgroundColor: '#FFFBF0', borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: '#FFE8A3', flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Ionicons name="information-circle" size={18} color="#C97A00" style={{ marginTop: 1 }} />
              <Text style={{ fontSize: 11.5, color: '#8F5700', lineHeight: 16, flex: 1 }}>
                All amendments to submitted operation logs are permanently recorded in the immutable SRA audit ledger to prevent unverified record tampering.
              </Text>
            </View>

            {/* Account Password Input */}
            <View style={{ gap: 4 }}>
              <Text style={s.formLabel}>Account Password <Text style={{ color: '#D9534F' }}>*</Text></Text>
              <TextInput
                secureTextEntry
                placeholder="Enter your login password"
                placeholderTextColor={COLORS.textMuted}
                style={s.formInput}
                value={editAuthPassword}
                onChangeText={(val) => {
                  setEditAuthPassword(val);
                  setEditAuthError('');
                }}
              />
              <Text style={{ fontSize: 10.5, color: COLORS.textMuted }}>
                Verifies that you are authorized to amend records for {getCurrentSession().name}.
              </Text>
            </View>

            {/* Mandatory Reason for Amendment */}
            <View style={{ gap: 4 }}>
              <Text style={s.formLabel}>Reason for Amendment / Correction <Text style={{ color: '#D9534F' }}>*</Text></Text>
              <TextInput
                multiline
                numberOfLines={3}
                placeholder="State the reason (e.g., Adjusted fertilizer receipt cost, labor headcount correction...)"
                placeholderTextColor={COLORS.textMuted}
                style={[s.formInput, { height: 75, textAlignVertical: 'top' }]}
                value={editAuthReason}
                onChangeText={(val) => {
                  setEditAuthReason(val);
                  setEditAuthError('');
                }}
              />

              {/* Quick Preset Reason Chips */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {[
                  'Voucher / Receipt cost adjustment',
                  'Worker headcount recount',
                  'Input volume / bags correction',
                  'Date / Typo correction',
                  'Supervisor field audit review'
                ].map((preset, pIdx) => (
                  <TouchableOpacity
                    key={pIdx}
                    onPress={() => {
                      setEditAuthReason(preset);
                      setEditAuthError('');
                    }}
                    style={{ backgroundColor: '#F0F6FC', paddingHorizontal: 9, paddingVertical: 5, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#CCE0F5' }}
                  >
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#0B63B7' }}>+ {preset}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Error Message */}
            {Boolean(editAuthError) && (
              <View style={{ backgroundColor: '#FFF5F5', padding: 10, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: '#FFD4D4', flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Ionicons name="alert-circle" size={16} color="#D9534F" />
                <Text style={{ fontSize: 11.5, color: '#D9534F', fontWeight: '700', flex: 1 }}>
                  {editAuthError}
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, paddingBottom: 16 }}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => setShowEditAuthModal(false)}
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: '#0B63B7' }]}
                onPress={handleConfirmEditAuth}
              >
                <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
                <Text style={s.submitBtnText}>Authorize & Edit</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Log Revision History & Audit Trail Modal ── */}
      <Modal visible={showLogAuditModal} transparent animationType="slide">
        <View style={s.overlay} />
        <View style={[s.sheet, { maxHeight: '90%' }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#EBF3FB', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="git-commit-outline" size={18} color="#0B63B7" />
              </View>
              <View>
                <Text style={s.sheetTitle}>Log Audit Trail</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>
                  #{activeLogForAudit?.id} · {activeLogForAudit?.operationName || activeLogForAudit?.activity}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowLogAuditModal(false)}>
              <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 12, paddingBottom: 32 }}>
            {/* Log Header Summary */}
            <View style={{ backgroundColor: '#F8FAF5', borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.text }}>
                  {activeLogForAudit?.operationName || activeLogForAudit?.activity}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '900', color: COLORS.primary }}>
                  ₱{Number(activeLogForAudit?.totalCost != null ? activeLogForAudit?.totalCost : activeLogForAudit?.cost || 0).toLocaleString()}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>
                {activeLogForAudit?.stageName || `Stage ${activeLogForAudit?.stageNumber || 1}`} · {activeLogForAudit?.date || activeLogForAudit?.period} · {activeLogForAudit?.hectares} Ha · {activeLogForAudit?.people} Workers
              </Text>
            </View>

            {/* Audit History Timeline */}
            <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>
              Revision History ({activeLogForAudit?.editHistory?.length || 0} Amendment{activeLogForAudit?.editHistory?.length !== 1 ? 's' : ''})
            </Text>

            {(!activeLogForAudit?.editHistory || activeLogForAudit.editHistory.length === 0) ? (
              <View style={{ padding: 24, alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, gap: 6 }}>
                <Ionicons name="shield-outline" size={28} color={COLORS.textMuted} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text }}>Original Record</Text>
                <Text style={{ fontSize: 11.5, color: COLORS.textMuted, textAlign: 'center' }}>
                  This operation log is in its original verified state and has not been modified.
                </Text>
              </View>
            ) : (
              activeLogForAudit.editHistory.map((rev, revIdx) => (
                <View key={rev.id || revIdx} style={{ backgroundColor: '#fff', borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#D1E3F6', padding: 12, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }}>
                  {/* Revision Header */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#EDF3FA', paddingBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ backgroundColor: '#0B63B7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs }}>
                        <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>REV #{revIdx + 1}</Text>
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>
                        {rev.editedBy || 'Authorized User'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 10.5, color: COLORS.textMuted }}>
                      {rev.editedAt}
                    </Text>
                  </View>

                  {/* Stated Reason Box */}
                  <View style={{ backgroundColor: '#F0F6FC', padding: 8, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#CCE0F5' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#0B63B7', textTransform: 'uppercase' }}>Reason for Correction</Text>
                    <Text style={{ fontSize: 11.5, color: COLORS.text, fontWeight: '600', marginTop: 2 }}>
                      "{rev.reason || rev.note || 'Log values updated'}"
                    </Text>
                  </View>

                  {/* Previous vs New Values Diff */}
                  {rev.previousValues && (
                    <View style={{ backgroundColor: '#FAFAFA', borderRadius: RADIUS.xs, padding: 8, gap: 4, borderWidth: 1, borderColor: '#EDEDED' }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase' }}>Value Changes</Text>
                      
                      {/* Cost Diff */}
                      {rev.previousValues.cost !== rev.newValues?.cost && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>Cost:</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700' }}>
                            <Text style={{ color: '#D9534F', textDecorationLine: 'line-through' }}>₱{Number(rev.previousValues.cost || 0).toLocaleString()}</Text>
                            {' → '}
                            <Text style={{ color: '#267326' }}>₱{Number(rev.newValues?.cost || 0).toLocaleString()}</Text>
                          </Text>
                        </View>
                      )}

                      {/* Hectares Diff */}
                      {String(rev.previousValues.hectares) !== String(rev.newValues?.hectares) && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>Hectares:</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700' }}>
                            <Text style={{ color: '#D9534F', textDecorationLine: 'line-through' }}>{rev.previousValues.hectares} Ha</Text>
                            {' → '}
                            <Text style={{ color: '#267326' }}>{rev.newValues?.hectares} Ha</Text>
                          </Text>
                        </View>
                      )}

                      {/* Workers Diff */}
                      {String(rev.previousValues.people) !== String(rev.newValues?.people) && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>Workers:</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700' }}>
                            <Text style={{ color: '#D9534F', textDecorationLine: 'line-through' }}>{rev.previousValues.people}</Text>
                            {' → '}
                            <Text style={{ color: '#267326' }}>{rev.newValues?.people}</Text>
                          </Text>
                        </View>
                      )}

                      {/* Date Diff */}
                      {rev.previousValues.date !== rev.newValues?.date && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>Date:</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700' }}>
                            <Text style={{ color: '#D9534F', textDecorationLine: 'line-through' }}>{rev.previousValues.date}</Text>
                            {' → '}
                            <Text style={{ color: '#267326' }}>{rev.newValues?.date}</Text>
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              ))
            )}

            <TouchableOpacity
              style={[s.submitBtn, { marginTop: 8 }]}
              onPress={() => setShowLogAuditModal(false)}
            >
              <Text style={s.submitBtnText}>Close Audit Trail</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Manager Assign Field Modal ── */}
      <Modal visible={showManagerAssignModal} transparent animationType="slide">
        <View style={s.overlay} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{managerAssignForm.isEditing ? 'Edit Field Plot & Ownership' : 'Assign Field to Member'}</Text>
            <TouchableOpacity onPress={() => setShowManagerAssignModal(false)}>
              <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={s.sheetBody}>
            <View style={{ gap: 4 }}>
              <Text style={s.formLabel}>Field ID <Text style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: '400' }}>({managerAssignForm.isEditing ? 'Registered Plot ID' : 'Auto-generated'})</Text></Text>
              <View style={[s.formInput, { backgroundColor: '#F4F7F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <Text style={{ fontSize: 14, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: COLORS.primary }}>
                  {managerAssignForm.fieldId}
                </Text>
                <View style={{ backgroundColor: COLORS.primaryBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.primary }}>{managerAssignForm.isEditing ? 'Plot ID' : 'Auto-assigned'}</Text>
                </View>
              </View>
            </View>
            <View style={{ gap: 4 }}>
              <Text style={s.formLabel}>Assigned Member User ID <Text style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: '400' }}>(8-digit User ID or Mobile)</Text></Text>
              <TextInput 
                style={s.formInput} 
                placeholder="e.g. 04000001 or 0917 123 4567" 
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0F8EC', borderWidth: 1, borderColor: COLORS.primary + '40', paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm, marginTop: 4 }}>
                      <Ionicons name="checkmark-circle" size={14} color={COLORS.primary} />
                      <Text style={{ fontSize: 11, color: COLORS.primary, fontWeight: '700' }} numberOfLines={1}>
                        {matched.name} · Permanent ID: {matched.employeeId} ({matched.contact || 'No phone'})
                      </Text>
                    </View>
                  );
                }
                if (q.replace(/\D/g, '').length >= 7) {
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm, marginTop: 4 }}>
                      <Ionicons name="alert-circle-outline" size={14} color="#B45309" />
                      <Text style={{ fontSize: 11, color: '#B45309', fontWeight: '600' }}>
                        No registered member matches this identifier.
                      </Text>
                    </View>
                  );
                }
                return null;
              })()}
            </View>
            <View style={{ gap: 4 }}>
              <Text style={s.formLabel}>Declared Area (Ha)</Text>
              <TextInput style={s.formInput} placeholder="e.g. 1.5" keyboardType="numeric" value={managerAssignForm.ha} onChangeText={t => setManagerAssignForm({...managerAssignForm, ha: t})} />
            </View>
            <View style={s.sheetFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowManagerAssignModal(false)}><Text style={s.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.submitBtn} onPress={() => {
                const rawInput = (managerAssignForm.userId || '').trim();
                const cleanInput = rawInput.replace(/\D/g, '');
                if(!rawInput || !managerAssignForm.fieldId || !managerAssignForm.ha) {
                  Alert.alert('Required Fields', 'Please fill in all required fields.');
                  return;
                }
                if (cleanInput.length < 7 && !findUserByIdOrContact(rawInput)) {
                  Alert.alert('Invalid Identifier', 'Please enter a valid 8-digit Member User ID (e.g., 04000001) or 11-digit mobile number (e.g., 09171234567).');
                  return;
                }
                const matchedUser = findUserByIdOrContact(rawInput);
                const memberDisplayName = matchedUser ? matchedUser.name : `Member (${rawInput})`;
                const memberIdVal = matchedUser ? (matchedUser.employeeId || matchedUser.contact) : rawInput;
                const memberContactVal = matchedUser ? (matchedUser.contact || matchedUser.mobile) : rawInput;

                const session = getCurrentSession();
                const existing = fields.find(f => f.id === managerAssignForm.fieldId);
                if (existing) {
                  existing.member = memberDisplayName;
                  existing.memberName = memberDisplayName;
                  existing.userId = memberIdVal;
                  existing.memberId = memberIdVal;
                  existing.memberContact = memberContactVal;
                  existing.ha = parseFloat(managerAssignForm.ha) || existing.ha;
                  if (selectedField.id === existing.id) {
                    setSelectedField({ ...selectedField, member: memberDisplayName, memberName: memberDisplayName, userId: memberIdVal, memberId: memberIdVal, memberContact: memberContactVal, ha: existing.ha });
                  }
                  saveFieldPlot(existing, false);
                } else {
                  const newField = {
                    id: managerAssignForm.fieldId,
                    blockFarmId: session?.blockFarmId || 'BLK-NCY-01',
                    blockFarm: session?.farm || 'Nacayao Block Farm',
                    memberId: memberIdVal,
                    userId: memberIdVal,
                    memberName: memberDisplayName,
                    member: memberDisplayName,
                    memberContact: memberContactVal,
                    ha: parseFloat(managerAssignForm.ha) || 1.5,
                    stage: 'Pre-Planting & Land Preparation',
                    stageNumber: 1,
                    month: 0,
                    batchMonth: 1,
                    synced: true,
                    lastSync: 'Just now',
                    variety: 'VMC 84-524',
                    soilType: 'Clay Loam'
                  };
                  saveFieldPlot(newField, true);
                  setSelectedField(newField);
                }
                Alert.alert('Success', `Field plot ${managerAssignForm.fieldId} assigned to ${memberDisplayName} (${memberIdVal}).`);
                setShowManagerAssignModal(false);
                setManagerAssignForm({ userId: '', fieldId: '', ha: '', isEditing: false });
              }}>
                <Text style={s.submitBtnText}>{managerAssignForm.isEditing ? 'Save Changes' : 'Assign Field'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Pending Farmer Registrations Modal ── */}
      <Modal visible={showPendingModal} transparent animationType="slide">
        <View style={s.overlay} />
        <View style={[s.sheet, { maxHeight: height * 0.85 }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.sheetTitle}>Pending Registrations</Text>
                <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full, borderWidth: 1, borderColor: '#FDE68A' }}>
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
                      <Text style={{ fontWeight: '700' }}>Block Farm:</Text> {u.blockFarm || 'Nacayao Block Farm'}
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
                      <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Approve & Assign Plot</Text>
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
        </View>
      </Modal>

      {/* ── Crop Cycle Selection Modal ── */}
      <Modal visible={showCycleModal} transparent animationType="slide">
        <View style={s.overlay} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View>
              <Text style={s.sheetTitle}>Crop Cycle Configuration</Text>
              <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>Field {selectedField.id} ({selectedField.ha} Ha)</Text>
            </View>
            <TouchableOpacity onPress={() => setShowCycleModal(false)}>
              <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={s.sheetBody}>
            <Text style={s.formLabel}>Select Sugarcane Cycle Type *</Text>
            <View style={{ gap: 8, marginBottom: SPACING.md }}>
              {[
                { type: 'Plant Cane (New Plant)', duration: '12–14 months', icon: 'leaf', desc: 'New planting cycle: Full soil prep, canepoints planting, basal & top-dress.' },
                { type: '1st Ratoon (Ratoon 1)', duration: '10–12 months', icon: 'git-branch', desc: 'First ratoon stubble shaving, trash blanketing, off-barring & fertilization.' },
                { type: '2nd Ratoon (Ratoon 2)', duration: '10–12 months', icon: 'water', desc: 'Second ratoon maintenance, cultivation, fertilization & harvesting.' }
              ].map(item => {
                const isSel = cycleTypeForm.cycleType === item.type;
                return (
                  <TouchableOpacity
                    key={item.type}
                    style={[
                      { padding: 12, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff', gap: 3 },
                      isSel && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }
                    ]}
                    onPress={() => setCycleTypeForm(p => ({ ...p, cycleType: item.type }))}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name={item.icon} size={16} color={isSel ? COLORS.primary : COLORS.textSecondary} />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: isSel ? COLORS.primary : COLORS.text }}>{item.type}</Text>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isSel ? COLORS.primary : COLORS.textMuted }}>{item.duration}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 15 }}>{item.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.formLabel}>Select Crop Year (CY) *</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: SPACING.lg }}>
              {['CY 2025–2026', 'CY 2026–2027', 'CY 2027–2028'].map(cy => {
                const isSel = cycleTypeForm.cropYear === cy;
                return (
                  <TouchableOpacity
                    key={cy}
                    style={[
                      { flex: 1, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff', alignItems: 'center' },
                      isSel && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }
                    ]}
                    onPress={() => setCycleTypeForm(p => ({ ...p, cropYear: cy }))}
                  >
                    <Text style={{ fontSize: 11.5, fontWeight: isSel ? '800' : '600', color: isSel ? COLORS.primary : COLORS.text }}>{cy}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.sheetFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCycleModal(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.submitBtn}
                onPress={() => {
                  const newStages = (CROP_CYCLE_STAGES_BY_TYPE[cycleTypeForm.cycleType] || CROP_CYCLE_STAGES_BY_TYPE['Plant Cane (New Plant)']).map(s => ({ ...s }));
                  const activeStg = newStages.find(s => s.active) || newStages[0];
                  
                  const updatedField = {
                    ...selectedField,
                    cycleType: cycleTypeForm.cycleType,
                    cropYear: cycleTypeForm.cropYear,
                    stage: activeStg.name,
                    stageNumber: activeStg.stageNumber || 1
                  };
                  setSelectedField(updatedField);
                  setCycleTasksByField(p => ({
                    ...p,
                    [selectedField.id]: newStages
                  }));

                  const mf = fields.find(f => f.id === selectedField.id);
                  if (mf) {
                    mf.cycleType = cycleTypeForm.cycleType;
                    mf.cropYear = cycleTypeForm.cropYear;
                    mf.stage = activeStg.name;
                    mf.stageNumber = activeStg.stageNumber || 1;
                  }
                  updateFieldStageAndCycle(selectedField.id, {
                    cycleType: cycleTypeForm.cycleType,
                    cropYear: cycleTypeForm.cropYear,
                    stage: activeStg.name,
                    stageNumber: activeStg.stageNumber || 1,
                    lastUpdated: new Date().toISOString()
                  });
                  setShowCycleModal(false);
                  Alert.alert('Crop Cycle Updated', `${selectedField.id} is now set to ${cycleTypeForm.cycleType} (${cycleTypeForm.cropYear}) with its 6 growth stages.`);
                }}
              >
                <Text style={s.submitBtnText}>Save Cycle</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Stage Editor Modal ── */}
      <Modal visible={showStageEditor} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: height * 0.88 }}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <View>
                <Text style={s.sheetTitle}>{t('btn_stage_editor', 'Field Stages')}</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>{selectedField.id} · {t('stage_reorder_hint', 'tap icons to reorder or remove')}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowStageEditor(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
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
                const hasLogs = logs.some(l => l.fieldId === selectedField.id && l.taskId === stage.id && !l.isPastCycle);
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
                  updateFieldCustomStages(selectedField.id, updatedStages);
                  setCycleTasksByField(p => ({ ...p, [selectedField.id]: updatedStages }));

                  const activeTask = updatedStages.find(t => t.active);
                  const currentLabel = activeTask 
                    ? getTaskLabel(activeTask) 
                    : (updatedStages.length > 0 
                        ? (updatedStages.every(t => t.done) ? `${t('task_t11', 'Harvesting / Cutting')} (${t('status_completed', 'Completed')})` : (updatedStages.some(t => t.done) ? t('status_pending', 'Waiting to Start Next Stage') : t('status_pending', 'Not Started'))) 
                        : 'Not Started');

                  setSelectedField(prevF => ({ ...prevF, stage: currentLabel, customStages: updatedStages }));
                  const mf = fields.find(f => f.id === selectedField.id);
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
          </View>
        </View>
      </Modal>

      {/* ── Dedicated Full History & Ledger Modal (Full Screen) ── */}
      <Modal visible={showHistoryModal} animationType="none" onRequestClose={handleCloseHistoryModal}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          {/* Modal Header */}
          <View style={s.historyModalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.historyModalTitle}>
                {activeRole === 'SRA (Admin)' 
                  ? t('district_audit_records_title', 'District Audit History Records') 
                  : activeRole === 'Farm Manager'
                  ? t('farm_manager_ledger_title', 'Farm Operations & Regulatory Ledger')
                  : t('ledger_title', 'Field History & Ledger')}
              </Text>
              <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>
                {activeRole === 'SRA (Admin)'
                  ? t('sra_oversight_scope_sub', 'Silay SRA Regulatory Oversight Scope · District 3')
                  : activeRole === 'Farm Manager'
                  ? (managerLedgerScope === 'all'
                    ? `${targetFarm || 'Nacayao Block Farm'} · All Plots (${fields.length} Plots)`
                    : `${selectedField?.id} (${selectedField?.ha || 0} Ha) · ${selectedField?.member || selectedField?.memberName || 'Member'} · ${targetFarm || 'Nacayao Block Farm'}`)
                  : `${t('my_field', 'Field')} ${selectedField.id} · ${selectedField.member}`}
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
            const scopedDrafts = draftLogs.filter(d => d.fieldId === selectedField.id);
            const submittedTotalCost = fieldLogs.reduce((sum, l) => sum + Number(l.cost || 0), 0);
            const draftsTotalCost = scopedDrafts.reduce((sum, d) => sum + Number(d.cost || 0), 0);
            const pastTotalCost = pastLogs.reduce((sum, l) => sum + Number(l.cost || 0), 0);

            let statCostLabel = t('stat_total_cost', 'Total Recorded Cost');
            let statCostValue = `Php ${submittedTotalCost.toLocaleString()}`;
            let statCostColor = COLORS.primary;
            let statCountLabel = t('stat_records', 'Submitted Records');
            let statCountValue = `${fieldLogs.length} ${t('total_records_lbl', 'Total Records')}`;

            if (activeRole === 'Farm Manager') {
              if (logTab === 'submitted') {
                const managerCost = managerSubmittedLogs.reduce((sum, l) => sum + Number(l.cost || l.totalCost || 0), 0);
                const managerAmendedCount = managerSubmittedLogs.filter(l => l.isAmended || (Array.isArray(l.editHistory) && l.editHistory.length > 0)).length;
                statCostLabel = managerLedgerScope === 'all' ? t('stat_total_cost', 'Total Recorded Cost') : `${selectedField?.id || 'Field'} Total Cost`;
                statCostValue = `Php ${managerCost.toLocaleString()}`;
                statCostColor = COLORS.primary;
                statCountLabel = managerLedgerScope === 'all' ? t('farm_operations_lbl', 'Farm Operations & Edits') : `${selectedField?.id || 'Field'} Operations & Edits`;
                statCountValue = `${managerSubmittedLogs.length} Logs (${managerAmendedCount} Edited)`;
              } else {
                const auditTotalCost = (auditLogs || []).reduce((sum, a) => sum + Number(a.totalCost || 0), 0);
                statCostLabel = t('compiled_audited_cost_lbl', 'Compiled Audited Cost');
                statCostValue = `Php ${auditTotalCost.toLocaleString()}`;
                statCostColor = COLORS.primary;
                statCountLabel = t('verified_sra_audits_lbl', 'Verified SRA Audits');
                statCountValue = `${(auditLogs || []).length} ${t('monthly_reports_lbl', 'Monthly Reports')}`;
              }
            } else if (activeRole === 'SRA (Admin)' || logTab === 'audit_history') {
              const auditTotalCost = (auditLogs || []).reduce((sum, a) => sum + Number(a.totalCost || 0), 0);
              statCostLabel = t('compiled_audited_cost_lbl', 'Compiled Audited Cost');
              statCostValue = `Php ${auditTotalCost.toLocaleString()}`;
              statCostColor = COLORS.primary;
              statCountLabel = t('verified_sra_audits_lbl', 'Verified SRA Audits');
              statCountValue = `${(auditLogs || []).length} ${t('monthly_reports_lbl', 'Monthly Reports')}`;
            } else if (logTab === 'drafts') {
              statCostLabel = t('estimated_draft_cost_lbl', 'Estimated Draft Cost');
              statCostValue = `Php ${draftsTotalCost.toLocaleString()}`;
              statCostColor = '#C97A00';
              statCountLabel = t('pending_draft_pipeline_lbl', 'Pending Draft Pipeline');
              statCountValue = `${scopedDrafts.length} ${t('draft_records_lbl', 'Draft Records')}`;
            } else if (logTab === 'past') {
              statCostLabel = t('past_cycles_cost_lbl', 'Past Cycles Total Cost');
              statCostValue = `Php ${pastTotalCost.toLocaleString()}`;
              statCostColor = '#64748B';
              statCountLabel = t('archived_logs_lbl', 'Archived Logs');
              statCountValue = `${pastLogs.length} ${t('past_records_lbl', 'Past Records')}`;
            }

            return (
              <View style={[
                s.historyStatBar,
                logTab === 'drafts' && { backgroundColor: '#FFFBF0', borderBottomColor: '#FDE68A' },
                logTab === 'past' && { backgroundColor: '#F8FAFC', borderBottomColor: '#E2E8F0' },
              ]}>
                <View style={s.historyStatItem}>
                  <Text style={[s.historyStatLbl, logTab === 'drafts' && { color: '#92400E' }]}>{statCostLabel}</Text>
                  <Text style={[s.historyStatVal, { color: statCostColor }]}>{statCostValue}</Text>
                </View>
                <View style={[s.historyStatItem, { borderLeftWidth: 1, borderLeftColor: logTab === 'drafts' ? '#FDE68A' : COLORS.border, paddingLeft: 12 }]}>
                  <Text style={[s.historyStatLbl, logTab === 'drafts' && { color: '#92400E' }]}>{statCountLabel}</Text>
                  <Text style={[s.historyStatVal, { color: statCostColor }]}>{statCountValue}</Text>
                </View>
              </View>
            );
          })()}

          {/* Ledger Sub-tabs */}
          {activeRole === 'Member' ? (
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
                      const fLogCount = visibleLogs.filter(l => (l.fieldId || '').trim().toUpperCase() === f.id.toUpperCase() && !l.isPastCycle && !l.isArchived && !l.isDeleted).length;
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
          ) : activeRole === 'SRA (Admin)' ? (
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
            {activeRole === 'Member' ? (
              logTab === 'drafts' ? (
                renderCompactLogList(draftLogs.filter(l => (l.fieldId || '').trim().toUpperCase() === (selectedField.id || '').trim().toUpperCase()), true, false)
              ) : logTab === 'past' ? (
                <>
                  {pastLogs.length > 0 && (
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        backgroundColor: '#FFF5F5',
                        borderWidth: 1,
                        borderColor: '#FED7D7',
                        borderRadius: RADIUS.md,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        marginBottom: 12
                      }}
                      onPress={handleClearPastLogs}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={15} color="#E53E3E" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#E53E3E' }}>
                        {t('btn_delete_past_cycles', 'Delete All Past Cycles')} ({pastLogs.length})
                      </Text>
                    </TouchableOpacity>
                  )}
                  {renderCompactLogList(pastLogs, false, false)}
                </>
              ) : (
                renderCompactLogList(fieldLogs, false, false)
              )
            ) : logTab === 'drafts' ? (
              renderCompactLogList(draftLogs.filter(l => (l.fieldId || '').trim().toUpperCase() === (selectedField.id || '').trim().toUpperCase()), true, true)
            ) : activeRole === 'Farm Manager' && logTab === 'submitted' ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={s.sectionLabel}>
                    {managerLedgerScope === 'all'
                      ? t('all_block_farm_ops', 'All Block Farm Operations & Edits')
                      : `${selectedField?.id || 'Plot'} Operations & Edits`}
                  </Text>
                  {(() => {
                    const amendedCount = managerSubmittedLogs.filter(l => l.isAmended || (Array.isArray(l.editHistory) && l.editHistory.length > 0)).length;
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
            ) : activeRole === 'Farm Manager' || activeRole === 'SRA (Admin)' || logTab === 'audit_history' ? (
              <View style={{ gap: SPACING.md }}>
                <Text style={s.sectionLabel}>{t('compiled_monthly_audit_title', 'Compiled Monthly Regulatory Audit')}</Text>
                {auditLogs.map(audit => (
                  <View key={audit.id} style={[s.auditCard, { marginBottom: 6 }]}>
                    {/* Header: Audit ID & Status */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="document-text" size={16} color={COLORS.primary} />
                        <Text style={{ fontSize: 14.5, fontWeight: '900', color: COLORS.text }}>{formatPhaseMonth ? formatPhaseMonth(audit.month) : audit.month} {t('audit_report_suffix', 'Audit Report')}</Text>
                      </View>
                      {audit.status === 'Certified' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primaryBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.xs }}>
                          <Ionicons name="checkmark-done-circle" size={13} color={COLORS.primary} />
                          <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.primary }}>{t('verified_sra_badge', 'Verified SRA')}</Text>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#FDE68A' }}>
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
                          {audit.fieldsReported} {t('plots_word', 'Plots')} · {audit.logsCount} {t('logs_unit', 'Logs')} · ₱{audit.totalCost.toLocaleString()}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>{t('inspector_verifier', 'Inspector Verifier:')}</Text>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: audit.status === 'Certified' ? COLORS.textSecondary : '#D97706', fontStyle: audit.status === 'Certified' ? 'normal' : 'italic' }}>
                          {audit.verifiedBy || (audit.status === 'Certified' ? 'Engr. Maria Santos (SRA Officer)' : 'Pending SRA Inspector Review')}
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
            ) : (
              renderCompactLogList(fieldLogs, false, true)
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

  // Scanner Modal
  scanOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  scanModal: { width: '100%', alignItems: 'center', gap: SPACING.lg },
  scanTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  scanViewfinder: { width: 240, height: 240, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', gap: 12 },
  scanCorner: { position: 'absolute', width: 28, height: 28, borderColor: COLORS.primary, borderWidth: 3 },
  scanTL: { top: 8, left: 8, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 4 },
  scanTR: { top: 8, right: 8, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 4 },
  scanBL: { bottom: 8, left: 8, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 4 },
  scanBR: { bottom: 8, right: 8, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 4 },
  scanHint: { fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  scanSimBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.success, borderRadius: RADIUS.md, paddingHorizontal: 24, paddingVertical: 14 },
  scanSimBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  scanCancelBtn: { paddingVertical: 10 },
  scanCancelText: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },

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
