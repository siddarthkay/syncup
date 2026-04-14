import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRecentChanges } from '../daemon/RecentChangesContext';
import { useSyncthingClient } from '../daemon/SyncthingContext';
import type { FolderConfig } from '../api/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../components/ui';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function RecentChangesModal({ visible, onClose }: Props) {
  const { changes, clear } = useRecentChanges();
  const client = useSyncthingClient();
  const keyboardHeight = useKeyboardHeight();
  const { height: winHeight } = useWindowDimensions();
  const sheetHeight = Math.max(320, (winHeight - keyboardHeight) * 0.92);

  const [folderLabels, setFolderLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    client
      .folders()
      .then((folders: FolderConfig[]) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const f of folders) {
          map[f.id] = f.label || f.id;
        }
        setFolderLabels(map);
      })
      .catch(() => {
        // fall back to bare ids
      });
    return () => {
      cancelled = true;
    };
  }, [visible, client]);

  const totals = useMemo(() => {
    let updates = 0;
    let deletes = 0;
    let errors = 0;
    for (const c of changes) {
      if (c.error) errors += 1;
      else if (c.action === 'delete') deletes += 1;
      else updates += 1;
    }
    return { updates, deletes, errors };
  }, [changes]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={[styles.backdrop, { paddingBottom: keyboardHeight }]} edges={['top', 'bottom']}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { height: sheetHeight }]}>
          <View style={styles.container}>
            <View style={styles.header}>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Text style={styles.cancel}>Close</Text>
              </TouchableOpacity>
              <Text style={styles.title} numberOfLines={1}>
                Recent changes
              </Text>
              <TouchableOpacity onPress={clear} hitSlop={8} disabled={changes.length === 0}>
                <Text
                  style={[styles.clear, changes.length === 0 && styles.clearDisabled]}
                >
                  Clear
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.summary}>
              <SummaryPill label="updated" value={totals.updates} tone="ok" />
              <SummaryPill label="deleted" value={totals.deletes} tone="warn" />
              <SummaryPill label="errors" value={totals.errors} tone="err" />
            </View>

            {changes.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No changes yet</Text>
                <Text style={styles.emptyHint}>
                  Recently synced files appear here as they happen. Keep this view open while
                  syncing, or come back after a transfer completes.
                </Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.list}>
                {changes.map(c => {
                  const label = folderLabels[c.folder] || c.folder;
                  return (
                    <View key={c.id} style={styles.row}>
                      <Text style={[styles.rowIcon, c.error && styles.rowIconError]}>
                        {iconFor(c.action, !!c.error)}
                      </Text>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowPath} numberOfLines={2}>
                          {c.item}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {label} · {actionLabel(c.action)} · {formatTime(c.time)}
                        </Text>
                        {c.error && (
                          <Text style={styles.rowError} numberOfLines={2}>
                            {c.error}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <Text style={styles.footer}>
              {changes.length} change{changes.length === 1 ? '' : 's'} captured · live
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function SummaryPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ok' | 'warn' | 'err';
}) {
  const color =
    tone === 'ok' ? colors.success : tone === 'warn' ? colors.warning : colors.error;
  return (
    <View style={styles.pill}>
      <Text style={[styles.pillValue, { color }]}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

function iconFor(action: string, error: boolean): string {
  if (error) return '⚠';
  switch (action) {
    case 'delete':
      return '🗑';
    case 'metadata':
      return '⚙';
    default:
      return '↓';
  }
}

function actionLabel(action: string): string {
  switch (action) {
    case 'delete':
      return 'deleted';
    case 'metadata':
      return 'metadata';
    default:
      return 'updated';
  }
}

function formatTime(when: string): string {
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return when;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
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
  cancel: { color: colors.textDim, fontSize: 15 },
  clear: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  clearDisabled: { color: colors.border },
  summary: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pill: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillValue: { fontSize: 18, fontWeight: '700' },
  pillLabel: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  emptyHint: { color: colors.textDim, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  list: { paddingHorizontal: 12, paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIcon: { color: colors.text, fontSize: 18, marginTop: 1, width: 22, textAlign: 'center' },
  rowIconError: { color: colors.error },
  rowMain: { flex: 1 },
  rowPath: { color: colors.text, fontSize: 13, fontFamily: 'Menlo' },
  rowMeta: { color: colors.textDim, fontSize: 11, marginTop: 3 },
  rowError: { color: colors.error, fontSize: 11, marginTop: 3, lineHeight: 15 },
  footer: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
