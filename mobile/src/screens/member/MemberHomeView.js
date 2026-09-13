import { getCurrentSession } from '../../data/dataStore';
// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — Member Home View Component
// Role: Sugarcane Block Farm Member
// ══════════════════════════════════════════════════════════════

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { useTranslation } from '../../services/i18n';

function MemberHomeView({
  session = {},
  myFields = [],
  navigation,
  onManualSync
}) {
  const { t, formatStageName } = useTranslation();
  const hasPlot = Array.isArray(myFields) && myFields.length > 0 && myFields[0] && myFields[0].id && myFields[0].id !== 'Unassigned (Pending Manager Allocation)';
  const primaryField = hasPlot ? myFields[0] : null;

  return (
    <View style={s.container}>
      {/* Primary Field Card */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{t('my_active_field', 'My Active Field')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Field Ops')}>
          <Text style={s.seeAllText}>{t('view_ops', 'View Ops')} →</Text>
        </TouchableOpacity>
      </View>

      {!hasPlot ? (
        <View style={[s.fieldCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
          <View style={s.fieldCardHeader}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[s.fieldId, { color: '#92400E' }]}>No Plot Allocated</Text>
                <View style={[s.memberIdBadge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                  <Text style={[s.memberIdBadgeText, { color: '#B45309' }]}>ID: {session?.employeeId || session?.contact || '—'}</Text>
                </View>
              </View>
              <Text style={[s.fieldFarm, { color: '#B45309' }]}>{session?.farm || session?.blockFarm || 'Block Farm'}</Text>
            </View>
            <View style={[s.haBadge, { backgroundColor: '#FEF3C7' }]}>
              <Text style={[s.haText, { color: '#B45309' }]}>UNASSIGNED</Text>
            </View>
          </View>

          <View style={[s.stageBox, { backgroundColor: '#FFF', borderColor: '#FDE68A', borderWidth: 1 }]}>
            <Text style={[s.stageLabel, { color: '#B45309' }]}>Plot Allocation Status</Text>
            <Text style={[s.stageValue, { color: '#78350F' }]}>Awaiting Plot Assignment by Farm Manager</Text>
            <Text style={{ fontSize: 11, color: '#92400E', marginTop: 3, lineHeight: 15 }}>
              Your member account is active. Once your Farm Manager registers your sugarcane plot in the cooperative registry, your plot hectarage and operations timeline will appear here.
            </Text>
          </View>

          <View style={s.actionRow}>
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#92400E' }]} onPress={() => navigation.navigate('Field Ops')} activeOpacity={0.8}>
              <Ionicons name="information-circle-outline" size={16} color="#FFF" />
              <Text style={s.actionBtnText} numberOfLines={1} adjustsFontSizeToFit>
                View Status Notice
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.syncActionBtn} onPress={onManualSync} activeOpacity={0.8}>
              <Ionicons name="sync" size={16} color={COLORS.primary} />
              <Text style={s.syncBtnText} numberOfLines={1} adjustsFontSizeToFit>
                {t('btn_sync_now', 'Sync Now')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={s.fieldCard}>
          <View style={s.fieldCardHeader}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={s.fieldId}>{primaryField.id}</Text>
                <View style={s.memberIdBadge}>
                  <Text style={s.memberIdBadgeText}>ID: {session?.employeeId || primaryField.memberId || session?.contact || '—'}</Text>
                </View>
              </View>
              <Text style={s.fieldFarm}>{session?.farm || session?.blockFarm || primaryField.blockFarm || 'Block Farm'}</Text>
            </View>
            <View style={s.haBadge}>
              <Text style={s.haText}>{primaryField.ha} Ha</Text>
            </View>
          </View>

          <View style={s.stageBox}>
            <Text style={s.stageLabel}>{t('current_stage', 'Current Stage')}</Text>
            <Text style={s.stageValue}>{formatStageName ? formatStageName(primaryField.stage) : primaryField.stage}</Text>
          </View>

          <View style={s.actionRow}>
            <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('Field Ops')} activeOpacity={0.8}>
              <Ionicons name="add-circle" size={16} color="#FFF" />
              <Text style={s.actionBtnText} numberOfLines={1} adjustsFontSizeToFit>
                {t('action_log_ops', 'Log Operation')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.syncActionBtn} onPress={onManualSync} activeOpacity={0.8}>
              <Ionicons name="sync" size={16} color={COLORS.primary} />
              <Text style={s.syncBtnText} numberOfLines={1} adjustsFontSizeToFit>
                {t('btn_sync_now', 'Sync Now')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: 0 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  seeAllText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  fieldCard: {
    backgroundColor: '#FFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card
  },
  fieldCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm },
  fieldId: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  memberIdBadge: { backgroundColor: '#F0F8EC', borderWidth: 1, borderColor: COLORS.primary + '30', paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.xs },
  memberIdBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.primary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  fieldFarm: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  haBadge: { backgroundColor: COLORS.primaryBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  haText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  stageBox: { backgroundColor: '#F8FAF5', padding: SPACING.sm, borderRadius: RADIUS.md, marginVertical: SPACING.sm },
  stageLabel: { fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: '600' },
  stageValue: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: SPACING.xs },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: RADIUS.md,
    minHeight: 42
  },
  actionBtnText: { fontSize: 12.5, fontWeight: '700', color: '#FFF', textAlign: 'center', flexShrink: 1 },
  syncActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primaryBg,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    minHeight: 42
  },
  syncBtnText: { fontSize: 12.5, fontWeight: '700', color: COLORS.primary, textAlign: 'center', flexShrink: 1 }
});

export default React.memo(MemberHomeView);
