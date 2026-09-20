import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';

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
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
        )}
        <View style={styles.titleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {rightAction && (
        <TouchableOpacity
          style={styles.rightActionBtn}
          onPress={rightAction.onPress}
          activeOpacity={0.7}
        >
          {rightAction.icon && (
            <Ionicons name={rightAction.icon} size={18} color={COLORS.primary} />
          )}
          {rightAction.label ? (
            <Text style={styles.rightActionLabel}>{rightAction.label}</Text>
          ) : null}
        </TouchableOpacity>
      )}
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
              style={{ marginRight: 6 }}
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
          style={{ marginRight: 6 }}
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
  const isSuccess = status === 'success' || status === 'active' || status === 'completed' || status === 'recorded';
  const isPending = status === 'pending' || status === 'offline';
  const isWarning = status === 'warning' || status === 'amended';

  const badgeBg = isSuccess ? '#F2FBF2' : isPending ? '#FFFBF0' : isWarning ? '#EBF3FB' : '#F3F4F6';
  const badgeBorder = isSuccess ? '#D5ECD5' : isPending ? '#FEF0D0' : isWarning ? '#CCE0F5' : '#E5E7EB';
  const badgeColor = isSuccess ? '#16A34A' : isPending ? '#C97A00' : isWarning ? '#0B63B7' : '#4B5563';

  return (
    <View style={[styles.badgeBase, { backgroundColor: badgeBg, borderColor: badgeBorder }, style]}>
      <Text style={[styles.badgeText, { color: badgeColor }]}>
        {label || status.toUpperCase()}
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
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    minHeight: 52
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: '#F8FAF5',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  titleWrap: {
    flex: 1
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.2
  },
  headerSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1
  },
  rightActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F4FAF0',
    borderWidth: 1,
    borderColor: '#D7ECD0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.md
  },
  rightActionLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.primary
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
    color: COLORS.text,
    fontSize: 13.5,
    fontWeight: '700'
  },
  btnDisabled: {
    opacity: 0.55
  },

  // Badge
  badgeBase: {
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start'
  },
  badgeText: {
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
