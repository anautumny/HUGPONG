import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { formatCropYear } from '../../data/firestoreSchema';

function displayOperationDate(operation) {
  const value = operation?.performedOn || operation?.date || operation?.period || '';
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) return value || 'Date unavailable';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ManagerFieldOpsView({
  fields = [],
  operations = [],
  isLoading = false,
  error = '',
  onEditOperation,
  onOpenHistory
}) {
  const operationsByField = React.useMemo(() => {
    const grouped = new Map();
    operations.forEach(operation => {
      const fieldId = String(operation?.fieldId || '').trim().toUpperCase();
      if (!fieldId) return;
      grouped.set(fieldId, [...(grouped.get(fieldId) || []), operation]);
    });
    return grouped;
  }, [operations]);

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Field Operations</Text>
          <Text style={s.subtitle}>Assigned Block Farm fields and their existing operation records</Text>
        </View>
        <TouchableOpacity style={s.historyBtn} onPress={onOpenHistory} activeOpacity={0.8}>
          <Ionicons name="receipt-outline" size={14} color={COLORS.primary} />
          <Text style={s.historyBtnText}>History &amp; Ledger</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={s.stateCard}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={s.stateText}>Loading field operations...</Text>
        </View>
      ) : error ? (
        <View style={[s.stateCard, s.errorCard]}>
          <Ionicons name="alert-circle-outline" size={20} color={COLORS.danger} />
          <Text style={[s.stateText, { color: COLORS.danger }]}>{error}</Text>
        </View>
      ) : fields.length === 0 ? (
        <View style={s.stateCard}>
          <Text style={s.stateText}>No assigned fields found.</Text>
        </View>
      ) : fields.map(field => {
        const fieldOperations = operationsByField.get(String(field.id || '').toUpperCase()) || [];
        const memberName = field.memberName || field.member || 'Unassigned';
        const area = Number(field.areaHa ?? field.ha ?? 0);
        const stageNumber = field.stageNumber || field.cropCycle?.currentStageNumber;
        const cycleParts = [
          field.cycleType || field.cropCycle?.cropType,
          formatCropYear(field.cropYear || field.cropCycle?.cropYear),
          stageNumber ? `Stage ${stageNumber}` : null,
          field.cropCycle?.status
        ].filter(Boolean);

        return (
          <View key={field.id} style={s.fieldCard}>
            <View style={s.fieldHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldId}>{field.id}</Text>
                <Text style={s.memberName}>{memberName}</Text>
                <Text style={s.area}>{area.toFixed(2)} ha</Text>
              </View>
              {cycleParts.length > 0 && (
                <View style={s.cycleBadge}>
                  <Text style={s.cycleText}>{cycleParts.join(' · ')}</Text>
                </View>
              )}
            </View>

            <Text style={s.operationLabel}>Operation</Text>
            {fieldOperations.length === 0 ? (
              <Text style={s.emptyText}>No recorded operations yet.</Text>
            ) : fieldOperations.map(operation => (
              <View key={operation.id} style={s.operationRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.operationName} numberOfLines={1}>
                    {operation.operationName || operation.activity || 'Field Operation'}
                  </Text>
                  <Text style={s.operationDate}>
                    {displayOperationDate(operation)}{operation.status === 'ARCHIVED' ? ' · Archived' : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[s.editBtn, operation.status === 'ARCHIVED' && s.disabledBtn]}
                  onPress={() => onEditOperation && onEditOperation(field, operation)}
                  disabled={operation.status === 'ARCHIVED'}
                  activeOpacity={0.8}
                >
                  <Ionicons name="create-outline" size={14} color={COLORS.primary} />
                  <Text style={s.editText}>Edit</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginBottom: SPACING.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  subtitle: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  historyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: '#FFF' },
  historyBtnText: { fontSize: 10.5, fontWeight: '800', color: COLORS.primary },
  stateCard: { minHeight: 90, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', gap: 8, padding: SPACING.md },
  errorCard: { borderColor: COLORS.danger + '50', backgroundColor: '#FFF5F5' },
  stateText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' },
  fieldCard: { backgroundColor: '#FFF', borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOW.xs },
  fieldHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  fieldId: { fontSize: 14, fontWeight: '900', color: COLORS.text },
  memberName: { fontSize: 12, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  area: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  cycleBadge: { maxWidth: '52%', backgroundColor: COLORS.primaryBg, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 5 },
  cycleText: { fontSize: 9.5, fontWeight: '800', color: COLORS.primary, textAlign: 'right' },
  operationLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 5 },
  emptyText: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic', paddingVertical: 5 },
  operationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAF5', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 8, marginTop: 5 },
  operationName: { fontSize: 12, fontWeight: '800', color: COLORS.text },
  operationDate: { fontSize: 10.5, color: COLORS.textMuted, marginTop: 2 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primaryBg, paddingHorizontal: 9, paddingVertical: 6, borderRadius: RADIUS.sm },
  disabledBtn: { opacity: 0.4 },
  editText: { fontSize: 11, fontWeight: '800', color: COLORS.primary }
});

export default React.memo(ManagerFieldOpsView);
