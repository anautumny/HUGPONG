// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — Member Field Operations View Component
// Role: Sugarcane Block Farm Member
// ══════════════════════════════════════════════════════════════

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { useTranslation } from '../../services/i18n';

function MemberFieldOpsView({
  session,
  fields = [],
  selectedField = {},
  onSelectField,
  fieldLogs = [],
  draftLogsCount = 0,
  onOpenAddLog,
  onOpenLedger,
  onOpenPlanner
}) {
  const { t, formatSyncTime, formatStageName } = useTranslation();
  const safeField = selectedField || fields[0] || {};

  return (
    <View style={s.container}>
      {/* My Fields Selector */}
      <Text style={s.sectionLabel}>{t('my_fields', 'My Sugarcane Plots')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.selectorScroll} contentContainerStyle={{ gap: 8 }}>
        {fields.map(field => (
          <TouchableOpacity
            key={field.id}
            style={[s.fieldChip, safeField.id === field.id && s.fieldChipActive]}
            onPress={() => onSelectField(field)}
            activeOpacity={0.75}
          >
            <Ionicons name="leaf" size={13} color={safeField.id === field.id ? COLORS.primary : COLORS.textMuted} />
            <Text style={[s.fieldChipText, safeField.id === field.id && s.fieldChipTextActive]}>
              {field.id} ({field.ha} Ha)
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Selected Field Details Card */}
      <Text style={s.sectionLabel}>{t('field_plot', 'Selected Field Details')}</Text>
      <View style={s.fieldCard}>
        <View style={s.fieldCardTop}>
          <View style={s.fieldIdBadge}><Text style={s.fieldIdText}>{safeField.id || 'No Field'}</Text></View>
          <Text style={s.fieldHa}>{safeField.ha ? `${safeField.ha} Ha` : ''}</Text>
        </View>
        <Text style={s.fieldMember}>
          {t('member_label', 'Member')}: <Text style={{ fontWeight: '700' }}>{safeField.member || session?.name}</Text>
          {(safeField.memberId || session?.employeeId) ? (
            <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 11, color: COLORS.primary, fontWeight: '700' }}> · ID: {safeField.memberId || session?.employeeId}</Text>
          ) : null}
        </Text>
        <Text style={s.fieldSync}>
          <Ionicons name={safeField.synced ? 'cloud-done-outline' : 'cloud-offline-outline'} size={14} color={safeField.synced ? '#267326' : '#C97A00'} />
          {' '}{safeField.synced ? `${t('synced', 'Synced')} ${formatSyncTime(safeField.lastSync)}` : `${t('not_synced', 'Not synced')} (${formatSyncTime(safeField.lastSync)})`}
        </Text>
      </View>

      {/* Quick Log Action Bar */}
      <View style={s.actionRow}>
        <TouchableOpacity style={s.primaryActionBtn} onPress={onOpenAddLog} activeOpacity={0.8}>
          <Ionicons name="add-circle" size={18} color="#FFF" />
          <Text style={s.primaryActionText} numberOfLines={1} adjustsFontSizeToFit>{t('record_field_log_btn', 'Record Field Log')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.secondaryActionBtn} onPress={onOpenPlanner} activeOpacity={0.8}>
          <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
          <Text style={s.secondaryActionText} numberOfLines={1} adjustsFontSizeToFit>{t('planner_btn_label', 'Planner')}</Text>
        </TouchableOpacity>
      </View>

      {/* Activity & History Preview */}
      <View style={s.historyCard}>
        <View style={s.historyHeader}>
          <View>
            <Text style={s.historyTitle}>{t('ops_title', 'Field Activity & Ledger')}</Text>
            <Text style={s.historySub}>{fieldLogs.length} submitted{draftLogsCount > 0 ? ` · ${draftLogsCount} draft${draftLogsCount !== 1 ? 's' : ''}` : ''}</Text>
          </View>
          <TouchableOpacity onPress={onOpenLedger}>
            <Text style={s.seeAllText}>{t('view_all_link', 'View All →')}</Text>
          </TouchableOpacity>
        </View>

        {fieldLogs.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyText}>{t('no_ops_recorded_plot', 'No operations recorded for this plot yet.')}</Text>
          </View>
        ) : (
          fieldLogs.slice(0, 3).map(log => (
            <View key={log.id} style={s.logItem}>
              <View style={s.logDot} />
              <View style={{ flex: 1 }}>
                <Text style={s.logActivity}>{log.activity}</Text>
                <Text style={s.logDate}>{log.date} · {formatStageName ? formatStageName(log.stageName) : (log.stageName || 'General Stage')}</Text>
              </View>
              <Text style={s.logCost}>₱{Number(log.cost || 0).toLocaleString()}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: SPACING.sm },
  sectionLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', color: COLORS.textMuted, marginBottom: 6, letterSpacing: 0.5 },
  selectorScroll: { marginBottom: SPACING.md },
  fieldChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: '#FFF', borderWidth: 1, borderColor: COLORS.border },
  fieldChipActive: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  fieldChipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  fieldChipTextActive: { color: COLORS.primary, fontWeight: '800' },
  fieldCard: { backgroundColor: '#FFF', borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md, ...SHADOW.xs },
  fieldCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  fieldIdBadge: { backgroundColor: COLORS.primaryBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.sm },
  fieldIdText: { fontSize: 13, fontWeight: '900', color: COLORS.primary },
  fieldHa: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  fieldMember: { fontSize: 12, color: COLORS.text, fontWeight: '600', marginBottom: 4 },
  fieldSync: { fontSize: 11, color: COLORS.textMuted },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.md },
  primaryActionBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 8, borderRadius: RADIUS.lg },
  primaryActionText: { color: '#FFF', fontSize: 12.5, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  secondaryActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#FFF', borderWidth: 1, borderColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 8, borderRadius: RADIUS.lg },
  secondaryActionText: { color: COLORS.primary, fontSize: 12, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  historyCard: { backgroundColor: '#FFF', borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.xs },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  historyTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  historySub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  seeAllText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  emptyBox: { paddingVertical: 16, alignItems: 'center' },
  emptyText: { fontSize: 12, color: COLORS.textMuted },
  logItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  logDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  logActivity: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  logDate: { fontSize: 10, color: COLORS.textMuted, marginTop: 1 },
  logCost: { fontSize: 12, fontWeight: '800', color: COLORS.text }
});

export default React.memo(MemberFieldOpsView);
