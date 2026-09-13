import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Image } from 'react-native';
import { COLORS } from '../../theme';
import { getItem } from '../../services/storageService';
import { restoreSessionFromToken } from '../../data/dataStore';

const LOGO = require('../../../assets/HUGPONG LOGO.png');

const { width, height } = Dimensions.get('window');

export default function SplashScreen({ navigation }) {
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.timing(tagOpacity, { toValue: 1, duration: 400, delay: 200, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(async () => {
      try {
        const langChosen = await getItem('@hugpong_lang_chosen');
        if (!langChosen) {
          navigation.replace('LanguageSelect');
          return;
        }

        const onboarded = await getItem('@hugpong_onboarded');
        if (!onboarded) {
          navigation.replace('Onboarding');
          return;
        }

        // Check persistent auth session token (Stay Logged In)
        const authRes = await restoreSessionFromToken();
        if (authRes.success) {
          navigation.replace('MainTabs');
        } else {
          navigation.replace('Login');
        }
      } catch (e) {
        navigation.replace('Login');
      }
    }, 1800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={s.container}>
      <View style={s.center}>
        <Animated.View style={[s.logoWrap, { transform: [{ scale: logoScale }], opacity: logoOpacity }]}>
          <Image source={LOGO} style={s.logoImg} resizeMode="contain" />
          <Text style={s.logoText}>HUGPONG</Text>
        </Animated.View>
        <Animated.Text style={[s.tagline, { opacity: tagOpacity }]}>
          Agricultural Operations Platform
        </Animated.Text>
      </View>
      <Animated.Text style={[s.version, { opacity: tagOpacity }]}>v1.0.0</Animated.Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  logoWrap: { alignItems: 'center', gap: 18 },
  logoImg: { width: 140, height: 140 },
  logoText: { fontSize: 32, fontWeight: '800', color: COLORS.primary, letterSpacing: 4 },
  tagline: { fontSize: 14, color: COLORS.textSecondary, letterSpacing: 1, fontWeight: '400' },
  version: { fontSize: 12, color: COLORS.textMuted },
});
