import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, Modal, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import { SRA_PRICE_HISTORY, currentPrice, currentMarketObservation, getMemberSyncHealth, subscribe, getCurrentSession, fields, operationLogs, blockFarms, resolveFieldBlockFarm, resolveFieldMember } from '../data/dataStore';
import { useTranslation } from '../services/i18n';

// ── 6 SRA Growth Stages Definition ─────────────────────────────
const SRA_GROWTH_STAGES = [
  { key: 'stage-1', stageNum: 1, name: 'Soil & Land Prep', short: 'Land Prep', color: '#8F3A8F', icon: 'construct', days: '0–15 Days', ops: 'Ops 1–2', keywords: ['stage 1', 'pre-planting', 'prep', 'soil', 'land', 'furrow', 'plow', 'sampling'] },
  { key: 'stage-2', stageNum: 2, name: 'Planting & Seeds', short: 'Planting', color: '#4A7C2F', icon: 'leaf', days: '15–30 Days', ops: 'Ops 3–4', keywords: ['stage 2', 'establishment', 'plant', 'patdan', 'seedcane', 'canepoint'] },
  { key: 'stage-3', stageNum: 3, name: 'Basal Nutrition', short: 'Basal Fert', color: '#1A6B9A', icon: 'flask', days: '30–45 Days', ops: 'Ops 5–6', keywords: ['stage 3', 'nutrition', 'basal', 'dap', 'phosphate', 'fertiliz', 'abono', 'early care'] },
  { key: 'stage-4', stageNum: 4, name: 'Weeding & Care', short: 'Cultivation', color: '#F5A623', icon: 'git-branch', days: '45–90 Days', ops: 'Ops 7, 10–11', keywords: ['stage 4', 'cultivation', 'weed', 'weeding', 'barring', 'off-barring'] },
  { key: 'stage-5', stageNum: 5, name: 'Top-Dress Fert', short: 'Top-Dress', color: '#0284C7', icon: 'water', days: '90–120 Days', ops: 'Ops 8–9', keywords: ['stage 5', 'maintenance', 'hilling', 'pasandig', 'top-dress', 'top dress', '2nd dose', 'drainage'] },
  { key: 'stage-6', stageNum: 6, name: 'Harvest & Milling', short: 'Harvesting', color: '#D9534F', icon: 'bus', days: '10–12 Mos', ops: 'Ops 12–14', keywords: ['stage 6', 'harvest', 'cutting', 'hauling', 'trucking', 'bull cart', 'milling', 'tapas', 'karga', 'transport'] },
];

export default function AnalyticsScreen({ navigation, route }) {
  const { t, formatOperationName, formatStageName, formatPhaseMonth } = useTranslation();
  const [tab, setTab] = useState('overview'); // 'overview' | 'roster' (or 'logs' for member)
  const [selectedBlockFarm, setSelectedBlockFarm] = useState('All');
  const [selectedFieldId, setSelectedFieldId] = useState('All');
  const [selectedStageKey, setSelectedStageKey] = useState(null);
  const [session, setSession] = useState(getCurrentSession());
  const [logs, setLogs] = useState(operationLogs);
  const [cycleFilter, setCycleFilter] = useState('active'); // 'active' | 'all'
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [expandedLedgerLogId, setExpandedLedgerLogId] = useState(null);
  const [viewedLedgerLogIds, setViewedLedgerLogIds] = useState(new Set());
  const [showPlotPickerModal, setShowPlotPickerModal] = useState(false);
  const [plotSearchQuery, setPlotSearchQuery] = useState('');

  useEffect(() => {
    if (route && route.params && route.params.blockFarm) {
      setSelectedBlockFarm(route.params.blockFarm);
      setSelectedFieldId('All');
    }
  }, [route && route.params && route.params.blockFarm]);

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setSession({ ...getCurrentSession() });
      setLogs([...operationLogs]);
    });
    return unsubscribe;
  }, []);

  const isMember = session.role === 'Member';
  const isSRA = session.role === 'SRA (Admin)';
  const isManager = session.role === 'Farm Manager';

  // 1. Scoped Fields by Role
  const scopedFields = React.useMemo(() => {
    if (isMember) {
      const myFields = fields.filter(f => f.member === session.name || f.memberId === session.employeeId);
      return myFields.length > 0 ? myFields : fields.slice(0, 1);
    }
    if (isSRA) {
      if (selectedBlockFarm === 'All') return fields;
      return fields.filter(f => resolveFieldBlockFarm(f) === selectedBlockFarm || f.blockFarmId === selectedBlockFarm);
    }
    // Farm Manager: scoped to assigned farm
    const mgrFarm = session.blockFarm || session.farm || 'Nacayao Block Farm';
    const mgrFields = fields.filter(f => resolveFieldBlockFarm(f) === mgrFarm || f.blockFarmId === session.blockFarmId);
    return mgrFields.length > 0 ? mgrFields : fields;
  }, [isMember, isSRA, selectedBlockFarm, session.name, session.farm, session.employeeId, session.blockFarmId]);

  // Block farms list for SRA filter (from canonical block_farms collection)
  const blockFarmsList = React.useMemo(() => {
    const canonical = blockFarms.length > 0
      ? blockFarms
      : [{ id: 'BLK-NCY-01', code: 'BLK-NCY', name: 'Nacayao Block Farm', declaredHa: 15.25 }];

    return canonical.map(bf => {
      const bfFields = fields.filter(f => f.blockFarmId === bf.id || f.blockFarm === bf.name || f.blockFarmId === bf.code);
      const totalHa = bfFields.reduce((s, f) => s + (Number(f.ha || f.area) || 0), 0) || Number(bf.declaredHa) || 15.25;
      return {
        id: bf.id,
        name: bf.name || 'Nacayao Block Farm',
        fields: bfFields,
        totalHa
      };
    });
  }, [blockFarms, fields]);

  // Active fields for current calculation
  const activeFields = React.useMemo(() => {
    if (selectedFieldId !== 'All') {
      return scopedFields.filter(f => f.id === selectedFieldId);
    }
    return scopedFields;
  }, [scopedFields, selectedFieldId]);

  const totalHa = activeFields.reduce((s, f) => s + (Number(f.ha) || 1.5), 0);

  // Helper: accurately map an operation log to its agronomic category
  const getLogCategory = (l) => {
    if (l.category) return l.category;
    const sNum = Number(l.stageNumber);
    if (sNum === 1) return 'prep';
    if (sNum === 2) return 'plant';
    if (sNum === 3) return 'fert';
    if (sNum === 4) return 'weed';
    if (sNum === 5) return 'maint';
    if (sNum === 6) return 'harvest';

    const t = `${l.taskId || ''} ${l.sraOperationId || ''} ${l.operationName || ''} ${l.activity || ''}`.toLowerCase();
    if (t.includes('prep') || t.includes('plow') || t.includes('furrow') || t.includes('sra-01') || t.includes('sra-02') || t.includes('t1') || t.includes('t2')) return 'prep';
    if (t.includes('plant') || t.includes('patdan') || t.includes('seedcane') || t.includes('sra-03') || t.includes('sra-04') || t.includes('t3') || t.includes('t4')) return 'plant';
    if (t.includes('fert') || t.includes('basal') || t.includes('dap') || t.includes('urea') || t.includes('sra-05') || t.includes('sra-06') || t.includes('t5') || t.includes('t6')) return 'fert';
    if (t.includes('weed') || t.includes('cultivation') || t.includes('barring') || t.includes('sra-07') || t.includes('sra-10') || t.includes('t7') || t.includes('t10')) return 'weed';
    if (t.includes('top-dress') || t.includes('hilling') || t.includes('maint') || t.includes('drainage') || t.includes('sra-08') || t.includes('sra-09') || t.includes('sra-11') || t.includes('t8') || t.includes('t9') || t.includes('t11')) return 'maint';
    if (t.includes('harvest') || t.includes('cutting') || t.includes('haul') || t.includes('truck') || t.includes('sra-12') || t.includes('sra-13') || t.includes('sra-14') || t.includes('t12') || t.includes('t13') || t.includes('t14')) return 'harvest';
    return 'prep';
  };

  // Cost & Activity calculations - Supports active cycle and all cycles view
  const { totalCost, costPerHa, activeLogsCount, categoryBreakdown, activeLogs = [], hasPastLogs = false, pastLogsCount = 0 } = React.useMemo(() => {
    const activeFieldIds = activeFields.map(f => (f.id || '').trim().toUpperCase());
    
    // Scoped logs for active fields
    const fieldAllLogs = logs.filter(l => {
      const fId = (l.fieldId || '').trim().toUpperCase();
      if (!activeFieldIds.includes(fId)) return false;
      if (l.isArchived || l.isDeleted || l.isDraft) return false;
      return true;
    });

    const pastLogs = fieldAllLogs.filter(l => l.isPastCycle);

    // Filter submitted logs according to cycleFilter ('active' or 'all') and sort newest first
    const activeLogs = fieldAllLogs.filter(l => {
      if (cycleFilter === 'active' && l.isPastCycle) return false;
      if (!isMember && l.isOffline) return false;
      return true;
    }).sort((a, b) => {
      const timeA = new Date(a.createdAt || a.timestamp || a.date || 0).getTime();
      const timeB = new Date(b.createdAt || b.timestamp || b.date || 0).getTime();
      if (timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
      return (b.id || '').localeCompare(a.id || '');
    });

    const cost = activeLogs.reduce((sum, l) => sum + (Number(l.totalCost || l.cost) || 0), 0);
    const ha = Math.max(totalHa, 0.1);
    const totalActivities = activeLogs.length;

    const catLabels = {
      prep: 'Land Preparation',
      plant: 'Planting & Seedcane',
      fert: 'Fertilization',
      weed: 'Cultivation & Weeding',
      maint: 'Crop Maintenance & Hilling-Up',
      harvest: 'Harvesting & Transport'
    };
    const catColors = {
      prep: '#8F3A8F',
      plant: '#4A7C2F',
      fert: '#1A6B9A',
      weed: '#F5A623',
      maint: '#0284C7',
      harvest: '#D9534F'
    };

    const sums = { prep: 0, plant: 0, fert: 0, weed: 0, maint: 0, harvest: 0 };
    const counts = { prep: 0, plant: 0, fert: 0, weed: 0, maint: 0, harvest: 0 };

    activeLogs.forEach(l => {
      const cat = getLogCategory(l);
      if (sums[cat] !== undefined) {
        sums[cat] += Number(l.totalCost || l.cost) || 0;
        counts[cat]++;
      }
    });

    const breakdown = Object.keys(catLabels).map(cat => ({
      key: cat,
      label: catLabels[cat],
      color: catColors[cat],
      amount: sums[cat],
      count: counts[cat],
      costPct: cost > 0 ? Math.round((sums[cat] / cost) * 100) : 0,
      activityPct: totalActivities > 0 ? Math.round((counts[cat] / totalActivities) * 100) : 0,
    }));

    return {
      totalCost: cost,
      costPerHa: Math.round(cost / ha),
      activeLogsCount: totalActivities,
      categoryBreakdown: breakdown,
      activeLogs,
      hasPastLogs: pastLogs.length > 0,
      pastLogsCount: pastLogs.length
    };
  }, [activeFields, totalHa, isMember, logs, cycleFilter]);


  // Helper: map a field to exactly one SRA stage (prevent double counting)
  const matchFieldToStageKey = (f) => {
    const stageStr = (f.stage || '').toLowerCase();
    for (let i = 1; i <= 6; i++) {
      if (stageStr.includes(`stage ${i}`) || stageStr.includes(`stage${i}`)) {
        return `stage-${i}`;
      }
    }
    for (const st of SRA_GROWTH_STAGES) {
      if (st.keywords.some(kw => stageStr.includes(kw))) {
        return st.key;
      }
    }
    return 'stage-2';
  };

  // Crop stage distribution (strictly 1 stage per field)
  const stageDistribution = React.useMemo(() => {
    return SRA_GROWTH_STAGES.map(st => {
      const matching = activeFields.filter(f => matchFieldToStageKey(f) === st.key);
      const ha = matching.reduce((s, f) => s + (Number(f.ha) || 1.5), 0);
      const pct = totalHa > 0 ? Math.round((ha / totalHa) * 100) : 0;
      return {
        ...st,
        ha,
        pct,
        count: matching.length
      };
    });
  }, [activeFields, totalHa]);

  // Member current active stage focus (when viewing as Member, or when Manager/SRA has selected a single field)
  const memberCurrentStage = React.useMemo(() => {
    if (isMember) {
      const myField = scopedFields[0];
      const stageKey = myField ? matchFieldToStageKey(myField) : 'stage-2';
      const stageObj = SRA_GROWTH_STAGES.find(s => s.key === stageKey) || SRA_GROWTH_STAGES[1];
      return {
        ...stageObj,
        fieldId: myField?.id || 'FLD-NCY-001',
        member: myField?.member || session.name,
        ha: Number(myField?.ha || 1.5),
        variety: myField?.variety || 'Phil 2006-2282',
        blockFarm: myField?.blockFarm || 'Nacayao Block Farm'
      };
    }
    if (selectedFieldId !== 'All' && activeFields.length === 1) {
      const field = activeFields[0];
      const stageKey = field ? matchFieldToStageKey(field) : 'stage-2';
      const stageObj = SRA_GROWTH_STAGES.find(s => s.key === stageKey) || SRA_GROWTH_STAGES[1];
      return {
        ...stageObj,
        fieldId: field.id,
        member: field.member || 'Member Farmer',
        ha: Number(field.ha || 1.5),
        variety: field.variety || 'Phil 2006-2282',
        blockFarm: field.blockFarm || 'Nacayao Block Farm'
      };
    }
    return null;
  }, [isMember, scopedFields, selectedFieldId, activeFields, session.name]);

  // Member field logs for member view
  const memberLogs = React.useMemo(() => {
    if (!isMember) return [];
    const myFieldIds = scopedFields.map(f => (f.id || '').trim().toUpperCase());
    return logs.filter(l => myFieldIds.includes((l.fieldId || '').trim().toUpperCase()) && !l.isArchived && !l.isDeleted);
  }, [isMember, scopedFields, logs]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Clean Top Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>{t('analytics_header_title', 'HUGPONG Analytics')}</Text>
          <Text style={s.headerSub}>
            {isSRA
              ? (selectedBlockFarm === 'All' ? 'District Block Farms Supervision' : `${selectedBlockFarm} Supervision`)
              : isManager
              ? `${session.blockFarm || session.farm || 'Nacayao Block Farm'} Operations`
              : `${scopedFields[0]?.id || 'Field Plot'} · ${session.name || 'Member Farmer'}`}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Sleek Segmented Tab Navigation */}
      <View style={s.tabBarWrapper}>
        <View style={s.tabBar}>
          <TouchableOpacity
            style={[s.tab, tab === 'overview' && s.tabActive]}
            onPress={() => setTab('overview')}
            activeOpacity={0.75}
          >
            <Ionicons name="pie-chart-outline" size={13} color={tab === 'overview' ? COLORS.primary : COLORS.textMuted} />
            <Text style={[s.tabText, tab === 'overview' && s.tabTextActive]}>Overview</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tab, tab === 'stages' && s.tabActive]}
            onPress={() => setTab('stages')}
            activeOpacity={0.75}
          >
            <Ionicons name="leaf-outline" size={13} color={tab === 'stages' ? COLORS.primary : COLORS.textMuted} />
            <Text style={[s.tabText, tab === 'stages' && s.tabTextActive]}>
              {isMember || selectedFieldId !== 'All' ? 'Crop Cycle' : 'Crop Stages'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tab, tab === 'operations' && s.tabActive]}
            onPress={() => setTab('operations')}
            activeOpacity={0.75}
          >
            <Ionicons name="briefcase-outline" size={13} color={tab === 'operations' ? COLORS.primary : COLORS.textMuted} />
            <Text style={[s.tabText, tab === 'operations' && s.tabTextActive]}>Operations</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── SRA ADMIN: Minimal Sleek Block Farm Filter Pill Bar ── */}
        {isSRA && (
          <View style={s.sraFilterContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.sraFilterLabel}>Block Farm Supervision:</Text>
              <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.primary }}>
                {selectedBlockFarm === 'All' ? 'District-Wide' : selectedBlockFarm}
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <TouchableOpacity
                style={[s.sraPill, selectedBlockFarm === 'All' && s.sraPillActive]}
                onPress={() => { setSelectedBlockFarm('All'); setSelectedFieldId('All'); }}
                activeOpacity={0.7}
              >
                <Text style={[s.sraPillText, selectedBlockFarm === 'All' && s.sraPillTextActive]}>
                  All Districts (110.5 Ha)
                </Text>
              </TouchableOpacity>
              {blockFarmsList.map(bf => (
                <TouchableOpacity
                  key={bf.name}
                  style={[s.sraPill, selectedBlockFarm === bf.name && s.sraPillActive]}
                  onPress={() => { setSelectedBlockFarm(bf.name); setSelectedFieldId('All'); }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.sraPillText, selectedBlockFarm === bf.name && s.sraPillTextActive]}>
                    {bf.name} ({bf.totalHa.toFixed(1)} Ha)
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── FARM MANAGER & SRA: Member Plot Filter Pill Bar ── */}
        {!isMember && (
          <View style={s.sraFilterContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="person-circle-outline" size={14} color={COLORS.primary} />
                <Text style={s.sraFilterLabel}>
                  {isManager ? 'Nacayao Member Plot Filter:' : 'Member Plot Filter:'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {selectedFieldId !== 'All' && (
                  <TouchableOpacity 
                    onPress={() => setSelectedFieldId('All')}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2.5, borderRadius: RADIUS.xs }}
                  >
                    <Text style={{ fontSize: 9.5, fontWeight: '800', color: COLORS.danger }}>Reset ✕</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => {
                    setPlotSearchQuery('');
                    setShowPlotPickerModal(true);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primaryBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.xs }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="search" size={11} color={COLORS.primary} />
                  <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.primary }}>
                    Search / Show All ({scopedFields.length})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {/* All Plots Default Pill */}
              <TouchableOpacity
                style={[s.sraPill, selectedFieldId === 'All' && s.sraPillActive]}
                onPress={() => setSelectedFieldId('All')}
                activeOpacity={0.7}
              >
                <Text style={[s.sraPillText, selectedFieldId === 'All' && s.sraPillTextActive]}>
                  {isManager ? 'All Nacayao Plots' : 'All Enrolled Plots'} ({scopedFields.reduce((sum, f) => sum + (Number(f.ha) || 1.5), 0).toFixed(1)} Ha)
                </Text>
              </TouchableOpacity>

              {/* Individual Member Plot Pills (Top 5) */}
              {scopedFields.slice(0, 5).map(f => {
                const isSelected = selectedFieldId === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[s.sraPill, isSelected && s.sraPillActive]}
                    onPress={() => setSelectedFieldId(isSelected ? 'All' : f.id)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {isSelected && <Ionicons name="checkmark-circle" size={12} color={COLORS.primary} />}
                      <Text style={[s.sraPillText, isSelected && s.sraPillTextActive]}>
                        {f.id} · {f.member || 'Member'} ({Number(f.ha || 1.5).toFixed(1)} Ha)
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* + Show More / Search Pill */}
              {scopedFields.length > 5 && (
                <TouchableOpacity
                  style={[s.sraPill, { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' }]}
                  onPress={() => {
                    setPlotSearchQuery('');
                    setShowPlotPickerModal(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="search" size={12} color={COLORS.primary} />
                    <Text style={[s.sraPillText, { color: COLORS.primary, fontWeight: '800' }]}>
                      + {scopedFields.length - 5} More (Search & Pick)
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* TAB 1: OVERVIEW & COST BREAKDOWN                         */}
        {/* ══════════════════════════════════════════════════════════ */}
        {tab === 'overview' && (
          <>
            {/* Role-Dependent KPI Twin Cards */}
            <View style={s.twinRow}>
              {selectedFieldId !== 'All' && activeFields.length === 1 ? (
                <>
                  <View style={s.twinCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[s.twinIconBox, { backgroundColor: '#DCFCE7' }]}>
                        <Ionicons name="person" size={13} color={COLORS.primary} />
                      </View>
                      <Text style={s.twinLabel}>Selected Member</Text>
                    </View>
                    <Text style={s.twinValue} numberOfLines={1}>{activeFields[0].member || 'Member Farmer'}</Text>
                    <Text style={s.twinSub}>{activeFields[0].id} · {activeFields[0].blockFarm || 'Nacayao Block Farm'}</Text>
                  </View>

                  <View style={s.twinCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[s.twinIconBox, { backgroundColor: '#E0F2FE' }]}>
                        <Ionicons name="leaf" size={13} color="#0284C7" />
                      </View>
                      <Text style={s.twinLabel}>Allocated Area</Text>
                    </View>
                    <Text style={s.twinValue}>{Number(activeFields[0].ha || 1.5).toFixed(2)} Ha</Text>
                    <Text style={s.twinSub} numberOfLines={1}>{activeFields[0].variety || 'Phil 84-77'} · {activeFields[0].stage ? activeFields[0].stage.split(':')[0] : 'Active'}</Text>
                  </View>
                </>
              ) : isSRA ? (
                <>
                  <View style={s.twinCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[s.twinIconBox, { backgroundColor: '#F3E8FF' }]}>
                        <Ionicons name="cube" size={13} color="#7C3AED" />
                      </View>
                      <Text style={s.twinLabel}>Managed Area</Text>
                    </View>
                    <Text style={s.twinValue}>{selectedBlockFarm === 'All' ? '110.5 Ha' : `${totalHa.toFixed(1)} Ha`}</Text>
                    <Text style={s.twinSub}>{selectedBlockFarm === 'All' ? '4 block farms · 100% mapped' : selectedBlockFarm}</Text>
                  </View>

                  <View style={s.twinCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[s.twinIconBox, { backgroundColor: '#DCFCE7' }]}>
                        <Ionicons name="grid" size={13} color={COLORS.primary} />
                      </View>
                      <Text style={s.twinLabel}>Monitored Plots</Text>
                    </View>
                    <Text style={s.twinValue}>{selectedBlockFarm === 'All' ? '16 Plots' : `${activeFields.length} Plots`}</Text>
                    <Text style={s.twinSub}>{selectedBlockFarm === 'All' ? '16 member farmers · Active' : `${activeFields.length} active plots`}</Text>
                  </View>
                </>
              ) : isManager ? (
                <>
                  <View style={s.twinCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[s.twinIconBox, { backgroundColor: '#DCFCE7' }]}>
                        <Ionicons name="grid" size={13} color={COLORS.primary} />
                      </View>
                      <Text style={s.twinLabel}>My Field Plots</Text>
                    </View>
                    <Text style={s.twinValue}>{activeFields.length} Plots</Text>
                    <Text style={s.twinSub}>{session.blockFarm || session.farm || 'Nacayao Block Farm'}</Text>
                  </View>

                  <View style={s.twinCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[s.twinIconBox, { backgroundColor: '#E0F2FE' }]}>
                        <Ionicons name="map" size={13} color="#0284C7" />
                      </View>
                      <Text style={s.twinLabel}>Cultivated Area</Text>
                    </View>
                    <Text style={s.twinValue}>{totalHa.toFixed(1)} Ha</Text>
                    <Text style={s.twinSub}>100% mapped & assigned</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={s.twinCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[s.twinIconBox, { backgroundColor: '#DCFCE7' }]}>
                        <Ionicons name="location" size={13} color={COLORS.primary} />
                      </View>
                      <Text style={s.twinLabel}>My Plot</Text>
                    </View>
                    <Text style={s.twinValue}>{scopedFields[0]?.id || 'FLD-01'}</Text>
                    <Text style={s.twinSub}>{scopedFields[0]?.ha || '1.5'} Ha · {scopedFields[0]?.variety || 'Phil 84-77'}</Text>
                  </View>

                  <View style={s.twinCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[s.twinIconBox, { backgroundColor: '#FEF3C7' }]}>
                        <Ionicons name="time" size={13} color="#D97706" />
                      </View>
                      <Text style={s.twinLabel}>Active Stage</Text>
                    </View>
                    <Text style={s.twinValue} numberOfLines={1}>{scopedFields[0]?.stage ? scopedFields[0].stage.split(':')[0] : 'Stage 2'}</Text>
                    <Text style={s.twinSub}>Active Cycle 2026</Text>
                  </View>
                </>
              )}
            </View>

            {/* Direct Operational Spend Summary Card */}
            <View style={s.spendCard}>
              <View style={s.spendCardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
                  <View style={s.spendIconBox}>
                    <Ionicons name="cash" size={16} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.spendCardTitle}>
                      {isMember ? 'My Direct Field Expenditure' : (selectedFieldId !== 'All' ? `${activeFields[0]?.member || 'Member'}'s Field Spend` : 'Direct Operations Expenditure')}
                    </Text>
                    <Text style={s.spendCardSub}>Real operational costs recorded on field logs</Text>
                  </View>
                </View>
                <View style={s.activePlotsPill}>
                  <Text style={s.activePlotsPillText}>{activeFields.length} {activeFields.length === 1 ? 'Plot' : 'Plots'}</Text>
                </View>
              </View>

              {/* Cycle View Toggle (When user has past cycle records) */}
              {hasPastLogs && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 6 }}>
                  <TouchableOpacity
                    style={[
                      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
                      cycleFilter === 'active' && { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary }
                    ]}
                    onPress={() => setCycleFilter('active')}
                    activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: cycleFilter === 'active' ? COLORS.primary : COLORS.textMuted }}>
                      Current Cycle
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
                      cycleFilter === 'all' && { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary }
                    ]}
                    onPress={() => setCycleFilter('all')}
                    activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: cycleFilter === 'all' ? COLORS.primary : COLORS.textMuted }}>
                      All Cycles ({pastLogsCount} past)
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {activeLogsCount === 0 && hasPastLogs && cycleFilter === 'active' && (
                <TouchableOpacity 
                  onPress={() => setCycleFilter('all')}
                  activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFBEB', padding: 8, borderRadius: RADIUS.xs, marginVertical: 6, borderWidth: 1, borderColor: '#FDE68A' }}
                >
                  <Ionicons name="information-circle" size={14} color="#B45309" />
                  <Text style={{ fontSize: 11, color: '#B45309', flex: 1 }}>
                    Active cycle has 0 recorded operations. Tap here to view {pastLogsCount} past cycle records.
                  </Text>
                </TouchableOpacity>
              )}

              <View style={s.spendValueRow}>
                <Text style={s.spendMainValue}>₱ {costPerHa.toLocaleString()}</Text>
                <Text style={s.spendMainUnit}>/ Ha</Text>
              </View>

              <View style={s.spendFooterRow}>
                <Text style={s.spendFooterText}>
                  Total Recorded: <Text style={{ fontWeight: '800', color: COLORS.text }}>₱ {totalCost.toLocaleString()}</Text>
                </Text>
                <Text style={s.spendFooterSub}>{totalHa.toFixed(2)} Ha · {activeLogsCount} recorded ops</Text>
              </View>
            </View>

            {/* Operational Cost Breakdown by Category */}
            <View style={s.sectionCard}>
              <View style={s.sectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sectionTitle}>Operational Cost Breakdown</Text>
                  <Text style={s.sectionSub}>Recorded spend by agronomic activity category</Text>
                </View>
              </View>

              <View style={{ gap: 9 }}>
                {categoryBreakdown.map(item => (
                  <View key={item.key} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: COLORS.text }}>{item.label}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{item.count} {item.count === 1 ? 'op' : 'ops'}</Text>
                        <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.text }}>₱ {item.amount.toLocaleString()}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: COLORS.textSecondary }}>({item.costPct}%)</Text>
                      </View>
                    </View>
                    <View style={{ height: 5, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${Math.max(item.costPct, item.amount > 0 ? 4 : 0)}%`, backgroundColor: item.color, borderRadius: 3 }} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* TAB 2: CROP STAGE LIFECYCLE DISTRIBUTION                 */}
        {/* ══════════════════════════════════════════════════════════ */}
        {tab === 'stages' && (
          (isMember || (selectedFieldId !== 'All' && memberCurrentStage)) ? (
            /* SINGLE MEMBER PLOT: Sleek 6-Stage Timeline Stepper & Active Stage Focus */
            <View style={s.sectionCard}>
              <View style={s.sectionHeader}>
                <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                  <Text style={s.sectionTitle}>
                    {isMember ? 'My Field Crop Cycle Progress' : `${memberCurrentStage.member} · Crop Cycle`}
                  </Text>
                  <Text style={s.sectionSub}>SRA 6-stage agronomic cycle for {memberCurrentStage.fieldId}</Text>
                </View>
                <View style={[s.badgePill, { backgroundColor: `${memberCurrentStage.color}15` }]}>
                  <Text style={[s.badgePillText, { color: memberCurrentStage.color }]}>
                    Stage {memberCurrentStage.stageNum} Active
                  </Text>
                </View>
              </View>

              {/* Horizontal 6-Stage Timeline Stepper */}
              <View style={s.timelineStepperContainer}>
                <View style={s.timelineTrackLine} />
                <View style={s.timelineStepsRow}>
                  {SRA_GROWTH_STAGES.map((st) => {
                    const isPassed = st.stageNum < memberCurrentStage.stageNum;
                    const isCurrent = st.stageNum === memberCurrentStage.stageNum;

                    return (
                      <View key={st.key} style={s.stepItem}>
                        <View style={[
                          s.stepCircle,
                          isPassed && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
                          isCurrent && { backgroundColor: st.color, borderColor: st.color, transform: [{ scale: 1.15 }] },
                          !isPassed && !isCurrent && { backgroundColor: '#fff', borderColor: COLORS.border }
                        ]}>
                          {isPassed ? (
                            <Ionicons name="checkmark" size={11} color="#fff" />
                          ) : (
                            <Text style={[
                              s.stepNumberText,
                              isCurrent ? { color: '#fff' } : { color: COLORS.textMuted }
                            ]}>
                              {st.stageNum}
                            </Text>
                          )}
                        </View>
                        <Text style={[
                          s.stepLabel,
                          isCurrent && { color: st.color, fontWeight: '800' }
                        ]} numberOfLines={1}>
                          {st.short}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Current Active Stage Focus Card */}
              <View style={[s.activeStageCard, { borderColor: `${memberCurrentStage.color}50` }]}>
                <View style={[s.stageAccentStrip, { backgroundColor: memberCurrentStage.color }]} />
                <View style={{ padding: 12, gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={[s.stageTag, { backgroundColor: `${memberCurrentStage.color}15` }]}>
                      <Text style={[s.stageTagText, { color: memberCurrentStage.color }]}>
                        Current: Stage {memberCurrentStage.stageNum}
                      </Text>
                    </View>
                    <View style={s.liveBadge}>
                      <View style={[s.liveDot, { backgroundColor: memberCurrentStage.color }]} />
                      <Text style={[s.liveText, { color: memberCurrentStage.color }]}>In Progress</Text>
                    </View>
                  </View>

                  <Text style={{ fontSize: 14, fontWeight: '900', color: COLORS.text }}>
                    {memberCurrentStage.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                    Standard Agronomic Window: <Text style={{ fontWeight: '700', color: COLORS.text }}>{memberCurrentStage.days}</Text> ({memberCurrentStage.ops})
                  </Text>

                  <View style={{ backgroundColor: '#F8FAF5', borderRadius: RADIUS.xs, padding: 8, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Assigned Land</Text>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: COLORS.text }}>{memberCurrentStage.ha.toFixed(2)} Ha</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Crop Variety</Text>
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.primary }}>{memberCurrentStage.variety}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Cycle Progress</Text>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: memberCurrentStage.color }}>
                        {Math.round((memberCurrentStage.stageNum / 6) * 100)}%
                      </Text>
                    </View>
                  </View>

                  {/* If manager/SRA is inspecting single plot, provide toggle to view all plots */}
                  {!isMember && (
                    <TouchableOpacity
                      onPress={() => setSelectedFieldId('All')}
                      style={{
                        marginTop: 6,
                        paddingVertical: 8,
                        backgroundColor: '#F0F9EB',
                        borderRadius: RADIUS.xs,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: '#C8E6C9'
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.primary }}>
                        ← View All Farm Plots Stage Distribution
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ) : (
            /* SRA & MANAGER: 2-Column Balanced Crop Cycle Stage Grid */
            <View style={s.sectionCard}>
              <View style={s.sectionHeader}>
                <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                  <Text style={s.sectionTitle}>Crop Cycle Stage Distribution</Text>
                  <Text style={s.sectionSub}>6 official SRA agronomic stages · Active Cycle 2026</Text>
                </View>
                <View style={s.badgePill}>
                  <Text style={s.badgePillText}>{totalHa.toFixed(1)} Ha Active</Text>
                </View>
              </View>

              <View style={s.stagesGrid}>
                {stageDistribution.map(st => {
                  const isStageSelected = selectedStageKey === st.key;
                  return (
                    <TouchableOpacity
                      key={st.key}
                      style={[
                        s.stageCard,
                        isStageSelected && { borderColor: st.color, backgroundColor: '#FAFDF7' }
                      ]}
                      onPress={() => setSelectedStageKey(isStageSelected ? null : st.key)}
                      activeOpacity={0.7}
                    >
                      {/* Top Colored Accent Strip (Matching Web) */}
                      <View style={[s.stageAccentStrip, { backgroundColor: st.color }]} />

                      <View style={{ padding: 9, gap: 4 }}>
                        {/* Header: Stage Tag & Share % */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={[s.stageTag, { backgroundColor: `${st.color}15` }]}>
                            <Text style={[s.stageTagText, { color: st.color }]}>Stage {st.stageNum}</Text>
                          </View>
                          <View style={s.stagePctBadge}>
                            <Text style={s.stagePct}>{st.pct}%</Text>
                          </View>
                        </View>

                        {/* Stage Name & Timeline */}
                        <Text style={s.stageName} numberOfLines={1}>{st.name}</Text>
                        <Text style={s.stageTimeline}>{st.days}</Text>

                        {/* Bottom Stats */}
                        <View style={{ marginTop: 2, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#F0F0F0' }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <Text style={[s.stageHa, { color: st.color }]}>
                              {st.ha.toFixed(1)} <Text style={{ fontSize: 10, fontWeight: '600', color: COLORS.textMuted }}>Ha</Text>
                            </Text>
                            <View style={[s.stagePlotsPill, st.count > 0 ? { backgroundColor: COLORS.primaryBg } : { backgroundColor: '#F3F4F6' }]}>
                              <Text style={[s.stagePlotsText, st.count > 0 ? { color: COLORS.primary } : { color: COLORS.textMuted }]}>
                                {st.count} {st.count === 1 ? 'plot' : 'plots'}
                              </Text>
                            </View>
                          </View>

                          {/* Progress Track */}
                          <View style={s.stageTrack}>
                            <View style={[s.stageFill, { width: `${Math.max(st.pct, st.ha > 0 ? 10 : 0)}%`, backgroundColor: st.color }]} />
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Tapped Stage: Detailed Plot Drilldown Drawer */}
              {selectedStageKey && (
                <View style={s.selectedStageDrawer}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={s.drawerTitle}>
                      Plots in {SRA_GROWTH_STAGES.find(s => s.key === selectedStageKey)?.name || 'This Stage'}:
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedStageKey(null)}>
                      <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                  {activeFields.filter(f => matchFieldToStageKey(f) === selectedStageKey).length === 0 ? (
                    <Text style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' }}>
                      No plots are currently in this stage.
                    </Text>
                  ) : (
                    activeFields.filter(f => matchFieldToStageKey(f) === selectedStageKey).map(p => (
                      <TouchableOpacity 
                        key={p.id} 
                        style={s.drawerPlotItem}
                        onPress={() => { setSelectedFieldId(p.id); setSelectedStageKey(null); }}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.drawerPlotId}>{p.id} · <Text style={{ fontWeight: '600', color: COLORS.textSecondary }}>{p.member || 'Member'}</Text></Text>
                          <Text style={s.drawerPlotSub}>{p.blockFarm || 'Block Farm'} · {p.variety || 'Phil 84-77'}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          <Text style={s.drawerPlotHa}>{Number(p.ha || 1.5).toFixed(1)} Ha</Text>
                          <Text style={{ fontSize: 9.5, fontWeight: '700', color: COLORS.primary }}>Inspect Plot →</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
            </View>
          )
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* TAB 3: FARM OPERATIONS & ACTIVITY DISTRIBUTION           */}
        {/* ══════════════════════════════════════════════════════════ */}
        {tab === 'operations' && (
          <View style={s.sectionCard}>
            <View style={s.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.sectionTitle}>Farm Operations Analytics</Text>
                <Text style={s.sectionSub}>Aggregated activity volume, categories & execution distribution</Text>
              </View>
            </View>

            {activeLogsCount === 0 ? (
              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' }}>
                  No recorded operations yet.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 12, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: '#F8FAF5', padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' }}>Total Completed</Text>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: COLORS.text, marginTop: 2 }}>{activeLogsCount}</Text>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: COLORS.textSecondary, marginTop: 2 }}>Field activities</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#F8FAF5', padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' }}>Active Plots</Text>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: COLORS.primary, marginTop: 2 }}>{activeFields.length}</Text>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: COLORS.textSecondary, marginTop: 2 }}>{totalHa.toFixed(1)} Ha supervised</Text>
                  </View>
                </View>

                {/* Operations by Category Distribution with clean spacing & progress bars */}
                <View style={{ gap: 10, marginTop: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Activity Category Distribution
                  </Text>
                  {categoryBreakdown.map(cat => (
                    <View key={cat.key} style={{ gap: 6, paddingVertical: 3 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.color }} />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{cat.label}</Text>
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text }}>
                          {cat.count} <Text style={{ fontSize: 11, fontWeight: '500', color: COLORS.textMuted }}>({cat.activityPct}%)</Text>
                        </Text>
                      </View>
                      <View style={{ height: 6, backgroundColor: '#EEF0E9', borderRadius: 3, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${Math.max(cat.activityPct, cat.count > 0 ? 4 : 0)}%`, backgroundColor: cat.color, borderRadius: 3 }} />
                      </View>
                    </View>
                  ))}
                </View>

                {/* Clean Drill-Down Action automatically opening the Operational Ledger (Zero Animation Lag) */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: '#F0F7EB',
                    paddingVertical: 13,
                    paddingHorizontal: 16,
                    borderRadius: RADIUS.md,
                    borderWidth: 1,
                    borderColor: `${COLORS.primary}40`,
                    marginTop: 6
                  }}
                  onPress={() => setShowLedgerModal(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="book-outline" size={16} color={COLORS.primary} />
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: COLORS.primary }}>
                    View Detailed Operations Ledger ({activeLogsCount} {activeLogsCount === 1 ? 'record' : 'records'}) →
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Direct Analytics Ledger Modal (Instant, Zero Lag, Stays on Analytics) ── */}
      <Modal visible={showLedgerModal} animationType="none" onRequestClose={() => setShowLedgerModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          {/* Modal Header */}
          <View style={s.historyModalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.historyModalTitle}>
                {t('ledger_title', 'Field History & Ledger')}
              </Text>
              <Text style={s.historyModalSub}>
                {isSRA
                  ? `${selectedBlockFarm === 'All' ? 'All Block Farms' : selectedBlockFarm} · Active Operations`
                  : `${activeFields[0]?.id || scopedFields[0]?.id || 'Field Plot'} · ${activeFields[0]?.member || session.name || 'Member'}`}
              </Text>
            </View>
            <TouchableOpacity 
              style={s.historyModalCloseBtn}
              onPress={() => setShowLedgerModal(false)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Stat Summary Bar */}
          <View style={s.historyStatBar}>
            <View style={s.historyStatItem}>
              <Text style={s.historyStatLbl}>Total Recorded Cost</Text>
              <Text style={s.historyStatVal}>Php {totalCost.toLocaleString()}</Text>
            </View>
            <View style={[s.historyStatItem, { borderLeftWidth: 1, borderLeftColor: COLORS.border, paddingLeft: 14 }]}>
              <Text style={s.historyStatLbl}>Submitted Records</Text>
              <Text style={s.historyStatVal}>{activeLogsCount} {activeLogsCount === 1 ? 'Record' : 'Records'}</Text>
            </View>
          </View>

          {/* Scrollable Records List */}
          <ScrollView contentContainerStyle={{ padding: SPACING.md, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {activeLogs.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <Ionicons name="documents-outline" size={40} color={COLORS.textMuted} />
                <Text style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 8 }}>
                  {hasPastLogs && cycleFilter === 'active' 
                    ? `No current cycle operations found. (${pastLogsCount} past cycle records available)`
                    : 'No operational logs recorded yet.'}
                </Text>
                {hasPastLogs && cycleFilter === 'active' && (
                  <TouchableOpacity
                    style={{ marginTop: 12, backgroundColor: COLORS.primaryBg, paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.primary }}
                    onPress={() => setCycleFilter('all')}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.primary }}>
                      View Past Cycles ({pastLogsCount} records)
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {activeLogs.map(log => {
                  const isExpanded = expandedLedgerLogId === log.id;
                  const isNew = Boolean(log.isNew && !viewedLedgerLogIds.has(log.id));
                  return (
                    <View key={log.id} style={[
                      s.compactLogCard,
                      isNew && {
                        backgroundColor: '#F6FAF3',
                        borderColor: COLORS.primaryBorder,
                        borderWidth: 1.5,
                      }
                    ]}>
                      <TouchableOpacity
                        style={s.compactLogHeader}
                        onPress={() => {
                          setExpandedLedgerLogId(isExpanded ? null : log.id);
                          setViewedLedgerLogIds(prev => new Set([...prev, log.id]));
                        }}
                        activeOpacity={0.7}
                      >
                        {isNew ? (
                          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.primary, marginRight: 2 }} />
                        ) : null}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {log.sraOperationId && (
                              <View style={{ backgroundColor: COLORS.primaryBg, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs }}>
                                <Text style={{ fontSize: 10, fontWeight: '900', color: COLORS.primary }}>{log.sraOperationId}</Text>
                              </View>
                            )}
                            {log.isPastCycle && (
                              <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#E2E8F0' }}>
                                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#64748B' }}>Past Cycle</Text>
                              </View>
                            )}
                            <Text style={s.compactLogTitle} numberOfLines={1}>
                              {formatOperationName ? formatOperationName(log.operationName || log.activity) : log.operationName || log.activity}
                            </Text>
                          </View>

                          {/* Connected Parent Stage Badge */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Ionicons name="git-branch-outline" size={11} color={COLORS.primary} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }} numberOfLines={1}>
                              {formatStageName ? formatStageName(log.stageName || `Stage ${log.stageNumber}`, true) : log.stageName || `Stage ${log.stageNumber}`}
                            </Text>
                          </View>

                          <Text style={[s.compactLogSub, { marginTop: 2 }]}>
                            {log.date || log.period} · {log.hectares || 1.5} Ha · {log.people || 2} Workers{log.subItems?.length ? ` · ${log.subItems.length} Items` : ''}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                          <Text style={s.compactLogCost}>₱{Number(log.totalCost || log.cost || 0).toLocaleString()}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                            {log.isOffline && <Ionicons name="cloud-offline-outline" size={12} color="#C97A00" />}
                            <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={COLORS.textMuted} />
                          </View>
                        </View>
                      </TouchableOpacity>

                      {/* Expandable Details Drawer */}
                      {isExpanded && (
                        <View style={s.compactLogDrawer}>
                          <View style={s.compactLogDivider} />
                          <View style={s.receiptRow}>
                            <Text style={s.receiptLabel}>Operation Name</Text>
                            <Text style={s.receiptValue}>{log.sraOperationId ? `[${log.sraOperationId}] ` : ''}{log.operationName || log.activity}</Text>
                          </View>
                          <View style={s.receiptRow}>
                            <Text style={s.receiptLabel}>Connected Stage</Text>
                            <Text style={[s.receiptValue, { color: COLORS.primary, fontWeight: '800' }]}>
                              {log.stageName || (log.stageNumber ? `Stage ${log.stageNumber}` : 'General Operation')}
                            </Text>
                          </View>
                          <View style={s.receiptRow}>
                            <Text style={s.receiptLabel}>Log Reference</Text>
                            <Text style={s.receiptValue}>#{log.id}</Text>
                          </View>
                          <View style={s.receiptRow}>
                            <Text style={s.receiptLabel}>Work Coverage</Text>
                            <Text style={s.receiptValue}>{log.hectares || 1.5} Hectares · {log.people || 2} Workers</Text>
                          </View>

                          {/* Child Items / Materials Breakdown */}
                          {log.subItems && log.subItems.length > 0 && (
                            <View style={{ backgroundColor: '#F8FAF5', padding: 10, borderRadius: RADIUS.sm, gap: 5, marginVertical: 6, borderWidth: 1, borderColor: COLORS.border }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase' }}>
                                Operation Items & Materials ({log.subItems.length})
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

                          <View style={s.receiptRow}>
                            <Text style={s.receiptLabel}>Total Cost</Text>
                            <Text style={s.receiptCostText}>Php {Number(log.totalCost || log.cost || 0).toLocaleString()}</Text>
                          </View>
                          <View style={s.receiptRow}>
                            <Text style={s.receiptLabel}>Date Recorded</Text>
                            <Text style={s.receiptValue}>{log.date || log.period}</Text>
                          </View>
                          <View style={s.receiptRow}>
                            <Text style={s.receiptLabel}>Status</Text>
                            <View style={[s.receiptStatusBadge, { backgroundColor: log.isOffline ? '#FFFBF0' : '#F2FBF2', borderColor: log.isOffline ? '#FEF0D0' : '#E8F5E8' }]}>
                              <Ionicons name={log.isOffline ? 'cloud-offline-outline' : 'checkmark-circle-outline'} size={12} color={log.isOffline ? '#C97A00' : '#267326'} />
                              <Text style={[s.receiptStatusText, { fontSize: 10, color: log.isOffline ? '#C97A00' : '#267326' }]}>
                                {log.isOffline ? 'Saved Offline' : 'Recorded'}
                              </Text>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Searchable Member Plot Picker Modal Sheet ── */}
      <Modal
        visible={showPlotPickerModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowPlotPickerModal(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
          {/* Modal Header */}
          <View style={s.historyModalHeader}>
            <View>
              <Text style={s.historyModalTitle}>Select Enrolled Plot</Text>
              <Text style={s.historyModalSub}>
                {scopedFields.length} total plots registered in {isManager ? 'Nacayao' : 'supervised district'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowPlotPickerModal(false)}
              style={s.historyModalCloseBtn}
            >
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Search Input Bar */}
          <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
              <Ionicons name="search" size={16} color={COLORS.textMuted} />
              <TextInput
                placeholder="Search by Plot ID (e.g. FLD-NCY-001) or Member name..."
                placeholderTextColor={COLORS.textMuted}
                value={plotSearchQuery}
                onChangeText={setPlotSearchQuery}
                style={{ flex: 1, fontSize: 13, color: COLORS.text, padding: 0 }}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {plotSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setPlotSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 10 }}>
            {/* All Plots Option */}
            <TouchableOpacity
              onPress={() => {
                setSelectedFieldId('All');
                setShowPlotPickerModal(false);
              }}
              style={{
                backgroundColor: '#fff',
                borderRadius: RADIUS.md,
                padding: 14,
                borderWidth: 1.5,
                borderColor: selectedFieldId === 'All' ? COLORS.primary : COLORS.border,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                ...SHADOW.xs
              }}
            >
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: selectedFieldId === 'All' ? COLORS.primary : COLORS.text }}>
                  {isManager ? 'All Nacayao Plots' : 'All Enrolled District Plots'}
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>
                  Combined summary of {scopedFields.length} plots ({scopedFields.reduce((sum, f) => sum + (Number(f.ha) || 1.5), 0).toFixed(1)} Ha)
                </Text>
              </View>
              {selectedFieldId === 'All' && (
                <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
              )}
            </TouchableOpacity>

            {/* Filtered Plot Cards */}
            {scopedFields
              .filter(f => {
                if (!plotSearchQuery) return true;
                const q = plotSearchQuery.toLowerCase();
                const idMatch = (f.id || '').toLowerCase().includes(q);
                const memberMatch = (f.member || '').toLowerCase().includes(q);
                const memberIdMatch = (f.memberId || '').toLowerCase().includes(q);
                const varietyMatch = (f.variety || '').toLowerCase().includes(q);
                const stageMatch = (f.stage || '').toLowerCase().includes(q);
                return idMatch || memberMatch || memberIdMatch || varietyMatch || stageMatch;
              })
              .map(f => {
                const isSelected = selectedFieldId === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => {
                      setSelectedFieldId(f.id);
                      setShowPlotPickerModal(false);
                    }}
                    style={{
                      backgroundColor: '#fff',
                      borderRadius: RADIUS.md,
                      padding: 14,
                      borderWidth: 1.5,
                      borderColor: isSelected ? COLORS.primary : COLORS.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      ...SHADOW.xs
                    }}
                  >
                    <View style={{ gap: 4, flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 13.5, fontWeight: '800', color: isSelected ? COLORS.primary : COLORS.text }}>
                          {f.id}
                        </Text>
                        <View style={{ backgroundColor: '#F0FDF4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs }}>
                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#16A34A' }}>
                            {Number(f.ha || 1.5).toFixed(1)} Ha
                          </Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textSecondary }}>
                        Member: {f.member || 'Assigned Farmer'}
                        {f.memberId ? (
                          <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 11, color: COLORS.primary, fontWeight: '700' }}> · ID: {f.memberId}</Text>
                        ) : null}
                      </Text>
                      {f.stage && (
                        <Text style={{ fontSize: 10.5, color: COLORS.textMuted }}>
                          Stage: {f.stage} {f.variety ? `· ${f.variety}` : ''}
                        </Text>
                      )}
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                    )}
                  </TouchableOpacity>
                );
              })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  backBtn: { padding: 6, borderRadius: RADIUS.sm },
  headerTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  headerSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1, textAlign: 'center' },

  // Dedicated Ledger Modal Styles
  historyModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  historyModalTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  historyModalSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  historyModalCloseBtn: { padding: 4 },
  historyStatBar: { flexDirection: 'row', backgroundColor: '#F8FAF5', paddingHorizontal: SPACING.lg, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 16 },
  historyStatItem: { flex: 1 },
  historyStatLbl: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  historyStatVal: { fontSize: 13, fontWeight: '800', color: COLORS.primary, marginTop: 1 },

  // Compact Log Cards in Ledger
  compactLogCard: { backgroundColor: '#fff', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  compactLogHeader: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8 },
  compactLogDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  compactLogTitle: { fontSize: 12.5, fontWeight: '700', color: COLORS.text, flex: 1 },
  compactLogSub: { fontSize: 10.5, color: COLORS.textMuted },
  compactLogCost: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  compactLogDrawer: { backgroundColor: '#FAFAF8', padding: 10, gap: 5, borderTopWidth: 1, borderTopColor: '#EEEEEE' },
  compactLogDivider: { height: 1, backgroundColor: '#E5E5E5', marginBottom: 2 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  receiptLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  receiptValue: { fontSize: 11.5, color: COLORS.text, fontWeight: '700' },
  receiptCostText: { fontSize: 12, fontWeight: '900', color: COLORS.primary },
  receiptStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs, borderWidth: 1 },
  receiptStatusText: { fontSize: 10, fontWeight: '700' },

  // Segmented Pill Tab Bar
  tabBarWrapper: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F3F5EE',
    borderRadius: RADIUS.lg,
    padding: 3,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
  },
  tabActive: {
    backgroundColor: '#fff',
    ...SHADOW.xs,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '900',
  },

  scroll: { padding: 14, gap: 14, paddingBottom: 36 },

  // SRA Minimal Filter Row
  sraFilterContainer: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.md,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6
  },
  sraFilterLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase'
  },
  sraPill: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  sraPillActive: {
    backgroundColor: COLORS.primaryBg,
    borderColor: COLORS.primary
  },
  sraPillText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  sraPillTextActive: { color: COLORS.primary, fontWeight: '800' },

  // Status Badges
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#BBF7D0'
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#15803D'
  },
  liveText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#15803D'
  },

  // Twin Row
  twinRow: {
    flexDirection: 'row',
    gap: 10
  },
  twinCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: RADIUS.md,
    padding: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
    gap: 3
  },
  twinIconBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center'
  },
  twinLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: COLORS.textSecondary
  },
  twinValue: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.text,
    marginTop: 1
  },
  twinSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '500'
  },

  // Direct Spend Card
  spendCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.md,
    padding: 13,
    borderWidth: 1,
    borderColor: '#DCE8CC',
    ...SHADOW.card,
    gap: 8
  },
  spendCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  spendIconBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E2EED9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  spendCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text
  },
  spendCardSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 0.5
  },
  activePlotsPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#BBF7D0'
  },
  activePlotsPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D'
  },
  spendValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4
  },
  spendMainValue: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5
  },
  spendMainUnit: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted
  },
  spendFooterRow: {
    backgroundColor: '#F8FAF5',
    borderRadius: RADIUS.sm,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  spendFooterText: {
    fontSize: 11,
    color: COLORS.textSecondary
  },
  spendFooterSub: {
    fontSize: 10,
    color: COLORS.textMuted
  },

  // Standard Section Card
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.md,
    padding: 13,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.text
  },
  sectionSub: {
    fontSize: 10.5,
    color: COLORS.textMuted,
    marginTop: 1
  },
  badgePill: {
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary
  },

  // Stages Grid (2 Columns, Perfectly Balanced Across Entire Width)
  stagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginTop: 4,
  },
  stageCard: {
    width: '48.5%',
    backgroundColor: '#fff',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOW.card,
  },
  stageAccentStrip: {
    height: 3.5,
    width: '100%',
  },

  // Member Timeline Stepper
  timelineStepperContainer: {
    position: 'relative',
    paddingVertical: 10,
    marginVertical: 4,
  },
  timelineTrackLine: {
    position: 'absolute',
    top: 22,
    left: 20,
    right: 20,
    height: 2.5,
    backgroundColor: '#E5E7EB',
  },
  timelineStepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  stepItem: {
    alignItems: 'center',
    width: 46,
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepNumberText: {
    fontSize: 10,
    fontWeight: '800',
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  activeStageCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    overflow: 'hidden',
    marginTop: 4,
    ...SHADOW.card,
  },
  stageTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  stageTagText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  stagePctBadge: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: RADIUS.xs,
  },
  stagePct: {
    fontSize: 9.5,
    fontWeight: '800',
    color: COLORS.text,
  },
  stageName: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
  },
  stageTimeline: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  stageHa: {
    fontSize: 15,
    fontWeight: '900',
  },
  stagePlotsPill: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: RADIUS.xs,
  },
  stagePlotsText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  stageTrack: {
    height: 4,
    backgroundColor: '#F0F0F0',
    borderRadius: 2,
    marginTop: 5,
    overflow: 'hidden',
  },
  stageFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Selected Stage Drawer
  selectedStageDrawer: {
    backgroundColor: '#F8FAF5',
    borderRadius: RADIUS.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: '#DCE8CC',
    marginTop: 6,
    gap: 6,
  },
  drawerTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.text,
  },
  drawerPlotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: RADIUS.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  drawerPlotId: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.primary,
  },
  drawerPlotSub: {
    fontSize: 9.5,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  drawerPlotHa: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
  },


  // Member Plot Card
  plotCard: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  plotCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#F0F9EB'
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D4E5C7'
  },
  memberAvatarText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary
  },
  plotMemberName: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text
  },
  plotSubText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 0.5
  },
  plotVarietyText: {
    fontSize: 9.5,
    color: COLORS.textMuted
  },
  plotStagePill: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
    borderWidth: 1,
    borderColor: '#C8E6C9'
  },
  plotStageText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.primary
  },
  plotCost: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.text
  },
  plotLogCount: {
    fontSize: 9,
    color: COLORS.textMuted
  },

  // Member Log Item
  logItem: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    padding: 9,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  logActivity: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.text
  },
  logDate: {
    fontSize: 9.5,
    color: COLORS.textMuted,
    marginTop: 1
  },
  logMeta: {
    fontSize: 9.5,
    color: COLORS.textSecondary,
    marginTop: 2
  },
  logCost: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary
  },

  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 6
  },
  emptyText: {
    fontSize: 11,
    color: COLORS.textMuted
  }
});
