// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — Audit History & Monthly Breakdown Modal Component
// Role: Farm Manager & SRA Admin Audit History Inspector
// ══════════════════════════════════════════════════════════════

import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOW } from '../theme';
import { auditLogs, blockFarms, getCurrentSession } from '../data/dataStore';
import { useTranslation } from '../services/i18n';
import { sortNewestFirst } from '../utils/dataHelpers';
import { exportAuditReportPdf } from '../services/auditPdfService';

const fmt = n => (Number.isFinite(n) ? n.toLocaleString('en-PH') : '0');

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
  const [exportingReportId, setExportingReportId] = useState(null);
  const orderedAudits = sortNewestFirst(Array.isArray(reports) ? reports : auditLogs, ['certifiedAt', 'compiledAt', 'createdAt', 'period', 'month']);

  // Deduplicate audits by period/month so chips don't show duplicate identical pills
  const uniquePeriodAudits = useMemo(() => {
    const map = new Map();
    orderedAudits.forEach(audit => {
      const key = audit.periodKey || audit.month || audit.period || 'Unknown';
      if (!map.has(key)) {
        map.set(key, audit);
      }
    });
    return Array.from(map.values());
  }, [orderedAudits]);

  const [selectedAuditId, setSelectedAuditId] = useState(uniquePeriodAudits[0]?.id || orderedAudits[0]?.id || 'AUD-2026-05');
  const activeAudit = orderedAudits.find(a => (a.id === selectedAuditId || a.reportId === selectedAuditId)) || uniquePeriodAudits[0] || orderedAudits[0] || {};

  // Extract operations list
  const operationsList = Array.isArray(activeAudit.operationSnapshots) && activeAudit.operationSnapshots.length > 0
    ? activeAudit.operationSnapshots
    : (Array.isArray(activeAudit.operations) && activeAudit.operations.length > 0
      ? activeAudit.operations
      : (Array.isArray(activeAudit.logs) && activeAudit.logs.length > 0 ? activeAudit.logs : []));

  // Derive Fields Reported count reliably
  const derivedFieldCount = activeAudit.fieldsReported ?? activeAudit.fieldCount ?? (
    Array.isArray(activeAudit.fieldSnapshots) && activeAudit.fieldSnapshots.length > 0
      ? activeAudit.fieldSnapshots.length
      : (operationsList.length > 0 ? new Set(operationsList.map(o => o.fieldId).filter(Boolean)).size : 1)
  );

  // Derive Compiled Logs count reliably
  const derivedLogsCount = activeAudit.logsCount ?? activeAudit.totalLogs ?? activeAudit.operationCount ?? operationsList.length ?? 0;

  // Format Generated Date
  const rawDate = activeAudit.dateGenerated || activeAudit.compiledAt || activeAudit.createdAt || activeAudit.submittedAt;
  const displayDateGenerated = rawDate
    ? (typeof rawDate === 'string' && (rawDate.includes('T') || rawDate.includes('-'))
        ? new Date(rawDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
        : String(rawDate))
    : 'Recently generated';

  // Format Verifier & Farm Name
  const isCertified = activeAudit.status === 'CERTIFIED' || activeAudit.certificationStatus === 'certified';
  const displayVerifier = activeAudit.verifiedBy || activeAudit.certifiedByName || (isCertified ? 'SRA Certified Inspector' : 'Pending SRA Inspection');
  const displayFarm = activeAudit.blockFarmName || activeAudit.blockFarm || activeAudit.blockFarmId || 'District Block Farm';

  const handleExportPdf = async report => {
    const reportId = report?.reportId || report?.id || report?.periodKey || report?.period || report?.month || 'report';
    if (exportingReportId) return;
    setExportingReportId(reportId);
    try {
      await exportAuditReportPdf(report, {
        blockFarms,
        currentUser: getCurrentSession()
      });
    } catch (error) {
      Alert.alert('PDF Export Failed', error.message || 'The audit report could not be generated.');
    } finally {
      setExportingReportId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={{ width: 32, height: 32, borderRadius: RADIUS.sm, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="journal-outline" size={18} color={COLORS.primary} />
              </View>
              <View>
                <Text style={s.headerTitle}>{t('monthly_audit_history_title', 'Monthly Audit History')}</Text>
                <Text style={s.headerSub}>{t('audit_history_sub', 'Monthly operation breakdowns & SRA compliance records')}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* Monthly Selector Horizontal Chips */}
          <View style={{ gap: 6 }}>
            <Text style={s.sectionLabel}>{t('select_report_month', 'SELECT REPORT MONTH')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.monthScroll} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              {uniquePeriodAudits.map((audit, idx) => {
                const auditKey = audit.reportId || audit.id || `audit-${idx}`;
                const isSel = audit.id === selectedAuditId || audit.reportId === selectedAuditId;
                return (
                  <TouchableOpacity
                    key={auditKey}
                    style={[s.monthChip, isSel && s.monthChipActive]}
                    onPress={() => setSelectedAuditId(audit.id || audit.reportId)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="calendar-outline" size={14} color={isSel ? COLORS.primary : COLORS.textMuted} />
                    <Text style={[s.monthChipText, isSel && s.monthChipTextActive]}>
                      {formatPhaseMonth ? formatPhaseMonth(audit.month) : (audit.month || audit.period || 'Report')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Selected Month Audit Summary Banner */}
          <View style={s.summaryCard}>
            <View style={s.summaryTop}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={s.monthTitle}>
                  {formatPhaseMonth ? formatPhaseMonth(activeAudit.month) : (activeAudit.month || activeAudit.period || 'Monthly')} {t('audit_report_suffix', 'Audit Report')}
                </Text>
                <Text style={s.reportFarm}>{displayFarm}</Text>
              </View>
              <View style={[s.statusBadge, !isCertified && { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name={isCertified ? "checkmark-done-circle" : "shield-checkmark"} size={14} color={isCertified ? COLORS.primary : '#D97706'} />
                <Text style={[s.statusText, !isCertified && { color: '#B45309' }]}>
                  {isCertified ? t('verified_sra_badge', 'Verified SRA') : 'Pending SRA Review'}
                </Text>
              </View>
            </View>

            {/* 3 Metric Tiles (Total Cost, Fields Reported, Compiled Logs) */}
            <View style={s.statsGrid}>
              <View style={s.statItem}>
                <Text style={s.statVal}>₱{fmt(activeAudit.totalCost)}</Text>
                <Text style={s.statLbl}>{t('total_cost_label', 'Total Cost')}</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Text style={[s.statVal, { color: COLORS.primary }]}>{derivedFieldCount}</Text>
                <Text style={s.statLbl}>{t('fields_reported_lbl', 'Fields Reported')}</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Text style={s.statVal}>{derivedLogsCount}</Text>
                <Text style={s.statLbl}>{t('compiled_logs_lbl', 'Compiled Logs')}</Text>
              </View>
            </View>

            {/* Summary Metadata Details Box */}
            <View style={s.metaBox}>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>{t('date_time_gen', 'Date & Time Generated:')}</Text>
                <Text style={s.metaValue}>{displayDateGenerated}</Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>{t('qr_payload_id', 'QR Payload ID:')}</Text>
                <Text style={[s.metaValue, { color: COLORS.primary, fontFamily: 'monospace', fontSize: 11 }]}>
                  {activeAudit.qrSignature || activeAudit.qrHash || 'Unavailable'}
                </Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>{t('inspector_verifier', 'Inspector Verifier:')}</Text>
                <Text style={s.metaValue}>{displayVerifier}</Text>
              </View>
            </View>

            {/* Actions: View QR & Export PDF */}
            <View style={s.actionRow}>
              <TouchableOpacity
                style={s.qrBtn}
                onPress={() => {
                  if (onOpenQR) onOpenQR(activeAudit);
                  else Alert.alert('SRA Audit QR Code', `QR Code Signature:\n${activeAudit.qrSignature || activeAudit.qrHash}`);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="qr-code-outline" size={16} color="#fff" />
                <Text style={s.qrBtnText} numberOfLines={1}>{t('view_qr_code_btn', 'View SRA QR Code')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.pdfBtn, exportingReportId && { opacity: 0.65 }]}
                onPress={() => handleExportPdf(activeAudit)}
                disabled={Boolean(exportingReportId)}
                activeOpacity={0.8}
              >
                {exportingReportId ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Ionicons name="download-outline" size={16} color={COLORS.primary} />
                )}
                <Text style={s.pdfBtnText} numberOfLines={1}>
                  {exportingReportId ? 'Preparing PDF...' : t('export_pdf_btn', 'Export PDF Report')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Compiled Operations Breakdown Section */}
          <View style={{ gap: 10, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 }}>
              <Text style={s.sectionLabel}>
                {t('compiled_operations_title', 'COMPILED OPERATION SNAPSHOTS')} ({operationsList.length})
              </Text>
              <View style={{ backgroundColor: COLORS.primaryBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.xs }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.primary }}>Verified Operations</Text>
              </View>
            </View>

            {operationsList.length > 0 ? (
              <View style={s.operationsCard}>
                {operationsList.map((op, opIdx) => {
                  const isLast = opIdx === operationsList.length - 1;
                  return (
                    <View key={op.operationLogId || op.id || `op-${opIdx}`} style={[s.operationRow, isLast && { borderBottomWidth: 0, paddingBottom: 0 }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text, flex: 1 }}>
                          {op.operationName || op.activity || op.operationDefinitionId || 'Operation Entry'}
                        </Text>
                        <Text style={{ fontSize: 13.5, fontWeight: '900', color: COLORS.primary }}>
                          ₱{Number(op.totalCost || op.cost || 0).toLocaleString()}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                        <View style={{ backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs }}>
                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: COLORS.textSecondary }}>
                            {op.fieldId || 'Field'}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, color: COLORS.textMuted }}>
                          {op.performedOn || op.date || '—'}
                        </Text>
                        <Text style={{ fontSize: 11, color: COLORS.textMuted }}>·</Text>
                        <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' }}>
                          Stage {op.stageNumber || 1}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={[s.operationsCard, { paddingVertical: 24, alignItems: 'center', gap: 6 }]}>
                <Ionicons name="document-text-outline" size={28} color={COLORS.textMuted} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textSecondary }}>No operation logs recorded in this period</Text>
              </View>
            )}
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
  safe: { flex: 1, backgroundColor: '#F8FAF5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  headerTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  headerSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },

  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 },

  sectionLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },

  monthScroll: { marginHorizontal: -SPACING.lg, paddingHorizontal: SPACING.lg },
  monthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1.2,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff'
  },
  monthChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  monthChipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  monthChipTextActive: { fontWeight: '800', color: COLORS.primary },

  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1.2,
    borderColor: '#E5E7EB',
    ...SHADOW.card,
    gap: 14
  },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  monthTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text, letterSpacing: -0.2 },
  reportFarm: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.primaryBg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.xs },
  statusText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },

  statsGrid: { flexDirection: 'row', backgroundColor: '#F8FAF5', borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', borderWidth: 1, borderColor: '#EDF2E8' },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 17, fontWeight: '900', color: COLORS.text },
  statLbl: { fontSize: 10.5, fontWeight: '600', color: COLORS.textMuted, marginTop: 3 },
  statDivider: { width: 1, height: 26, backgroundColor: '#E2E8DC' },

  metaBox: { backgroundColor: '#F8FAF5', padding: 12, borderRadius: RADIUS.md, gap: 7, borderWidth: 1, borderColor: '#EDF2E8' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  metaValue: { fontSize: 11.5, fontWeight: '800', color: COLORS.text },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  qrBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 8, borderRadius: RADIUS.md, ...SHADOW.sm },
  qrBtnText: { fontSize: 12.5, fontWeight: '800', color: '#fff', textAlign: 'center' },
  pdfBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#FFFFFF', borderWidth: 1.2, borderColor: '#D1D5DB', paddingVertical: 12, paddingHorizontal: 8, borderRadius: RADIUS.md },
  pdfBtnText: { fontSize: 12.5, fontWeight: '800', color: COLORS.text, textAlign: 'center' },

  operationsCard: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: 14, borderWidth: 1.2, borderColor: '#E5E7EB', gap: 10, ...SHADOW.card },
  operationRow: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 2 }
});
