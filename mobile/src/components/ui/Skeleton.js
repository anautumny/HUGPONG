import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../../theme';

/**
 * Reusable animated skeleton placeholder for smooth loading states.
 * Uses a subtle opacity pulse loop to prevent abrupt spinners and content layout shifts.
 */
export function SkeletonItem({
  width = '100%',
  height = 16,
  borderRadius = RADIUS.sm,
  style
}) {
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: '#E2E8F0',
          opacity: pulseAnim,
        },
        style,
      ]}
    />
  );
}

/**
 * Skeleton placeholder for Analytics overview cards.
 */
export function AnalyticsOverviewSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {/* Top Scope Card placeholder */}
      <View style={styles.scopeCardSkeleton}>
        <SkeletonItem width={90} height={24} borderRadius={RADIUS.sm} />
        <SkeletonItem width={110} height={24} borderRadius={RADIUS.sm} />
        <SkeletonItem width={80} height={24} borderRadius={RADIUS.sm} />
      </View>

      {/* Primary KPI Card skeleton */}
      <View style={styles.cardSkeleton}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonItem width="60%" height={12} />
            <SkeletonItem width="90%" height={28} borderRadius={RADIUS.sm} />
            <SkeletonItem width="75%" height={12} />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonItem width="50%" height={12} />
            <SkeletonItem width="80%" height={28} borderRadius={RADIUS.sm} />
            <SkeletonItem width="60%" height={12} />
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: COLORS.border, marginVertical: 4 }} />
        <SkeletonItem width="100%" height={16} />
      </View>

      {/* Secondary Progress skeleton */}
      <View style={styles.cardSkeleton}>
        <SkeletonItem width="40%" height={14} style={{ marginBottom: 4 }} />
        <SkeletonItem width="100%" height={36} borderRadius={RADIUS.md} />
        <SkeletonItem width="100%" height={36} borderRadius={RADIUS.md} />
        <SkeletonItem width="100%" height={36} borderRadius={RADIUS.md} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonContainer: {
    gap: 12,
    paddingVertical: 4,
  },
  scopeCardSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAF5',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.md,
    padding: 10,
  },
  cardSkeleton: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...SHADOW.card,
  },
});

export default SkeletonItem;
