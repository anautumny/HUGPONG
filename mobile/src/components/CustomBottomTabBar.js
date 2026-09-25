import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOW, RADIUS } from '../theme';
import { getCurrentSession, subscribe, getPendingSyncCount } from '../data/dataStore';
import { useTranslation } from '../services/i18n';
import { safeAlert } from '../utils/dialogs';

const TAB_CONFIG = {
  Home: {
    activeIcon: 'home',
    inactiveIcon: 'home-outline',
    translationKey: 'tab_home',
    fallbackLabel: 'Home',
  },
  Planner: {
    activeIcon: 'calculator',
    inactiveIcon: 'calculator-outline',
    translationKey: 'tab_planner',
    fallbackLabel: 'Planner',
  },
  'Field Ops': {
    activeIcon: 'leaf',
    inactiveIcon: 'leaf-outline',
    translationKey: 'tab_field_ops',
    fallbackLabel: 'Operation',
  },
  Profile: {
    activeIcon: 'person',
    inactiveIcon: 'person-outline',
    translationKey: 'tab_profile',
    fallbackLabel: 'Profile',
  },
};

/**
 * CustomBottomTabBar — High-contrast, outdoor-safe bottom navigation bar for HUGPONG mobile.
 * Features:
 *  - Clear localized typography and farm-themed iconography.
 *  - Prominent active capsule highlight and active indicator bar.
 *  - Real-time unsynced outbox badge on Field Ops.
 *  - Offline state handling with cloud-offline indicator and educational notice on tap.
 *  - Full safe-area padding for edge-to-edge Android/iOS devices.
 */
export default function CustomBottomTabBar({
  state,
  descriptors,
  navigation,
  insets,
  isOnline = true,
}) {
  const { t } = useTranslation();
  const [session, setSession] = useState(getCurrentSession());
  const [pendingCount, setPendingCount] = useState(() => getPendingSyncCount(getCurrentSession()));

  const bottomInset = insets?.bottom ? Math.max(insets.bottom, 8) : 8;

  useEffect(() => {
    const unsub = subscribe(() => {
      const cur = getCurrentSession();
      setSession(cur);
      setPendingCount(getPendingSyncCount(cur));
    });
    return unsub;
  }, []);

  return (
    <View
      style={[
        styles.barContainer,
        { paddingBottom: bottomInset }
      ]}
      accessibilityRole="tablist"
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const cfg = TAB_CONFIG[route.name] || {
          activeIcon: 'ellipse',
          inactiveIcon: 'ellipse-outline',
          fallbackLabel: route.name,
        };

        const isTabDisabled = !isOnline && (route.name === 'Home' || route.name === 'Profile');
        const rawLabel = (cfg.translationKey && t(cfg.translationKey)) || cfg.fallbackLabel || route.name;
        const label = typeof rawLabel === 'string' ? rawLabel : cfg.fallbackLabel;
        const iconName = isFocused && !isTabDisabled ? cfg.activeIcon : cfg.inactiveIcon;

        const hasPendingSync = route.name === 'Field Ops' && pendingCount > 0;

        const onPress = () => {
          if (isTabDisabled) {
            safeAlert(
              'Offline Mode Active',
              `${label} requires an active internet connection to synchronize with the cloud. Operation remains fully functional offline.`
            );
            return;
          }

          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          if (!isTabDisabled) {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          }
        };

        const iconColor = isTabDisabled
          ? '#94A3B8'
          : isFocused
          ? COLORS.primary
          : COLORS.textMuted;

        const textColor = isTabDisabled
          ? '#94A3B8'
          : isFocused
          ? COLORS.primary
          : COLORS.textSecondary;

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused, disabled: isTabDisabled }}
            accessibilityLabel={`${label}${hasPendingSync ? `, ${pendingCount} pending items to sync` : ''}${isTabDisabled ? ', offline disabled' : ''}`}
            accessibilityHint={isTabDisabled ? 'Internet connection required to access this tab' : undefined}
            onPress={onPress}
            onLongPress={onLongPress}
            activeOpacity={0.7}
            style={[
              styles.tabButton,
              isTabDisabled && styles.tabButtonDisabled
            ]}
          >
            {/* Top indicator bar */}
            <View
              style={[
                styles.activeIndicatorLine,
                { backgroundColor: isFocused && !isTabDisabled ? COLORS.primary : 'transparent' }
              ]}
            />

            {/* Icon capsule with pill highlight */}
            <View
              style={[
                styles.iconWrapper,
                isFocused && !isTabDisabled && styles.iconWrapperActive
              ]}
            >
              <Ionicons
                name={iconName}
                size={22}
                color={iconColor}
              />

              {/* Pending Sync Badge for Field Ops */}
              {hasPendingSync && (
                <View
                  style={styles.syncBadge}
                  accessibilityLabel={`${pendingCount} pending logs`}
                >
                  <Text style={styles.syncBadgeText}>
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </Text>
                </View>
              )}

              {/* Offline warning badge on disabled tabs */}
              {isTabDisabled && (
                <View style={styles.offlineChip}>
                  <Ionicons name="cloud-offline" size={9} color="#D97706" />
                </View>
              )}
            </View>

            {/* Localized Label */}
            <Text
              style={[
                styles.tabLabel,
                {
                  color: textColor,
                  fontWeight: isFocused && !isTabDisabled ? '800' : '600'
                }
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: '#E2EED9',
    paddingTop: 6,
    paddingHorizontal: 8,
    ...SHADOW.float,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingVertical: 2,
  },
  tabButtonDisabled: {
    opacity: 0.5,
  },
  activeIndicatorLine: {
    width: 24,
    height: 3,
    borderRadius: 1.5,
    marginBottom: 4,
  },
  iconWrapper: {
    width: 52,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  iconWrapperActive: {
    backgroundColor: '#E4EED8',
  },
  syncBadge: {
    position: 'absolute',
    top: -3,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.accent, // Warm harvest amber
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    ...SHADOW.card,
  },
  syncBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 12,
  },
  offlineChip: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: -0.2,
    marginTop: 2,
    textAlign: 'center',
    maxWidth: 88,
  },
});
