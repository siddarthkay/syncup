import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSyncthing, useSyncthingClient } from '../daemon/SyncthingContext';
import type { Completion, DbStatus, DeviceConfig, FolderConfig } from '../api/types';
import { colors, formatBytes, Progress } from '../components/ui';

interface Props {
  folder: FolderConfig;
  status: DbStatus | null;
  onBack: () => void;
}

interface DeviceCompletion {
  device: DeviceConfig;
  completion: Completion | null;
}

export function FolderStatistics({ folder, status, onBack }: Props) {
  const { info } = useSyncthing();
  const client = useSyncthingClient();
  const [devices, setDevices] = useState<DeviceCompletion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const allDevices = await client.devices();
      const folderDeviceIds = new Set(folder.devices.map(d => d.deviceID));
      const peers = allDevices.filter(
        d => folderDeviceIds.has(d.deviceID) && d.deviceID !== info?.deviceId,
      );
      const results: DeviceCompletion[] = await Promise.all(
        peers.map(async device => {
          try {
            const comp = await client.dbCompletion(device.deviceID, folder.id);
            return { device, completion: comp };
          } catch {
            return { device, completion: null };
          }
        }),
      );
      setDevices(results);
    } catch {
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [client, folder, info?.deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  const globalBytes = status?.globalBytes ?? 0;
  const localBytes = status?.localBytes ?? 0;
  const needBytes = status?.needBytes ?? 0;
  const syncPct = globalBytes > 0 ? ((globalBytes - needBytes) / globalBytes) * 100 : 100;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>Statistics</Text>
        <TouchableOpacity onPress={load} hitSlop={8}>
          <Text style={styles.refresh}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>This device</Text>
          <StatRow label="Global files" value={status?.globalFiles?.toLocaleString() ?? '-'} />
          <StatRow label="Global size" value={formatBytes(globalBytes)} />
          <StatRow label="Local files" value={status?.localFiles?.toLocaleString() ?? '-'} />
          <StatRow label="Local size" value={formatBytes(localBytes)} />
          <StatRow label="Out of sync" value={status?.needFiles ? `${status.needFiles} files (${formatBytes(needBytes)})` : 'None'} />
          <View style={styles.progressBlock}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressPct}>{Math.round(syncPct)}%</Text>
              <Text style={styles.progressLabel}>synced locally</Text>
            </View>
            <Progress value={syncPct / 100} height={8} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Per-device completion</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textDim} />
          </View>
        ) : devices.length === 0 ? (
          <Text style={styles.emptyText}>No peer devices share this folder.</Text>
        ) : (
          devices.map(({ device, completion }) => {
            const pct = completion?.completion ?? 0;
            const need = completion?.needBytes ?? 0;
            const needItems = completion?.needItems ?? 0;
            return (
              <View key={device.deviceID} style={styles.deviceCard}>
                <View style={styles.deviceHeader}>
                  <Text style={styles.deviceName} numberOfLines={1}>
                    {device.name || device.deviceID.slice(0, 7)}
                  </Text>
                  <Text style={[
                    styles.devicePct,
                    pct >= 100 && styles.devicePctDone,
                    pct < 100 && pct > 0 && styles.devicePctPartial,
                  ]}>
                    {Math.round(pct)}%
                  </Text>
                </View>
                <Progress value={pct / 100} height={6} />
                {need > 0 && (
                  <Text style={styles.deviceNeed}>
                    {needItems} file{needItems === 1 ? '' : 's'} ({formatBytes(need)}) still needed from this peer
                  </Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
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
  back: { color: colors.accent, fontSize: 15, minWidth: 56 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center' },
  refresh: { color: colors.accent, fontSize: 15, minWidth: 56, textAlign: 'right' },
  body: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 24,
  },
  cardTitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  statLabel: { color: colors.textDim, fontSize: 13 },
  statValue: { color: colors.text, fontSize: 13, fontWeight: '500' },
  progressBlock: { marginTop: 14, gap: 8 },
  progressHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  progressPct: { color: colors.text, fontSize: 22, fontWeight: '700' },
  progressLabel: { color: colors.textDim, fontSize: 12 },
  sectionTitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  center: { paddingVertical: 30, alignItems: 'center' },
  emptyText: { color: colors.textDim, fontSize: 13, fontStyle: 'italic' },
  deviceCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceName: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
  devicePct: { color: colors.textDim, fontSize: 16, fontWeight: '700' },
  devicePctDone: { color: colors.accent },
  devicePctPartial: { color: '#e5a94b' },
  deviceNeed: { color: colors.textDim, fontSize: 11, marginTop: 2 },
});
