import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticFeedback } from '../utils/haptics';

const OPEN_DURATION_MS = 290;
const CLOSE_DURATION_MS = 220;

/**
 * A controlled bottom sheet whose backdrop and sheet animate independently.
 * The native Modal itself never animates, so the page behind it remains fixed.
 */
export default function AnimatedBottomSheet({
  visible,
  onClose,
  children,
  sheetStyle,
  backdropColor = 'rgba(0, 0, 0, 0.55)',
  keyboardAvoiding = false,
  testID,
  dismissible = false,
  expandable = false,
}) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(false);
  const sheetHeight = useRef(400);
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

  const gestures = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => dismissible,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => dismissible
      && gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onMoveShouldSetPanResponderCapture: (_, gesture) => dismissible
      && gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.1,
    onPanResponderGrant: () => {
      dragY.stopAnimation();
    },
    onPanResponderMove: (_, gesture) => {
      const clampedY = gesture.dy > 0 ? gesture.dy : Math.max(-18, gesture.dy * 0.2);
      dragY.setValue(clampedY);
    },
    onPanResponderRelease: (_, gesture) => {
      const shouldDismiss = gesture.dy > 35 || (gesture.dy > 12 && gesture.vy > 0.2);
      if (shouldDismiss) {
        try { hapticFeedback.light(); } catch {}
        requestClose();
      } else if (expandable && gesture.dy < -35) {
        setExpanded(true);
      }
      Animated.spring(dragY, {
        toValue: 0,
        damping: 24,
        mass: 0.8,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderTerminate: () => Animated.spring(dragY, {
      toValue: 0,
      damping: 24,
      mass: 0.8,
      stiffness: 220,
      useNativeDriver: true,
    }).start(),
  }), [dismissible, dragY, expandable, requestClose, windowHeight]);

  useEffect(() => {
    visibleRef.current = Boolean(visible);

    if (visible) {
      setExpanded(false);
      dragY.setValue(0);
      if (phaseRef.current === 'closed' || phaseRef.current === 'closing') openSheet();
      return;
    }

    if (phaseRef.current !== 'closed' && phaseRef.current !== 'closing') closeSheet();
  }, [closeSheet, dragY, openSheet, visible]);

  useEffect(() => () => stopCurrentAnimation(), [stopCurrentAnimation]);

  if (phase === 'closed') return null;

  const sheetTravelDistance = sheetHeight.current > 50
    ? sheetHeight.current + 40
    : 480;

  const sheetTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetTravelDistance, 0],
    extrapolate: 'clamp',
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
      <View style={styles.root} accessibilityViewIsModal onAccessibilityEscape={requestClose}>
        <Animated.View style={[styles.backdrop, { backgroundColor: backdropColor, opacity: progress }]}>
          {dismissible && <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessible={false} />}
        </Animated.View>

        <KeyboardAvoidingView
          pointerEvents="box-none"
          style={[styles.sheetLayer, {
            paddingTop: insets.top + 12,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          }]}
          behavior={keyboardAvoiding ? (Platform.OS === 'ios' ? 'padding' : undefined) : undefined}
          enabled={keyboardAvoiding}
        >
          <Animated.View
            onLayout={event => { sheetHeight.current = event.nativeEvent.layout.height; }}
            style={[
              styles.sheet,
              sheetStyle,
              expanded && { height: windowHeight - insets.top - insets.bottom - 24 },
              {
                paddingBottom: Math.max(StyleSheet.flatten(sheetStyle)?.paddingBottom || 0, insets.bottom, 12),
                transform: [{ translateY: Animated.add(sheetTranslateY, dragY) }],
              },
            ]}
          >
            {dismissible && (
              <View
                {...gestures.panHandlers}
                style={styles.handleTouch}
                hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel="Sheet controls"
                accessibilityHint="Swipe down to dismiss. Swipe up to expand."
                accessibilityActions={[
                  { name: 'dismiss', label: 'Dismiss' },
                  ...(expandable ? [{ name: 'increment', label: 'Expand' }, { name: 'decrement', label: 'Collapse' }] : []),
                ]}
                onAccessibilityAction={event => {
                  if (event.nativeEvent.actionName === 'dismiss') requestClose();
                  else setExpanded(event.nativeEvent.actionName === 'increment');
                }}
              ><View style={styles.handle} /></View>
            )}
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  handleTouch: {
    width: '100%',
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: 'transparent',
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
  },
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderTopColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 24,
    overflow: 'hidden',
  },
});
