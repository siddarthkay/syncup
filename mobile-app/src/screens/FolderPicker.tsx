import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../components/ui';
import { Icon } from '../components/Icon';
import { listSubdirs, mkdirSubdir, type FsEntry } from '../fs/bridgeFs';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

interface Props {
  visible: boolean;
  rootPath: string; // absolute, sandbox root (e.g. dataDir/folders)
  initialPath?: string;
  onCancel: () => void;
  onPick: (absolutePath: string) => void;
}

export function FolderPicker({ visible, rootPath, initialPath, onCancel, onPick }: Props) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [path, setPath] = useState<string>(initialPath ?? rootPath);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const isRoot = path === rootPath;

  const load = useCallback((p: string) => {
    setLoading(true);
    setError(null);
    try {
      const { entries: e, path: resolvedPath } = listSubdirs(p);
      setEntries(e.filter(x => x.isDir));
      setPath(resolvedPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setPath(initialPath ?? rootPath);
      setCreating(false);
      setNewName('');
    }
     
  }, [visible, rootPath, initialPath]);

  useEffect(() => {
    if (visible && path) load(path);
  }, [visible, path, load]);

  const goUp = () => {
    if (isRoot) return;
    const idx = path.lastIndexOf('/');
    if (idx <= 0) return;
    const parent = path.slice(0, idx);
    // clamp to root
    if (parent.length < rootPath.length) {
      setPath(rootPath);
    } else {
      setPath(parent);
    }
  };

  const openSubdir = (name: string) => {
    setPath(`${path}/${name}`);
  };

  const createFolder = () => {
    const n = newName.trim();
    if (!n) return;
    try {
      const created = mkdirSubdir(path, n);
      setCreating(false);
      setNewName('');
      // jump into it so pick is one tap
      setPath(created);
    } catch (e) {
      Alert.alert('Could not create folder', e instanceof Error ? e.message : String(e));
    }
  };

  const displayPath = useMemo(() => {
    if (path === rootPath) return '/';
    return path.replace(rootPath, '') || '/';
  }, [path, rootPath]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel} statusBarTranslucent>
      <View style={[styles.backdrop, { paddingBottom: keyboardHeight }]}>
        <TouchableWithoutFeedback onPress={onCancel}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Pick folder</Text>
            <TouchableOpacity onPress={() => onPick(path)}>
              <Text style={styles.pick}>Use</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.pathBar}>
            {!isRoot && (
              <TouchableOpacity onPress={goUp} style={styles.upBtn}>
                <Text style={styles.upText}>↑</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.pathText} numberOfLines={1}>
              {displayPath}
            </Text>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.textDim} />
            </View>
          ) : (
            <FlatList
              data={entries}
              keyExtractor={e => e.name}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <Text style={styles.empty}>No subfolders here - tap "New folder" to create one.</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => openSubdir(item.name)}>
                  <Icon name="folder" size={18} color={colors.textDim} />
                  <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.rowArrow}>›</Text>
                </TouchableOpacity>
              )}
            />
          )}

          <View style={[styles.footer, { paddingBottom: 12 + (keyboardHeight > 0 ? 0 : insets.bottom) }]}>
            {creating ? (
              <View style={styles.createRow}>
                <TextInput
                  autoFocus
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="new folder name"
                  placeholderTextColor={colors.textDim}
                  style={styles.createInput}
                  onSubmitEditing={createFolder}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={createFolder} style={styles.createBtn}>
                  <Text style={styles.createBtnText}>Create</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setCreating(false);
                    setNewName('');
                  }}
                  style={styles.createCancel}
                >
                  <Text style={styles.createCancelText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.newFolderBtn} onPress={() => setCreating(true)}>
                <Text style={styles.newFolderText}>+ New folder</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
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
    maxHeight: '92%',
    minHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  cancel: { color: colors.textDim, fontSize: 15 },
  pick: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  pathBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  upBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upText: { color: colors.text, fontSize: 18, fontWeight: '600' },
  pathText: { color: colors.text, fontSize: 13, fontFamily: 'Menlo', flex: 1 },
  error: {
    color: colors.error,
    fontSize: 13,
    padding: 16,
  },
  loading: { paddingVertical: 30, alignItems: 'center' },
  list: { paddingVertical: 4 },
  empty: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    padding: 30,
    fontStyle: 'italic',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  folderIcon: { fontSize: 18 },
  rowName: { color: colors.text, fontSize: 15, flex: 1 },
  rowArrow: { color: colors.textDim, fontSize: 20 },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    padding: 12,
    backgroundColor: colors.card,
  },
  newFolderBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: colors.bg,
  },
  newFolderText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createInput: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
  },
  createBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  createBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  createCancel: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createCancelText: { color: colors.textDim, fontSize: 18 },
});
