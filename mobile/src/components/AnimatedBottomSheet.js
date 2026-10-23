import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  keyboardAvoiding = false,
  testID,
}) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const animationRef = useRef(null);
  const frameRef = useRef(null);
  const phaseRef = useRef('closed');
  const visibleRef = useRef(Boolean(visible));
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
    if (phaseRef.current === 'closed') progress.setValue(0);
    setAnimationPhase('opening');
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (!visibleRef.current) return;
      animationRef.current = Animated.timing(progress, {
        toValue: 1,
        duration: OPEN_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: true,
      });
      animationRef.current.start(({ finished }) => {
        animationRef.current = null;
        if (finished && visibleRef.current) {
          setAnimationPhase('open');
        }
      });
    });
  }, [progress, setAnimationPhase, stopCurrentAnimation]);

  const closeSheet = useCallback(() => {
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
    });
  }, [progress, setAnimationPhase, stopCurrentAnimation]);

  const requestClose = useCallback(() => {
    // Let the owner handle Back first (a nested picker can return to its filters).
    // The visible prop then drives the closing animation when the owner exits.
    if (visibleRef.current) onClose?.();
  }, [onClose]);

  useEffect(() => {
    visibleRef.current = Boolean(visible);

    if (visible) {
      if (phaseRef.current === 'closed' || phaseRef.current === 'closing') openSheet();
      return;
    }

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
      <View style={styles.root} accessibilityViewIsModal>
        <Animated.View style={[styles.backdrop, { backgroundColor: backdropColor, opacity: progress }]} />

        <KeyboardAvoidingView
          pointerEvents="box-none"
          style={[styles.sheetLayer, {
            paddingTop: insets.top + 12,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          }]}
          behavior={keyboardAvoiding ? (Platform.OS === 'ios' ? 'padding' : 'height') : undefined}
          enabled={keyboardAvoiding}
        >
          <Animated.View
            style={[
              styles.sheet,
              sheetStyle,
              {
                paddingBottom: Math.max(StyleSheet.flatten(sheetStyle)?.paddingBottom || 0, insets.bottom, 12),
                transform: [{ translateY: sheetTranslateY }],
              },
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
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxHeight: '100%',
    flexShrink: 1,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
});
