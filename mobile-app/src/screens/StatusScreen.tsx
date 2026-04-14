import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSyncthing } from '../daemon/SyncthingContext';
import { useResource } from '../daemon/useResource';
import { useEventLog, useEventTrigger } from '../daemon/EventsContext';
import { useRecentChanges } from '../daemon/RecentChangesContext';
import { formatEvent } from '../daemon/formatEvent';
import { RecentChangesModal } from './RecentChangesModal';
import { TransfersModal } from './TransfersModal';
import { ShowDeviceQRModal } from './ShowDeviceQRModal';
import {
  Card,
  CardTitle,
  Row,
  ErrorBox,
  colors,
  formatBytes,
  formatUptime,
} from '../components/ui';
import { Icon } from '../components/Icon';

export function StatusScreen() {
  const { info, client, error: daemonError } = useSyncthing();
  const { changes: recentChanges } = useRecentChanges();
  const [recentChangesOpen, setRecentChangesOpen] = useState(false);
  const [transfersOpen, setTransfersOpen] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const fetcher = useCallback(async () => {
    if (!client) throw new Error('daemon not ready');
    return client.systemStatus();
  }, [client]);

  const {
    data: status,
    error: statusError,
    refreshing,
    refresh,
    refetch,
  } = useResource(fetcher, [client], {
    intervalMs: 30000,
    enabled: !!client,
  });

  // lifecycle-only; skip the chatty Item*/DownloadProgress stuff
  useEventTrigger(['StartupComplete', 'ConfigSaved'], refetch);

  const recentEvents = useEventLog(
    [
      'StateChanged',
      'DeviceConnected',
      'DeviceDisconnected',
      'FolderCompletion',
      'FolderErrors',
      'FolderPaused',
      'FolderResumed',
      'ConfigSaved',
      'PendingFoldersChanged',
      'PendingDevicesChanged',
      'StartupComplete',
    ],
    20,
  );

  if (daemonError) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <ErrorBox message={daemonError} />
      </ScrollView>
    );
  }

  if (!info) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.text} />
        <Text style={styles.subtle}>Starting daemon…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textDim} />}
    >
      {statusError && <ErrorBox message={statusError} />}

      <TouchableOpacity
        style={styles.recentLink}
        onPress={() => setRecentChangesOpen(true)}
      >
        <Icon name="folder-open" size={22} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.recentLinkTitle}>Recent changes</Text>
          <Text style={styles.recentLinkHint}>
            {recentChanges.length === 0
              ? 'See files as they sync'
              : `${recentChanges.length} file${recentChanges.length === 1 ? '' : 's'} touched recently`}
          </Text>
        </View>
        <Text style={styles.recentLinkArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.recentLink}
        onPress={() => setTransfersOpen(true)}
      >
        <Icon name="download" size={22} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.recentLinkTitle}>Active transfers</Text>
          <Text style={styles.recentLinkHint}>
            Files downloading and queued for sync
          </Text>
        </View>
        <Text style={styles.recentLinkArrow}>›</Text>
      </TouchableOpacity>

      <Card>
        <CardTitle>Daemon</CardTitle>
        <Row label="Port" value={String(info.port)} />
        <Row label="GUI address" value={info.guiAddress} />
        <Row label="Device ID" value={info.deviceId} mono multiline />
        <TouchableOpacity style={styles.qrBtn} onPress={() => setShowQR(true)}>
          <Text style={styles.qrBtnText}>Show QR code</Text>
        </TouchableOpacity>
      </Card>

      <ShowDeviceQRModal
        visible={showQR}
        deviceId={info.deviceId}
        onClose={() => setShowQR(false)}
      />

      {status && (
        <Card>
          <CardTitle>System</CardTitle>
          <Row label="Uptime" value={formatUptime(status.uptime)} />
          <Row label="Goroutines" value={String(status.goroutines)} />
          <Row label="Memory (alloc)" value={formatBytes(status.alloc)} />
          <Row label="Memory (sys)" value={formatBytes(status.sys)} />
        </Card>
      )}

      {status && (
        <Card>
          <CardTitle>Discovery & connections</CardTitle>
          <Row label="Discovery" value={status.discoveryEnabled ? 'Enabled' : 'Disabled'} />
          {status.discoveryErrors && Object.keys(status.discoveryErrors).length > 0 && (
            Object.entries(status.discoveryErrors).map(([method, err]) => (
              <Row key={method} label={method} value={String(err)} />
            ))
          )}
          {status.connectionServiceStatus && Object.keys(status.connectionServiceStatus).length > 0 && (
            <>
              <Text style={[styles.subtle, { marginTop: 10, marginBottom: 6 }]}>Listening addresses</Text>
              {Object.keys(status.connectionServiceStatus).map(addr => {
                const clean = addr
                  .replace('tcp://', '')
                  .replace('quic://', '')
                  .replace('relay://', 'relay: ');
                return (
                  <Text key={addr} style={[styles.subtle, { fontFamily: 'Menlo', fontSize: 11, marginBottom: 3 }]}>
                    {clean}
                  </Text>
                );
              })}
            </>
          )}
        </Card>
      )}

      <Card>
        <CardTitle>Recent activity</CardTitle>
        {recentEvents.length === 0 ? (
          <Text style={styles.subtle}>
            Activity from the daemon will appear here as it happens.
          </Text>
        ) : (
          recentEvents.map(e => {
            const f = formatEvent(e);
            const color =
              f.tone === 'success'
                ? colors.success
                : f.tone === 'warning'
                  ? colors.warning
                  : f.tone === 'error'
                    ? colors.error
                    : colors.textDim;
            return (
              <View key={e.id} style={styles.eventRow}>
                <Text style={[styles.eventIcon, { color }]}>{f.icon}</Text>
                <Text style={styles.eventText} numberOfLines={2}>{f.text}</Text>
                <Text style={styles.eventTime}>{f.time}</Text>
              </View>
            );
          })
        )}
      </Card>

      {transfersOpen && (
        <TransfersModal
          visible
          onClose={() => setTransfersOpen(false)}
        />
      )}
      <RecentChangesModal
        visible={recentChangesOpen}
        onClose={() => setRecentChangesOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  qrBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  qrBtnText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  scroll: { padding: 20, paddingTop: 16, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  subtle: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  eventIcon: {
    fontSize: 14,
    width: 16,
    textAlign: 'center',
  },
  eventText: {
    color: colors.text,
    fontSize: 12,
    flex: 1,
  },
  eventTime: {
    color: colors.textDim,
    fontSize: 11,
    fontFamily: 'Menlo',
  },
  recentLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 14,
    marginBottom: 16,
  },
  recentLinkIcon: { fontSize: 22 },
  recentLinkTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  recentLinkHint: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  recentLinkArrow: { color: colors.textDim, fontSize: 22 },
});
