import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';

export default function OfflineBanner({ 
  message = 'You are offline. Connect to internet for real-time cloud data.',
  style 
}) {
  return (
    <View style={[s.banner, style]}>
      <Ionicons name="cloud-offline-outline" size={15} color="#B45309" />
      <Text style={s.text}>{message}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FEF0D0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  text: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
});
