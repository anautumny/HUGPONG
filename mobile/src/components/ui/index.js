import React from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { AppText as Text } from '../Typography';

// ── ScreenHeader ──────────────────────────────────────────────────
export function ScreenHeader({
  title,
  subtitle,
  onBackPress,
  rightAction,
  style
}) {
  return (
    <View style={[styles.headerContainer, style]}>
      <View style={styles.headerLeft}>
        {onBackPress && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBackPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
        )}
        <View style={styles.titleWrap}>
          <Text style={styles.headerTitle}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={2} accessibilityLabel={subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {React.isValidElement(rightAction) ? (
        rightAction
      ) : rightAction ? (
        <TouchableOpacity
          style={[
            styles.rightActionBtn,
            rightAction.active && styles.rightActionBtnActive,
            rightAction.style
          ]}
          onPress={rightAction.onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={rightAction.accessibilityLabel || rightAction.label || 'Screen action'}
        >
          {rightAction.icon && (
            <Ionicons
              name={rightAction.icon}
              size={18}
              color={rightAction.active ? '#FFFFFF' : COLORS.primary}
            />
          )}
          {rightAction.label ? (
            <Text style={[styles.rightActionLabel, rightAction.active && styles.rightActionLabelActive]}>
              {rightAction.label}
            </Text>
          ) : null}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Card ──────────────────────────────────────────────────────────
export function Card({
  children,
  style,
  variant = 'default',
  onPress,
  ...rest
}) {
  const cardStyle = [
    styles.cardBase,
    variant === 'subtle' ? styles.cardSubtle : styles.cardDefault,
    style
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        style={cardStyle}
        onPress={onPress}
        activeOpacity={0.8}
        {...rest}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={cardStyle} {...rest}>
      {children}
    </View>
  );
}

// ── PrimaryButton ─────────────────────────────────────────────────
export function PrimaryButton({
  title,
  onPress,
  icon,
  disabled = false,
  loading = false,
  style,
  textStyle
}) {
  return (
    <TouchableOpacity
      style={[
        styles.primaryBtn,
        disabled && styles.btnDisabled,
        style
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <>
          {icon && (
            <Ionicons
              name={icon}
              size={16}
              color="#FFFFFF"
              style={styles.buttonIcon}
            />
          )}
          <Text style={[styles.primaryBtnText, textStyle]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ── SecondaryButton ───────────────────────────────────────────────
export function SecondaryButton({
  title,
  onPress,
  icon,
  disabled = false,
  style,
  textStyle
}) {
  return (
    <TouchableOpacity
      style={[
        styles.secondaryBtn,
        disabled && styles.btnDisabled,
        style
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={16}
          color={COLORS.primary}
          style={styles.buttonIcon}
        />
      )}
      <Text style={[styles.secondaryBtnText, textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────
export function StatusBadge({
  status = 'active',
  label,
  style
}) {
  const normalized = String(status || '').trim().toLowerCase();
  const isSuccess = ['success', 'active', 'completed', 'recorded', 'synced'].includes(normalized);
  const isPending = ['pending', 'offline', 'unsynced', 'retrying'].includes(normalized);
  const isWarning = normalized === 'warning' || normalized === 'amended';
  const labels = {
    active: 'Active', archived: 'Archived', synced: 'Synced', unsynced: 'Unsynced',
    pending: 'Pending', retrying: 'Retrying', failed: 'Failed', conflict: 'Conflict', amended: 'Amended'
  };

  const badgeBg = isSuccess ? '#F2FBF2' : isPending ? '#FFFBF0' : isWarning ? '#EBF3FB' : '#F3F4F6';
  const badgeBorder = isSuccess ? '#D5ECD5' : isPending ? '#FEF0D0' : isWarning ? '#CCE0F5' : '#E5E7EB';
  const badgeColor = isSuccess ? '#16A34A' : isPending ? '#C97A00' : isWarning ? '#0B63B7' : '#4B5563';

  return (
    <View style={[styles.badgeBase, { backgroundColor: badgeBg, borderColor: badgeBorder }, style]}>
      <Text style={[styles.badgeText, { color: badgeColor }]}>
        {label || labels[normalized] || String(status)}
      </Text>
    </View>
  );
}

// ── ProgressTrack ─────────────────────────────────────────────────
export function ProgressTrack({
  progress = 0,
  color = COLORS.primary,
  height = 6,
  style
}) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <View style={[styles.trackBase, { height, borderRadius: height / 2 }, style]}>
      <View
        style={[
          styles.trackFill,
          {
            width: `${clampedProgress}%`,
            backgroundColor: color,
            borderRadius: height / 2
          }
        ]}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Header
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    minHeight: 64
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0
  },
  backButton: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  titleWrap: {
    flex: 1,
    minWidth: 0
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.2
  },
  headerSubtitle: {
    flexShrink: 1,
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2
  },
  rightActionBtn: {
    minHeight: 38,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EAF6E7',
    borderWidth: 1,
    borderColor: '#BFE7B6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md
  },
  rightActionBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary
  },
  rightActionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    textAlignVertical: 'center',
    includeFontPadding: false
  },
  rightActionLabelActive: {
    color: '#FFFFFF'
  },

  // Card
  cardBase: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: 8
  },
  cardDefault: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card
  },
  cardSubtle: {
    backgroundColor: '#F8FAF5',
    borderWidth: 1,
    borderColor: '#E2EBDC'
  },

  // Primary Button
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    ...SHADOW.xs
  },
  primaryBtnText: {
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.2
  },

  // Secondary Button
  secondaryBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46
  },
  secondaryBtnText: {
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: '700'
  },
  btnDisabled: {
    opacity: 0.55
  },
  buttonIcon: {
    flexShrink: 0,
    marginRight: 6
  },

  // Badge
  badgeBase: {
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start'
  },
  badgeText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '800'
  },

  // Progress Track
  trackBase: {
    backgroundColor: '#EEF2E6',
    overflow: 'hidden',
    width: '100%'
  },
  trackFill: {
    height: '100%'
  }
});

export { SearchableSelect, SearchableSelectModal } from './SearchableSelect';
export { SkeletonItem, AnalyticsOverviewSkeleton } from './Skeleton';
