import React, { useEffect, useMemo, useState } from 'react';
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
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { colors } from '../components/ui';
import {
  applyResolutions,
  joinLines,
  merge2,
  unresolvedConflictIds,
  type ConflictResolution,
  type MergeResult,
} from '../utils/markdownMerge';

interface Props {
  // The "current" version (what the user has now) and one conflict copy
  // to merge against. We bias A=original / B=copy in the labels for
  // user clarity, but the algorithm is symmetric.
  originalUri: string;
  originalName: string;
  copyUri: string;
  copyLabel: string;
  onCancel: () => void;
  // Receives the merged text. The caller writes to disk and deletes the
  // conflict copy — this view only computes and presents the merge.
  onSave: (mergedText: string) => Promise<void>;
}

export function MarkdownMergeView({
  originalUri,
  originalName,
  copyUri,
  copyLabel,
  onCancel,
  onSave,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [aText, setAText] = useState('');
  const [bText, setBText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<number, ConflictResolution>>({});
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, b] = await Promise.all([
          FileSystem.readAsStringAsync(originalUri),
          FileSystem.readAsStringAsync(copyUri),
        ]);
        if (cancelled) return;
        setAText(a);
        setBText(b);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [originalUri, copyUri]);

  const result: MergeResult = useMemo(() => merge2(aText, bText), [aText, bText]);
  const unresolved = useMemo(
    () => unresolvedConflictIds(result, resolutions),
    [result, resolutions],
  );

  const pick = (id: number, choice: ConflictResolution['pick']) => {
    Haptics.selectionAsync().catch(() => {});
    setResolutions(prev => ({ ...prev, [id]: { pick: choice } }));
  };

  const startEditing = (id: number) => {
    const hunk = result.hunks.find(h => h.kind === 'conflict' && h.id === id);
    if (!hunk || hunk.kind !== 'conflict') return;
    const r = resolutions[id];
    let initial: string;
    if (r?.pick === 'custom') initial = (r.customLines ?? []).join('\n');
    else if (r?.pick === 'a') initial = hunk.a.join('\n');
    else if (r?.pick === 'b') initial = hunk.b.join('\n');
    else if (r?.pick === 'both-ab') initial = [...hunk.a, ...hunk.b].join('\n');
    else if (r?.pick === 'both-ba') initial = [...hunk.b, ...hunk.a].join('\n');
    else initial = [...hunk.a, '', ...hunk.b].join('\n');
    setEditing(prev => ({ ...prev, [id]: initial }));
  };

  const commitEdit = (id: number) => {
    const text = editing[id] ?? '';
    setResolutions(prev => ({
      ...prev,
      [id]: { pick: 'custom', customLines: text === '' ? [] : text.split('\n') },
    }));
    setEditing(prev => {
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
    Haptics.selectionAsync().catch(() => {});
  };

  const cancelEdit = (id: number) => {
    setEditing(prev => {
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  };

  const save = async () => {
    if (unresolved.length > 0) {
      Alert.alert(
        'Conflicts remaining',
        `${unresolved.length} hunk${unresolved.length === 1 ? '' : 's'} still need a choice.`,
      );
      return;
    }
    setSaving(true);
    try {
      const merged = applyResolutions(result, resolutions);
      await onSave(merged);
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textDim} />
        <Text style={styles.loadingText}>Reading files…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onCancel}>
          <Text style={styles.secondaryBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const conflictCount = result.hunks.filter(h => h.kind === 'conflict').length;
  const resolvedCount = conflictCount - unresolved.length;
  const previewText = applyResolutions(result, resolutions);
  const allResolved = unresolved.length === 0 && conflictCount > 0;
  const noConflicts = conflictCount === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>Merge</Text>
        <TouchableOpacity onPress={save} disabled={saving || (!allResolved && !noConflicts)} hitSlop={8}>
          {saving ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={[styles.save, !(allResolved || noConflicts) && styles.saveDisabled]}>
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.summaryBar}>
        <Text style={styles.summaryName} numberOfLines={1}>{originalName}</Text>
        {noConflicts ? (
          <Text style={styles.summaryStatus}>
            No conflicting hunks — both sides merge cleanly.
          </Text>
        ) : (
          <Text style={styles.summaryStatus}>
            {resolvedCount} / {conflictCount} resolved
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {result.hunks.map((hunk, idx) => {
          if (hunk.kind === 'merged') {
            const visible = hunk.lines.length > 0;
            if (!visible) return null;
            return (
              <View key={`m-${idx}`} style={styles.mergedHunk}>
                <Text style={styles.mergedHunkText} selectable>
                  {hunk.lines.join('\n')}
                </Text>
              </View>
            );
          }
          const r = resolutions[hunk.id];
          const inEdit = editing[hunk.id] !== undefined;
          return (
            <View key={`c-${hunk.id}`} style={styles.conflictHunk}>
              <Text style={styles.conflictHeader}>Conflict #{hunk.id + 1}</Text>

              <View style={styles.side}>
                <Text style={styles.sideLabel}>This device (current file)</Text>
                <Text style={styles.sideText} selectable>
                  {hunk.a.length === 0 ? '(empty)' : hunk.a.join('\n')}
                </Text>
              </View>

              <View style={styles.side}>
                <Text style={styles.sideLabel}>{copyLabel}</Text>
                <Text style={styles.sideText} selectable>
                  {hunk.b.length === 0 ? '(empty)' : hunk.b.join('\n')}
                </Text>
              </View>

              {!inEdit ? (
                <View style={styles.choices}>
                  <ChoiceBtn
                    label="Use this device"
                    active={r?.pick === 'a'}
                    onPress={() => pick(hunk.id, 'a')}
                  />
                  <ChoiceBtn
                    label="Use other"
                    active={r?.pick === 'b'}
                    onPress={() => pick(hunk.id, 'b')}
                  />
                  <ChoiceBtn
                    label="Keep both"
                    active={r?.pick === 'both-ab' || r?.pick === 'both-ba'}
                    onPress={() => pick(hunk.id, 'both-ab')}
                  />
                  <ChoiceBtn
                    label={r?.pick === 'custom' ? 'Edit (custom)' : 'Edit…'}
                    active={r?.pick === 'custom'}
                    onPress={() => startEditing(hunk.id)}
                  />
                </View>
              ) : (
                <View style={styles.editor}>
                  <TextInput
                    style={styles.editorInput}
                    value={editing[hunk.id]}
                    onChangeText={t => setEditing(prev => ({ ...prev, [hunk.id]: t }))}
                    multiline
                    autoCorrect={false}
                    autoCapitalize="none"
                    spellCheck={false}
                    textAlignVertical="top"
                  />
                  <View style={styles.editorActions}>
                    <TouchableOpacity
                      style={styles.editorCancel}
                      onPress={() => cancelEdit(hunk.id)}
                    >
                      <Text style={styles.editorCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.editorCommit}
                      onPress={() => commitEdit(hunk.id)}
                    >
                      <Text style={styles.editorCommitText}>Use this</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.previewBox}>
          <Text style={styles.previewTitle}>Preview</Text>
          <Text style={styles.previewText} selectable>
            {previewText.length > 0 ? previewText : '(empty file)'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function ChoiceBtn({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.choiceBtn, active && styles.choiceBtnActive]}
      onPress={onPress}
    >
      <Text style={[styles.choiceBtnText, active && styles.choiceBtnTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// Keep import-only export usable if a caller wants to reuse the merge
// pipeline outside the view (e.g. headless dry-run from a future
// auto-merge button on the conflict list).
export { joinLines };

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
  back: { color: colors.accent, fontSize: 15, minWidth: 56 },
  save: { color: colors.accent, fontSize: 15, fontWeight: '600', minWidth: 56, textAlign: 'right' },
  saveDisabled: { color: colors.border },
  summaryBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  summaryName: { color: colors.text, fontSize: 13, fontWeight: '600', fontFamily: 'Menlo' },
  summaryStatus: { color: colors.textDim, fontSize: 11, marginTop: 4 },
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: colors.textDim, fontSize: 13, marginTop: 12 },
  errorText: { color: colors.error, fontSize: 13, textAlign: 'center', marginBottom: 12 },
  secondaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  mergedHunk: {
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
  },
  mergedHunkText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Menlo',
  },
  conflictHunk: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.error,
    padding: 12,
    gap: 8,
  },
  conflictHeader: {
    color: colors.error,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  side: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: 10,
  },
  sideLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  sideText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Menlo',
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  choiceBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceBtnActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  choiceBtnText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  choiceBtnTextActive: { color: '#fff' },
  editor: { gap: 8, marginTop: 4 },
  editorInput: {
    minHeight: 120,
    color: colors.text,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontFamily: 'Menlo',
    fontSize: 13,
    lineHeight: 18,
  },
  editorActions: { flexDirection: 'row', gap: 8 },
  editorCancel: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editorCancelText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  editorCommit: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  editorCommitText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  previewBox: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 12,
    gap: 6,
  },
  previewTitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  previewText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Menlo',
  },
});
