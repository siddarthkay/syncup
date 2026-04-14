import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSyncthingClient } from '../daemon/SyncthingContext';
import type { SystemLogMessage } from '../api/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../components/ui';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const REFRESH_MS = 2000;

// inverted FlashList. FlatList was janky on Android at a few hundred rows.
// /rest/system/log returns the full ring buffer each call; we track last-seen
// by timestamp and only prepend fresh lines.
export function LogsModal({ visible, onClose }: Props) {
  const client = useSyncthingClient();
  const keyboardHeight = useKeyboardHeight();
  const { height: winHeight } = useWindowDimensions();
  const sheetHeight = Math.max(320, (winHeight - keyboardHeight) * 0.92);

  // newest-first; `inverted` flips to chronological in the visual list
  const [messages, setMessages] = useState<SystemLogMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);

  const lastSeenRef = useRef<string>('');

  const fetchLogs = useCallback(async () => {
    try {
      const res = await client.systemLog();
      const all = res.messages ?? [];
      if (all.length === 0) return;
      const lastSeen = lastSeenRef.current;
      let startIdx = 0;
      if (lastSeen) {
        const idx = all.findIndex(m => m.when === lastSeen);
        if (idx >= 0) startIdx = idx + 1;
      }
      const fresh = all.slice(startIdx);
      if (fresh.length === 0) return;
      lastSeenRef.current = fresh[fresh.length - 1].when;
      setMessages(prev => {
        // cap retention so long open sessions don't blow memory
        const reversed = [...fresh].reverse();
        const next = [...reversed, ...prev];
        if (next.length > 2000) next.length = 2000;
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client]);

  useEffect(() => {
    if (!visible) {
      setMessages([]);
      setError(null);
      lastSeenRef.current = '';
      setPaused(false);
      return;
    }
    setLoading(true);
    fetchLogs().finally(() => setLoading(false));
  }, [visible, fetchLogs]);

  useEffect(() => {
    if (!visible || paused) return;
    const id = setInterval(fetchLogs, REFRESH_MS);
    return () => clearInterval(id);
  }, [visible, paused, fetchLogs]);

  const clear = () => {
    setMessages([]);
    lastSeenRef.current = '';
    if (!paused) {
      // reseed so the view doesn't sit empty after a clear
      fetchLogs();
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: SystemLogMessage }) => (
      <View style={styles.logLine}>
        <Text style={styles.logTime}>{formatTime(item.when)}</Text>
        <Text style={styles.logMessage} selectable>
          {item.message}
        </Text>
      </View>
    ),
    [],
  );

  const keyExtractor = useCallback(
    (item: SystemLogMessage, index: number) => `${item.when}-${index}`,
    [],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={[styles.backdrop, { paddingBottom: keyboardHeight }]} edges={['top', 'bottom']}>
        {/* sibling, not ancestor, or FlashList's scroll gesture fights the Pressable */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { height: sheetHeight }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Text style={styles.cancel}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>
              Daemon log
            </Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setPaused(p => !p)}
                hitSlop={8}
                style={styles.headerBtn}
              >
                <Text style={styles.headerBtnText}>{paused ? 'Resume' : 'Pause'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clear} hitSlop={8} style={styles.headerBtn}>
                <Text style={styles.headerBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          {loading && messages.length === 0 ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.textDim} />
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.loading}>
              <Text style={styles.empty}>No log messages yet.</Text>
            </View>
          ) : (
            <View style={styles.logScroll}>
              <FlashList
                contentContainerStyle={styles.logContent}
                data={messages}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                inverted
              />
            </View>
          )}

          <Text style={styles.footer}>
            {messages.length} lines · refresh {paused ? 'paused' : `${REFRESH_MS / 1000}s`}
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function formatTime(when: string): string {
  // HH:MM:SS only. date is noise in a tail view
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return when.slice(11, 19);
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
  headerActions: { flexDirection: 'row', gap: 12 },
  headerBtn: { paddingHorizontal: 4 },
  headerBtnText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  error: {
    color: colors.error,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.textDim, fontSize: 13 },
  logScroll: { flex: 1 },
  logContent: { paddingHorizontal: 12, paddingVertical: 10 },
  logLine: {
    flexDirection: 'row',
    paddingVertical: 2,
    gap: 8,
  },
  logTime: {
    color: colors.textDim,
    fontFamily: 'Menlo',
    fontSize: 11,
    minWidth: 64,
  },
  logMessage: {
    color: colors.text,
    fontFamily: 'Menlo',
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
  footer: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
