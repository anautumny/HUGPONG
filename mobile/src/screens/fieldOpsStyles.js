import { Dimensions, Platform, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';

const { height, width } = Dimensions.get('window');

export default StyleSheet.create({
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
  reticleCorner: { position: 'absolute', width: 36, height: 36, borderColor: '#4ADE80', borderWidth: 4 },
  reticleTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 12 },
  reticleTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 12 },
  reticleBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 12 },
  reticleBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 12 },
  laserLine: { width: '85%', height: 2, backgroundColor: '#4ADE80', shadowColor: '#4ADE80', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: 4 },
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
