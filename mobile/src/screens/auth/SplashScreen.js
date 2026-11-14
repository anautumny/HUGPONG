import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Dimensions, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { COLORS, FONT_FAMILY } from '../../theme';
import { getItem } from '../../services/storageService';
import { restoreSessionFromToken } from '../../data/dataStore';
import { AppText as Text } from '../../components/Typography';
import { useTranslation } from '../../services/i18n';

const LOGO = require('../../../assets/icon-foreground.png');
const AnimatedText = Animated.createAnimatedComponent(Text);

const { width, height } = Dimensions.get('window');

export default function SplashScreen({ navigation }) {
  const { t } = useTranslation();
  const [restoreError, setRestoreError] = useState('');
  const [restoreAttempt, setRestoreAttempt] = useState(0);
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

    let active = true;
    const restore = async () => {
      setRestoreError('');
      try {
        const langChosen = await getItem('@hugpong_lang_chosen', null, { strict: true });
        if (!active) return;
        if (!langChosen) {
          navigation.replace('LanguageSelect');
          return;
        }

        const onboarded = await getItem('@hugpong_onboarded', null, { strict: true });
        if (!active) return;
        if (!onboarded) {
          navigation.replace('Onboarding');
          return;
        }

        // Check persistent auth session token (Stay Logged In)
        const authRes = await restoreSessionFromToken();
        if (!active) return;
        if (authRes.success && (authRes.user?.employeeId || authRes.user?.id)) {
          navigation.replace('MainTabs');
        } else if (authRes.error) {
          setRestoreError('Your saved account could not be loaded. Tap Retry to try again.');
        } else {
          navigation.replace('Login');
        }
      } catch (e) {
        if (active) setRestoreError('Your saved account could not be loaded. Tap Retry to try again.');
      }
    };
    restore();
    return () => { active = false; };
  }, [restoreAttempt]);

  return (
    <View style={s.container}>
      <View style={s.center}>
        <Animated.View style={[s.logoWrap, { transform: [{ scale: logoScale }], opacity: logoOpacity }]}>
          <Image source={LOGO} style={s.logoImg} resizeMode="contain" />
          <Text style={s.logoText}>HUGPONG</Text>
        </Animated.View>
        <AnimatedText style={[s.tagline, { opacity: tagOpacity }]}>
          Agricultural Operations Platform
        </AnimatedText>
        {!restoreError && <View style={s.restoreNotice} accessibilityLiveRegion="polite">
          <ActivityIndicator color={COLORS.primary} accessibilityLabel={t('data_restoring_account')} />
          <Text style={s.restoreMessage}>{t('data_restoring_account')}</Text>
        </View>}
        {!!restoreError && <View style={s.restoreNotice}>
          <Text accessibilityRole="alert" style={s.restoreMessage}>{restoreError}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => setRestoreAttempt(value => value + 1)} style={s.retryButton}>
            <Text style={s.retryLabel}>Retry</Text>
          </TouchableOpacity>
        </View>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  logoWrap: { alignItems: 'center', gap: 18 },
  logoImg: { width: 140, height: 140 },
  logoText: { fontFamily: FONT_FAMILY.display, fontSize: 32, fontWeight: '800', color: COLORS.primary, letterSpacing: 4 },
  tagline: { fontSize: 14, color: COLORS.textSecondary, letterSpacing: 1, fontWeight: '400' },
  restoreNotice: { maxWidth: 320, paddingHorizontal: 20, alignItems: 'center', gap: 14 },
  restoreMessage: { color: COLORS.textSecondary, textAlign: 'center', fontSize: 14 },
  retryButton: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
  retryLabel: { color: '#FFF', fontWeight: '700' },
});
