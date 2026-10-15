import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOW, SPACING } from '../theme';
import { AppText as Text } from './Typography';
import { decidePasswordRecoveryReview, fetchPasswordRecoveryReviews } from '../services/authService';

export default function RecoveryReviewQueue() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetchPasswordRecoveryReviews();
      setReviews(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      Alert.alert('Recovery reviews unavailable', error.message || 'Pending recovery reviews could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const decide = (review, approve) => {
    Alert.alert(
      approve ? 'Approve password recovery?' : 'Reject password recovery?',
      approve
        ? `Confirm that you met ${review.displayName} in person, checked valid identification, and confirmed the registered mobile number. The user will receive a 15-minute reset window.`
        : `Reject the recovery request for ${review.displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: approve ? 'Approve' : 'Reject',
          style: approve ? 'default' : 'destructive',
          onPress: async () => {
            setProcessingId(review.id);
            try {
              await decidePasswordRecoveryReview(review.id, approve);
              setReviews(current => current.filter(item => item.id !== review.id));
              Alert.alert(
                approve ? 'Recovery approved' : 'Recovery rejected',
                approve
                  ? 'The user has 15 minutes to create a new password and will receive a push alert if notifications were enabled.'
                  : 'The request was rejected. The user will receive a push alert if notifications were enabled.'
              );
            } catch (error) {
              Alert.alert('Decision not saved', error.message || 'The recovery decision could not be saved.');
            } finally {
              setProcessingId('');
            }
          }
        }
      ]
    );
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Password Recovery Reviews</Text>
          <Text style={s.subtitle}>Smart/TNT or unavailable-SMS requests require an in-person identity check.</Text>
        </View>
        <TouchableOpacity onPress={load} disabled={loading} style={s.refresh} accessibilityLabel="Refresh password recovery reviews">
          {loading ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="refresh" size={18} color={COLORS.primary} />}
        </TouchableOpacity>
      </View>
      {!loading && reviews.length === 0 && <Text style={s.empty}>No password recovery reviews are waiting in your scope.</Text>}
      {reviews.map(review => (
        <View key={review.id} style={s.review}>
          <Text style={s.name}>{review.displayName} · {review.userId}</Text>
          <Text style={s.meta}>Registered mobile: {review.registeredPhone || 'unavailable'}</Text>
          <Text style={s.meta}>{review.role} · Block Farm {review.blockFarmId || 'not assigned'}</Text>
          <Text style={s.meta}>Requested {new Date(review.requestedAt).toLocaleString()}</Text>
          <View style={s.actions}>
            <TouchableOpacity style={s.reject} disabled={Boolean(processingId)} onPress={() => decide(review, false)}><Text style={s.rejectText}>Reject</Text></TouchableOpacity>
            <TouchableOpacity style={s.approve} disabled={Boolean(processingId)} onPress={() => decide(review, true)}>
              {processingId === review.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.approveText}>Approve after in-person check</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: 12, ...SHADOW.xs },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 13.5, fontWeight: '900', color: COLORS.text },
  subtitle: { marginTop: 2, fontSize: 10.5, lineHeight: 15, color: COLORS.textMuted },
  refresh: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  empty: { marginTop: 12, fontSize: 11, color: COLORS.textMuted },
  review: { marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 },
  name: { fontSize: 12.5, fontWeight: '800', color: COLORS.text },
  meta: { marginTop: 2, fontSize: 10.5, color: COLORS.textMuted },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  reject: { borderWidth: 1, borderColor: COLORS.danger, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 9 },
  rejectText: { color: COLORS.danger, fontSize: 11, fontWeight: '800' },
  approve: { flex: 1, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center' },
  approveText: { color: '#fff', fontSize: 11, fontWeight: '800' }
});
