import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSyncthingClient } from '../daemon/SyncthingContext';
import type { Options } from '../api/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../components/ui';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

interface Props {
  visible: boolean;
  onClose: () => void;
}

// urAccepted sentinels (syncthing's reporting code):
//   -1 declined, 0 undecided, >=1 accepted (consent version)
const UR_DECLINED = -1;
const UR_UNDECIDED = 0;
const UR_ACCEPTED = 3;

function joinList(items: readonly string[] | undefined): string {
  return (items ?? []).join('\n');
}

function splitList(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

export function GlobalOptionsModal({ visible, onClose }: Props) {
  const client = useSyncthingClient();
  const keyboardHeight = useKeyboardHeight();
  const { height: winHeight } = useWindowDimensions();
  const sheetHeight = Math.max(320, (winHeight - keyboardHeight) * 0.92);

  const [original, setOriginal] = useState<Options | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [listenAddrs, setListenAddrs] = useState('');
  const [globalAnnounce, setGlobalAnnounce] = useState(true);
  const [globalServers, setGlobalServers] = useState('');
  const [localAnnounce, setLocalAnnounce] = useState(true);
  const [localPort, setLocalPort] = useState('21027');
  const [relays, setRelays] = useState(true);
  const [nat, setNat] = useState(true);
  const [maxSend, setMaxSend] = useState('0');
  const [maxRecv, setMaxRecv] = useState('0');
  const [limitLan, setLimitLan] = useState(false);
  const [urAccepted, setUrAccepted] = useState<number>(UR_UNDECIDED);

  useEffect(() => {
    if (!visible) {
      setOriginal(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    client
      .options()
      .then(opts => {
        if (cancelled) return;
        setOriginal(opts);
        setListenAddrs(joinList(opts.listenAddresses));
        setGlobalAnnounce(opts.globalAnnounceEnabled);
        setGlobalServers(joinList(opts.globalAnnounceServers));
        setLocalAnnounce(opts.localAnnounceEnabled);
        setLocalPort(String(opts.localAnnouncePort ?? 21027));
        setRelays(opts.relaysEnabled);
        setNat(opts.natEnabled);
        setMaxSend(String(opts.maxSendKbps ?? 0));
        setMaxRecv(String(opts.maxRecvKbps ?? 0));
        setLimitLan(opts.limitBandwidthInLan);
        setUrAccepted(opts.urAccepted ?? UR_UNDECIDED);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, client]);

  const dirty = useMemo(() => {
    if (!original) return false;
    if (listenAddrs !== joinList(original.listenAddresses)) return true;
    if (globalAnnounce !== original.globalAnnounceEnabled) return true;
    if (globalServers !== joinList(original.globalAnnounceServers)) return true;
    if (localAnnounce !== original.localAnnounceEnabled) return true;
    if (Number(localPort) !== original.localAnnouncePort) return true;
    if (relays !== original.relaysEnabled) return true;
    if (nat !== original.natEnabled) return true;
    if (Number(maxSend) !== (original.maxSendKbps ?? 0)) return true;
    if (Number(maxRecv) !== (original.maxRecvKbps ?? 0)) return true;
    if (limitLan !== original.limitBandwidthInLan) return true;
    if (urAccepted !== (original.urAccepted ?? UR_UNDECIDED)) return true;
    return false;
  }, [
    original,
    listenAddrs,
    globalAnnounce,
    globalServers,
    localAnnounce,
    localPort,
    relays,
    nat,
    maxSend,
    maxRecv,
    limitLan,
    urAccepted,
  ]);

  const validate = (): string | null => {
    const port = Number(localPort);
    if (!Number.isFinite(port) || port < 0 || port > 65535) {
      return 'Local discovery port must be between 0 and 65535';
    }
    const send = Number(maxSend);
    if (!Number.isFinite(send) || send < 0) {
      return 'Max send rate must be 0 or positive';
    }
    const recv = Number(maxRecv);
    if (!Number.isFinite(recv) || recv < 0) {
      return 'Max receive rate must be 0 or positive';
    }
    if (splitList(listenAddrs).length === 0) {
      return 'At least one listen address is required (use "default")';
    }
    return null;
  };

  const save = async () => {
    if (saving || !original) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const patch: Partial<Options> = {
        listenAddresses: splitList(listenAddrs),
        globalAnnounceEnabled: globalAnnounce,
        globalAnnounceServers: splitList(globalServers),
        localAnnounceEnabled: localAnnounce,
        localAnnouncePort: Number(localPort),
        relaysEnabled: relays,
        natEnabled: nat,
        maxSendKbps: Number(maxSend),
        maxRecvKbps: Number(maxRecv),
        limitBandwidthInLan: limitLan,
        urAccepted,
      };
      await client.patchOptions(patch);
      onClose();
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
        { text: 'Discard', style: 'destructive', onPress: onClose },
      ]);
      return;
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={cancel}
      statusBarTranslucent
    >
      <SafeAreaView style={[styles.backdrop, { paddingBottom: keyboardHeight }]} edges={['top', 'bottom']}>
        <TouchableWithoutFeedback onPress={cancel}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { height: sheetHeight }]}>
          <View style={styles.container}>
            <View style={styles.header}>
              <TouchableOpacity onPress={cancel} hitSlop={8}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.title} numberOfLines={1}>
                Daemon configuration
              </Text>
              <TouchableOpacity onPress={save} disabled={!dirty || saving} hitSlop={8}>
                {saving ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text style={[styles.save, !dirty && styles.saveDisabled]}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            {loading && !original ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.textDim} />
              </View>
            ) : (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.body}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {error && <Text style={styles.error}>{error}</Text>}

                <Section title="Listen addresses">
                  <Text style={styles.sectionHint}>
                    One per line. <Text style={styles.mono}>default</Text> picks sensible TCP/QUIC defaults. Pin specific endpoints like <Text style={styles.mono}>tcp://0.0.0.0:22000</Text> to override.
                  </Text>
                  <TextInput
                    style={styles.multiLineInput}
                    value={listenAddrs}
                    onChangeText={setListenAddrs}
                    multiline
                    scrollEnabled={false}
                    autoCorrect={false}
                    autoCapitalize="none"
                    spellCheck={false}
                    textAlignVertical="top"
                    placeholder={'default'}
                    placeholderTextColor={colors.textDim}
                  />
                </Section>

                <Section title="Discovery">
                  <SwitchRow
                    label="Local discovery"
                    hint="Find peers on the same LAN via UDP broadcast. Recommended on home/office networks."
                    value={localAnnounce}
                    onValueChange={setLocalAnnounce}
                  />
                  <View style={styles.divider} />
                  <NumberField
                    label="Local discovery port"
                    suffix="UDP"
                    value={localPort}
                    onChangeText={setLocalPort}
                  />
                  <View style={styles.divider} />
                  <SwitchRow
                    label="Global discovery"
                    hint="Locate peers via syncthing's discovery servers when local discovery doesn't see them."
                    value={globalAnnounce}
                    onValueChange={setGlobalAnnounce}
                  />
                  {globalAnnounce && (
                    <>
                      <Text style={styles.subHint}>Global discovery servers</Text>
                      <Text style={styles.subSubHint}>
                        One per line. Use <Text style={styles.mono}>default</Text> to fall back to syncthing-hosted servers.
                      </Text>
                      <TextInput
                        style={styles.multiLineInput}
                        value={globalServers}
                        onChangeText={setGlobalServers}
                        multiline
                        scrollEnabled={false}
                        autoCorrect={false}
                        autoCapitalize="none"
                        spellCheck={false}
                        textAlignVertical="top"
                        placeholder={'default'}
                        placeholderTextColor={colors.textDim}
                      />
                    </>
                  )}
                </Section>

                <Section title="Connections">
                  <SwitchRow
                    label="Enable relaying"
                    hint="Route traffic through public relay servers when peers can't reach each other directly. Slower but works behind strict NATs."
                    value={relays}
                    onValueChange={setRelays}
                  />
                  <View style={styles.divider} />
                  <SwitchRow
                    label="Enable NAT traversal"
                    hint="Try UPnP and NAT-PMP to open the listen port automatically on your router."
                    value={nat}
                    onValueChange={setNat}
                  />
                </Section>

                <Section title="Bandwidth limits">
                  <Text style={styles.sectionHint}>
                    Global caps in kilobits per second. 0 means unlimited. Per-device limits stack on top of these.
                  </Text>
                  <NumberField
                    label="Outgoing rate limit"
                    suffix="kbit/s"
                    value={maxSend}
                    onChangeText={setMaxSend}
                  />
                  <View style={styles.divider} />
                  <NumberField
                    label="Incoming rate limit"
                    suffix="kbit/s"
                    value={maxRecv}
                    onChangeText={setMaxRecv}
                  />
                  <View style={styles.divider} />
                  <SwitchRow
                    label="Apply limits to LAN too"
                    hint="By default LAN traffic ignores the rate limit. Turn this on to throttle local peers as well."
                    value={limitLan}
                    onValueChange={setLimitLan}
                  />
                </Section>

                <Section title="Anonymous usage reporting">
                  <Text style={styles.sectionHint}>
                    Send anonymous statistics to the syncthing project so they can prioritize features and detect regressions. No file contents or peer identities are reported.
                  </Text>
                  <UrChoice value={urAccepted} onChange={setUrAccepted} />
                </Section>
              </ScrollView>
            )}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
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

function UrChoice({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const opts: { v: number; label: string; hint: string }[] = [
    { v: UR_ACCEPTED, label: 'Send anonymous reports', hint: 'Help the project. Recommended.' },
    { v: UR_DECLINED, label: 'Do not send', hint: 'Opt out entirely.' },
    { v: UR_UNDECIDED, label: 'Ask me later', hint: 'Default until you decide.' },
  ];
  return (
    <View style={{ gap: 6 }}>
      {opts.map(o => {
        const on = o.v === value || (o.v === UR_ACCEPTED && value >= 1);
        return (
          <TouchableOpacity
            key={o.v}
            style={[styles.radioRow, on && styles.radioRowOn]}
            onPress={() => onChange(o.v)}
            activeOpacity={0.7}
          >
            <View style={[styles.radio, on && styles.radioOn]}>
              {on && <View style={styles.radioInner} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.radioLabel, on && styles.radioLabelOn]}>{o.label}</Text>
              <Text style={styles.radioHint}>{o.hint}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
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
  cancel: { color: colors.textDim, fontSize: 15 },
  save: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  saveDisabled: { color: colors.border },
  loading: { paddingVertical: 60, alignItems: 'center' },
  scroll: { flex: 1 },
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
    minHeight: 80,
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
  subHint: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  subSubHint: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 6,
  },
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
