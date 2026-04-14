import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { FolderConfig } from '../api/types';
import { colors } from './ui';

type FolderType = FolderConfig['type'];

interface Option {
  value: FolderType;
  label: string;
  hint: string;
}

const OPTIONS: Option[] = [
  {
    value: 'sendreceive',
    label: 'Send & Receive',
    hint: 'Two-way sync. Local and remote changes both propagate.',
  },
  {
    value: 'sendonly',
    label: 'Send Only',
    hint: 'Push local changes out. Ignore what peers have that we don\u2019t.',
  },
  {
    value: 'receiveonly',
    label: 'Receive Only',
    hint: 'Accept peer changes. Never send local edits back.',
  },
  {
    value: 'receiveencrypted',
    label: 'Receive Encrypted',
    hint: 'Store peer data as untrusted encrypted blobs. For backup relays.',
  },
];

interface Props {
  value: FolderType;
  onChange: (value: FolderType) => void;
  disabled?: boolean;
}

export function FolderTypePicker({ value, onChange, disabled }: Props) {
  return (
    <View style={styles.container}>
      {OPTIONS.map(opt => {
        const on = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.row, on && styles.rowOn]}
            onPress={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <View style={[styles.radio, on && styles.radioOn]}>
              {on && <View style={styles.radioInner} />}
            </View>
            <View style={styles.text}>
              <Text style={[styles.label, on && styles.labelOn]}>{opt.label}</Text>
              <Text style={styles.hint}>{opt.hint}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  rowOn: { borderColor: colors.accent },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioOn: { borderColor: colors.accent },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  text: { flex: 1 },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  labelOn: { color: colors.accent },
  hint: { color: colors.textDim, fontSize: 11, lineHeight: 15, marginTop: 2 },
});
