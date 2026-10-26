import { Vibration, Platform } from 'react-native';

/**
 * Safe, zero-dependency haptic feedback for HUGPONG mobile.
 * Provides subtle tactile responses on Android and iOS without requiring extra native binaries.
 */
export const hapticFeedback = {
  light: () => {
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate(12);
      } else {
        Vibration.vibrate(15);
      }
    } catch {
      // Safely ignore if device does not support vibration
    }
  },

  medium: () => {
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate(25);
      } else {
        Vibration.vibrate(30);
      }
    } catch {
      // Safely ignore
    }
  },

  success: () => {
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 15, 60, 25]);
      } else {
        Vibration.vibrate([0, 20, 70, 30]);
      }
    } catch {
      // Safely ignore
    }
  },

  error: () => {
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 40, 80, 40]);
      } else {
        Vibration.vibrate([0, 50, 100, 50]);
      }
    } catch {
      // Safely ignore
    }
  }
};

export default hapticFeedback;
