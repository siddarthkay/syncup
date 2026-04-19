import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { useSyncthingClient } from '../daemon/SyncthingContext';
import type { DbStatus, FolderConfig, TreeEntry } from '../api/types';
import { colors, formatBytes } from '../components/ui';
import { fileKind, kindIconName, isConflict } from '../utils/fileTypes';
import { Icon } from '../components/Icon';
import { isPathSelected, togglePath } from '../utils/selectiveSync';
import { listSubdirs, resolvePath, zipDir } from '../fs/bridgeFs';
import { FilePreviewModal } from './FilePreviewModal';
import GoBridge from '../GoServerBridgeJSI';

interface Props {
  folder: FolderConfig;
  isSelective?: boolean;
  onBack: () => void;
}

type SortKey = 'name' | 'size' | 'modified';
type SortDir = 'asc' | 'desc';
interface SortPref { key: SortKey; dir: SortDir }

const DEFAULT_SORT: SortPref = { key: 'name', dir: 'asc' };
const RECENT_MS = 24 * 60 * 60 * 1000;

const joinPath = (parent: string, name: string) =>
  parent ? `${parent}/${name}` : name;

const parentPath = (path: string) => {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
};

const crumbs = (path: string) => {
  if (!path) return [];
  const out: { label: string; path: string }[] = [];
  let acc = '';
  for (const p of path.split('/')) {
    acc = acc ? `${acc}/${p}` : p;
    out.push({ label: p, path: acc });
  }
  return out;
};

const isDirEntry = (entry: TreeEntry) =>
  entry.type === 'DIRECTORY' ||
  entry.type === 'FILE_INFO_TYPE_DIRECTORY' ||
  (Array.isArray(entry.children) && entry.children.length > 0);

// Entry on disk is a plain file with matching size, or missing entirely.
// We cache to avoid re-statting on every re-render.
type LocalState = 'synced' | 'missing' | 'partial' | 'unknown';

export function FolderBrowser({ folder, isSelective, onBack }: Props) {
  const client = useSyncthingClient();
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [sort, setSort] = useState<SortPref>(DEFAULT_SORT);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<TreeEntry | null>(null);
  const [localStates, setLocalStates] = useState<Record<string, LocalState>>({});
  const [resolvedFolderPath, setResolvedFolderPath] = useState(() => {
    // SAF folders use content:// URIs -- no path resolution needed.
    if (folder.path.startsWith('content://')) return folder.path;
    // folder.path can be relative (e.g. "memes"). The daemon resolves it
    // from its own CWD (which on iOS is the bundle dir, not Documents).
    // Use the Go bridge's resolvePath to get the absolute path exactly as
    // the daemon sees it.
    if (folder.path.startsWith('/')) return folder.path;
    try {
      return resolvePath(folder.path);
    } catch {
      return folder.path;
    }
  });
  const [ignoreLines, setIgnoreLines] = useState<string[]>([]);
  const [sortLoaded, setSortLoaded] = useState(false);
  const initialPathLoadedRef = useRef(false);

  const sortStorageKey = `browser:sort:${folder.id}`;
  const pathStorageKey = `browser:path:${folder.id}`;

  useEffect(() => {
    (async () => {
      try {
        const s = await AsyncStorage.getItem(sortStorageKey);
        if (s) {
          const parsed = JSON.parse(s) as SortPref;
          if (parsed && typeof parsed.key === 'string') setSort(parsed);
        }
        if (!initialPathLoadedRef.current) {
          const p = await AsyncStorage.getItem(pathStorageKey);
          if (p != null) setPath(p);
          initialPathLoadedRef.current = true;
        }
      } catch {
        // stale or missing prefs just fall back to defaults
      } finally {
        setSortLoaded(true);
      }
    })();
  }, [sortStorageKey, pathStorageKey]);

  useEffect(() => {
    AsyncStorage.setItem(sortStorageKey, JSON.stringify(sort)).catch(() => {});
  }, [sort, sortStorageKey]);

  useEffect(() => {
    if (!initialPathLoadedRef.current) return;
    AsyncStorage.setItem(pathStorageKey, path).catch(() => {});
  }, [path, pathStorageKey]);

  const load = useCallback(
    async (nextPath: string, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [res, stat] = await Promise.all([
          client.dbBrowse(folder.id, nextPath, 0),
          client.dbStatus(folder.id).catch(() => null),
        ]);

        let entries = res;

        // fallback: if the daemon index returns empty but the folder has
        // files on disk (common with selective sync where IsInvalid()
        // filters ignored files from GlobalDirectoryTree), list the
        // filesystem directly via the Go bridge.
        if (
          entries.length === 0 &&
          stat &&
          (stat.localFiles > 0 || stat.globalFiles > 0)
        ) {
          try {
            const diskPath = nextPath
              ? `${folder.path}/${nextPath}`
              : folder.path;
            const listing = listSubdirs(diskPath);
            entries = listing.entries.map(e => ({
              name: e.name,
              modTime: e.modTime,
              size: e.size,
              type: e.isDir ? 'FILE_INFO_TYPE_DIRECTORY' : 'FILE_INFO_TYPE_FILE',
            }));
          } catch {
            // filesystem listing failed too; show the empty state
          }
        }

        setEntries(entries);
        if (stat) setStatus(stat);
        resolveLocalStates(resolvedFolderPath, nextPath, entries, setLocalStates);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setEntries([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client, folder.id, folder.path],
  );

  useEffect(() => {
    if (!sortLoaded) return;
    load(path);
    setSelectMode(false);
    setSelected(new Set());
    setFilter('');
    setLocalStates({});
    if (isSelective) {
      client.getIgnores(folder.id).then(setIgnoreLines).catch(() => {});
    }
  }, [load, path, sortLoaded, isSelective, client, folder.id]);

  const visibleEntries = useMemo(() => {
    let out = entries;
    if (filter.trim()) {
      const q = filter.trim().toLowerCase();
      out = out.filter(e => e.name.toLowerCase().includes(q));
    }
    if (recentOnly) {
      const cutoff = Date.now() - RECENT_MS;
      out = out.filter(e => {
        const t = Date.parse(e.modTime);
        return !Number.isNaN(t) && t >= cutoff;
      });
    }
    const sorted = [...out];
    sorted.sort((a, b) => {
      const ad = isDirEntry(a);
      const bd = isDirEntry(b);
      if (ad !== bd) return ad ? -1 : 1;
      let cmp = 0;
      switch (sort.key) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'size':
          cmp = (a.size ?? 0) - (b.size ?? 0);
          break;
        case 'modified':
          cmp = Date.parse(a.modTime) - Date.parse(b.modTime);
          break;
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [entries, filter, recentOnly, sort]);

  const goInto = (entry: TreeEntry) => {
    if (selectMode) {
      toggleSelect(entry.name);
      return;
    }
    if (isDirEntry(entry)) {
      Haptics.selectionAsync().catch(() => {});
      setPath(joinPath(path, entry.name));
      return;
    }
    setPreview(entry);
  };

  const goUp = () => {
    if (filterOpen) {
      setFilterOpen(false);
      setFilter('');
      return;
    }
    if (selectMode) {
      setSelectMode(false);
      setSelected(new Set());
      return;
    }
    if (!path) {
      onBack();
      return;
    }
    setPath(parentPath(path));
  };

  const jumpTo = (target: string) => {
    if (selectMode) return;
    if (target === path) return;
    setPath(target);
  };

  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const startSelect = (entry: TreeEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectMode(true);
    setSelected(new Set([entry.name]));
  };

  const selectAll = () => {
    if (selected.size === visibleEntries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleEntries.map(e => e.name)));
    }
  };

  const readOnly = folder.type === 'receiveonly' || folder.type === 'receiveencrypted';

  const togglePin = async (entry: TreeEntry) => {
    const rel = joinPath(path, entry.name);
    const newLines = togglePath(ignoreLines, rel);
    try {
      await client.setIgnores(folder.id, newLines);
      setIgnoreLines(newLines);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch (e) {
      Alert.alert('Pin failed', e instanceof Error ? e.message : String(e));
    }
  };

  const showRowActions = (entry: TreeEntry) => {
    const uri = onDiskUri(resolvedFolderPath, joinPath(path, entry.name));
    const options: string[] = [];
    const handlers: (() => void)[] = [];

    if (!isDirEntry(entry)) {
      options.push('Preview');
      handlers.push(() => setPreview(entry));
    }
    options.push('Share');
    handlers.push(() => shareOne(uri, entry.name));
    options.push('Copy relative path');
    handlers.push(() => copyPath(joinPath(path, entry.name)));
    if (!readOnly) {
      options.push('Rename');
      handlers.push(() => promptRename(entry));
      options.push('Delete');
      handlers.push(() => confirmDelete([entry.name]));
    }
    options.push('Cancel');
    handlers.push(() => {});

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: readOnly ? undefined : options.length - 2,
          title: entry.name,
        },
        i => handlers[i]?.(),
      );
    } else {
      setActionSheet({ title: entry.name, options, handlers });
    }
  };

  const [actionSheet, setActionSheet] = useState<{
    title: string;
    options: string[];
    handlers: (() => void)[];
  } | null>(null);

  const shareOne = async (fileUri: string, displayName: string) => {
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) {
        Alert.alert(
          'File not on this device',
          `"${displayName}" hasn't finished syncing locally yet, so there is nothing to share. Wait for the sync to complete.`,
        );
        return;
      }
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(fileUri);
        return;
      }
      await Share.share({ url: fileUri, message: displayName });
    } catch (e) {
      Alert.alert('Share failed', e instanceof Error ? e.message : String(e));
    }
  };

  const copyPath = (rel: string) => {
    Alert.alert(
      'Relative path',
      rel,
      [{ text: 'OK' }],
    );
  };

  const promptRename = (entry: TreeEntry) => {
    // react-native Alert.prompt exists on iOS only; Android falls back to
    // a minimal Modal with a TextInput.
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Rename',
        `New name for "${entry.name}"`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Rename',
            onPress: async (input?: string) => {
              if (!input || input === entry.name) return;
              await performRename(entry.name, input.trim());
            },
          },
        ],
        'plain-text',
        entry.name,
      );
    } else {
      setRenameTarget(entry);
    }
  };

  const [renameTarget, setRenameTarget] = useState<TreeEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    if (renameTarget) setRenameValue(renameTarget.name);
  }, [renameTarget]);

  const performRename = async (oldName: string, newName: string) => {
    if (!newName || newName === oldName) return;
    if (newName.includes('/')) {
      Alert.alert('Invalid name', 'Names cannot contain slashes.');
      return;
    }
    const oldUri = onDiskUri(resolvedFolderPath, joinPath(path, oldName));
    const newUri = onDiskUri(resolvedFolderPath, joinPath(path, newName));
    try {
      await FileSystem.moveAsync({ from: oldUri, to: newUri });
      await client.scanFolder(folder.id, path);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => load(path), 300);
    } catch (e) {
      Alert.alert('Rename failed', e instanceof Error ? e.message : String(e));
    }
  };

  const confirmDelete = (names: string[]) => {
    const count = names.length;
    const title = count === 1 ? `Delete "${names[0]}"?` : `Delete ${count} items?`;
    const body = count === 1
      ? 'The file will be removed from this device. Other peers will sync the deletion.'
      : 'These files will be removed from this device. Other peers will sync the deletion.';
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          for (const name of names) {
            const uri = onDiskUri(resolvedFolderPath, joinPath(path, name));
            try {
              await FileSystem.deleteAsync(uri, { idempotent: true });
            } catch (e) {
              Alert.alert('Delete failed', `${name}: ${e instanceof Error ? e.message : String(e)}`);
              return;
            }
          }
          try {
            await client.scanFolder(folder.id, path);
          } catch {
            // scan is best effort; daemon's own watcher will catch up too
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setSelectMode(false);
          setSelected(new Set());
          setTimeout(() => load(path), 300);
        },
      },
    ]);
  };

  const batchShare = async () => {
    const names = Array.from(selected);
    if (names.length === 1) {
      const uri = onDiskUri(resolvedFolderPath, joinPath(path, names[0]));
      await shareOne(uri, names[0]);
      return;
    }
    Alert.alert(
      'Share multiple files',
      'Batch share isn\'t supported by the OS. Share files one at a time, or use "Zip & Share".',
      [{ text: 'OK' }],
    );
  };

  const exportZip = async () => {
    const srcPath = path
      ? `${resolvedFolderPath}/${path}`
      : resolvedFolderPath;
    const folderName = folder.label || folder.id;
    const zipName = path
      ? `${path.replace(/\//g, '-')}.zip`
      : `${folderName}.zip`;
    const dstPath = `${FileSystem.cacheDirectory}${zipName}`;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      zipDir(srcPath, dstPath.replace(/^file:\/\//, ''));
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(dstPath, { mimeType: 'application/zip' });
      } else {
        Alert.alert('Zip created', `Saved to ${dstPath}`);
      }
    } catch (e) {
      Alert.alert('Zip failed', e instanceof Error ? e.message : String(e));
    }
  };

  const toggleSort = (key: SortKey) => {
    setSort(prev => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'asc' };
    });
  };

  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const breadcrumb = useMemo(() => crumbs(path), [path]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goUp} hitSlop={8}>
          <Text style={styles.back}>
            {selectMode ? 'Cancel' : filterOpen ? 'Close' : `‹ ${path ? 'Up' : 'Back'}`}
          </Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {selectMode
            ? `${selected.size} selected`
            : folder.label || folder.id}
        </Text>
        <View style={styles.headerRight}>
          {selectMode ? (
            <TouchableOpacity onPress={selectAll} hitSlop={8}>
              <Text style={styles.headerAction}>
                {selected.size === visibleEntries.length ? 'None' : 'All'}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => setFilterOpen(v => !v)}
                hitSlop={8}
                style={styles.headerIcon}
              >
                {filterOpen ? <Text style={styles.headerIconText}>✕</Text> : <Icon name="search" size={16} />}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSortMenuOpen(true)}
                hitSlop={8}
                style={styles.headerIcon}
              >
                <Icon name="swap-vertical" size={16} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {status && !selectMode && (
        <View style={styles.statsStrip}>
          <StatItem label="Files" value={status.globalFiles.toLocaleString()} />
          <StatDivider />
          <StatItem label="Size" value={formatBytes(status.globalBytes)} />
          <StatDivider />
          <StatItem
            label="Local"
            value={status.localFiles > 0
              ? `${status.localFiles} / ${status.globalFiles}`
              : status.globalFiles > 0 ? 'Remote only' : 'Empty'}
            tone={
              status.localFiles === 0 && status.globalFiles > 0
                ? 'warn'
                : status.localFiles < status.globalFiles
                  ? 'warn'
                  : 'ok'
            }
          />
        </View>
      )}

      <View style={styles.pathBar}>
        <TouchableOpacity onPress={() => jumpTo('')}>
          <Text style={[styles.crumb, !path && styles.crumbCurrent]}>/</Text>
        </TouchableOpacity>
        {breadcrumb.map((c, i) => (
          <View key={c.path} style={styles.crumbRow}>
            <Text style={styles.crumbSep}>/</Text>
            <TouchableOpacity onPress={() => jumpTo(c.path)}>
              <Text
                style={[styles.crumb, i === breadcrumb.length - 1 && styles.crumbCurrent]}
                numberOfLines={1}
              >
                {c.label}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {filterOpen && (
        <View style={styles.filterBar}>
          <TextInput
            style={styles.filterInput}
            placeholder="Filter in this directory"
            placeholderTextColor={colors.textDim}
            value={filter}
            onChangeText={setFilter}
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus
          />
          <TouchableOpacity
            onPress={() => setRecentOnly(r => !r)}
            style={[styles.chip, recentOnly && styles.chipOn]}
          >
            <Text style={[styles.chipText, recentOnly && styles.chipTextOn]}>
              24h
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.textDim} />
        </View>
      ) : error ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => load(path)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : visibleEntries.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            {filter || recentOnly
              ? 'No matches in this directory.'
              : path
                ? 'This directory is empty.'
                : 'No files in this folder yet.'}
          </Text>
          <Text style={styles.emptyHint}>Pull down to refresh.</Text>
        </View>
      ) : (
        <FlatList
          data={visibleEntries}
          keyExtractor={it => it.name}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(path, true)}
              tintColor={colors.textDim}
            />
          }
          contentContainerStyle={styles.listBody}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => {
            const dir = isDirEntry(item);
            const kind = dir ? 'other' : fileKind(item.name);
            const conflict = !dir && isConflict(item.name);
            const state = localStates[item.name] ?? 'unknown';
            const uri = onDiskUri(resolvedFolderPath, joinPath(path, item.name));
            const showThumb = !dir && kind === 'image' && state === 'synced';
            const isSelected = selectMode && selected.has(item.name);
            return (
              <TouchableOpacity
                style={[styles.row, isSelected && styles.rowSelected]}
                onPress={() => goInto(item)}
                onLongPress={() => (selectMode ? null : startSelect(item))}
                delayLongPress={350}
              >
                {selectMode ? (
                  <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                ) : (
                  <View style={styles.iconWrap}>
                    {showThumb ? (
                      <Image source={{ uri }} style={styles.thumb} />
                    ) : (
                      <Icon name={kindIconName(kind, dir) as any} size={22} color={colors.textDim} />
                    )}
                  </View>
                )}
                <View style={styles.rowMain}>
                  <View style={styles.rowNameRow}>
                    <Text
                      style={[styles.rowName, conflict && styles.rowNameConflict]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    {conflict && <Text style={styles.conflictChip}>conflict</Text>}
                  </View>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {dir ? '' : `${formatBytes(item.size)}   `}
                    {formatModTime(item.modTime)}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  {isSelective && !selectMode && (
                    <TouchableOpacity
                      onPress={() => togglePin(item)}
                      hitSlop={10}
                      style={styles.pinBtn}
                    >
                      {isPathSelected(ignoreLines, joinPath(path, item.name))
                        ? <Icon name="pin" size={16} color={colors.accent} />
                        : <Icon name="pin-outline" size={16} color={colors.textDim} />}
                    </TouchableOpacity>
                  )}
                  {!dir && <StateDot state={state} />}
                  {!selectMode && !dir && (
                    <TouchableOpacity
                      onPress={() => showRowActions(item)}
                      hitSlop={10}
                      style={styles.moreBtn}
                    >
                      <Icon name="ellipsis-horizontal" size={20} color={colors.textDim} />
                    </TouchableOpacity>
                  )}
                  {dir && !selectMode && <Text style={styles.rowArrow}>›</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {selectMode && selected.size > 0 && (
        <View style={styles.batchBar}>
          <TouchableOpacity style={styles.batchBtn} onPress={batchShare}>
            <Text style={styles.batchBtnText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.batchBtn} onPress={exportZip}>
            <Text style={styles.batchBtnText}>Zip</Text>
          </TouchableOpacity>
          {!readOnly && (
            <TouchableOpacity
              style={[styles.batchBtn, styles.batchBtnDestructive]}
              onPress={() => confirmDelete(Array.from(selected))}
            >
              <Text style={[styles.batchBtnText, styles.batchBtnTextDestructive]}>
                Delete
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Modal
        visible={sortMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setSortMenuOpen(false)}
        >
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>Sort by</Text>
            <SortOption
              label="Name"
              active={sort.key === 'name'}
              dir={sort.key === 'name' ? sort.dir : null}
              onPress={() => { toggleSort('name'); setSortMenuOpen(false); }}
            />
            <SortOption
              label="Size"
              active={sort.key === 'size'}
              dir={sort.key === 'size' ? sort.dir : null}
              onPress={() => { toggleSort('size'); setSortMenuOpen(false); }}
            />
            <SortOption
              label="Last modified"
              active={sort.key === 'modified'}
              dir={sort.key === 'modified' ? sort.dir : null}
              onPress={() => { toggleSort('modified'); setSortMenuOpen(false); }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {actionSheet && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setActionSheet(null)}
        >
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setActionSheet(null)}
          >
            <View style={styles.sheetCard}>
              <Text style={styles.sheetTitle} numberOfLines={1}>{actionSheet.title}</Text>
              {actionSheet.options.map((opt, i) => {
                const isCancel = i === actionSheet.options.length - 1;
                const isDestructive = opt === 'Delete';
                return (
                  <TouchableOpacity
                    key={opt}
                    style={styles.sheetRow}
                    onPress={() => {
                      const h = actionSheet.handlers[i];
                      setActionSheet(null);
                      h?.();
                    }}
                  >
                    <Text
                      style={[
                        styles.sheetRowText,
                        isDestructive && styles.sheetRowDestructive,
                        isCancel && styles.sheetRowCancel,
                      ]}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {renameTarget && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setRenameTarget(null)}
        >
          <View style={styles.sheetBackdrop}>
            <View style={styles.renameCard}>
              <Text style={styles.sheetTitle}>Rename</Text>
              <TextInput
                style={styles.renameInput}
                value={renameValue}
                onChangeText={setRenameValue}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
              />
              <View style={styles.renameActions}>
                <TouchableOpacity
                  style={styles.renameBtn}
                  onPress={() => setRenameTarget(null)}
                >
                  <Text style={styles.renameBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.renameBtn, styles.renameBtnPrimary]}
                  onPress={() => {
                    const target = renameTarget;
                    setRenameTarget(null);
                    if (target) performRename(target.name, renameValue.trim());
                  }}
                >
                  <Text style={[styles.renameBtnText, styles.renameBtnTextPrimary]}>
                    Rename
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      <FilePreviewModal
        visible={!!preview}
        fileUri={preview ? onDiskUri(resolvedFolderPath, joinPath(path, preview.name)) : null}
        name={preview?.name ?? ''}
        size={preview?.size ?? 0}
        modTime={preview?.modTime ?? ''}
        relPath={preview ? joinPath(path, preview.name) : ''}
        onClose={() => setPreview(null)}
      />
    </View>
  );
}

function StatItem({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[
        styles.statValue,
        tone === 'warn' && styles.statValueWarn,
        tone === 'ok' && styles.statValueOk,
      ]}>
        {value}
      </Text>
    </View>
  );
}

function StatDivider() {
  return <View style={styles.statDivider} />;
}

function SortOption({
  label, active, dir, onPress,
}: {
  label: string;
  active: boolean;
  dir: SortDir | null;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.sheetRow} onPress={onPress}>
      <Text style={[styles.sheetRowText, active && styles.sheetRowActive]}>
        {label}{active ? (dir === 'asc' ? '  ↑' : '  ↓') : ''}
      </Text>
    </TouchableOpacity>
  );
}

function StateDot({ state }: { state: LocalState }) {
  const color =
    state === 'synced' ? colors.accent :
    state === 'partial' ? '#e5a94b' :
    state === 'missing' ? '#6b7280' :
    'transparent';
  return <View style={[styles.stateDot, { backgroundColor: color }]} />;
}

function syncedPct(status: DbStatus): string {
  if (!status.globalBytes) return '100%';
  const frac = (status.globalBytes - status.needBytes) / status.globalBytes;
  return `${Math.max(0, Math.min(100, Math.round(frac * 100)))}%`;
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

function onDiskUri(folderPath: string, rel: string): string {
  if (folderPath.startsWith('content://')) {
    // SAF folders: copy the file to the app's cache dir via the bridge,
    // then return a file:// URI pointing at the cache copy.
    try {
      const cachePath = GoBridge.copySafFileToCache(folderPath, rel);
      if (cachePath) return `file://${cachePath}`;
    } catch { /* fall through */ }
    return '';
  }
  const base = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath;
  const joined = rel ? `${base}/${rel}` : base;
  return joined.startsWith('file://') ? joined : `file://${joined}`;
}

async function resolveLocalStates(
  folderPath: string,
  dirPath: string,
  entries: TreeEntry[],
  setStates: React.Dispatch<React.SetStateAction<Record<string, LocalState>>>,
) {
  // Stat in parallel but cap concurrency so we don't overwhelm the iOS
  // sandbox on huge directories.
  const queue = entries.slice();
  const next: Record<string, LocalState> = {};
  const worker = async () => {
    while (queue.length) {
      const entry = queue.shift();
      if (!entry) break;
      if (isDirEntry(entry)) {
        next[entry.name] = 'synced';
        continue;
      }
      const uri = onDiskUri(folderPath, dirPath ? `${dirPath}/${entry.name}` : entry.name);
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) {
          next[entry.name] = 'missing';
        } else {
          const sz = info.size ?? -1;
          next[entry.name] = sz === entry.size ? 'synced' : 'partial';
        }
      } catch {
        next[entry.name] = 'unknown';
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  setStates(next);
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
  headerRight: { flexDirection: 'row', gap: 12, minWidth: 56, justifyContent: 'flex-end' },
  headerIcon: { padding: 4 },
  headerIconText: { color: colors.text, fontSize: 16 },
  headerAction: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statLabel: { color: colors.textDim, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  statValue: { color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 2 },
  statValueOk: { color: colors.accent },
  statValueWarn: { color: '#e5a94b' },
  statDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.border },
  pathBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  crumbRow: { flexDirection: 'row', alignItems: 'center' },
  crumb: { color: colors.textDim, fontSize: 13 },
  crumbCurrent: { color: colors.text, fontWeight: '600' },
  crumbSep: { color: colors.border, fontSize: 13, marginHorizontal: 6 },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  chipText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
  emptyHint: { color: colors.border, fontSize: 12, marginTop: 6 },
  errorText: { color: colors.error, fontSize: 13, textAlign: 'center' },
  retry: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  listBody: { paddingHorizontal: 8, paddingVertical: 8, paddingBottom: 80 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 14,
    borderRadius: 8,
  },
  rowSelected: { backgroundColor: colors.card },
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
  rowMeta: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowArrow: { color: colors.textDim, fontSize: 20 },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pinBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  pinIcon: { fontSize: 16, opacity: 0.5 },
  pinIconActive: { opacity: 1 },
  moreBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  moreBtnText: { color: colors.textDim, fontSize: 20 },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 62,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  batchBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  batchBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  batchBtnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  batchBtnDestructive: { borderColor: colors.errorBorder, backgroundColor: colors.errorBg },
  batchBtnTextDestructive: { color: colors.error },
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
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  sheetCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
  },
  sheetTitle: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sheetRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sheetRowText: { color: colors.text, fontSize: 15 },
  sheetRowActive: { color: colors.accent, fontWeight: '600' },
  sheetRowDestructive: { color: colors.error },
  sheetRowCancel: { color: colors.textDim, fontWeight: '600' },
  renameCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  renameInput: {
    marginTop: 10,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  renameActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  renameBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  renameBtnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  renameBtnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  renameBtnTextPrimary: { color: '#fff' },
});
