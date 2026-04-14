import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors } from './ui';

export function Fab({ onPress, label = '+' }: { onPress: () => void; label?: string }) {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  label: { color: '#fff', fontSize: 28, fontWeight: '400', lineHeight: 30 },
});
