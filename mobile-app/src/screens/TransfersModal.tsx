import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSyncthingClient } from '../daemon/SyncthingContext';
import type { FolderConfig, NeedFile } from '../api/types';
import { colors, formatBytes } from '../components/ui';
import { kindIconName, fileKind } from '../utils/fileTypes';
import { Icon } from '../components/Icon';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface TransferItem {
  folder: FolderConfig;
  file: NeedFile;
  phase: 'downloading' | 'queued' | 'pending';
}

export function TransfersModal({ visible, onClose }: Props) {
  const client = useSyncthingClient();
  const [items, setItems] = useState<TransferItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const folders = await client.folders();
        const allItems: TransferItem[] = [];
        await Promise.all(
          folders.map(async folder => {
            try {
              const need = await client.dbNeed(folder.id, 1, 50);
              for (const f of need.progress ?? []) {
                allItems.push({ folder, file: f, phase: 'downloading' });
              }
              for (const f of need.queued ?? []) {
                allItems.push({ folder, file: f, phase: 'queued' });
              }
              for (const f of (need.rest ?? []).slice(0, 20)) {
                allItems.push({ folder, file: f, phase: 'pending' });
              }
            } catch {
              // folder may be paused
            }
          }),
        );
        setItems(allItems);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (!visible) return;
    load();
    const interval = setInterval(() => load(true), 3000);
    return () => clearInterval(interval);
  }, [visible, load]);

  const downloading = items.filter(i => i.phase === 'downloading');
  const queued = items.filter(i => i.phase === 'queued');
  const pending = items.filter(i => i.phase === 'pending');
  const totalNeeded = items.reduce((s, i) => s + (i.file.size ?? 0), 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeBtn}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Transfers</Text>
          <View style={{ width: 50 }} />
        </View>

        {loading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textDim} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.emptyTitle}>All synced</Text>
            <Text style={styles.emptyHint}>No files are waiting to download.</Text>
          </View>
        ) : (
          <FlatList
            data={[
              ...(downloading.length > 0
                ? [{ type: 'header' as const, label: `Downloading (${downloading.length})` }]
                : []),
              ...downloading.map(i => ({ type: 'item' as const, item: i })),
              ...(queued.length > 0
                ? [{ type: 'header' as const, label: `Queued (${queued.length})` }]
                : []),
              ...queued.map(i => ({ type: 'item' as const, item: i })),
              ...(pending.length > 0
                ? [{ type: 'header' as const, label: `Pending (${pending.length})` }]
                : []),
              ...pending.map(i => ({ type: 'item' as const, item: i })),
            ]}
            keyExtractor={(row, idx) =>
              row.type === 'header' ? `h-${row.label}` : `${row.item.folder.id}:${row.item.file.name}:${idx}`
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={colors.textDim}
              />
            }
            contentContainerStyle={styles.listBody}
            ListHeaderComponent={
              <View style={styles.summary}>
                <Text style={styles.summaryText}>
                  {items.length} file{items.length === 1 ? '' : 's'} remaining ({formatBytes(totalNeeded)})
                </Text>
              </View>
            }
            renderItem={({ item: row }) => {
              if (row.type === 'header') {
                return (
                  <Text style={styles.sectionHeader}>{row.label}</Text>
                );
              }
              const { folder, file, phase } = row.item;
              const kind = fileKind(file.name);
              return (
                <View style={styles.row}>
                  <Icon name={kindIconName(kind, false) as any} size={20} color={colors.textDim} />
                  <View style={styles.rowMain}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {file.name.split('/').pop()}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {folder.label || folder.id}  ·  {formatBytes(file.size)}
                    </Text>
                  </View>
                  <View style={[styles.phaseBadge, phaseStyle(phase)]}>
                    <Text style={[styles.phaseText, phaseTextStyle(phase)]}>
                      {phase === 'downloading' ? '↓' : phase === 'queued' ? '⏳' : '○'}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function phaseStyle(phase: string) {
  switch (phase) {
    case 'downloading':
      return { backgroundColor: '#1a3a2a', borderColor: '#2a7a4a' };
    case 'queued':
      return { backgroundColor: '#3a3020', borderColor: '#7a6830' };
    default:
      return {};
  }
}

function phaseTextStyle(phase: string) {
  switch (phase) {
    case 'downloading':
      return { color: '#4ade80' };
    case 'queued':
      return { color: '#e5a94b' };
    default:
      return { color: colors.textDim };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  closeBtn: { color: colors.accent, fontSize: 15, width: 50 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIcon: { color: colors.accent, fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  emptyHint: { color: colors.textDim, fontSize: 13, marginTop: 8 },
  summary: {
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: 8,
  },
  summaryText: { color: colors.textDim, fontSize: 12 },
  listBody: { padding: 16, paddingBottom: 40 },
  sectionHeader: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIcon: { fontSize: 20 },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { color: colors.text, fontSize: 13, fontWeight: '500' },
  rowMeta: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  phaseBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseText: { fontSize: 14 },
});
