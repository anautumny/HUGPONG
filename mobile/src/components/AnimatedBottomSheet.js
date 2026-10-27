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
import { useBlurTarget } from '../context/BlurTargetContext';
import { ExpandedSheetContext, useExpandedSheet } from '../context/ExpandedSheetContext';

export { ExpandedSheetContext, useExpandedSheet };

const OPEN_DURATION_MS = 340;
const CLOSE_DURATION_MS = 240;
const OPEN_EASING = typeof Easing.bezier === 'function' ? Easing.bezier(0.16, 1, 0.3, 1) : Easing.out(Easing.cubic);
const CLOSE_EASING = typeof Easing.bezier === 'function' ? Easing.bezier(0.3, 0, 0.8, 0.15) : Easing.in(Easing.cubic);

let BlurViewComponent = null;
try {
  const blurModule = require('expo-blur');
  BlurViewComponent = blurModule.BlurView || null;
} catch {
  BlurViewComponent = null;
}

/**
 * A controlled bottom sheet whose backdrop and sheet animate independently.
 * The native Modal itself never animates, so the page behind it remains fixed.
 */
export default function AnimatedBottomSheet({
  visible,
  onClose,
  children,
  sheetStyle,
  backdropColor = 'rgba(0, 0, 0, 0.65)',
  keyboardAvoiding = false,
  testID,
  dismissible = false,
  expandable = false,
  blurTarget,
}) {
  const blurContext = useBlurTarget();
  const requestBlur = blurContext?.requestBlur;
  const releaseBlur = blurContext?.releaseBlur;

  useEffect(() => {
    if (visible) {
      requestBlur?.();
      return () => {
        releaseBlur?.();
      };
    }
  }, [visible, requestBlur, releaseBlur]);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);
  expandedRef.current = expanded;
  const initialEstimate = Math.round((windowHeight || 800) * 0.72);
  const sheetHeight = useRef(initialEstimate);
  const [measuredHeight, setMeasuredHeight] = useState(initialEstimate);
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
        easing: OPEN_EASING,
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
      easing: CLOSE_EASING,
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
    onMoveShouldSetPanResponder: (_, gesture) => {
      if (!dismissible) return false;
      const isVertical = Math.abs(gesture.dy) > Math.abs(gesture.dx);
      if (!isVertical) return false;
      if (gesture.dy > 4) return true;
      if (expandable && gesture.dy < -4) return true;
      return false;
    },
    onMoveShouldSetPanResponderCapture: (_, gesture) => {
      if (!dismissible) return false;
      const isVertical = Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.1;
      if (!isVertical) return false;
      if (gesture.dy > 6) return true;
      if (expandable && gesture.dy < -6) return true;
      return false;
    },
    onPanResponderGrant: () => {
      dragY.stopAnimation();
    },
    onPanResponderMove: (_, gesture) => {
      const isCurrentlyExpanded = expandedRef.current;
      const clampedY = gesture.dy > 0
        ? gesture.dy
        : (expandable && !isCurrentlyExpanded ? Math.max(-50, gesture.dy * 0.4) : Math.max(-18, gesture.dy * 0.2));
      dragY.setValue(clampedY);
    },
    onPanResponderRelease: (_, gesture) => {
      const isCurrentlyExpanded = expandedRef.current;
      if (isCurrentlyExpanded) {
        // If sheet is expanded, swiping down collapses it back unless it is a strong drag
        const shouldDismiss = gesture.dy > 160 || (gesture.dy > 60 && gesture.vy > 0.8);
        if (shouldDismiss) {
          try { hapticFeedback.light(); } catch {}
          requestClose();
        } else if (gesture.dy > 30) {
          try { hapticFeedback.light(); } catch {}
          setExpanded(false);
        }
      } else {
        const shouldDismiss = gesture.dy > 35 || (gesture.dy > 12 && gesture.vy > 0.2);
        if (shouldDismiss) {
          try { hapticFeedback.light(); } catch {}
          requestClose();
        } else if (expandable && (gesture.dy < -30 || (gesture.dy < -10 && gesture.vy < -0.2))) {
          try { hapticFeedback.light(); } catch {}
          setExpanded(true);
        }
      }
      // Tap on handle toggles expand / collapse when expandable
      if (expandable && Math.abs(gesture.dy) < 6 && Math.abs(gesture.dx) < 6) {
        try { hapticFeedback.light(); } catch {}
        setExpanded(prev => !prev);
      }
      Animated.spring(dragY, {
        toValue: 0,
        damping: 24,
        mass: 0.8,
        stiffness: 220,
        overshootClamping: false,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderTerminate: () => Animated.spring(dragY, {
      toValue: 0,
      damping: 24,
      mass: 0.8,
      stiffness: 220,
      overshootClamping: false,
      useNativeDriver: true,
    }).start(),
  }), [dismissible, dragY, expandable, requestClose]);

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
    ? sheetHeight.current + (insets?.bottom || 0) + 48
    : Math.max(windowHeight || 800, 600);

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
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: backdropColor }]} />
          {dismissible && (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={requestClose}
              accessible={false}
            />
          )}
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
            renderToHardwareTextureAndroid={phase !== 'open'}
            onLayout={event => {
              const h = event.nativeEvent.layout.height;
              sheetHeight.current = h;
              if (h > 0 && Math.abs(h - measuredHeight) > 1) setMeasuredHeight(h);
            }}
            style={[
              styles.sheet,
              sheetStyle,
              expanded && {
                height: windowHeight - insets.top - insets.bottom - 24,
                maxHeight: windowHeight - insets.top - 12,
              },
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
                accessibilityHint="Swipe down to dismiss. Swipe up or tap handle to expand."
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
            <ExpandedSheetContext.Provider value={{ expanded, isExpanded: expanded, setExpanded }}>
              {children}
            </ExpandedSheetContext.Provider>
          </Animated.View>
          {dismissible && (
            <Pressable
              collapsable={false}
              style={[
                styles.topBackdropPressable,
                {
                  top: -(insets.top + 12),
                  left: -insets.left,
                  right: -insets.right,
                  bottom: measuredHeight,
                },
              ]}
              onPress={() => {
                try { hapticFeedback.light(); } catch {}
                requestClose();
              }}
              accessible={false}
            />
          )}
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
  topBackdropPressable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 400,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  sheet: {
    width: '100%',
    maxHeight: '92%',
    minHeight: 180,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderTopColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 20,
    zIndex: 20,
    overflow: 'hidden',
  },
});
