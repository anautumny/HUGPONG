// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — Audit History & Monthly Breakdown Modal Component
// Role: Farm Manager & SRA Admin Audit History Inspector
// ══════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOW } from '../theme';
import { auditLogs, operationLogs } from '../data/dataStore';
import { useTranslation } from '../services/i18n';
import { sortNewestFirst } from '../utils/dataHelpers';

const fmt = n => (Number.isFinite(n) ? n.toLocaleString('en-PH') : '—');

export default function AuditHistoryModal({
  visible = false,
  onClose,
  onOpenQR,
  reports = null,
  onLoadMore,
  hasMore = false,
  isLoading = false
}) {
  const { t, formatPhaseMonth } = useTranslation();
  const orderedAudits = sortNewestFirst(Array.isArray(reports) ? reports : auditLogs, ['certifiedAt', 'compiledAt', 'createdAt', 'period', 'month']);
  const [selectedAuditId, setSelectedAuditId] = useState(orderedAudits[0]?.id || 'AUD-2026-05');
  const activeAudit = orderedAudits.find(a => a.id === selectedAuditId) || orderedAudits[0] || {};

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.safe}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="journal-outline" size={20} color={COLORS.primary} />
              <Text style={s.headerTitle}>{t('monthly_audit_history_title', 'Block Farm Audit History')}</Text>
            </View>
            <Text style={s.headerSub}>{t('audit_history_sub', 'Monthly operation breakdowns & SRA compliance records')}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.content}>
          {/* Monthly Selector Horizontal Chips */}
          <Text style={s.sectionLabel}>{t('select_report_month', 'Select Report Month')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.monthScroll} contentContainerStyle={{ gap: 8 }}>
            {Array.from(new Map(orderedAudits.map(a => [a.reportId || a.id, a])).values()).map((audit, idx) => {
              const auditKey = audit.reportId || audit.id || `audit-${idx}`;
              const isSel = audit.id === selectedAuditId || audit.reportId === selectedAuditId;
              return (
                <TouchableOpacity
                  key={auditKey}
                  style={[s.monthChip, isSel && s.monthChipActive]}
                  onPress={() => setSelectedAuditId(audit.id || audit.reportId)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="calendar-outline" size={13} color={isSel ? COLORS.primary : COLORS.textMuted} />
                  <Text style={[s.monthChipText, isSel && s.monthChipTextActive]}>
                    {formatPhaseMonth ? formatPhaseMonth(audit.month) : audit.month}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Selected Month Audit Summary Banner */}
          <View style={s.summaryCard}>
            <View style={s.summaryTop}>
              <View>
                <Text style={s.monthTitle}>
                  {formatPhaseMonth ? formatPhaseMonth(activeAudit.month) : activeAudit.month} {t('audit_report_suffix', 'Audit Report')}
                </Text>
                <Text style={s.reportFarm}>{activeAudit.blockFarm}</Text>
              </View>
              <View style={s.statusBadge}>
                <Ionicons name="checkmark-done-circle" size={14} color={COLORS.primary} />
                <Text style={s.statusText}>{t('verified_sra_badge', activeAudit.status)}</Text>
              </View>
            </View>

            <View style={s.statsGrid}>
              <View style={s.statItem}>
                <Text style={s.statVal}>₱{fmt(activeAudit.totalCost)}</Text>
                <Text style={s.statLbl}>{t('total_cost_label', 'Total Cost')}</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Text style={s.statVal}>{activeAudit.fieldsReported}</Text>
                <Text style={s.statLbl}>{t('fields_reported_lbl', 'Fields Reported')}</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Text style={s.statVal}>{activeAudit.logsCount}</Text>
                <Text style={s.statLbl}>{t('compiled_logs_lbl', 'Compiled Logs')}</Text>
              </View>
            </View>

            {/* Summary Metadata Details */}
            <View style={{ backgroundColor: '#F8FAF5', padding: 12, borderRadius: RADIUS.md, gap: 6, borderWidth: 1, borderColor: COLORS.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: COLORS.textMuted }}>{t('date_time_gen', 'Date & Time Generated:')}</Text>
                <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text }}>{activeAudit.dateGenerated}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: COLORS.textMuted }}>{t('qr_payload_id', 'QR Payload ID:')}</Text>
                <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.primary, fontFamily: 'monospace' }}>
                  {activeAudit.qrSignature}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: COLORS.textMuted }}>{t('inspector_verifier', 'Inspector Verifier:')}</Text>
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.textSecondary }}>{activeAudit.verifiedBy}</Text>
              </View>
            </View>

            {/* Actions: View QR & Export PDF */}
            <View style={s.actionRow}>
              <TouchableOpacity
                style={s.qrBtn}
                onPress={() => {
                  if (onOpenQR) onOpenQR(activeAudit);
                  else Alert.alert('SRA Audit QR Code', `QR Code Signature:\n${activeAudit.qrSignature}`);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="qr-code-outline" size={15} color="#fff" />
                <Text style={s.qrBtnText} numberOfLines={1} adjustsFontSizeToFit>{t('view_qr_code_btn', 'View SRA QR Code')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.pdfBtn}
                onPress={() => {
                  Alert.alert(
                    'Exporting PDF',
                    `Generating Official Monthly Audit PDF for ${activeAudit.month}...`,
                    [
                      { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                      { text: 'Download', onPress: () => Alert.alert('Success', `HUGPONG_${activeAudit.month.replace(' ', '_')}_Audit_Report.pdf downloaded successfully to your device.`) }
                    ]
                  );
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="download-outline" size={15} color={COLORS.primary} />
                <Text style={s.pdfBtnText} numberOfLines={1} adjustsFontSizeToFit>{t('export_pdf_btn', 'Export PDF')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          {hasMore && (
            <TouchableOpacity style={s.qrBtn} disabled={isLoading} onPress={onLoadMore}>
              <Text style={s.qrBtnText}>{isLoading ? 'Loading...' : 'Load More Certified Audits'}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  headerTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  headerSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  closeBtn: { padding: 4 },

  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 36 },

  sectionLabel: { fontSize: 11.5, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  monthScroll: { marginHorizontal: -SPACING.lg, paddingHorizontal: SPACING.lg, marginBottom: 2 },
  monthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: '#fff'
  },
  monthChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  monthChipText: { fontSize: 12.5, fontWeight: '600', color: COLORS.textSecondary },
  monthChipTextActive: { fontWeight: '900', color: COLORS.primary },

  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SHADOW.card,
    gap: SPACING.md
  },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  monthTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  reportFarm: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primaryBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.xs },
  statusText: { fontSize: 10.5, fontWeight: '800', color: COLORS.primary },

  statsGrid: { flexDirection: 'row', backgroundColor: '#F8FAF5', borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  statLbl: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 24, backgroundColor: COLORS.border },

  summaryFooter: { borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 8, gap: 2 },
  metaText: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  qrBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 8, borderRadius: RADIUS.md, ...SHADOW.xs },
  qrBtnText: { fontSize: 12, fontWeight: '800', color: '#fff', textAlign: 'center', flexShrink: 1 },
  pdfBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primary + '40', paddingVertical: 12, paddingHorizontal: 8, borderRadius: RADIUS.md },
  pdfBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.primary, textAlign: 'center', flexShrink: 1 },

  stageBreakdownCard: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1.5, borderColor: COLORS.border, gap: 12, ...SHADOW.card },
  stageRow: { gap: 4 },
  stageTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stageName: { fontSize: 12.5, fontWeight: '800', color: COLORS.text, flex: 1 },
  stageCost: { fontSize: 12.5, fontWeight: '900', color: COLORS.primary },
  stagePct: { fontSize: 10.5, fontWeight: '600', color: COLORS.textMuted },
  barBackground: { height: 6, backgroundColor: '#EEF2E6', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },
  stageMeta: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },

  logItem: { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: 4, ...SHADOW.xs },
  logItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logFieldId: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  logMember: { fontSize: 11.5, color: COLORS.textMuted },
  logCost: { fontSize: 13, fontWeight: '900', color: COLORS.primary },
  logOpName: { fontSize: 12.5, color: COLORS.text, fontWeight: '600' },
  logItemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F5F5F5', paddingTop: 4, marginTop: 2 },
  logDate: { fontSize: 10.5, color: COLORS.textMuted },
  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  syncBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.primary }
});
