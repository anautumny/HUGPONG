/**
 * AdminOfflineBarrier.js — SRA Regulatory Authority Offline Security Barrier
 * Enforces strict online requirements for SRA Admin & Super Admin to preserve audit compliance.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import { checkConnectivity } from '../services/networkService';

const { width } = Dimensions.get('window');

export default function AdminOfflineBarrier({ onRetry, session = {} }) {
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckFailed, setLastCheckFailed] = useState(false);

  const handleRetry = async () => {
    if (isChecking) return;
    setIsChecking(true);
    setLastCheckFailed(false);
    try {
      const isOnline = await checkConnectivity(3500);
      if (!isOnline) {
        setLastCheckFailed(true);
      }
      if (typeof onRetry === 'function') onRetry(isOnline);
    } catch (e) {
      setLastCheckFailed(true);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.container}>
        {/* Regulatory Header Badge */}
        <View style={s.badgeWrap}>
          <View style={s.badge}>
            <Ionicons name="shield-checkmark" size={14} color={COLORS.primary} />
            <Text style={s.badgeText}>SRA REGULATORY AUTHORITY</Text>
          </View>
        </View>

        {/* Central Icon */}
        <View style={s.iconCircle}>
          <Ionicons name="cloud-offline-outline" size={48} color="#B45309" />
          <View style={s.statusDot}>
            <View style={s.innerDot} />
          </View>
        </View>

        {/* Title & Subtitle */}
        <Text style={s.title}>Regulatory Terminal Offline</Text>
        <Text style={s.subtitle}>
          The SRA Administrative & Regulatory Desk requires an active internet connection to ensure certified records, member approvals, and price broadcasts are validated in real time.
        </Text>

        {/* Compliance Guarantees Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Protected Administrative Services:</Text>

          <View style={s.featureRow}>
            <Ionicons name="lock-closed" size={16} color={COLORS.primary} style={s.featIcon} />
            <View style={{ flex: 1 }}>
              <Text style={s.featTitle}>Regulatory Audit Certification</Text>
              <Text style={s.featDesc}>Prevents unverified offline certification seals to preserve audit compliance.</Text>
            </View>
          </View>

          <View style={s.featureRow}>
            <Ionicons name="trending-up" size={16} color={COLORS.primary} style={s.featIcon} />
            <View style={{ flex: 1 }}>
              <Text style={s.featTitle}>Weekly Benchmark Broadcast</Text>
              <Text style={s.featDesc}>Official price circulars must synchronize immediately across all block farms.</Text>
            </View>
          </View>

          <View style={s.featureRow}>
            <Ionicons name="people" size={16} color={COLORS.primary} style={s.featIcon} />
            <View style={{ flex: 1 }}>
              <Text style={s.featTitle}>Member Farmer Registration</Text>
              <Text style={s.featDesc}>Validates 8-digit identification codes against central database.</Text>
            </View>
          </View>
        </View>

        {lastCheckFailed && (
          <View style={s.errorPill}>
            <Ionicons name="alert-circle" size={14} color="#B91C1C" />
            <Text style={s.errorText}>No internet connection detected. Please check Wi-Fi or cellular data.</Text>
          </View>
        )}

        {/* Retry Button */}
        <TouchableOpacity
          style={[s.retryBtn, isChecking && { opacity: 0.7 }]}
          onPress={handleRetry}
          disabled={isChecking}
          activeOpacity={0.8}
        >
          {isChecking ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={s.retryBtnText}>Retry Connection</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Footer Note for Field Roles */}
        <Text style={s.footerText}>
          Logged in as <Text style={{ fontWeight: '700' }}>{session?.name || 'SRA Administrator'}</Text> ({session?.role || 'SRA Admin'}). Field operations (offline log and draft capture) remain active for Member Farmers and Farm Managers in the field.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8FAF5',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeWrap: {
    marginBottom: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EBF3E8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#C3DEB5',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
    ...SHADOW.md,
  },
  statusDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#D97706',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 16,
    ...SHADOW.xs,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  featIcon: {
    marginTop: 2,
  },
  featTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  featDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 15,
    marginTop: 1,
  },
  errorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 11,
    color: '#B91C1C',
    fontWeight: '600',
  },
  retryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    ...SHADOW.sm,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  footerText: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16,
  },
});
