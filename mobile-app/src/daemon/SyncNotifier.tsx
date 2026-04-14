import { useEffect, useRef } from 'react';
import GoBridge from '../GoServerBridgeJSI';
import { useEventTrigger } from './EventsContext';
import { useSyncthing } from './SyncthingContext';
import {
  buildFolderErrorPayload,
  type FolderErrorsEventData,
} from './folderErrorPayload';

// FolderErrors -> native notif. Dedup is native-side (NotificationDedup on
// Android, @synchronized in GoBridgeWrapper on iOS). iOS background path is
// BackgroundErrorNotifier.swift since BGTaskScheduler can't run JS.
export function SyncNotifier() {
  const { client } = useSyncthing();
  const folderLabelsRef = useRef<Record<string, string>>({});

  const refreshLabels = () => {
    if (!client) return;
    client
      .folders()
      .then(folders => {
        const map: Record<string, string> = {};
        for (const f of folders) {
          map[f.id] = f.label || f.id;
        }
        folderLabelsRef.current = map;
      })
      .catch(() => {
        // fall back to bare folder ids
      });
  };

  useEffect(() => {
    refreshLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  useEventTrigger(['ConfigSaved'], refreshLabels);

  useEventTrigger(['FolderErrors'], evt => {
    const payload = buildFolderErrorPayload(evt.data as FolderErrorsEventData);
    if (!payload) return;
    const label = folderLabelsRef.current[payload.folderId] || payload.folderId;
    try {
      GoBridge.maybeNotifyFolderErrors(
        payload.folderId,
        payload.count,
        label,
        payload.sample,
      );
    } catch {
      // permission denied or bridge gone; nothing to do
    }
  });

  return null;
}
