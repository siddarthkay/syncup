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
import type { DeviceConfig } from '../api/types';
import { colors } from '../components/ui';

interface Props {
  device: DeviceConfig;
  onBack: () => void;
  onSaved: () => void;
}

// mirrors the web ui's "Advanced" device tab; PATCH only the fields we own here

type CompressionMode = 'metadata' | 'always' | 'never';

const COMPRESSION_OPTIONS: { value: CompressionMode; label: string; hint: string }[] = [
  {
    value: 'metadata',
    label: 'Metadata only',
    hint: 'Compress the index exchange. File contents go through uncompressed. Default.',
  },
  {
    value: 'always',
    label: 'Always',
    hint: 'Compress everything, including file payloads. Trades CPU for bandwidth.',
  },
  {
    value: 'never',
    label: 'Never',
    hint: 'Skip compression entirely. Useful on fast LAN links where CPU is the bottleneck.',
  },
];

function joinList(items: readonly string[] | undefined): string {
  return (items ?? []).join('\n');
}

function splitList(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

export function DeviceAdvancedEditor({ device, onBack, onSaved }: Props) {
  const client = useSyncthingClient();

  const [compression, setCompression] = useState<CompressionMode>(
    (device.compression as CompressionMode) || 'metadata',
  );
  const [addressesText, setAddressesText] = useState(joinList(device.addresses));
  const [allowedNetworksText, setAllowedNetworksText] = useState(
    joinList(device.allowedNetworks),
  );
  const [maxSend, setMaxSend] = useState(String(device.maxSendKbps ?? 0));
  const [maxRecv, setMaxRecv] = useState(String(device.maxRecvKbps ?? 0));
  const [introducer, setIntroducer] = useState(device.introducer);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // re-seed when parent refetches after a save
  useEffect(() => {
    setCompression((device.compression as CompressionMode) || 'metadata');
    setAddressesText(joinList(device.addresses));
    setAllowedNetworksText(joinList(device.allowedNetworks));
    setMaxSend(String(device.maxSendKbps ?? 0));
    setMaxRecv(String(device.maxRecvKbps ?? 0));
    setIntroducer(device.introducer);
  }, [device]);

  const dirty = useMemo(() => {
    if (compression !== ((device.compression as CompressionMode) || 'metadata')) return true;
    if (addressesText !== joinList(device.addresses)) return true;
    if (allowedNetworksText !== joinList(device.allowedNetworks)) return true;
    if (Number(maxSend) !== (device.maxSendKbps ?? 0)) return true;
    if (Number(maxRecv) !== (device.maxRecvKbps ?? 0)) return true;
    if (introducer !== device.introducer) return true;
    return false;
  }, [device, compression, addressesText, allowedNetworksText, maxSend, maxRecv, introducer]);

  const validate = (): string | null => {
    const send = Number(maxSend);
    if (!Number.isFinite(send) || send < 0) return 'Max send rate must be 0 or positive';
    const recv = Number(maxRecv);
    if (!Number.isFinite(recv) || recv < 0) return 'Max receive rate must be 0 or positive';
    const addrs = splitList(addressesText);
    if (addrs.length === 0) return 'At least one address is required (use "dynamic" to rely on discovery)';
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
      const patch: Partial<DeviceConfig> = {
        compression,
        addresses: splitList(addressesText),
        allowedNetworks: splitList(allowedNetworksText),
        maxSendKbps: Number(maxSend),
        maxRecvKbps: Number(maxRecv),
        introducer,
      };
      await client.patchDevice(device.deviceID, patch);
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

      <Text style={styles.deviceLabel} numberOfLines={1}>
        {device.name || device.deviceID.slice(0, 7)}
      </Text>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {error && <Text style={styles.error}>{error}</Text>}

        <Section title="Compression">
          <Text style={styles.sectionHint}>How aggressively to compress data exchanged with this peer.</Text>
          {COMPRESSION_OPTIONS.map(opt => {
            const on = opt.value === compression;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.radioRow, on && styles.radioRowOn]}
                onPress={() => setCompression(opt.value)}
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

        <Section title="Addresses">
          <Text style={styles.sectionHint}>
            One per line. Use <Text style={styles.mono}>dynamic</Text> to rely on discovery, or pin a specific endpoint like <Text style={styles.mono}>tcp://1.2.3.4:22000</Text>.
          </Text>
          <TextInput
            style={styles.multiLineInput}
            value={addressesText}
            onChangeText={setAddressesText}
            multiline
            scrollEnabled={false}
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            textAlignVertical="top"
            placeholder={'dynamic'}
            placeholderTextColor={colors.textDim}
          />
        </Section>

        <Section title="Allowed networks">
          <Text style={styles.sectionHint}>
            CIDR ranges, one per line. Leave empty to allow any network. Example: <Text style={styles.mono}>192.168.1.0/24</Text>.
          </Text>
          <TextInput
            style={styles.multiLineInput}
            value={allowedNetworksText}
            onChangeText={setAllowedNetworksText}
            multiline
            scrollEnabled={false}
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            textAlignVertical="top"
            placeholder={'(any)'}
            placeholderTextColor={colors.textDim}
          />
        </Section>

        <Section title="Bandwidth limits">
          <Text style={styles.sectionHint}>
            Per-device caps in kilobits per second. 0 means unlimited.
          </Text>
          <NumberField
            label="Outgoing rate limit"
            suffix="kbit/s (0 = unlimited)"
            value={maxSend}
            onChangeText={setMaxSend}
          />
          <View style={styles.divider} />
          <NumberField
            label="Incoming rate limit"
            suffix="kbit/s (0 = unlimited)"
            value={maxRecv}
            onChangeText={setMaxRecv}
          />
        </Section>

        <Section title="Introducer">
          <SwitchRow
            label="Act as introducer"
            hint="Automatically share folders this peer adds with other peers, and accept devices it introduces. Use only with peers you fully trust."
            value={introducer}
            onValueChange={setIntroducer}
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

function NumberField({
  label,
  suffix,
  value,
  onChangeText,
}: {
  label: string;
  suffix: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
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
  deviceLabel: {
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
    lineHeight: 15,
    marginBottom: 6,
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
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  multiLineInput: {
    minHeight: 90,
    color: colors.text,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Menlo',
    fontSize: 13,
    lineHeight: 18,
  },
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
  mono: { fontFamily: 'Menlo', color: colors.text },
});
