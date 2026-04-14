import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSyncthingClient } from '../daemon/SyncthingContext';
import type { FolderConfig, FolderVersioning } from '../api/types';
import { colors } from '../components/ui';

interface Props {
  folder: FolderConfig;
  onBack: () => void;
  onSaved: () => void;
}

// Params from a prior type are dropped on switch; daemon keeps only the active
// type's params anyway and this keeps stored state matching the UI.

type VersionerType = '' | 'trashcan' | 'simple' | 'staggered';

interface TypeOption {
  value: VersionerType;
  label: string;
  hint: string;
}

const TYPES: TypeOption[] = [
  {
    value: '',
    label: 'No versioning',
    hint: 'Deleted files are gone for good. Default.',
  },
  {
    value: 'trashcan',
    label: 'Trash can',
    hint: 'Move replaced/deleted files into a .stversions directory. Optionally purged after N days.',
  },
  {
    value: 'simple',
    label: 'Simple',
    hint: 'Keep the most recent N versions of each file in .stversions.',
  },
  {
    value: 'staggered',
    label: 'Staggered',
    hint: 'Keep many recent versions and progressively fewer older ones, up to a maximum age.',
  },
];

// staggered versioner default maxAge
const YEAR_SECONDS = 31536000;

function paramOr(params: Record<string, string> | undefined, key: string, fallback: string): string {
  const v = params?.[key];
  return v == null || v === '' ? fallback : v;
}

export function FolderVersioningEditor({ folder, onBack, onSaved }: Props) {
  const client = useSyncthingClient();

  const initial = folder.versioning;
  const [type, setType] = useState<VersionerType>((initial?.type ?? '') as VersionerType);

  const [trashcanCleanout, setTrashcanCleanout] = useState(
    paramOr(initial?.params, 'cleanoutDays', '0'),
  );

  const [simpleKeep, setSimpleKeep] = useState(paramOr(initial?.params, 'keep', '5'));
  const [simpleCleanout, setSimpleCleanout] = useState(
    paramOr(initial?.params, 'cleanoutDays', '0'),
  );

  const [staggeredMaxAge, setStaggeredMaxAge] = useState(
    paramOr(initial?.params, 'maxAge', String(YEAR_SECONDS)),
  );
  const [staggeredVersionsPath, setStaggeredVersionsPath] = useState(
    paramOr(initial?.params, 'versionsPath', ''),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const v = folder.versioning;
    setType((v?.type ?? '') as VersionerType);
    setTrashcanCleanout(paramOr(v?.params, 'cleanoutDays', '0'));
    setSimpleKeep(paramOr(v?.params, 'keep', '5'));
    setSimpleCleanout(paramOr(v?.params, 'cleanoutDays', '0'));
    setStaggeredMaxAge(paramOr(v?.params, 'maxAge', String(YEAR_SECONDS)));
    setStaggeredVersionsPath(paramOr(v?.params, 'versionsPath', ''));
  }, [folder]);

  const buildVersioning = (): FolderVersioning => {
    const base: FolderVersioning = {
      type,
      params: {},
      cleanupIntervalS: initial?.cleanupIntervalS ?? 3600,
      fsPath: initial?.fsPath ?? '',
      fsType: initial?.fsType ?? 'basic',
    };
    if (type === 'trashcan') {
      base.params = { cleanoutDays: trashcanCleanout || '0' };
    } else if (type === 'simple') {
      base.params = {
        keep: simpleKeep || '5',
        cleanoutDays: simpleCleanout || '0',
      };
    } else if (type === 'staggered') {
      base.params = {
        maxAge: staggeredMaxAge || String(YEAR_SECONDS),
        versionsPath: staggeredVersionsPath ?? '',
      };
    }
    return base;
  };

  const dirty = useMemo(() => {
    const next = buildVersioning();
    if ((initial?.type ?? '') !== next.type) return true;
    const a = initial?.params ?? {};
    const b = next.params;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if ((a[k] ?? '') !== (b[k] ?? '')) return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initial,
    type,
    trashcanCleanout,
    simpleKeep,
    simpleCleanout,
    staggeredMaxAge,
    staggeredVersionsPath,
  ]);

  const validate = (): string | null => {
    if (type === 'simple') {
      const n = Number(simpleKeep);
      if (!Number.isFinite(n) || n < 1) return 'Keep must be at least 1';
    }
    if (type === 'trashcan' || type === 'simple') {
      const days = Number(type === 'trashcan' ? trashcanCleanout : simpleCleanout);
      if (!Number.isFinite(days) || days < 0) return 'Cleanout days must be 0 or positive';
    }
    if (type === 'staggered') {
      const age = Number(staggeredMaxAge);
      if (!Number.isFinite(age) || age < 0) return 'Max age must be 0 or positive';
    }
    return null;
  };

  const save = async () => {
    if (saving) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await client.patchFolder(folder.id, { versioning: buildVersioning() });
      onSaved();
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (dirty) {
      Alert.alert('Discard changes?', 'Your edits will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onBack },
      ]);
      return;
    }
    onBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={cancel} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          File versioning
        </Text>
        <TouchableOpacity onPress={save} disabled={!dirty || saving} hitSlop={8}>
          {saving ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={[styles.saveBtn, !dirty && styles.saveBtnDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.folderLabel} numberOfLines={1}>
        {folder.label || folder.id}
      </Text>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.sectionTitle}>Type</Text>
        <View style={styles.typeList}>
          {TYPES.map(opt => {
            const on = opt.value === type;
            return (
              <TouchableOpacity
                key={opt.value || 'none'}
                style={[styles.typeRow, on && styles.typeRowOn]}
                onPress={() => setType(opt.value)}
                activeOpacity={0.7}
              >
                <View style={[styles.radio, on && styles.radioOn]}>
                  {on && <View style={styles.radioInner} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.typeLabel, on && styles.typeLabelOn]}>{opt.label}</Text>
                  <Text style={styles.typeHint}>{opt.hint}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {type === 'trashcan' && (
          <View style={styles.paramBox}>
            <Text style={styles.paramTitle}>Trash can settings</Text>
            <NumberField
              label="Cleanout interval"
              suffix="days (0 = keep forever)"
              value={trashcanCleanout}
              onChangeText={setTrashcanCleanout}
              hint="Files older than this in .stversions are purged."
            />
          </View>
        )}

        {type === 'simple' && (
          <View style={styles.paramBox}>
            <Text style={styles.paramTitle}>Simple settings</Text>
            <NumberField
              label="Keep versions"
              suffix="per file"
              value={simpleKeep}
              onChangeText={setSimpleKeep}
              hint="Most recent N versions are retained, older ones discarded."
            />
            <View style={styles.divider} />
            <NumberField
              label="Cleanout interval"
              suffix="days (0 = keep forever)"
              value={simpleCleanout}
              onChangeText={setSimpleCleanout}
              hint="Files older than this in .stversions are purged."
            />
          </View>
        )}

        {type === 'staggered' && (
          <View style={styles.paramBox}>
            <Text style={styles.paramTitle}>Staggered settings</Text>
            <NumberField
              label="Maximum age"
              suffix="seconds (0 = keep forever)"
              value={staggeredMaxAge}
              onChangeText={setStaggeredMaxAge}
              hint="Versions older than this are removed. 31536000 = 1 year."
            />
            <View style={styles.divider} />
            <View>
              <Text style={styles.fieldLabel}>Versions path</Text>
              <Text style={styles.fieldHint}>
                Optional alternative directory for stored versions. Leave empty to use .stversions inside the folder.
              </Text>
              <TextInput
                style={styles.textInput}
                value={staggeredVersionsPath}
                onChangeText={setStaggeredVersionsPath}
                placeholder=".stversions"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
        )}

        <Text style={styles.tip}>
          Versioned files live in <Text style={styles.mono}>.stversions</Text> inside the folder unless you override the path. Recover by copying them out manually.
        </Text>
      </ScrollView>
    </View>
  );
}

function NumberField({
  label,
  suffix,
  hint,
  value,
  onChangeText,
}: {
  label: string;
  suffix: string;
  hint: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldHint}>{hint}</Text>
      <View style={styles.numberRow}>
        <TextInput
          style={styles.numberInput}
          value={value}
          onChangeText={onChangeText}
          keyboardType="numeric"
          placeholderTextColor={colors.textDim}
        />
        <Text style={styles.numberSuffix}>{suffix}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center' },
  back: { color: colors.accent, fontSize: 15, fontWeight: '500' },
  saveBtn: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  saveBtnDisabled: { color: colors.border },
  folderLabel: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 8,
  },
  body: { padding: 16, paddingBottom: 40, gap: 16 },
  error: { color: colors.error, fontSize: 13 },
  sectionTitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  typeList: { gap: 8 },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  typeRowOn: { borderColor: colors.accent },
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
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  typeLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  typeLabelOn: { color: colors.accent },
  typeHint: { color: colors.textDim, fontSize: 11, lineHeight: 15, marginTop: 2 },
  paramBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  paramTitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  fieldHint: { color: colors.textDim, fontSize: 11, lineHeight: 15, marginTop: 2 },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  numberInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: 'Menlo',
    fontSize: 13,
  },
  numberSuffix: { color: colors.textDim, fontSize: 12, flexShrink: 1 },
  textInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: 'Menlo',
    fontSize: 13,
    marginTop: 8,
  },
  tip: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  mono: { fontFamily: 'Menlo', color: colors.text },
});
