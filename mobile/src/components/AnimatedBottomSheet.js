import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

const OPEN_DURATION_MS = 250;
const CLOSE_DURATION_MS = 230;

/**
 * A controlled bottom sheet whose backdrop and sheet animate independently.
 * The native Modal itself never animates, so the page behind it remains fixed.
 */
export default function AnimatedBottomSheet({
  visible,
  onClose,
  children,
  sheetStyle,
  backdropColor = 'rgba(0, 0, 0, 0.5)',
  closeOnBackdropPress = true,
  keyboardAvoiding = false,
  testID,
}) {
  const { height: windowHeight } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const animationRef = useRef(null);
  const frameRef = useRef(null);
  const phaseRef = useRef('closed');
  const visibleRef = useRef(Boolean(visible));
  const closeRequestedRef = useRef(false);
  const [phase, setPhase] = useState('closed');

  const setAnimationPhase = useCallback((nextPhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

  const stopCurrentAnimation = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    animationRef.current?.stop();
    animationRef.current = null;
  }, []);

  const openSheet = useCallback(() => {
    stopCurrentAnimation();
    progress.setValue(0);
    setAnimationPhase('opening');
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (!visibleRef.current || closeRequestedRef.current) return;
      animationRef.current = Animated.timing(progress, {
        toValue: 1,
        duration: OPEN_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: true,
      });
      animationRef.current.start(({ finished }) => {
        animationRef.current = null;
        if (finished && visibleRef.current && !closeRequestedRef.current) {
          setAnimationPhase('open');
        }
      });
    });
  }, [progress, setAnimationPhase, stopCurrentAnimation]);

  const closeSheet = useCallback((afterClose) => {
    if (phaseRef.current === 'closed' || phaseRef.current === 'closing') return;
    stopCurrentAnimation();
    setAnimationPhase('closing');
    animationRef.current = Animated.timing(progress, {
      toValue: 0,
      duration: CLOSE_DURATION_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
      isInteraction: true,
    });
    animationRef.current.start(({ finished }) => {
      animationRef.current = null;
      if (!finished) return;
      setAnimationPhase('closed');
      afterClose?.();
    });
  }, [progress, setAnimationPhase, stopCurrentAnimation]);

  const requestClose = useCallback(() => {
    if (closeRequestedRef.current || phaseRef.current === 'closed' || phaseRef.current === 'closing') return;
    closeRequestedRef.current = true;
    closeSheet(onClose);
  }, [closeSheet, onClose]);

  useEffect(() => {
    visibleRef.current = Boolean(visible);

    if (visible) {
      if (!closeRequestedRef.current && phaseRef.current === 'closed') openSheet();
      return;
    }

    closeRequestedRef.current = false;
    if (phaseRef.current !== 'closed' && phaseRef.current !== 'closing') closeSheet();
  }, [closeSheet, openSheet, visible]);

  useEffect(() => () => stopCurrentAnimation(), [stopCurrentAnimation]);

  if (phase === 'closed') return null;

  const sheetTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [Math.max(windowHeight, 800), 0],
  });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      hardwareAccelerated
      onRequestClose={requestClose}
      testID={testID}
    >
      <View style={styles.root} pointerEvents={phase === 'open' ? 'auto' : 'none'}>
        <Animated.View style={[styles.backdrop, { backgroundColor: backdropColor, opacity: progress }]}>
          <Pressable
            accessibilityRole={closeOnBackdropPress ? 'button' : undefined}
            accessibilityLabel={closeOnBackdropPress ? 'Close bottom sheet' : undefined}
            disabled={!closeOnBackdropPress}
            onPress={requestClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <KeyboardAvoidingView
          pointerEvents="box-none"
          style={styles.sheetLayer}
          behavior={keyboardAvoiding && Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View
            style={[
              styles.sheet,
              sheetStyle,
              { transform: [{ translateY: sheetTranslateY }] },
            ]}
          >
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
  },
});
