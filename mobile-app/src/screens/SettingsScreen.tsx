import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GlobalOptionsModal } from './GlobalOptionsModal';
import { LogsModal } from './LogsModal';
import { PhotoBackupSettings } from './PhotoBackupSettings';
import { ShowDeviceQRModal } from './ShowDeviceQRModal';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GoBridge from '../GoServerBridgeJSI';
import { useSyncthing } from '../daemon/SyncthingContext';
import { useOnboarding } from '../onboarding/useOnboarding';
import { useCoach } from '../onboarding/coach/CoachContext';
import { useCoachTarget } from '../onboarding/coach/useCoachTarget';
import { useResource } from '../daemon/useResource';
import type { SystemVersion } from '../api/types';
import {
  Card,
  CardTitle,
  Row,
  ErrorBox,
  colors,
  formatBytes,
  formatUptime,
} from '../components/ui';

export function SettingsScreen() {
  const { info, client, error: daemonError, restart, stop, refreshStorageState } = useSyncthing();
  const isAndroid = Platform.OS === 'android';

  const fetcher = useCallback(async () => {
    if (!client) throw new Error('daemon not ready');
    const [status, version] = await Promise.all([
      client.systemStatus(),
      client.systemVersion().catch(() => null as SystemVersion | null),
    ]);
    return { status, version };
  }, [client]);

  const { data, error, refreshing, refresh } = useResource(fetcher, [client], {
    intervalMs: 10000,
    enabled: !!client,
  });

  const [globalOptionsOpen, setGlobalOptionsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [photoBackupOpen, setPhotoBackupOpen] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const onboarding = useOnboarding();
  const coach = useCoach();
  const scrollRef = useRef<ScrollView | null>(null);

  // native side owns the truth (SharedPreferences); we mirror + write-through
  const [wifiOnly, setWifiOnly] = useState<boolean>(false);
  const [chargingOnly, setChargingOnly] = useState<boolean>(false);
  const [allowMetered, setAllowMetered] = useState<boolean>(false);
  const [allowMobile, setAllowMobile] = useState<boolean>(false);
  useEffect(() => {
    try {
      setWifiOnly(GoBridge.getWifiOnlySync());
      setChargingOnly(GoBridge.getChargingOnlySync());
      setAllowMetered(GoBridge.getAllowMeteredWifi());
      setAllowMobile(GoBridge.getAllowMobileData());
    } catch {
      // ignore - stays false
    }
  }, []);

  const toggleWifiOnly = (value: boolean) => {
    setWifiOnly(value);
    try {
      GoBridge.setWifiOnlySync(value);
    } catch (e) {
      Alert.alert('Could not change setting', e instanceof Error ? e.message : String(e));
      setWifiOnly(!value);
    }
  };

  const toggleChargingOnly = (value: boolean) => {
    setChargingOnly(value);
    try {
      GoBridge.setChargingOnlySync(value);
    } catch (e) {
      Alert.alert('Could not change setting', e instanceof Error ? e.message : String(e));
      setChargingOnly(!value);
    }
  };

  const openBatterySettings = () => {
    try {
      const ok = GoBridge.openBatteryOptimizationSettings();
      if (!ok) {
        Alert.alert(
          'Battery settings unavailable',
          'Could not open the system battery optimization screen. Open Settings -> Apps -> SyncUp -> Battery manually.',
        );
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    }
  };

  // re-read on tab focus so returning from system settings shows the new mode
  useEffect(() => {
    refreshStorageState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmRestart = () => {
    Alert.alert(
      'Restart daemon?',
      'Stops and restarts the local syncthing process. Transfers in progress will pause briefly.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restart',
          style: 'destructive',
          onPress: () => {
            try {
              GoBridge.stopServer();
            } catch {
              // ignore
            }
            restart();
          },
        },
      ],
    );
  };

  const confirmStop = () => {
    Alert.alert(
      'Stop SyncUp?',
      undefined,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: stop },
      ],
    );
  };

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textDim} />}
    >
      {daemonError && <ErrorBox message={daemonError} />}
      {error && <ErrorBox message={error} />}

      <Card>
        <CardTitle>App</CardTitle>
        <Row label="Platform" value={`${Platform.OS} ${Platform.Version}`} />
        <Row label="Package" value="com.siddarthkay.syncup" mono />
      </Card>

      {info && client && (
        <Card>
          <CardTitle>This device</CardTitle>
          <DeviceNameRow
            client={client}
            selfDeviceId={info.deviceId}
            scrollRef={scrollRef}
          />
          <Row label="Device ID" value={info.deviceId} mono multiline />
          <TouchableOpacity style={styles.qrBtn} onPress={() => setShowQR(true)}>
            <Text style={styles.qrBtnText}>Show QR for pairing</Text>
          </TouchableOpacity>
        </Card>
      )}

      {info && (
        <Card>
          <CardTitle>Daemon</CardTitle>
          {data?.version && (
            <>
              <Row label="Version" value={data.version.version} />
              <Row label="Build" value={`${data.version.os}/${data.version.arch}`} />
            </>
          )}
          {data?.status && (
            <>
              <Row label="Uptime" value={formatUptime(data.status.uptime)} />
              <Row label="Goroutines" value={String(data.status.goroutines)} />
              <Row label="Alloc" value={formatBytes(data.status.alloc)} />
            </>
          )}
          <Row label="GUI" value={info.guiAddress} />
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => setPhotoBackupOpen(true)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.linkRowTitle}>Photo backup</Text>
              <Text style={styles.linkRowHint}>
                Auto-copy new photos and videos into a synced folder
              </Text>
            </View>
            <Text style={styles.linkRowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => setGlobalOptionsOpen(true)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.linkRowTitle}>Daemon configuration</Text>
              <Text style={styles.linkRowHint}>
                Listen addresses, discovery, relays, NAT, bandwidth limits
              </Text>
            </View>
            <Text style={styles.linkRowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => setLogsOpen(true)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.linkRowTitle}>View logs</Text>
              <Text style={styles.linkRowHint}>
                Live tail of the daemon log
              </Text>
            </View>
            <Text style={styles.linkRowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => {
              onboarding.reset();
              coach.start();
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.linkRowTitle}>Replay tour</Text>
              <Text style={styles.linkRowHint}>
                Walk through the guided pointer tour again
              </Text>
            </View>
            <Text style={styles.linkRowArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={confirmRestart}>
            <Text style={styles.buttonText}>Restart daemon</Text>
          </TouchableOpacity>
        </Card>
      )}

      <Card>
          <CardTitle>Sync conditions</CardTitle>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.switchLabel}>Sync only on WiFi</Text>
              <Text style={styles.switchHint}>
                Pauses all folders when on cellular or an unvalidated network. Resumes automatically on WiFi.
              </Text>
            </View>
            <Switch
              value={wifiOnly}
              onValueChange={toggleWifiOnly}
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>
          <View style={[styles.switchRow, styles.switchRowDivider]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.switchLabel}>Sync only when charging</Text>
              <Text style={styles.switchHint}>
                Pauses all folders when running on battery. Resumes when plugged in.
              </Text>
            </View>
            <Switch
              value={chargingOnly}
              onValueChange={toggleChargingOnly}
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>
          {wifiOnly && (
            <>
              <View style={[styles.switchRow, styles.switchRowDivider]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.switchLabel}>Allow metered WiFi</Text>
                  <Text style={styles.switchHint}>
                    Sync on WiFi hotspots and tethered connections that the system marks as metered.
                  </Text>
                </View>
                <Switch
                  value={allowMetered}
                  onValueChange={v => {
                    setAllowMetered(v);
                    try { GoBridge.setAllowMeteredWifi(v); } catch {}
                  }}
                  trackColor={{ false: colors.border, true: colors.accent }}
                />
              </View>
              <View style={[styles.switchRow, styles.switchRowDivider]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.switchLabel}>Allow mobile data</Text>
                  <Text style={styles.switchHint}>
                    Sync over cellular when WiFi is unavailable. May use significant data.
                  </Text>
                </View>
                <Switch
                  value={allowMobile}
                  onValueChange={v => {
                    setAllowMobile(v);
                    try { GoBridge.setAllowMobileData(v); } catch {}
                  }}
                  trackColor={{ false: colors.border, true: colors.accent }}
                />
              </View>
            </>
          )}
        </Card>

      {isAndroid && (
        <Card>
          <CardTitle>Power</CardTitle>
          <Text style={styles.aboutText}>
            Android aggressively kills foreground services on some OEMs. Whitelisting this app from battery optimization keeps the daemon alive while the device sleeps.
          </Text>
          <TouchableOpacity style={styles.button} onPress={openBatterySettings}>
            <Text style={styles.buttonText}>Battery optimization settings</Text>
          </TouchableOpacity>
        </Card>
      )}

      {info && (
        <Card>
          <CardTitle>Storage</CardTitle>
          <Row label="Data dir" value={info.dataDir} mono multiline />
          <Text style={styles.hint}>
            {Platform.OS === 'ios'
              ? 'Folders inside this directory appear in the Files app under "SyncUp".'
              : 'Folders inside this directory are visible to Android file managers under Android/data/com.siddarthkay.syncup/files/.'}
          </Text>
        </Card>
      )}

      {info && (
        <Card>
          <CardTitle>Identity</CardTitle>
          <Row label="Device ID" value={info.deviceId} mono multiline />
          <TouchableOpacity style={styles.qrBtn} onPress={() => setShowQR(true)}>
            <Text style={styles.qrBtnText}>Show QR code</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Share this Device ID with a peer to link devices. Long-press to copy.
          </Text>
        </Card>
      )}

      <ShowDeviceQRModal
        visible={showQR}
        deviceId={info?.deviceId ?? ''}
        onClose={() => setShowQR(false)}
      />

      <Card>
        <CardTitle>Stop app</CardTitle>
        <Text style={styles.aboutText}>
          Fully stops SyncUp. Sync halts, the background notification goes away, and nothing runs in the background until you open the app again.
        </Text>
        <TouchableOpacity
          style={[styles.button, styles.buttonDanger]}
          onPress={confirmStop}
        >
          <Text style={[styles.buttonText, styles.buttonDangerText]}>Stop app</Text>
        </TouchableOpacity>
      </Card>

      <Card>
        <CardTitle>About</CardTitle>
        <Text style={styles.aboutText}>
          React Native syncthing client. The daemon runs in-process via gomobile and exposes its standard REST API on localhost.
        </Text>
        <Text style={[styles.aboutText, { marginTop: 8, color: colors.textDim }]}>
          iOS runs the daemon via BGTaskScheduler when in the background, so sync is opportunistic, not continuous. Android uses a foreground service so the daemon stays alive while the app is in the background.
        </Text>

        <View style={styles.creditsBlock}>
          <Text style={styles.creditsLine}>
            Built by{' '}
            <Text
              style={styles.creditsLink}
              onPress={() => Linking.openURL('https://siddarthkay.com')}
            >
              siddarthkay
            </Text>
          </Text>
          <Text style={styles.creditsLine}>
            Scaffolded on{' '}
            <Text
              style={styles.creditsLink}
              onPress={() => Linking.openURL('https://github.com/siddarthkay/react-native-go')}
            >
              react-native-go
            </Text>
          </Text>
        </View>
      </Card>

      <GlobalOptionsModal
        visible={globalOptionsOpen}
        onClose={() => setGlobalOptionsOpen(false)}
      />

      <LogsModal visible={logsOpen} onClose={() => setLogsOpen(false)} />

      {photoBackupOpen && (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setPhotoBackupOpen(false)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
            <PhotoBackupSettings onBack={() => setPhotoBackupOpen(false)} />
          </SafeAreaView>
        </Modal>
      )}
    </ScrollView>
  );
}

function DeviceNameRow({
  client,
  selfDeviceId,
  scrollRef,
}: {
  client: NonNullable<ReturnType<typeof useSyncthing>['client']>;
  selfDeviceId: string;
  scrollRef: React.RefObject<ScrollView | null>;
}) {
  const target = useCoachTarget('settings.deviceName', { scrollRef });
  const coach = useCoach();
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .devices()
      .then(list => {
        if (cancelled) return;
        const self = list.find(d => d.deviceID === selfDeviceId);
        const n = self?.name?.trim() ?? '';
        setName(n);
        setDraft(n);
      })
      .catch(e => !cancelled && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [client, selfDeviceId]);

  // Returns true if the row is in a "saved" state (write succeeded, or
  // the draft already matched the persisted name and was a no-op).
  const save = async (): Promise<boolean> => {
    const nextName = draft.trim();
    if (!nextName) return false;
    if (nextName === name) return true;
    setSaving(true);
    setErr(null);
    try {
      await client.patchDevice(selfDeviceId, { name: nextName });
      setName(nextName);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAndMaybeAdvance = async () => {
    const ok = await save();
    if (ok && coach.active && coach.step?.id === 'name') {
      coach.next();
    }
  };

  const dirty = draft.trim() !== name && draft.trim().length > 0;

  return (
    <View
      ref={target.ref}
      onLayout={target.onLayout}
      collapsable={false}
      style={styles.nameRow}
    >
      <Text style={styles.nameLabel}>Name</Text>
      <View style={styles.nameInputRow}>
        <TextInput
          style={styles.nameInput}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={save}
          onBlur={save}
          autoCapitalize="words"
          autoCorrect={false}
          placeholder="My iPhone"
          placeholderTextColor={colors.textDim}
          returnKeyType="done"
        />
        {dirty && (
          <TouchableOpacity
            onPress={saveAndMaybeAdvance}
            disabled={saving}
            style={styles.nameSave}
          >
            <Text style={styles.nameSaveText}>{saving ? '...' : 'Save'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {err && <Text style={styles.nameErr}>{err}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingTop: 16, paddingBottom: 100 },
  button: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  buttonDanger: { borderColor: colors.error },
  buttonDangerText: { color: colors.error },
  qrBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  qrBtnText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  hint: { color: colors.textDim, fontSize: 11, marginTop: 8, lineHeight: 15 },
  aboutText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  creditsBlock: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 4,
  },
  creditsLine: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  creditsLink: { color: colors.accent, fontWeight: '600' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 4,
    paddingTop: 12,
  },
  switchLabel: { color: colors.text, fontSize: 14, fontWeight: '500' },
  switchHint: { color: colors.textDim, fontSize: 11, marginTop: 4, lineHeight: 15 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 8,
  },
  linkRowTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  linkRowHint: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  linkRowArrow: { color: colors.textDim, fontSize: 22 },
  nameRow: { paddingVertical: 6, marginBottom: 4 },
  nameLabel: { color: colors.textDim, fontSize: 12, marginBottom: 4 },
  nameInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  nameSave: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  nameSaveText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  nameErr: { color: colors.error, fontSize: 12, marginTop: 6 },
});
