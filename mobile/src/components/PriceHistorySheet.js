import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AnimatedBottomSheet from './AnimatedBottomSheet';
import { AppText as Text } from './Typography';
import Pagination, { usePagination } from './ui/Pagination';
import { authenticatedRequest } from '../services/authService';
import { getCurrentSession } from '../data/dataStore';
import { priceText } from '../utils/pricePresentation';
import { COLORS } from '../theme';

// The recent chart remains a server-calculated window. This browser follows the
// server cursor to make the complete published ledger available on demand.
export default function PriceHistorySheet({ visible, onClose, ownerId }) {
  const [records, setRecords] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const busy = useRef(false);
  const page = usePagination(records, { resetKey: `${visible}:${ownerId}` });

  const load = async (after, token = generation.current) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError('');
    const current = () => {
      const session = getCurrentSession();
      return generation.current === token && (session?.employeeId || session?.id) === ownerId;
    };
    try {
      const response = await authenticatedRequest(`/api/prices?limit=50${after ? `&cursor=${encodeURIComponent(after)}` : ''}`);
      if (!current()) return;
      setRecords(previous => [...new Map([...(after ? previous : []), ...(response.data || [])].map(row => [row.id, row])).values()]);
      setCursor(response.page?.nextCursor || null);
    } catch (err) {
      if (current()) setError(err.message || 'Could not load price history.');
    } finally {
      if (generation.current === token) { busy.current = false; setLoading(false); }
    }
  };

  useEffect(() => {
    const token = ++generation.current;
    busy.current = false;
    setRecords([]); setCursor(null); setError(''); setLoading(false);
    if (visible && ownerId) load(null, token);
    return () => { generation.current++; busy.current = false; };
  }, [visible, ownerId]);

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.header}>
        <Text style={styles.title}>Published price history</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close price history" style={styles.close}>
          <Ionicons name="close" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {page.items.map(row => (
          <View key={row.id} style={styles.record}>
            <Text style={styles.date}>{row.weekLabel || row.effectiveDate}</Text>
            <Text style={styles.muted}>{row.effectiveDate}{row.circularNumber ? ` · ${row.circularNumber}` : ''}</Text>
            <Text style={styles.text}>Raw sugar: {priceText(row.sugarPricePerLkg, row.sugarPriceStatus, 'Lkg')}</Text>
            <Text style={styles.text}>Molasses: {priceText(row.molassesPricePerMetricTon, row.molassesPriceStatus, 'MT')}</Text>
          </View>
        ))}
        {!records.length && !loading && !error && <Text style={styles.muted}>No published price records.</Text>}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {loading && <Text style={styles.muted}>Loading price history…</Text>}
        <Pagination {...page} label="price records" />
        {(cursor || (!records.length && error)) && (
          <TouchableOpacity style={styles.button} accessibilityRole="button" disabled={loading} onPress={() => load(cursor)}>
            <Text style={styles.buttonText}>{loading ? 'Loading…' : cursor ? 'Load older price records' : 'Retry'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </AnimatedBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '90%', backgroundColor: COLORS.surface },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderColor: COLORS.border, gap: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: COLORS.text },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  record: { padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, gap: 6 },
  date: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  muted: { color: COLORS.textMuted, fontSize: 12 },
  text: { color: COLORS.text, fontSize: 14 },
  error: { color: COLORS.danger || '#b91c1c', fontSize: 14 },
  button: { minHeight: 44, padding: 12, alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 10 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
