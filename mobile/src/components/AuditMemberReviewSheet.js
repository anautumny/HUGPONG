import React, { useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AnimatedBottomSheet from './AnimatedBottomSheet';
import { AppText as Text } from './Typography';
import Pagination, { usePagination } from './ui/Pagination';
import { COLORS, RADIUS } from '../theme';

export default function AuditMemberReviewSheet({ data: incomingData, onClose, onContinue, onCall }) {
  // Retain the rows during the sheet's closing animation.
  const [lastReview, setLastReview] = useState(incomingData);
  if (incomingData && incomingData !== lastReview) setLastReview(incomingData);
  const data = incomingData || lastReview;
  const page = usePagination(data?.memberFollowUps || [], { resetKey: data && `${data.blockFarmId}:${data.periodKey}` });
  return (
    <AnimatedBottomSheet visible={Boolean(incomingData)} onClose={onClose} dismissible sheetStyle={styles.sheet}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Review Members Before Compiling</Text>
          <Text style={styles.note}>{data?.periodKey} · {data?.operationCount || 0} synchronized operations</Text>
        </View>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel member review" style={styles.close}>
          <Ionicons name="close" size={23} color={COLORS.text} />
        </TouchableOpacity>
      </View>
      <FlatList
        style={{ flexGrow: 0, flexShrink: 1, minHeight: 0 }}
        data={page.items}
        keyExtractor={member => member.memberId}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<View style={{ gap: 6 }}>
          <Text style={styles.note}>Call members to check whether they had no monthly work or still need to synchronize. Account inactivity is shown separately. You can compile the available operations.</Text>
          {data?.activityAvailable === false && <Text style={styles.note}>Account activity is unavailable. Monthly operation records were checked.</Text>}
          <Pagination {...page} label="members to review" position="top" />
        </View>}
        ListEmptyComponent={<Text style={styles.note}>No members need follow-up for this month.</Text>}
        renderItem={({ item: member }) => {
          const status = member.activity?.attentionStatus;
          const warning = ['CRITICAL', 'NEEDS_ATTENTION'].includes(status);
          const hasPhone = Boolean(String(member.contactNumber || '').replace(/[^+\d]/g, ''));
          return (
            <View style={styles.card}>
              <Text style={styles.name}>{member.memberName}</Text>
              {warning && <Text style={[styles.warning, status === 'CRITICAL' && { color: COLORS.danger }]}>{status === 'CRITICAL' ? 'Critical inactivity' : member.activity?.inactiveDays == null ? 'Activity not reported' : 'Inactivity warning'}</Text>}
              <Text style={styles.note}>{member.hasMonthlyOperations ? 'Monthly operations recorded; review account activity.' : 'No recorded operations for this month.'}</Text>
              <Text style={styles.note}>{member.activityNote}</Text>
              <Text style={styles.note}>{member.fieldIds.length ? `Plots: ${member.fieldIds.join(', ')}` : 'No active plot assigned.'}</Text>
              <Text style={styles.note}>{member.contactNumber || 'No registered contact number'}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={hasPhone ? `Call ${member.memberName}` : 'Call unavailable: no registered phone number'}
                disabled={!hasPhone}
                onPress={() => onCall(member.contactNumber)}
                style={[styles.call, !hasPhone && { opacity: 0.45 }]}
              >
                <Ionicons name="call" size={16} color="#fff" />
                <Text style={styles.buttonText}>{hasPhone ? 'Call Member' : 'Call Unavailable'}</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
      <View style={styles.footer}>
        {!data?.canCompile && <Text style={styles.note}>No eligible operations are available. You can contact members, but an empty report cannot be compiled.</Text>}
        <TouchableOpacity accessibilityRole="button" disabled={!data?.canCompile} onPress={onContinue} style={[styles.continue, !data?.canCompile && { opacity: 0.45 }]}>
          <Text style={styles.buttonText}>Compile Available Operations</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.close}>
          <Text style={styles.note}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </AnimatedBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '90%', borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl },
  header: { flexDirection: 'row', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  card: { padding: 13, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, gap: 5 },
  name: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  note: { fontSize: 12, color: COLORS.textMuted },
  warning: { fontSize: 12, fontWeight: '700', color: COLORS.warning },
  call: { minHeight: 44, padding: 10, backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 7 },
  continue: { minHeight: 48, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', padding: 12 },
});
