import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GlobalOptionsModal } from './GlobalOptionsModal';
import { LogsModal } from './LogsModal';
import { PhotoBackupSettings } from './PhotoBackupSettings';
import { ShowDeviceQRModal } from './ShowDeviceQRModal';
import {
  Alert,
  AppState,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { Focusable } from '../components/Focusable';
import { SafeAreaView } from 'react-native-safe-area-context';
import GoBridge from '../GoServerBridgeJSI';
import { useAppReload } from '../AppReload';
import { useSyncthing } from '../daemon/SyncthingContext';
import { exportAsyncStorage, importAsyncStorage } from '../utils/asyncStorageBackup';
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
  const [batteryExempt, setBatteryExempt] = useState<boolean>(false);
  const [externalControl, setExternalControl] = useState<boolean>(false);
  const [startOnBoot, setStartOnBoot] = useState<boolean>(false);
  const [continuousBg, setContinuousBg] = useState<boolean>(false);
  useEffect(() => {
    try {
      setWifiOnly(GoBridge.getWifiOnlySync());
      setChargingOnly(GoBridge.getChargingOnlySync());
      setAllowMetered(GoBridge.getAllowMeteredWifi());
      setAllowMobile(GoBridge.getAllowMobileData());
      setExternalControl(GoBridge.getExternalControlEnabled());
      setStartOnBoot(GoBridge.getStartOnBoot());
      setContinuousBg(GoBridge.getContinuousBackgroundSync());
    } catch {
      // ignore - stays false
    }
  }, []);

  const refreshBatteryExempt = useCallback(() => {
    if (!isAndroid) return;
    try {
      setBatteryExempt(GoBridge.isIgnoringBatteryOptimizations());
    } catch {
      setBatteryExempt(false);
    }
  }, [isAndroid]);

  useEffect(() => {
    refreshBatteryExempt();
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') refreshBatteryExempt();
    });
    return () => sub.remove();
  }, [refreshBatteryExempt]);

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

  const writeExternalControl = (next: boolean) => {
    try {
      const persisted = GoBridge.setExternalControlEnabled(next);
      setExternalControl(persisted);
    } catch (e) {
      Alert.alert('Could not change setting', e instanceof Error ? e.message : String(e));
    }
  };

  const toggleStartOnBoot = (value: boolean) => {
    try {
      const persisted = GoBridge.setStartOnBoot(value);
      setStartOnBoot(persisted);
    } catch (e) {
      Alert.alert('Could not change setting', e instanceof Error ? e.message : String(e));
    }
  };

  const toggleExternalControl = (value: boolean) => {
    if (value) {
      Alert.alert(
        'Allow external control?',
        'Any app on this device will be able to start, stop, or rescan SyncUp via broadcast intents. Useful with Tasker / MacroDroid; leave off if you do not need automation.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            style: 'destructive',
            onPress: () => writeExternalControl(true),
          },
        ],
      );
      return;
    }
    writeExternalControl(false);
  };

  const writeContinuousBg = (next: boolean) => {
    setContinuousBg(next);
    try {
      const persisted = GoBridge.setContinuousBackgroundSync(next);
      setContinuousBg(persisted);
    } catch (e) {
      Alert.alert('Could not change setting', e instanceof Error ? e.message : String(e));
      setContinuousBg(!next);
    }
  };

  const toggleContinuousBg = (value: boolean) => {
    if (value) {
      Alert.alert(
        'Keep syncing in the background?',
        'SyncUp will stay active so folders keep syncing even when the app is not open.\n\nThis uses noticeably more battery, because the sync engine and network stay awake continuously. Leave it off unless you need near-instant background sync and accept the battery cost.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enable', onPress: () => writeContinuousBg(true) },
        ],
      );
      return;
    }
    writeContinuousBg(false);
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

  const reloadApp = useAppReload();
  const [backupBusy, setBackupBusy] = useState<null | 'export' | 'import'>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<{
    retry: boolean;
    resolve: (value: string | null) => void;
  } | null>(null);
  const [passwordDraft, setPasswordDraft] = useState('');

  const handleExport = async () => {
    if (backupBusy) return;
    setBackupBusy('export');
    try {
      const asyncJson = await exportAsyncStorage();
      const raw = GoBridge.exportConfig(asyncJson);
      if (raw === '') return;
      const res = JSON.parse(raw) as { ok?: boolean; error?: string; displayName?: string };
      if (res.ok) {
        Alert.alert('Backup saved', res.displayName ? `Saved as ${res.displayName}.` : 'Backup saved.');
      } else {
        Alert.alert('Backup failed', res.error || 'Unknown error');
      }
    } catch (e) {
      Alert.alert('Backup failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBackupBusy(null);
    }
  };

  type ImportOutcome =
    | { kind: 'cancelled' }
    | { kind: 'needsPassword' }
    | { kind: 'wrongPassword'; message: string }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; importedPrefs: boolean; asyncJson: string };

  const attemptImport = (password: string): ImportOutcome => {
    let raw: string;
    try {
      raw = GoBridge.importConfig(password);
    } catch (e) {
      return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
    }
    if (raw === '') return { kind: 'cancelled' };
    let res: {
      ok?: boolean;
      error?: string;
      importedPrefs?: boolean;
      asyncStorageJson?: string;
    };
    try {
      res = JSON.parse(raw);
    } catch {
      return { kind: 'error', message: 'bridge returned invalid JSON' };
    }
    if (res.ok) {
      return {
        kind: 'ok',
        importedPrefs: !!res.importedPrefs,
        asyncJson: typeof res.asyncStorageJson === 'string' ? res.asyncStorageJson : '',
      };
    }
    const msg = res.error || 'Unknown error';
    if (msg.includes('password required')) return { kind: 'needsPassword' };
    if (msg.includes('wrong password')) return { kind: 'wrongPassword', message: msg };
    return { kind: 'error', message: msg };
  };

  const promptPassword = (retryMessage: string | null): Promise<string | null> =>
    new Promise(resolve => {
      setPasswordDraft('');
      setPasswordPrompt({ retry: !!retryMessage, resolve });
    });

  const runImport = async () => {
    setBackupBusy('import');
    try {
      try {
        GoBridge.stopServer();
      } catch {
        // importConfig refuses if globalClient is still set; best-effort is fine
      }

      let outcome = attemptImport('');
      while (outcome.kind === 'needsPassword' || outcome.kind === 'wrongPassword') {
        const retryMsg = outcome.kind === 'wrongPassword' ? 'Wrong password. Try again.' : null;
        const pw = await promptPassword(retryMsg);
        if (pw === null || pw === '') break;
        outcome = attemptImport(pw);
      }

      if (outcome.kind === 'cancelled' || outcome.kind === 'needsPassword' || outcome.kind === 'wrongPassword') {
        try {
          GoBridge.startServer();
        } catch {
          // ignore
        }
        return;
      }
      if (outcome.kind === 'error') {
        try {
          GoBridge.startServer();
        } catch {
          // ignore
        }
        Alert.alert('Restore failed', outcome.message);
        return;
      }

      let asyncRestored = 0;
      if (outcome.asyncJson) {
        try {
          asyncRestored = await importAsyncStorage(outcome.asyncJson);
        } catch {
          // ignore
        }
      }

      reloadApp();

      const parts = ['Identity and config restored'];
      if (outcome.importedPrefs) parts.push('device preferences restored');
      if (asyncRestored > 0) parts.push(`${asyncRestored} app settings restored`);
      const summary = parts.join('; ') + '.';

      // Folders restored from a backup often point at external-storage paths
      // that only sync once All Files Access is granted. The user has no way
      // to know this, so offer the permission screen directly.
      let needsAllFiles = false;
      if (isAndroid) {
        try {
          needsAllFiles = !GoBridge.hasAllFilesAccess();
        } catch {
          needsAllFiles = false;
        }
      }
      if (needsAllFiles) {
        Alert.alert(
          'Restore complete',
          summary +
            '\n\nSome restored folders may be stored outside the app and need the "All files access" permission to sync. Grant it now?',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Grant access',
              onPress: () => {
                try {
                  GoBridge.requestAllFilesAccess();
                } catch {
                  // ignore; user can grant later from the folder banner
                }
              },
            },
          ],
        );
      } else {
        Alert.alert('Restore complete', summary);
      }
    } finally {
      setBackupBusy(null);
    }
  };

  const confirmImport = () => {
    Alert.alert(
      'Restore backup?',
      "This replaces this device's identity, folder/device config, and app settings with the contents of the chosen backup. Sync will stop briefly while files are swapped.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Choose file', style: 'destructive', onPress: () => { void runImport(); } },
      ],
    );
  };

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
        <Row label="Version" value={Constants.expoConfig?.version ?? 'unknown'} />
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
          <Focusable style={styles.qrBtn} onPress={() => setShowQR(true)}>
            <Text style={styles.qrBtnText}>Show QR for pairing</Text>
          </Focusable>
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
          <Focusable
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
          </Focusable>
          <Focusable
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
          </Focusable>
          <Focusable
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
          </Focusable>
          <Focusable
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
          </Focusable>
          <Focusable style={styles.button} onPress={confirmRestart}>
            <Text style={styles.buttonText}>Restart daemon</Text>
          </Focusable>
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

      {Platform.OS === 'ios' && (
        <Card>
          <CardTitle>Background</CardTitle>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.switchLabel}>Continuous background sync</Text>
              <Text style={styles.switchHint}>
                Off by default. When on, SyncUp keeps syncing while backgrounded instead of only in the brief windows iOS normally allows. Uses noticeably more battery.
              </Text>
            </View>
            <Switch
              value={continuousBg}
              onValueChange={toggleContinuousBg}
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>
        </Card>
      )}

      {isAndroid && !batteryExempt && (
        <Card>
          <CardTitle>Power</CardTitle>
          <Text style={styles.aboutText}>
            Android aggressively kills foreground services on some OEMs. Whitelisting this app from battery optimization keeps the daemon alive while the device sleeps.
          </Text>
          <Focusable style={styles.button} onPress={openBatterySettings}>
            <Text style={styles.buttonText}>Battery optimization settings</Text>
          </Focusable>
        </Card>
      )}

      {isAndroid && (
        <Card>
          <CardTitle>Background</CardTitle>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.switchLabel}>Start at boot</Text>
              <Text style={styles.switchHint}>
                Off by default. When on, SyncUp launches automatically after the device boots and unlocks. Some OEMs (Xiaomi, Oppo, Vivo, Huawei) require enabling auto-start in their app-info screen for this to work.
              </Text>
            </View>
            <Switch
              value={startOnBoot}
              onValueChange={toggleStartOnBoot}
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>
        </Card>
      )}

      {isAndroid && (
        <Card>
          <CardTitle>Automation</CardTitle>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.switchLabel}>Allow external control</Text>
              <Text style={styles.switchHint}>
                Off by default. When on, Tasker / MacroDroid / any installed app can fire START, STOP, or RESCAN broadcast intents. There is no per-app authorization beyond this toggle.
              </Text>
            </View>
            <Switch
              value={externalControl}
              onValueChange={toggleExternalControl}
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>
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
          <Focusable style={styles.qrBtn} onPress={() => setShowQR(true)}>
            <Text style={styles.qrBtnText}>Show QR code</Text>
          </Focusable>
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
        <CardTitle>Backup & restore</CardTitle>
        <Text style={styles.aboutText}>
          Save this device's identity (cert.pem, key.pem), folder/device config, and
          {isAndroid ? ' device preferences' : ' app settings'} to a zip you can move to another device
          or keep as a recovery copy. Restoring replaces the current identity with the one in the chosen backup.
        </Text>
        <Focusable
          style={styles.button}
          onPress={handleExport}
          disabled={!!backupBusy}
        >
          <Text style={styles.buttonText}>
            {backupBusy === 'export' ? 'Working...' : 'Export backup'}
          </Text>
        </Focusable>
        <Focusable
          style={[styles.button, styles.buttonDanger]}
          onPress={confirmImport}
          disabled={!!backupBusy}
        >
          <Text style={[styles.buttonText, styles.buttonDangerText]}>
            {backupBusy === 'import' ? 'Working...' : 'Restore from backup'}
          </Text>
        </Focusable>
        <Text style={styles.hint}>
          Syncthing-Fork backups import as-is, including password-protected (AES-256) archives;
          you'll be prompted for the password. The fork's extras (https keys, index database) are
          accepted but only the identity, config{isAndroid ? ', and device preferences' : ''} are
          actually restored.
        </Text>
      </Card>

      <Card>
        <CardTitle>Stop app</CardTitle>
        <Text style={styles.aboutText}>
          Fully stops SyncUp. Sync halts, the background notification goes away, and nothing runs in the background until you open the app again.
        </Text>
        <Focusable
          style={[styles.button, styles.buttonDanger]}
          onPress={confirmStop}
        >
          <Text style={[styles.buttonText, styles.buttonDangerText]}>Stop app</Text>
        </Focusable>
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

      {passwordPrompt && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => {
            passwordPrompt.resolve(null);
            setPasswordPrompt(null);
          }}
        >
          <View style={styles.pwBackdrop}>
            <View style={styles.pwBox}>
              <Text style={styles.pwTitle}>Backup password</Text>
              <Text style={styles.pwBody}>
                {passwordPrompt.retry
                  ? 'Wrong password. Try again.'
                  : 'This backup is encrypted. Enter the password it was created with.'}
              </Text>
              <TextInput
                value={passwordDraft}
                onChangeText={setPasswordDraft}
                secureTextEntry
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Password"
                placeholderTextColor={colors.textDim}
                style={styles.pwInput}
                onSubmitEditing={() => {
                  passwordPrompt.resolve(passwordDraft);
                  setPasswordPrompt(null);
                }}
              />
              <View style={styles.pwButtonRow}>
                <Focusable
                  style={styles.pwButton}
                  onPress={() => {
                    passwordPrompt.resolve(null);
                    setPasswordPrompt(null);
                  }}
                >
                  <Text style={styles.pwButtonText}>Cancel</Text>
                </Focusable>
                <Focusable
                  style={[styles.pwButton, styles.pwButtonPrimary]}
                  onPress={() => {
                    passwordPrompt.resolve(passwordDraft);
                    setPasswordPrompt(null);
                  }}
                >
                  <Text style={[styles.pwButtonText, styles.pwButtonPrimaryText]}>
                    Decrypt
                  </Text>
                </Focusable>
              </View>
            </View>
          </View>
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
          <Focusable
            onPress={saveAndMaybeAdvance}
            disabled={saving}
            style={styles.nameSave}
          >
            <Text style={styles.nameSaveText}>{saving ? '...' : 'Save'}</Text>
          </Focusable>
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
  pwBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  pwBox: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 20,
  },
  pwTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  pwBody: { color: colors.textDim, fontSize: 13, lineHeight: 18, marginTop: 8 },
  pwInput: {
    marginTop: 16,
    color: colors.text,
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  pwButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 8,
  },
  pwButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  pwButtonPrimary: { backgroundColor: colors.accent },
  pwButtonText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  pwButtonPrimaryText: { color: '#fff' },
});
