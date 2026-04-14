import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSyncthingClient } from '../daemon/SyncthingContext';
import type { FolderConfig, PullOrder } from '../api/types';
import { colors } from '../components/ui';

interface Props {
  folder: FolderConfig;
  onBack: () => void;
  onSaved: () => void;
}

// inline page. parent sheet swaps this in place

const PULL_ORDERS: { value: PullOrder; label: string; hint: string }[] = [
  { value: 'random', label: 'Random', hint: 'Default. Parallelizes well across peers.' },
  { value: 'alphabetic', label: 'Alphabetic', hint: 'Filename order. Predictable progress.' },
  { value: 'smallestFirst', label: 'Smallest first', hint: 'Good for lots of tiny files.' },
  { value: 'largestFirst', label: 'Largest first', hint: 'Fronts the bulk of the transfer.' },
  { value: 'oldestFirst', label: 'Oldest first', hint: 'Mod-time ascending.' },
  { value: 'newestFirst', label: 'Newest first', hint: 'Mod-time descending.' },
];

const DISK_UNITS = ['%', 'kB', 'MB', 'GB', 'TB'];

export function FolderAdvancedEditor({ folder, onBack, onSaved }: Props) {
  const client = useSyncthingClient();

  const [watch, setWatch] = useState(folder.fsWatcherEnabled);
  const [rescanInterval, setRescanInterval] = useState(String(folder.rescanIntervalS ?? 3600));
  const [pullOrder, setPullOrder] = useState<PullOrder>(folder.order ?? 'random');
  const [minDiskValue, setMinDiskValue] = useState(String(folder.minDiskFree?.value ?? 1));
  const [minDiskUnit, setMinDiskUnit] = useState(folder.minDiskFree?.unit ?? '%');
  const [ignorePerms, setIgnorePerms] = useState(folder.ignorePerms);
  const [syncOwnership, setSyncOwnership] = useState(folder.syncOwnership ?? false);
  const [sendOwnership, setSendOwnership] = useState(folder.sendOwnership ?? false);
  const [syncXattrs, setSyncXattrs] = useState(folder.syncXattrs ?? false);
  const [sendXattrs, setSendXattrs] = useState(folder.sendXattrs ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // re-seed when parent refetches after a save
  useEffect(() => {
    setWatch(folder.fsWatcherEnabled);
    setRescanInterval(String(folder.rescanIntervalS ?? 3600));
    setPullOrder(folder.order ?? 'random');
    setMinDiskValue(String(folder.minDiskFree?.value ?? 1));
    setMinDiskUnit(folder.minDiskFree?.unit ?? '%');
    setIgnorePerms(folder.ignorePerms);
    setSyncOwnership(folder.syncOwnership ?? false);
    setSendOwnership(folder.sendOwnership ?? false);
    setSyncXattrs(folder.syncXattrs ?? false);
    setSendXattrs(folder.sendXattrs ?? false);
  }, [folder]);

  const dirty = useMemo(() => {
    if (watch !== folder.fsWatcherEnabled) return true;
    if (Number(rescanInterval) !== folder.rescanIntervalS) return true;
    if (pullOrder !== (folder.order ?? 'random')) return true;
    if (Number(minDiskValue) !== (folder.minDiskFree?.value ?? 1)) return true;
    if (minDiskUnit !== (folder.minDiskFree?.unit ?? '%')) return true;
    if (ignorePerms !== folder.ignorePerms) return true;
    if (syncOwnership !== (folder.syncOwnership ?? false)) return true;
    if (sendOwnership !== (folder.sendOwnership ?? false)) return true;
    if (syncXattrs !== (folder.syncXattrs ?? false)) return true;
    if (sendXattrs !== (folder.sendXattrs ?? false)) return true;
    return false;
  }, [
    folder,
    watch,
    rescanInterval,
    pullOrder,
    minDiskValue,
    minDiskUnit,
    ignorePerms,
    syncOwnership,
    sendOwnership,
    syncXattrs,
    sendXattrs,
  ]);

  const save = async () => {
    if (saving) return;
    const rescanNum = Number(rescanInterval);
    if (!Number.isFinite(rescanNum) || rescanNum < 0) {
      setError('Rescan interval must be a non-negative number');
      return;
    }
    const diskNum = Number(minDiskValue);
    if (!Number.isFinite(diskNum) || diskNum < 0) {
      setError('Minimum free disk space must be a non-negative number');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const patch: Partial<FolderConfig> = {
        fsWatcherEnabled: watch,
        rescanIntervalS: rescanNum,
        order: pullOrder,
        minDiskFree: { value: diskNum, unit: minDiskUnit },
        ignorePerms,
        syncOwnership,
        sendOwnership,
        syncXattrs,
        sendXattrs,
      };
      await client.patchFolder(folder.id, patch);
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
          Advanced options
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

        <Section title="Scanning">
          <SwitchRow
            label="Watch for changes"
            hint="Use filesystem notifications to detect edits. Falls back to periodic scans otherwise."
            value={watch}
            onValueChange={setWatch}
          />
          <View style={styles.divider} />
          <NumberRow
            label="Full rescan interval"
            suffix="seconds"
            hint="How often to walk the entire tree. 0 disables periodic rescans."
            value={rescanInterval}
            onChangeText={setRescanInterval}
          />
        </Section>

        <Section title="Pull order">
          <Text style={styles.sectionHint}>
            Order in which missing files are downloaded from peers.
          </Text>
          {PULL_ORDERS.map(opt => {
            const on = opt.value === pullOrder;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.radioRow, on && styles.radioRowOn]}
                onPress={() => setPullOrder(opt.value)}
                activeOpacity={0.7}
              >
                <View style={[styles.radio, on && styles.radioOn]}>
                  {on && <View style={styles.radioInner} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.radioLabel, on && styles.radioLabelOn]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.radioHint}>{opt.hint}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </Section>

        <Section title="Minimum free disk space">
          <Text style={styles.sectionHint}>
            Stop writing if free space would fall below this threshold.
          </Text>
          <View style={styles.diskRow}>
            <TextInput
              style={styles.diskValue}
              value={minDiskValue}
              onChangeText={setMinDiskValue}
              keyboardType="numeric"
              placeholder="1"
              placeholderTextColor={colors.textDim}
            />
            <View style={styles.unitRow}>
              {DISK_UNITS.map(u => {
                const on = u === minDiskUnit;
                return (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitChip, on && styles.unitChipOn]}
                    onPress={() => setMinDiskUnit(u)}
                  >
                    <Text style={[styles.unitChipText, on && styles.unitChipTextOn]}>
                      {u}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Section>

        <Section title="Permissions">
          <SwitchRow
            label="Ignore permissions"
            hint="Skip comparing file mode bits. Recommended on FAT, exFAT, and most Android storage."
            value={ignorePerms}
            onValueChange={setIgnorePerms}
          />
        </Section>

        <Section title="Ownership">
          <SwitchRow
            label="Sync ownership"
            hint="Apply incoming ownership info. Usually requires elevated privileges."
            value={syncOwnership}
            onValueChange={setSyncOwnership}
          />
          <View style={styles.divider} />
          <SwitchRow
            label="Send ownership"
            hint="Transmit local ownership info to peers. Significant performance impact."
            value={sendOwnership}
            onValueChange={setSendOwnership}
          />
        </Section>

        <Section title="Extended attributes">
          <SwitchRow
            label="Sync extended attributes"
            hint="Apply incoming xattrs. Filesystem support required."
            value={syncXattrs}
            onValueChange={setSyncXattrs}
          />
          <View style={styles.divider} />
          <SwitchRow
            label="Send extended attributes"
            hint="Transmit local xattrs to peers. Significant performance impact."
            value={sendXattrs}
            onValueChange={setSendXattrs}
          />
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SwitchRow({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.switchLabel}>{label}</Text>
        <Text style={styles.switchHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
      />
    </View>
  );
}

function NumberRow({
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
      <Text style={styles.switchLabel}>{label}</Text>
      <Text style={styles.switchHint}>{hint}</Text>
      <View style={styles.numberInputRow}>
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
  error: { color: colors.error, fontSize: 13, marginBottom: 4 },
  section: { gap: 8 },
  sectionTitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionHint: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: -2,
    marginBottom: 6,
    lineHeight: 15,
  },
  sectionBody: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  switchLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  switchHint: { color: colors.textDim, fontSize: 11, lineHeight: 15, marginTop: 2 },
  numberInputRow: {
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
  numberSuffix: { color: colors.textDim, fontSize: 12 },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 12,
  },
  radioRowOn: { borderColor: colors.accent, backgroundColor: colors.bg },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioOn: { borderColor: colors.accent },
  radioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
  radioLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  radioLabelOn: { color: colors.accent },
  radioHint: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  diskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  diskValue: {
    width: 90,
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
  unitRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  unitChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  unitChipOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  unitChipText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  unitChipTextOn: { color: '#fff' },
});
