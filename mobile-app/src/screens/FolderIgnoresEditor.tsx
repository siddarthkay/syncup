import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSyncthingClient } from '../daemon/SyncthingContext';
import { colors } from '../components/ui';

interface Props {
  folderId: string;
  folderLabel: string;
  onBack: () => void;
  onSaved: () => void;
}

// Single freeform textarea; a structured list editor would overspecify the
// pattern language (globs, `!` includes, `(?d)`/`(?i)` flags, `//` comments).
// Trailing empty lines trimmed so save/load round-trips stay stable.
export function FolderIgnoresEditor({ folderId, folderLabel, onBack, onSaved }: Props) {
  const client = useSyncthingClient();

  const [text, setText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lines = await client.getIgnores(folderId);
      const joined = lines.join('\n');
      setText(joined);
      setOriginalText(joined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, folderId]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = text !== originalText;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const lines = text.split('\n').map(l => l.replace(/\s+$/, ''));
      while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }
      await client.setIgnores(folderId, lines);
      onSaved();
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (dirty) {
      Alert.alert('Discard changes?', 'Your edits to the ignore patterns will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onBack },
      ]);
      return;
    }
    onBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={cancel} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          Ignore patterns
        </Text>
        <TouchableOpacity onPress={save} disabled={!dirty || saving} hitSlop={8}>
          {saving ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={[styles.save, !dirty && styles.saveDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.folderLabel} numberOfLines={1}>
        {folderLabel}
      </Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.textDim} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {error && <Text style={styles.error}>{error}</Text>}
          <TextInput
            style={styles.editor}
            value={text}
            onChangeText={setText}
            multiline
            scrollEnabled={false}
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            textAlignVertical="top"
            placeholder={'// one pattern per line\n*.tmp\n.DS_Store\nThumbs.db\nnode_modules\n!important.tmp'}
            placeholderTextColor={colors.textDim}
          />
          <View style={styles.helpBox}>
            <Text style={styles.helpTitle}>Pattern syntax</Text>
            <Text style={styles.helpLine}>
              <Text style={styles.mono}>*.tmp</Text> exclude all .tmp files
            </Text>
            <Text style={styles.helpLine}>
              <Text style={styles.mono}>/build</Text> only at the folder root
            </Text>
            <Text style={styles.helpLine}>
              <Text style={styles.mono}>**/cache</Text> cache anywhere in the tree
            </Text>
            <Text style={styles.helpLine}>
              <Text style={styles.mono}>!important.tmp</Text> re-include an excluded file
            </Text>
            <Text style={styles.helpLine}>
              <Text style={styles.mono}>{'// comment'}</Text> ignored, useful for notes
            </Text>
            <Text style={[styles.helpLine, { marginTop: 6 }]}>
              Changes take effect on the next folder scan.
            </Text>
          </View>
        </ScrollView>
      )}
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
  title: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center' },
  back: { color: colors.accent, fontSize: 15, fontWeight: '500' },
  save: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  saveDisabled: { color: colors.border },
  folderLabel: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 8,
  },
  body: { padding: 16, paddingBottom: 40 },
  editor: {
    minHeight: 240,
    color: colors.text,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontFamily: 'Menlo',
    fontSize: 13,
    lineHeight: 18,
  },
  loading: { paddingVertical: 40, alignItems: 'center' },
  error: { color: colors.error, fontSize: 13, marginBottom: 8 },
  helpBox: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 16,
    gap: 4,
  },
  helpTitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  helpLine: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  mono: { fontFamily: 'Menlo', color: colors.text },
});
