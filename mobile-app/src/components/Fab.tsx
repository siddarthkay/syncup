import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from './ui';
import { useCoachTarget } from '../onboarding/coach/useCoachTarget';

interface Props {
  onPress: () => void;
  label?: string;
  /** When set, registers this FAB as a coach spotlight target. */
  coachId?: string;
}

export function Fab({ onPress, label = '+', coachId }: Props) {
  if (coachId) {
    return <CoachableFab onPress={onPress} label={label} coachId={coachId} />;
  }
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

function CoachableFab({ onPress, label, coachId }: Props & { coachId: string }) {
  const target = useCoachTarget(coachId);
  return (
    <View
      ref={target.ref}
      onLayout={target.onLayout}
      style={styles.fab}
      collapsable={false}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={StyleSheet.absoluteFill}
      >
        <View style={styles.inner}>
          <Text style={styles.label}>{label}</Text>
        </View>
      </TouchableOpacity>
    </View>
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
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: '#fff', fontSize: 28, fontWeight: '400', lineHeight: 30 },
});
