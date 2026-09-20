import React, { useRef, useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated, Easing, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOW } from '../theme';
import { checkConnectivity } from '../services/networkService';

export default function CirclingRetryButton({
  onResult,
  label = 'Scan for Internet',
  scanningLabel = 'Scanning for Internet...',
  style,
  textStyle,
  iconColor = '#fff',
  theme = 'primary', // 'primary' | 'secondary' | 'light'
}) {
  const [isScanning, setIsScanning] = useState(false);
  const spinValue = useRef(new Animated.Value(0)).current;
  const loopAnim = useRef(null);

  const startSpin = () => {
    spinValue.setValue(0);
    loopAnim.current = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 750,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loopAnim.current.start();
  };

  const stopSpin = () => {
    if (loopAnim.current) {
      loopAnim.current.stop();
    }
    spinValue.setValue(0);
  };

  const handlePress = async () => {
    if (isScanning) return;
    setIsScanning(true);
    startSpin();

    try {
      // Actively ping connection
      const online = await checkConnectivity(3500);
      if (typeof onResult === 'function') {
        onResult(online);
      }
    } catch (err) {
      if (typeof onResult === 'function') {
        onResult(false);
      }
    } finally {
      // Keep rotation visible for a minimum of 400ms for smooth visual feel
      setTimeout(() => {
        stopSpin();
        setIsScanning(false);
      }, 400);
    }
  };

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const isLight = theme === 'light';
  const isSecondary = theme === 'secondary';

  const btnBg = isLight ? '#FFF' : (isSecondary ? '#F0F4EC' : COLORS.primary);
  const btnBorder = isLight ? '#DDE7D8' : (isSecondary ? '#C8D9C0' : COLORS.primary);
  const textColor = isLight || isSecondary ? COLORS.primary : '#FFF';
  const actualIconColor = isLight || isSecondary ? COLORS.primary : iconColor;

  return (
    <TouchableOpacity
      style={[
        s.button,
        { backgroundColor: btnBg, borderColor: btnBorder },
        isScanning && { opacity: 0.85 },
        style,
      ]}
      onPress={handlePress}
      disabled={isScanning}
      activeOpacity={0.8}
    >
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <Ionicons name="refresh" size={18} color={actualIconColor} />
      </Animated.View>
      <Text style={[s.label, { color: textColor }, textStyle]}>
        {isScanning ? scanningLabel : label}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1.2,
    ...SHADOW.sm,
  },
  label: {
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
