import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import AnimatedBottomSheet from './AnimatedBottomSheet';
import OfflineQRCode from './OfflineQRCode';
import { AppText as Text } from './Typography';
import { COLORS } from '../theme';
import { useTranslation } from '../services/i18n';
import { AUDIT_STATUS, canonicalAuditStatus } from '../domain/auditWorkflow';

export default function AuditQrSheet({ visible, onClose, data, qrRef, saving, onSave, submitting, onSendCloud }) {
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const [details, setDetails] = useState(false);
  useEffect(() => { setDetails(false); }, [visible]);
  const canSendCloud = canonicalAuditStatus(data?.report?.status) === AUDIT_STATUS.COMPILED;
  const copyId = async () => {
    try {
      await Clipboard.setStringAsync(data.reportId);
      Alert.alert(t('sheet_copied', "Report ID copied"), t('sheet_copied_hint', "SRA can use this ID to look up the report online."));
    } catch { Alert.alert(t('sheet_copy_failed', "Unable to copy"), t('sheet_copy_retry', "Try copying the report ID from Report details.")); }
  };
  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} dismissible expandable sheetStyle={s.sheet}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>{t('sheet_share_qr', "Share audit QR")}</Text>
        <Text style={s.hint}>{t('sheet_scan_hint', "Show this QR to the SRA scanner.")}</Text>
        <View style={s.card}>
          <View style={s.brand}><Ionicons name="leaf" size={17} color="#A9E59D" /><Text style={s.brandText}>HUGPONG</Text></View>
          <Text style={s.farm}>{data?.blockFarm || t('sheet_farm_missing', "Block farm not provided")}</Text>
          <Text style={s.period}>{data?.month || t('sheet_month_missing', "Month not recorded")} · {data?.cropYearCycle || t('sheet_year_missing', "Crop year not recorded")}</Text>
          <View style={s.qr}>
            <OfflineQRCode value={data?.qrPayload || ''} size={Math.min(256, width - 80)} color="#000000" />
          </View>
          <Text style={s.summary}>{data?.totalFields ?? 0} {t('sheet_plots', 'plots')} · {data?.totalLogs ?? 0} {t('sheet_operations', 'operations')} · ₱{Number(data?.totalCost ?? 0).toLocaleString('en-PH')}</Text>
        </View>
        <TouchableOpacity style={s.detailsToggle} onPress={() => setDetails(value => !value)} accessibilityRole="button" accessibilityState={{ expanded: details }}>
          <Text style={s.link}>{t('sheet_details', "Report details")}</Text><Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.primary} />
        </TouchableOpacity>
        {details && <View style={s.details}>
          <Text style={s.hint}>{t('sheet_manager', "Farm manager")}</Text><Text style={s.detailValue}>{data?.managerName || t('sheet_not_recorded', "Not recorded")}</Text>
          <Text style={s.hint}>{t('sheet_report_id', "Report ID")}</Text><Text selectable style={s.detailValue}>{data?.reportId}</Text>
          <Text style={s.hint}>{t('sheet_online_hint', "An internet connection is required to retrieve the report.")}</Text>
        </View>}
        <View style={s.actions}>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={onSave} style={[s.button, s.primary, saving && s.disabled]}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="download-outline" size={18} color="#fff" />}<Text style={s.primaryText}>{saving ? t('sheet_saving', 'Saving...') : t('sheet_save_qr', 'Save QR')}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={!data?.reportId} onPress={copyId} style={s.button}>
            <Ionicons name="copy-outline" size={18} color={COLORS.primary} /><Text style={s.link}>{t('sheet_copy_id', "Copy ID")}</Text>
          </TouchableOpacity>
        </View>
        {canSendCloud && <TouchableOpacity accessibilityRole="button" disabled={Boolean(submitting)} onPress={onSendCloud} style={s.cloud}>
          {submitting ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Text style={s.link}>{t('sheet_cloud', "Send through Cloud instead")}</Text>}
        </TouchableOpacity>}
      </ScrollView>
      {visible && data?.qrPayload && <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: -10000 }}>
        <OfflineQRCode ref={qrRef} value={data.qrPayload} size={320} footerLines={[
          `HUGPONG - ${t('sheet_transfer', 'Audit transfer')}`,
          ...(String(data.blockFarm || '').match(/.{1,52}(?:\s|$)|.{1,52}/g) || []),
          `${data.month || ''} · ${data.cropYearCycle || ''}`,
          data.reportId || '',
        ]} />
      </View>}
    </AnimatedBottomSheet>
  );
}

const s = StyleSheet.create({
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '94%' },
  content: { paddingHorizontal: 20, paddingBottom: 12, gap: 10, width: '100%', maxWidth: 440, alignSelf: 'center' },
  title: { fontSize: 19, fontWeight: '800', color: COLORS.text },
  hint: { fontSize: 12, lineHeight: 18, color: COLORS.textMuted },
  card: { borderWidth: 1, borderColor: '#DDE8D8', backgroundColor: '#F8FBF5', borderRadius: 16, overflow: 'hidden', alignItems: 'center', paddingBottom: 12 },
  brand: { width: '100%', backgroundColor: '#173D24', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9 },
  brandText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4, color: '#fff' },
  farm: { fontSize: 13, fontWeight: '700', color: COLORS.text, paddingHorizontal: 14, paddingTop: 12, textAlign: 'center' },
  period: { fontSize: 12, color: COLORS.textSecondary, paddingHorizontal: 12, marginTop: 4, textAlign: 'center' },
  qr: { backgroundColor: '#fff', marginVertical: 10, borderRadius: 12, overflow: 'hidden' },
  summary: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: 8 },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  details: { gap: 4, paddingBottom: 8 },
  detailValue: { fontSize: 12, color: COLORS.text, marginBottom: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { flexGrow: 1, flexBasis: 110, minHeight: 48, borderRadius: 12, backgroundColor: '#F0F6EB', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 10 },
  primary: { backgroundColor: COLORS.primary },
  primaryText: { fontSize: 13, color: '#fff', fontWeight: '700' },
  link: { fontSize: 13, color: COLORS.primary, fontWeight: '700', flexShrink: 1 },
  cloud: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.6 },
});
