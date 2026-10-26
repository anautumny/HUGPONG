import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, Keyboard } from 'react-native';
import { COLORS, RADIUS } from '../theme';
import { AppText as Text, AppTextInput as TextInput } from './Typography';

export default function OtpCodeInput({
  value = '',
  onChangeText,
  onComplete,
  disabled = false,
  error = false,
  autoFocus = true,
  accessibilityLabel = 'Six digit verification code'
}) {
  const inputRef = useRef(null);
  const completedCodeRef = useRef('');
  const isKeyboardOpenRef = useRef(false);
  const [isFocused, setIsFocused] = useState(false);
  const digits = String(value || '').replace(/\D/g, '').slice(0, 6);

  useEffect(() => {
    if (digits.length < 6) completedCodeRef.current = '';
  }, [digits]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      isKeyboardOpenRef.current = true;
    });

    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      isKeyboardOpenRef.current = false;
      // When keyboard is dismissed via Android back button or gesture,
      // blur the input so React Native resets its internal isFocused state.
      // That way, tapping the box again triggers a fresh focus and immediately opens the keyboard.
      if (inputRef.current?.isFocused?.()) {
        inputRef.current.blur();
      }
      setIsFocused(false);
    });

    if (autoFocus && !disabled) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => {
        clearTimeout(timer);
        showSub.remove();
        hideSub.remove();
      };
    }

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [autoFocus, disabled]);

  const updateCode = nextValue => {
    const nextCode = String(nextValue || '').replace(/\D/g, '').slice(0, 6);
    onChangeText?.(nextCode);
    if (nextCode.length === 6 && completedCodeRef.current !== nextCode) {
      completedCodeRef.current = nextCode;
      onComplete?.(nextCode);
    }
  };

  const handlePress = () => {
    if (disabled) return;
    if (!inputRef.current) return;

    // If input is already marked focused by React Native but the keyboard is closed,
    // calling inputRef.current.focus() is a no-op on Android.
    // Force a blur-then-focus cycle to guarantee the software keyboard is summoned.
    if (inputRef.current.isFocused?.() && !isKeyboardOpenRef.current) {
      inputRef.current.blur();
      setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
    } else {
      inputRef.current.focus();
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="none"
      style={styles.container}
    >
      <View style={styles.boxRow} pointerEvents="none">
        {Array.from({ length: 6 }, (_, index) => {
          const digit = digits[index] || '';
          const isActive = !disabled && isFocused && index === Math.min(digits.length, 5);
          return (
            <View
              key={index}
              style={[
                styles.box,
                isActive && styles.boxActive,
                error && styles.boxError,
                disabled && styles.boxDisabled
              ]}
            >
              <Text style={styles.digit} maxFontSizeMultiplier={1.5}>{digit}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={digits}
        onChangeText={updateCode}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onTouchStart={handlePress}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        autoFocus={autoFocus}
        editable={!disabled}
        caretHidden
        contextMenuHidden={false}
        accessibilityLabel={accessibilityLabel}
        style={styles.hiddenInput}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative', width: '100%' },
  boxRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  box: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface
  },
  boxActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  boxError: { borderColor: COLORS.danger || '#DC2626' },
  boxDisabled: { opacity: 0.65 },
  digit: { fontSize: 22, fontWeight: '900', color: COLORS.primary },
  hiddenInput: { ...StyleSheet.absoluteFillObject, opacity: 0.01, color: 'transparent' }
});
