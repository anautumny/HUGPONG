import React from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../../theme';
import { formatDisplayDate, isLogLocked } from '../../data/dataStore';

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
              <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 5, paddingVertical: 1, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#FDE68A' }}>
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

export default CompactLogItem;
