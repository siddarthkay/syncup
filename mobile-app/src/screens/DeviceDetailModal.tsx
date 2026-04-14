import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import type { Completion, ConnectionInfo, DeviceConfig, FolderConfig } from '../api/types';
import { colors, formatBytes } from '../components/ui';
import { Icon } from '../components/Icon';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { DeviceAdvancedEditor } from './DeviceAdvancedEditor';

type Page = 'main' | 'advanced';

interface Props {
  visible: boolean;
  device: DeviceConfig | null;
  connection: ConnectionInfo | undefined;
  isSelf: boolean;
  onClose: () => void;
  onChanged: () => void;
}

// device-side twin of FolderDetailModal; self hides pause/delete
export function DeviceDetailModal({
  visible,
  device,
  connection,
  isSelf,
  onClose,
  onChanged,
}: Props) {
  const client = useSyncthingClient();
  const keyboardHeight = useKeyboardHeight();
  const { height: winHeight } = useWindowDimensions();
  const sheetHeight = Math.max(320, (winHeight - keyboardHeight) * 0.92);

  const [name, setName] = useState('');
  const [autoAccept, setAutoAccept] = useState(false);
  const [allFolders, setAllFolders] = useState<FolderConfig[]>([]);
  const [sharedFolderIds, setSharedFolderIds] = useState<Set<string>>(new Set());
  const [originalSharedIds, setOriginalSharedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('main');

  // prev totals in a ref, rate calc must not depend on render cycle
  const [liveConn, setLiveConn] = useState<ConnectionInfo | null>(null);
  const [inRate, setInRate] = useState(0);
  const [outRate, setOutRate] = useState(0);
  const lastSnapshotRef = useRef<{
    at: number;
    inBytes: number;
    outBytes: number;
  } | null>(null);

  const [completions, setCompletions] = useState<Record<string, Completion>>({});

  const loadFolders = useCallback(async () => {
    if (!device) return;
    try {
      const folders = await client.folders();
      setAllFolders(folders);
      const shared = new Set(
        folders
          .filter(f => f.devices.some(d => d.deviceID === device.deviceID))
          .map(f => f.id),
      );
      setSharedFolderIds(shared);
      setOriginalSharedIds(new Set(shared));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client, device]);

  useEffect(() => {
    if (!visible) {
      setPage('main');
      return;
    }
    if (!device) return;
    setName(device.name || '');
    setAutoAccept(device.autoAcceptFolders);
    setError(null);
    loadFolders();
  }, [visible, device, loadFolders]);

  const smartClose = () => {
    if (page !== 'main') {
      setPage('main');
      return;
    }
    onClose();
  };

  // 2s poll; rates are delta/dt between snapshots
  useEffect(() => {
    if (!visible || !device) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const conns = await client.connections();
        if (cancelled) return;
        const c = conns.connections?.[device.deviceID] ?? null;
        setLiveConn(c);
        if (c) {
          const nowMs = Date.now();
          const prev = lastSnapshotRef.current;
          if (prev) {
            const dt = (nowMs - prev.at) / 1000;
            if (dt > 0) {
              const inDelta = c.inBytesTotal - prev.inBytes;
              const outDelta = c.outBytesTotal - prev.outBytes;
              setInRate(Math.max(0, inDelta / dt));
              setOutRate(Math.max(0, outDelta / dt));
            }
          }
          lastSnapshotRef.current = {
            at: nowMs,
            inBytes: c.inBytesTotal,
            outBytes: c.outBytesTotal,
          };
        } else {
          // drop snapshot on disconnect, reconnect would otherwise show a giant delta
          setInRate(0);
          setOutRate(0);
          lastSnapshotRef.current = null;
        }
      } catch {
        // next tick will retry
      }

      const ids = Array.from(sharedFolderIds);
      if (ids.length > 0) {
        const results = await Promise.allSettled(
          ids.map(folderId =>
            client
              .dbCompletion(device.deviceID, folderId)
              .then(c => ({ folderId, c })),
          ),
        );
        if (cancelled) return;
        setCompletions(prev => {
          const next = { ...prev };
          for (const r of results) {
            if (r.status === 'fulfilled') {
              next[r.value.folderId] = r.value.c;
            }
          }
          return next;
        });
      }
    };

    // fresh snapshot on remount
    lastSnapshotRef.current = null;
    setInRate(0);
    setOutRate(0);

    tick();
    const id = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [visible, device, client, sharedFolderIds]);

  const toggleFolder = (folderId: string) => {
    setSharedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const dirty = useMemo(() => {
    if (!device) return false;
    if (name !== (device.name || '')) return true;
    if (autoAccept !== device.autoAcceptFolders) return true;
    if (originalSharedIds.size !== sharedFolderIds.size) return true;
    for (const id of originalSharedIds) if (!sharedFolderIds.has(id)) return true;
    for (const id of sharedFolderIds) if (!originalSharedIds.has(id)) return true;
    return false;
  }, [device, name, autoAccept, originalSharedIds, sharedFolderIds]);

  const save = async () => {
    if (!device) return;
    setBusy(true);
    setError(null);
    try {
      if (name !== (device.name || '') || autoAccept !== device.autoAcceptFolders) {
        await client.patchDevice(device.deviceID, {
          name: name.trim() || device.deviceID.slice(0, 7),
          autoAcceptFolders: autoAccept,
        });
      }
      const toAdd: string[] = [];
      const toRemove: string[] = [];
      for (const id of sharedFolderIds) {
        if (!originalSharedIds.has(id)) toAdd.push(id);
      }
      for (const id of originalSharedIds) {
        if (!sharedFolderIds.has(id)) toRemove.push(id);
      }
      for (const folderId of toAdd) {
        const folder = allFolders.find(f => f.id === folderId);
        if (!folder) continue;
        const devices = [
          ...folder.devices,
          { deviceID: device.deviceID, introducedBy: '', encryptionPassword: '' },
        ];
        await client.patchFolder(folderId, { devices });
      }
      for (const folderId of toRemove) {
        const folder = allFolders.find(f => f.id === folderId);
        if (!folder) continue;
        const devices = folder.devices.filter(d => d.deviceID !== device.deviceID);
        await client.patchFolder(folderId, { devices });
      }
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const togglePause = async () => {
    if (!device || isSelf) return;
    setBusy(true);
    setError(null);
    try {
      await client.patchDevice(device.deviceID, { paused: !device.paused });
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    if (!device || isSelf) return;
    Alert.alert(
      'Remove device?',
      `"${device.name || device.deviceID.slice(0, 7)}" will be unlinked. Folders stay on disk but no longer sync with this peer.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              await client.deleteDevice(device.deviceID);
              onChanged();
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  if (!device) return null;

  // prefer our 2s poll over the parent's 30s tick
  const conn = liveConn ?? connection;
  const connected = conn?.connected ?? false;
  const stateLabel = isSelf
    ? 'this device'
    : device.paused
      ? 'paused'
      : connected
        ? 'connected'
        : 'disconnected';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={smartClose} statusBarTranslucent>
      <View style={[styles.backdrop, { paddingBottom: keyboardHeight }]}>
        <TouchableWithoutFeedback onPress={smartClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { height: sheetHeight }]}>
          {page === 'advanced' ? (
            <DeviceAdvancedEditor
              device={device}
              onBack={() => setPage('main')}
              onSaved={onChanged}
            />
          ) : (
          <>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancel}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>
              {device.name || stateLabel}
            </Text>
            <TouchableOpacity onPress={save} disabled={!dirty || busy}>
              {busy ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={[styles.save, !dirty && styles.saveDisabled]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Info</Text>
              <Row label="State" value={stateLabel} />
              <Row label="Device ID" value={device.deviceID} mono multiline />
              <Row label="Address" value={conn?.address || device.addresses[0] || 'dynamic'} mono />
              <Row label="Compression" value={device.compression} />
              {connected && conn && (
                <>
                  <Row
                    label="Rate"
                    value={`↑ ${formatRate(outRate)}   ↓ ${formatRate(inRate)}`}
                  />
                  <Row label="In" value={formatBytes(conn.inBytesTotal)} />
                  <Row label="Out" value={formatBytes(conn.outBytesTotal)} />
                  <Row label="Type" value={conn.type || '?'} />
                  <Row label="Crypto" value={conn.crypto || '?'} />
                </>
              )}
            </View>

            <Text style={styles.sectionLabel}>Name</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder={device.deviceID.slice(0, 7)}
              placeholderTextColor={colors.textDim}
              autoCorrect={false}
              autoCapitalize="none"
            />

            {!isSelf && (
              <>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.switchLabel}>Auto-accept folders</Text>
                    <Text style={styles.switchHint}>
                      Automatically create folders this peer shares without asking.
                    </Text>
                  </View>
                  <Switch
                    value={autoAccept}
                    onValueChange={setAutoAccept}
                    trackColor={{ false: colors.border, true: colors.accent }}
                  />
                </View>
              </>
            )}

            <Text style={styles.sectionLabel}>Shared folders</Text>
            {allFolders.length === 0 ? (
              <Text style={styles.peerEmpty}>No folders configured yet.</Text>
            ) : (
              allFolders.map(f => {
                const on = sharedFolderIds.has(f.id);
                const label = f.label || f.id;
                const comp = on ? completions[f.id] : undefined;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.folder, on && styles.folderOn]}
                    onPress={() => toggleFolder(f.id)}
                  >
                    <View style={styles.folderMain}>
                      <Text style={styles.folderLabel}>{label}</Text>
                      <Text style={styles.folderId} numberOfLines={1}>{f.id}</Text>
                      {comp && (
                        <Text style={styles.folderCompletion} numberOfLines={1}>
                          {Math.round(comp.completion)}%
                          {comp.needBytes > 0
                            ? ` · ${formatBytes(comp.needBytes)} remaining`
                            : ' · in sync'}
                        </Text>
                      )}
                    </View>
                    <View style={[styles.checkbox, on && styles.checkboxOn]}>
                      {on && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            {!isSelf && (
              <TouchableOpacity
                style={styles.advancedRow}
                onPress={() => setPage('advanced')}
              >
                <Icon name="settings" size={22} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.advancedTitle}>Advanced options</Text>
                  <Text style={styles.advancedHint}>
                    Compression, addresses, bandwidth limits, introducer
                  </Text>
                </View>
                <Text style={styles.advancedArrow}>›</Text>
              </TouchableOpacity>
            )}

            {!isSelf && (
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.pauseBtn]}
                  onPress={togglePause}
                  disabled={busy}
                >
                  <Text style={styles.actionBtnText}>
                    {device.paused ? 'Resume' : 'Pause'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={confirmDelete}
                  disabled={busy}
                >
                  <Text style={[styles.actionBtnText, styles.deleteBtnText]}>Remove</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
          </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// <1 kB/s collapses to "idle" so the row doesn't flicker
function formatRate(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec < 1024) return 'idle';
  return `${formatBytes(bytesPerSec)}/s`;
}

function Row({ label, value, mono, multiline }: { label: string; value: string; mono?: boolean; multiline?: boolean }) {
  if (multiline) {
    return (
      <View style={styles.rowStacked}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValueStacked, mono && styles.mono]} selectable>{value}</Text>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} selectable numberOfLines={1}>{value}</Text>
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
  body: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  rowStacked: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textDim, fontSize: 13 },
  rowValue: { color: colors.text, fontSize: 13, flex: 1, textAlign: 'right' },
  rowValueStacked: { color: colors.text, fontSize: 12, marginTop: 4 },
  mono: { fontFamily: 'Menlo' },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  nameInput: {
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 20,
  },
  switchLabel: { color: colors.text, fontSize: 14, fontWeight: '500' },
  switchHint: { color: colors.textDim, fontSize: 11, marginTop: 4, lineHeight: 15 },
  peerEmpty: { color: colors.textDim, fontSize: 13, fontStyle: 'italic', marginBottom: 20 },
  folder: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  folderOn: { borderColor: colors.accent },
  folderMain: { flex: 1 },
  folderLabel: { color: colors.text, fontSize: 14, fontWeight: '500' },
  folderId: { color: colors.textDim, fontSize: 11, fontFamily: 'Menlo', marginTop: 2 },
  folderCompletion: { color: colors.success, fontSize: 11, fontWeight: '600', marginTop: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  pauseBtn: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  deleteBtn: {
    backgroundColor: colors.errorBg,
    borderColor: colors.errorBorder,
  },
  actionBtnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  deleteBtnText: { color: colors.error },
  error: { color: colors.error, fontSize: 13, marginBottom: 12 },
  advancedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  advancedIcon: { fontSize: 22 },
  advancedTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  advancedHint: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  advancedArrow: { color: colors.textDim, fontSize: 22 },
});
