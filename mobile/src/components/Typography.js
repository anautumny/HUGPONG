import React, { forwardRef } from 'react';
import { isLoaded } from 'expo-font';
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
} from 'react-native';
import { FONT_FAMILY } from '../theme';

export { FONT_FAMILY } from '../theme';

const INTER_BY_WEIGHT = Object.freeze({
  300: 'Inter_300Light',
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
  800: 'Inter_800ExtraBold',
  900: 'Inter_900Black',
});

const DISPLAY_BY_WEIGHT = Object.freeze({
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
  900: 'PlusJakartaSans_800ExtraBold',
});

const normalizeWeight = (fontWeight) => {
  if (fontWeight === 'bold') return 700;
  if (fontWeight === 'normal' || fontWeight == null) return 400;

  const numericWeight = Number(fontWeight);
  if (!Number.isFinite(numericWeight)) return 400;
  return Math.min(900, Math.max(300, Math.round(numericWeight / 100) * 100));
};

const resolveTypographyStyle = (style, requestedFamily) => {
  const flattened = StyleSheet.flatten(style) || {};
  const declaredFamily = requestedFamily || flattened.fontFamily || FONT_FAMILY.body;

  // Technical identifiers deliberately retain the platform monospace face.
  if (declaredFamily === FONT_FAMILY.monospace) return flattened;

  // Preserve icon fonts and any explicitly declared third-party font family.
  if (declaredFamily !== FONT_FAMILY.body && declaredFamily !== FONT_FAMILY.display) {
    return flattened;
  }

  const weight = normalizeWeight(flattened.fontWeight);
  const resolvedFamily = flattened.fontStyle === 'italic' && declaredFamily === FONT_FAMILY.body
    ? 'Inter_400Regular_Italic'
    : declaredFamily === FONT_FAMILY.display
      ? DISPLAY_BY_WEIGHT[weight] || DISPLAY_BY_WEIGHT[400]
      : INTER_BY_WEIGHT[weight] || INTER_BY_WEIGHT[400];

  // If font loading ever fails, retain a usable native-system fallback.
  if (!isLoaded(resolvedFamily)) return flattened;

  const resolved = { ...flattened, fontFamily: resolvedFamily };
  // Each loaded asset is already the requested face; asking the platform to
  // synthesize weight/style on top would make Android and iOS diverge.
  delete resolved.fontWeight;
  if (resolvedFamily === 'Inter_400Regular_Italic') delete resolved.fontStyle;
  return resolved;
};

export const AppText = forwardRef(function AppText(
  {
    family,
    style,
    allowFontScaling = true,
    maxFontSizeMultiplier = 1.8,
    ...props
  },
  ref,
) {
  return (
    <NativeText
      ref={ref}
      {...props}
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[styles.responsiveText, resolveTypographyStyle(style, family)]}
    />
  );
});

export const AppTextInput = forwardRef(function AppTextInput(
  {
    family,
    style,
    multiline = false,
    allowFontScaling = true,
    maxFontSizeMultiplier = 1.6,
    textAlignVertical,
    ...props
  },
  ref,
) {
  return (
    <NativeTextInput
      ref={ref}
      {...props}
      multiline={multiline}
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      textAlignVertical={textAlignVertical || (multiline ? 'top' : 'center')}
      style={[styles.responsiveInput, resolveTypographyStyle(style, family)]}
    />
  );
});

const styles = StyleSheet.create({
  responsiveText: {
    minWidth: 0,
    flexShrink: 1,
  },
  responsiveInput: {
    minWidth: 0,
  },
});

