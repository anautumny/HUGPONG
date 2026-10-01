import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, FlatList, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../theme';
import { useTranslation } from '../../services/i18n';
import { setItem } from '../../services/storageService';

const { width } = Dimensions.get('window');

export default function OnboardingScreen({ navigation }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);
  const flatRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const slides = [
    {
      icon: 'leaf',
      iconBg: '#E8F5E0',
      title: t('onboard_slide1_title', 'Manage Your Farm\nOperations'),
      sub: t('onboard_slide1_sub', 'Track tasks, record operation costs, and monitor every sector of your block farm — all in one place.'),
    },
    {
      icon: 'trending-up',
      iconBg: '#E0F0E8',
      title: t('onboard_slide2_title', 'Live SRA Price\nMonitoring'),
      sub: t('onboard_slide2_sub', 'Get real-time sugarcane market prices and instant income estimates based on your land and yield.'),
    },
    {
      icon: 'cloud-done',
      iconBg: '#E0EAF5',
      title: t('onboard_slide3_title', 'Offline-First,\nAlways Synced'),
      sub: t('onboard_slide3_sub', 'Work without internet and sync automatically when back online. Your data is always safe.'),
    },
  ];

  const completeOnboarding = async (destination) => {
    await setItem('@hugpong_onboarded', 'true');
    navigation.replace(destination);
  };

  const handleFinish = () => completeOnboarding('Login');
  const handleRegister = () => completeOnboarding('Register');

  const goNext = () => {
    if (current < slides.length - 1) {
      flatRef.current?.scrollToIndex({ index: current + 1, animated: true });
    } else {
      handleFinish();
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <TouchableOpacity style={s.skip} onPress={handleFinish}>
        <Text style={s.skipText}>{t('onboard_skip', 'Skip')}</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={e => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={s.slide}>
            <View style={[s.iconWrap, { backgroundColor: item.iconBg }]}>
              <Ionicons name={item.icon} size={52} color={COLORS.primary} />
            </View>
            <Text style={s.title}>{item.title}</Text>
            <Text style={s.sub}>{item.sub}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={s.dots}>
        {slides.map((_, i) => {
          const opacity = scrollX.interpolate({
            inputRange: [(i - 1) * width, i * width, (i + 1) * width],
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
          });
          const w = scrollX.interpolate({
            inputRange: [(i - 1) * width, i * width, (i + 1) * width],
            outputRange: [8, 24, 8],
            extrapolate: 'clamp',
          });
          return <Animated.View key={i} style={[s.dot, { opacity, width: w }]} />;
        })}
      </View>

      {/* CTA */}
      <View style={s.footer}>
        <TouchableOpacity style={s.btn} onPress={goNext}>
          <Text style={s.btnText}>{current === slides.length - 1 ? t('onboard_get_started', 'Get Started') : t('reg_btn_continue', 'Next')}</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
        {current === slides.length - 1 && (
          <TouchableOpacity style={s.loginLink} onPress={handleRegister}>
            <Text style={s.loginLinkText}>{t('auth_no_account', "Don't have an account?")} <Text style={s.loginLinkBold}>{t('auth_register_now', 'Create Account')}</Text></Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  skip: { alignSelf: 'flex-end', padding: SPACING.lg },
  skipText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '500' },
  slide: { width, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center', paddingTop: 20, gap: 24 },
  iconWrap: { width: 120, height: 120, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text, textAlign: 'center', lineHeight: 36 },
  sub: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 24 },
  dot: { height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  footer: { paddingHorizontal: 24, paddingBottom: 16, gap: 14 },
  btn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  loginLink: { alignItems: 'center' },
  loginLinkText: { fontSize: 14, color: COLORS.textMuted },
  loginLinkBold: { color: COLORS.primary, fontWeight: '700' },
});
