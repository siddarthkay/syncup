import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useSyncthingClient } from '../daemon/SyncthingContext';
import type { FolderConfig, TreeEntry } from '../api/types';
import { colors, formatBytes } from '../components/ui';
import { fileKind, kindIconName, isConflict } from '../utils/fileTypes';
import { Icon } from '../components/Icon';
import { FilePreviewModal } from './FilePreviewModal';

interface Props {
  folder: FolderConfig;
  onBack: () => void;
  onChanged: () => void;
}

interface ConflictGroup {
  originalPath: string;
  originalName: string;
  original: TreeEntry | null;
  copies: { path: string; entry: TreeEntry }[];
}

const CONFLICT_RE = /\.sync-conflict-\d{8}-\d{6}-[A-Z0-9]+/;

function stripConflictSuffix(name: string): string {
  return name.replace(CONFLICT_RE, '');
}

const isDirEntry = (e: TreeEntry) =>
  e.type === 'DIRECTORY' ||
  e.type === 'FILE_INFO_TYPE_DIRECTORY';

function onDiskUri(folderPath: string, rel: string): string {
  const base = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath;
  const joined = rel ? `${base}/${rel}` : base;
  return joined.startsWith('file://') ? joined : `file://${joined}`;
}

export function ConflictResolver({ folder, onBack, onChanged }: Props) {
  const client = useSyncthingClient();
  const [groups, setGroups] = useState<ConflictGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ path: string; entry: TreeEntry } | null>(null);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tree = await client.dbBrowse(folder.id, '', -1);
      const all: { path: string; entry: TreeEntry }[] = [];
      flattenTree(tree, '', all);

      const conflicts = all.filter(
        f => !isDirEntry(f.entry) && isConflict(f.entry.name),
      );

      if (conflicts.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      const byOriginal = new Map<string, ConflictGroup>();
      for (const c of conflicts) {
        const dir = c.path.includes('/')
          ? c.path.slice(0, c.path.lastIndexOf('/'))
          : '';
        const originalName = stripConflictSuffix(c.entry.name);
        const originalPath = dir ? `${dir}/${originalName}` : originalName;

        let group = byOriginal.get(originalPath);
        if (!group) {
          const orig = all.find(f => f.path === originalPath);
          group = {
            originalPath,
            originalName,
            original: orig?.entry ?? null,
            copies: [],
          };
          byOriginal.set(originalPath, group);
        }
        group.copies.push(c);
      }

      const sorted = Array.from(byOriginal.values()).sort((a, b) =>
        a.originalPath.localeCompare(b.originalPath),
      );
      setGroups(sorted);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, folder.id]);

  useEffect(() => {
    scan();
  }, [scan]);

  const keepVersion = async (group: ConflictGroup, keepPath: string) => {
    const toDelete = [
      ...(group.original && group.originalPath !== keepPath
        ? [group.originalPath]
        : []),
      ...group.copies
        .filter(c => c.path !== keepPath)
        .map(c => c.path),
    ];

    if (keepPath !== group.originalPath && group.original) {
      // rename the kept conflict copy to the original name
      const keepUri = onDiskUri(folder.path, keepPath);
      const origUri = onDiskUri(folder.path, group.originalPath);
      try {
        // delete the current original first
        await FileSystem.deleteAsync(origUri, { idempotent: true });
        // rename chosen copy to original name
        await FileSystem.moveAsync({ from: keepUri, to: origUri });
      } catch (e) {
        Alert.alert('Rename failed', e instanceof Error ? e.message : String(e));
        return;
      }
    }

    for (const path of toDelete) {
      if (path === keepPath) continue;
      const uri = onDiskUri(folder.path, path);
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {
        // best effort
      }
    }

    try {
      await client.scanFolder(folder.id);
    } catch {
      // daemon watcher will catch up
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onChanged();
    setTimeout(() => scan(), 300);
  };

  const confirmKeep = (group: ConflictGroup, keepPath: string, label: string) => {
    const deleteCount =
      group.copies.length + (group.original ? 1 : 0) - 1;
    Alert.alert(
      `Keep "${label}"?`,
      `This will delete ${deleteCount} other version${deleteCount === 1 ? '' : 's'} and rename the kept file to "${group.originalName}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Keep this version',
          style: 'destructive',
          onPress: () => keepVersion(group, keepPath),
        },
      ],
    );
  };

  const deleteAllConflicts = (group: ConflictGroup) => {
    Alert.alert(
      'Delete all conflict copies?',
      `Keep "${group.originalName}" and delete ${group.copies.length} conflict cop${group.copies.length === 1 ? 'y' : 'ies'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete copies',
          style: 'destructive',
          onPress: async () => {
            for (const c of group.copies) {
              const uri = onDiskUri(folder.path, c.path);
              try {
                await FileSystem.deleteAsync(uri, { idempotent: true });
              } catch {
                // best effort
              }
            }
            try {
              await client.scanFolder(folder.id);
            } catch {}
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            onChanged();
            setTimeout(() => scan(), 300);
          },
        },
      ],
    );
  };

  const totalConflicts = groups.reduce((n, g) => n + g.copies.length, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>Conflicts</Text>
        <TouchableOpacity onPress={scan} hitSlop={8}>
          <Text style={styles.refresh}>Rescan</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textDim} />
          <Text style={styles.loadingText}>Scanning for conflicts...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={scan}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>✓</Text>
          <Text style={styles.emptyTitle}>No conflicts</Text>
          <Text style={styles.emptyHint}>
            All files in "{folder.label || folder.id}" are in agreement across peers.
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={g => g.originalPath}
          contentContainerStyle={styles.listBody}
          ListHeaderComponent={
            <Text style={styles.summary}>
              {totalConflicts} conflict{totalConflicts === 1 ? '' : 's'} in {groups.length} file{groups.length === 1 ? '' : 's'}
            </Text>
          }
          ItemSeparatorComponent={() => <View style={styles.groupSep} />}
          renderItem={({ item: group }) => (
            <View style={styles.groupCard}>
              <Text style={styles.groupPath} numberOfLines={2}>
                {group.originalPath}
              </Text>

              {group.original && (
                <VersionRow
                  label="Current version"
                  entry={group.original}
                  path={group.originalPath}
                  folder={folder}
                  onPreview={() =>
                    setPreview({ path: group.originalPath, entry: group.original! })
                  }
                  onKeep={() =>
                    deleteAllConflicts(group)
                  }
                  keepLabel="Keep & delete copies"
                />
              )}

              {group.copies.map(c => (
                <VersionRow
                  key={c.path}
                  label={conflictLabel(c.entry.name)}
                  entry={c.entry}
                  path={c.path}
                  folder={folder}
                  onPreview={() => setPreview(c)}
                  onKeep={() =>
                    confirmKeep(group, c.path, conflictLabel(c.entry.name))
                  }
                  keepLabel="Keep this version"
                />
              ))}
            </View>
          )}
        />
      )}

      <FilePreviewModal
        visible={!!preview}
        fileUri={preview ? onDiskUri(folder.path, preview.path) : null}
        name={preview?.entry.name ?? ''}
        size={preview?.entry.size ?? 0}
        modTime={preview?.entry.modTime ?? ''}
        relPath={preview?.path ?? ''}
        onClose={() => setPreview(null)}
      />
    </View>
  );
}

function VersionRow({
  label,
  entry,
  path,
  folder,
  onPreview,
  onKeep,
  keepLabel,
}: {
  label: string;
  entry: TreeEntry;
  path: string;
  folder: FolderConfig;
  onPreview: () => void;
  onKeep: () => void;
  keepLabel: string;
}) {
  const kind = fileKind(entry.name);
  const uri = onDiskUri(folder.path, path);
  const showThumb = kind === 'image';

  return (
    <View style={styles.versionRow}>
      <TouchableOpacity style={styles.versionMain} onPress={onPreview}>
        <View style={styles.versionIcon}>
          {showThumb ? (
            <Image source={{ uri }} style={styles.thumb} />
          ) : (
            <Icon name={kindIconName(kind, false) as any} size={20} color={colors.textDim} />
          )}
        </View>
        <View style={styles.versionInfo}>
          <Text style={styles.versionLabel} numberOfLines={1}>{label}</Text>
          <Text style={styles.versionMeta}>
            {formatBytes(entry.size)}   {formatModTime(entry.modTime)}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.keepBtn} onPress={onKeep}>
        <Text style={styles.keepBtnText}>{keepLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function conflictLabel(name: string): string {
  const match = name.match(/\.sync-conflict-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-([A-Z0-9]+)/);
  if (!match) return 'Conflict copy';
  const [, y, mo, d, h, mi, s, device] = match;
  return `${y}-${mo}-${d} ${h}:${mi}:${s} (${device.slice(0, 7)})`;
}

function flattenTree(
  entries: TreeEntry[],
  prefix: string,
  out: { path: string; entry: TreeEntry }[],
) {
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    out.push({ path, entry });
    if (entry.children) {
      flattenTree(entry.children, path, out);
    }
  }
}

function formatModTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: colors.textDim, fontSize: 13, marginTop: 12 },
  errorText: { color: colors.error, fontSize: 13, textAlign: 'center' },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  emptyIcon: { color: colors.accent, fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  emptyHint: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  summary: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  listBody: { padding: 16, paddingBottom: 40 },
  groupSep: { height: 16 },
  groupCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  groupPath: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Menlo',
    marginBottom: 12,
  },
  versionRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 10,
  },
  versionMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  versionIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    overflow: 'hidden',
  },
  thumb: { width: 36, height: 36, borderRadius: 6 },
  iconEmoji: { fontSize: 20 },
  versionInfo: { flex: 1, minWidth: 0 },
  versionLabel: { color: colors.text, fontSize: 13, fontWeight: '500' },
  versionMeta: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  keepBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  keepBtnText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
});
