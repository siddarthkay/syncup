import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { useSyncthingClient } from '../daemon/SyncthingContext';
import type { FolderConfig, TreeEntry } from '../api/types';
import { colors, formatBytes } from '../components/ui';
import { fileKind, kindIconName, isConflict } from '../utils/fileTypes';
import { Icon } from '../components/Icon';
import { resolvePath } from '../fs/bridgeFs';
import { FilePreviewModal } from './FilePreviewModal';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface SearchResult {
  folder: FolderConfig;
  resolvedFolderPath: string;
  path: string;
  entry: TreeEntry;
}

const RECENT_KEY = 'search:recent';
const MAX_RECENT = 8;
const DEBOUNCE_MS = 250;

const isDirEntry = (e: TreeEntry) =>
  e.type === 'DIRECTORY' ||
  e.type === 'FILE_INFO_TYPE_DIRECTORY' ||
  (Array.isArray(e.children) && e.children.length > 0);

function onDiskUri(folderPath: string, rel: string): string {
  const base = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath;
  const joined = rel ? `${base}/${rel}` : base;
  return joined.startsWith('file://') ? joined : `file://${joined}`;
}

export function SearchModal({ visible, onClose }: Props) {
  const client = useSyncthingClient();
  const [query, setQuery] = useState('');
  const [folders, setFolders] = useState<FolderConfig[]>([]);
  const [index, setIndex] = useState<SearchResult[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [indexedCount, setIndexedCount] = useState(0);
  const [scopeFolder, setScopeFolder] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [preview, setPreview] = useState<SearchResult | null>(null);
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setDebouncedQuery('');
    setScopeFolder(null);
    setPreview(null);
    AsyncStorage.getItem(RECENT_KEY)
      .then(raw => {
        if (raw) setRecent(JSON.parse(raw));
      })
      .catch(() => {});
    buildIndex();
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [visible]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const buildIndex = useCallback(async () => {
    setIndexing(true);
    setIndexedCount(0);
    try {
      const allFolders = await client.folders();
      setFolders(allFolders);
      const results: SearchResult[] = [];
      await Promise.all(
        allFolders.map(async folder => {
          try {
            let resolved = folder.path;
            if (!resolved.startsWith('/')) {
              try { resolved = resolvePath(resolved); } catch {}
            }
            const tree = await client.dbBrowse(folder.id, '', -1);
            flattenTree(tree, '', folder, resolved, results);
            setIndexedCount(prev => prev + 1);
          } catch {
            // folder may be paused or errored; skip
          }
        }),
      );
      setIndex(results);
    } catch {
      setIndex([]);
    } finally {
      setIndexing(false);
    }
  }, [client]);

  const results = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];
    let pool = index;
    if (scopeFolder) {
      pool = pool.filter(r => r.folder.id === scopeFolder);
    }
    return pool
      .filter(r => r.entry.name.toLowerCase().includes(q))
      .slice(0, 200);
  }, [index, debouncedQuery, scopeFolder]);

  const saveRecent = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecent(prev => {
      const next = [trimmed, ...prev.filter(r => r !== trimmed)].slice(0, MAX_RECENT);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const handleSubmit = () => {
    saveRecent(query);
  };

  const openResult = (result: SearchResult) => {
    saveRecent(query);
    if (isDirEntry(result.entry)) return;
    setPreview(result);
  };

  const showActions = (result: SearchResult) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const uri = onDiskUri(result.resolvedFolderPath, result.path);
    const options = ['Preview', 'Share', 'Copy path', 'Cancel'];
    const handlers = [
      () => setPreview(result),
      () => shareFile(uri, result.entry.name),
      () => Alert.alert('Path', `${result.folder.label || result.folder.id}/${result.path}`),
      () => {},
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3, title: result.entry.name },
        i => handlers[i]?.(),
      );
    } else {
      Alert.alert(
        result.entry.name,
        `${result.folder.label || result.folder.id}/${result.path}`,
        [
          { text: 'Preview', onPress: handlers[0] },
          { text: 'Share', onPress: handlers[1] },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    }
  };

  const clearRecent = () => {
    setRecent([]);
    AsyncStorage.removeItem(RECENT_KEY).catch(() => {});
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.searchRow}>
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search files across all folders"
              placeholderTextColor={colors.textDim}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSubmit}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Text style={styles.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {folders.length > 1 && (
            <FlatList
              horizontal
              data={[{ id: '', label: 'All' }, ...folders]}
              keyExtractor={f => f.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scopeBar}
              renderItem={({ item }) => {
                const active = scopeFolder === (item.id || null);
                return (
                  <TouchableOpacity
                    style={[styles.scopeChip, active && styles.scopeChipOn]}
                    onPress={() => setScopeFolder(item.id || null)}
                  >
                    <Text style={[styles.scopeText, active && styles.scopeTextOn]}>
                      {item.label || item.id}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {indexing && (
            <View style={styles.indexBar}>
              <ActivityIndicator size="small" color={colors.textDim} />
              <Text style={styles.indexText}>
                Indexing{folders.length > 0 ? ` ${indexedCount}/${folders.length} folders` : ''}...
              </Text>
            </View>
          )}

          {!indexing && index.length > 0 && !debouncedQuery && (
            <Text style={styles.indexSummary}>
              {index.length.toLocaleString()} files across {folders.length} folder{folders.length === 1 ? '' : 's'}
            </Text>
          )}
        </View>

        {!debouncedQuery && recent.length > 0 ? (
          <View style={styles.recentWrap}>
            <View style={styles.recentHeader}>
              <Text style={styles.recentTitle}>Recent searches</Text>
              <TouchableOpacity onPress={clearRecent}>
                <Text style={styles.recentClear}>Clear</Text>
              </TouchableOpacity>
            </View>
            {recent.map(term => (
              <TouchableOpacity
                key={term}
                style={styles.recentRow}
                onPress={() => {
                  setQuery(term);
                  setDebouncedQuery(term);
                }}
              >
                <Icon name="time" size={14} color={colors.textDim} />
                <Text style={styles.recentText} numberOfLines={1}>{term}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : debouncedQuery && results.length === 0 && !indexing ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              No files matching "{debouncedQuery}"
            </Text>
            {scopeFolder && (
              <TouchableOpacity onPress={() => setScopeFolder(null)}>
                <Text style={styles.emptyAction}>Search all folders</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item, i) => `${item.folder.id}:${item.path}:${i}`}
            contentContainerStyle={styles.listBody}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => {
              const dir = isDirEntry(item.entry);
              const kind = dir ? 'other' : fileKind(item.entry.name);
              const conflict = !dir && isConflict(item.entry.name);
              const uri = onDiskUri(item.resolvedFolderPath, item.path);
              const showThumb = !dir && kind === 'image';
              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => openResult(item)}
                  onLongPress={() => showActions(item)}
                  delayLongPress={350}
                >
                  <View style={styles.iconWrap}>
                    {showThumb ? (
                      <Image source={{ uri }} style={styles.thumb} />
                    ) : (
                      <Icon name={kindIconName(kind, dir) as any} size={22} color={colors.textDim} />
                    )}
                  </View>
                  <View style={styles.rowMain}>
                    <View style={styles.rowNameRow}>
                      <Text style={[styles.rowName, conflict && styles.rowNameConflict]} numberOfLines={1}>
                        {item.entry.name}
                      </Text>
                      {conflict && <Text style={styles.conflictChip}>conflict</Text>}
                    </View>
                    <Text style={styles.rowPath} numberOfLines={1}>
                      {item.folder.label || item.folder.id} / {item.path}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {dir ? '' : `${formatBytes(item.entry.size)}   `}
                      {formatModTime(item.entry.modTime)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListFooterComponent={
              debouncedQuery && results.length >= 200 ? (
                <Text style={styles.limitHint}>Showing first 200 matches. Narrow your search.</Text>
              ) : null
            }
          />
        )}
      </SafeAreaView>

      <FilePreviewModal
        visible={!!preview}
        fileUri={preview ? onDiskUri(preview.resolvedFolderPath, preview.path) : null}
        name={preview?.entry.name ?? ''}
        size={preview?.entry.size ?? 0}
        modTime={preview?.entry.modTime ?? ''}
        relPath={preview ? `${preview.folder.label || preview.folder.id}/${preview.path}` : ''}
        onClose={() => setPreview(null)}
      />
    </Modal>
  );
}

function flattenTree(
  entries: TreeEntry[],
  prefix: string,
  folder: FolderConfig,
  resolvedFolderPath: string,
  out: SearchResult[],
) {
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    out.push({ folder, resolvedFolderPath, path, entry });
    if (entry.children) {
      flattenTree(entry.children, path, folder, resolvedFolderPath, out);
    }
  }
}

async function shareFile(fileUri: string, name: string) {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      Alert.alert('File not on this device', `"${name}" hasn't synced locally yet.`);
      return;
    }
    const available = await Sharing.isAvailableAsync();
    if (available) {
      await Sharing.shareAsync(fileUri);
      return;
    }
    await Share.share({ url: fileUri, message: name });
  } catch (e) {
    Alert.alert('Share failed', e instanceof Error ? e.message : String(e));
  }
}

function formatModTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const month = d.toLocaleString(undefined, { month: 'short' });
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return sameYear ? `${month} ${day}, ${hh}:${mm}` : `${month} ${day} ${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingTop: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancelBtn: { color: colors.accent, fontSize: 15 },
  scopeBar: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  scopeChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  scopeChipOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  scopeText: { color: colors.textDim, fontSize: 13, fontWeight: '500' },
  scopeTextOn: { color: '#fff' },
  indexBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  indexText: { color: colors.textDim, fontSize: 12 },
  indexSummary: {
    color: colors.textDim,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  recentWrap: { paddingHorizontal: 16, paddingTop: 16 },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recentTitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  recentClear: { color: colors.accent, fontSize: 13 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  recentIcon: { fontSize: 14, opacity: 0.5 },
  recentText: { color: colors.text, fontSize: 14, flex: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
  emptyAction: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
  },
  listBody: { paddingHorizontal: 16, paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    overflow: 'hidden',
  },
  thumb: { width: 40, height: 40, borderRadius: 6 },
  rowIcon: { fontSize: 22 },
  rowMain: { flex: 1, minWidth: 0 },
  rowNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { color: colors.text, fontSize: 14, fontWeight: '500', flexShrink: 1 },
  rowNameConflict: { color: '#e5a94b' },
  rowPath: { color: colors.textDim, fontSize: 11, marginTop: 2, fontFamily: 'Menlo' },
  rowMeta: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 54,
  },
  conflictChip: {
    color: '#e5a94b',
    fontSize: 10,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: '#e5a94b',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    textTransform: 'uppercase',
  },
  limitHint: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
