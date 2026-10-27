import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

let BlurViewComponent = null;
let NativeBlurTargetView = null;
try {
  const blurModule = require('expo-blur');
  BlurViewComponent = blurModule.BlurView || null;
  const nativeModule = require('expo-blur/build/NativeBlurModule');
  NativeBlurTargetView = nativeModule.NativeBlurTargetView || blurModule.BlurTargetView || null;
} catch {
  BlurViewComponent = null;
  NativeBlurTargetView = null;
}

const BlurTargetContext = createContext({
  blurTargetRef: { current: null },
  requestBlur: () => {},
  releaseBlur: () => {},
});

export function BlurTargetProvider({ children }) {
  const blurTargetRef = useRef(null);
  const [active, setActive] = useState(false);
  const blurCountRef = useRef(0);
  const blurOpacity = useRef(new Animated.Value(0)).current;

  const openEasing = typeof Easing.bezier === 'function' ? Easing.bezier(0.22, 1, 0.36, 1) : Easing.out(Easing.cubic);
  const closeEasing = typeof Easing.bezier === 'function' ? Easing.bezier(0.32, 0, 0.67, 0) : Easing.in(Easing.cubic);

  const requestBlur = useCallback(() => {
    blurCountRef.current += 1;
    setActive(true);
    Animated.timing(blurOpacity, {
      toValue: 1,
      duration: 320,
      easing: openEasing,
      useNativeDriver: true,
    }).start();
  }, [blurOpacity, openEasing]);

  const releaseBlur = useCallback(() => {
    blurCountRef.current = Math.max(0, blurCountRef.current - 1);
    if (blurCountRef.current === 0) {
      Animated.timing(blurOpacity, {
        toValue: 0,
        duration: 240,
        easing: closeEasing,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && blurCountRef.current === 0) {
          setActive(false);
        }
      });
    }
  }, [blurOpacity, closeEasing]);

  const TargetComponent = NativeBlurTargetView || View;

  return (
    <BlurTargetContext.Provider value={{ blurTargetRef, requestBlur, releaseBlur }}>
      <View style={styles.container}>
        <TargetComponent ref={blurTargetRef} style={StyleSheet.absoluteFill}>
          {children}
        </TargetComponent>
        {active && BlurViewComponent ? (
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: blurOpacity }]}
            pointerEvents="none"
          >
            <BlurViewComponent
              blurMethod="dimezisBlurView"
              blurTarget={blurTargetRef}
              intensity={75}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ) : null}
      </View>
    </BlurTargetContext.Provider>
  );
}

export function useBlurTarget() {
  return useContext(BlurTargetContext);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
