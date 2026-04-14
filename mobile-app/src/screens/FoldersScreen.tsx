import React, { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSyncthingClient } from '../daemon/SyncthingContext';
import { useResource } from '../daemon/useResource';
import { useEventTrigger } from '../daemon/EventsContext';
import type {
  FolderConfig,
  DbStatus,
  FolderError,
  FolderState,
  PendingFolderOffer,
} from '../api/types';
import { Card, ErrorBox, Pill, Progress, colors, formatBytes } from '../components/ui';
import { Icon } from '../components/Icon';
import { Fab } from '../components/Fab';
import { AddFolderModal } from './AddFolderModal';
import { FolderDetailModal } from './FolderDetailModal';
import { AcceptFolderModal } from './AcceptFolderModal';
import { QuickCaptureModal } from './QuickCaptureModal';

interface FolderView {
  config: FolderConfig;
  status: DbStatus | null;
  error: string | null;
  errors: FolderError[];
}

interface FoldersPayload {
  folders: FolderView[];
  offers: PendingFolderOffer[];
}

function stateTone(state: FolderState | undefined): 'default' | 'success' | 'warning' | 'error' {
  switch (state) {
    case 'idle':
      return 'success';
    case 'syncing':
    case 'sync-preparing':
    case 'sync-waiting':
      return 'warning';
    case 'scanning':
    case 'cleaning':
    case 'cleanWaiting':
      return 'default';
    case 'error':
      return 'error';
    default:
      return 'default';
  }
}

export function FoldersScreen() {
  const client = useSyncthingClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [detailFolder, setDetailFolder] = useState<FolderView | null>(null);
  const [acceptOffer, setAcceptOffer] = useState<PendingFolderOffer | null>(null);

  const fetcher = useCallback(async (): Promise<FoldersPayload> => {
    const [folders, offers] = await Promise.all([
      client.folders(),
      client.pendingFolders().catch(() => [] as PendingFolderOffer[]),
    ]);
    const folderViews = await Promise.all(
      folders.map(async (f): Promise<FolderView> => {
        let status: DbStatus | null = null;
        let fetchError: string | null = null;
        try {
          status = await client.dbStatus(f.id);
        } catch (e) {
          fetchError = e instanceof Error ? e.message : String(e);
        }
        // only hit /folder/errors when the folder's actually in an error state
        let errors: FolderError[] = [];
        if (status && (status.state === 'error' || (status.error && status.error.length > 0))) {
          try {
            errors = await client.folderErrors(f.id);
          } catch {
            // pill still says "error" even if we can't list the files
          }
        }
        return { config: f, status, error: fetchError, errors };
      }),
    );
    return { folders: folderViews, offers };
  }, [client]);

  const { data, error, refreshing, refresh, refetch } = useResource(fetcher, [client], {
    intervalMs: 30000,
    enabled: !!client,
  });

  useEventTrigger(
    [
      'ConfigSaved',
      'FolderSummary',
      'StateChanged',
      'FolderResumed',
      'FolderPaused',
      'FolderErrors',
      'FolderRejected',
      'PendingFoldersChanged',
      'LocalIndexUpdated',
      'RemoteIndexUpdated',
    ],
    refetch,
  );

  const dismissOffer = async (offer: PendingFolderOffer) => {
    try {
      await client.dismissPendingFolder(offer.folderId, offer.deviceId);
      refetch();
    } catch (e) {
      Alert.alert('Could not dismiss', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textDim} />}
      >
        {error && <ErrorBox message={error} />}

        {data && data.offers.length > 0 && (
          <View style={styles.pendingSection}>
            <Text style={styles.sectionLabel}>Pending offers</Text>
            {data.offers.map(offer => (
              <PendingOfferCard
                key={`${offer.folderId}-${offer.deviceId}`}
                offer={offer}
                onAccept={() => setAcceptOffer(offer)}
                onIgnore={() => dismissOffer(offer)}
              />
            ))}
          </View>
        )}

        {data && data.folders.length === 0 && data.offers.length === 0 && !error && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No folders yet</Text>
            <Text style={styles.emptySub}>
              Tap + to add one. Folders are synced peer-to-peer with the devices you share them with.
            </Text>
          </View>
        )}

        {data?.folders.map(folder => (
          <FolderCard
            key={folder.config.id}
            folder={folder}
            onPress={() => setDetailFolder(folder)}
          />
        ))}
      </ScrollView>

      <Fab onPress={() => setShowAdd(true)} />
      {data && data.folders.length > 0 && (
        <TouchableOpacity
          style={styles.cameraFab}
          onPress={() => setShowCapture(true)}
        >
          <Icon name="camera" size={24} color={colors.text} />
        </TouchableOpacity>
      )}

      {showCapture && (
        <QuickCaptureModal
          visible
          folders={data?.folders.map(f => f.config) ?? []}
          onClose={() => setShowCapture(false)}
          onCaptured={refetch}
        />
      )}

      <AddFolderModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={refetch}
      />

      <FolderDetailModal
        visible={!!detailFolder}
        folder={detailFolder?.config ?? null}
        status={detailFolder?.status ?? null}
        errors={detailFolder?.errors ?? []}
        onClose={() => setDetailFolder(null)}
        onChanged={refetch}
      />

      <AcceptFolderModal
        visible={!!acceptOffer}
        offer={acceptOffer}
        onClose={() => setAcceptOffer(null)}
        onAccepted={refetch}
      />
    </View>
  );
}

function PendingOfferCard({
  offer,
  onAccept,
  onIgnore,
}: {
  offer: PendingFolderOffer;
  onAccept: () => void;
  onIgnore: () => void;
}) {
  return (
    <View style={styles.offerCard}>
      <View style={styles.offerHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.offerLabel} numberOfLines={1}>
            {offer.label || offer.folderId}
          </Text>
          <Text style={styles.offerMeta} numberOfLines={1}>
            from {offer.deviceId.slice(0, 7)}… · id {offer.folderId}
          </Text>
        </View>
        <Pill text="offered" tone="warning" />
      </View>
      <View style={styles.offerActions}>
        <TouchableOpacity style={[styles.offerBtn, styles.ignoreBtn]} onPress={onIgnore}>
          <Text style={styles.ignoreBtnText}>Ignore</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.offerBtn, styles.acceptBtn]} onPress={onAccept}>
          <Text style={styles.acceptBtnText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FolderCard({ folder, onPress }: { folder: FolderView; onPress: () => void }) {
  const { config, status, errors } = folder;
  const label = config.label || config.id;
  const state = status?.state;
  const stateLabel = folder.error
    ? 'error'
    : config.paused
      ? 'paused'
      : state ?? 'unknown';
  const tone = folder.error ? 'error' : config.paused ? 'default' : stateTone(state);
  const errorCount = errors.length;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card>
        <View style={styles.header}>
          <View style={styles.headerMain}>
            <Text style={styles.folderLabel} numberOfLines={1}>
              {label}
            </Text>
            <Text style={styles.folderPath} numberOfLines={1}>
              {config.path}
            </Text>
          </View>
          <View style={styles.headerPills}>
            {errorCount > 0 && (
              <Pill text={`${errorCount} error${errorCount === 1 ? '' : 's'}`} tone="error" />
            )}
            <Pill text={stateLabel} tone={tone} />
          </View>
        </View>

        {folder.error && <Text style={styles.errorInline}>{folder.error}</Text>}

        {status && (
          <View style={styles.statsRow}>
            <Stat label="Files" value={String(status.localFiles)} />
            <Stat label="Size" value={formatBytes(status.localBytes)} />
            <Stat label="Need" value={formatBytes(status.needBytes)} />
            <Stat label="Devices" value={String(config.devices.length)} />
          </View>
        )}

        {status && status.globalBytes > 0 && status.needBytes > 0 && (
          <View style={styles.progressWrap}>
            <Progress value={(status.globalBytes - status.needBytes) / status.globalBytes} />
            <Text style={styles.progressLabel}>
              {Math.floor(((status.globalBytes - status.needBytes) / status.globalBytes) * 100)}% ·{' '}
              {formatBytes(status.needBytes)} remaining
            </Text>
          </View>
        )}

        <View style={styles.metaRow}>
          <Text style={styles.meta}>{config.type}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.meta}>{config.id}</Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 20, paddingTop: 16, paddingBottom: 100 },
  cameraFab: {
    position: 'absolute',
    left: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cameraFabText: { fontSize: 24 },
  pendingSection: { marginBottom: 12 },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  offerCard: {
    backgroundColor: '#2b1d00',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  offerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  offerLabel: { color: colors.text, fontSize: 16, fontWeight: '600' },
  offerMeta: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  offerActions: { flexDirection: 'row', gap: 10 },
  offerBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  ignoreBtn: { backgroundColor: 'transparent', borderColor: colors.border },
  ignoreBtnText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  acceptBtn: { backgroundColor: colors.accent, borderColor: colors.accent },
  acceptBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  headerPills: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerMain: { flex: 1 },
  folderLabel: { color: colors.text, fontSize: 16, fontWeight: '600' },
  folderPath: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  errorInline: { color: colors.error, fontSize: 12, marginBottom: 8 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  statLabel: {
    color: colors.textDim,
    fontSize: 10,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressWrap: { marginBottom: 10, gap: 6 },
  progressLabel: { color: colors.textDim, fontSize: 11 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { color: colors.textDim, fontSize: 11, fontFamily: 'Menlo' },
  metaDot: { color: colors.textDim, fontSize: 11 },
  emptyBox: {
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  emptySub: { color: colors.textDim, fontSize: 13, textAlign: 'center' },
});
