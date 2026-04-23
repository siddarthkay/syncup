import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import GoBridge from '../GoServerBridgeJSI';
import { SyncthingClient } from '../api/syncthing';

export interface DaemonInfo {
  port: number;
  apiKey: string;
  deviceId: string;
  guiAddress: string;
  dataDir: string;
  /** Where new folders get created and the picker is rooted. May change at runtime. */
  foldersRoot: string;
}

interface SyncthingContextValue {
  info: DaemonInfo | null;
  client: SyncthingClient | null;
  error: string | null;
  restart: () => void;
  /** Re-read storage state after a permission grant/revoke. */
  refreshStorageState: () => void;
}

const Ctx = createContext<SyncthingContextValue | null>(null);

export function SyncthingProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<DaemonInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const start = useCallback(() => {
    try {
      const port = GoBridge.startServer();
      if (port <= 0) {
        setError('startServer returned 0 - see native logs');
        return;
      }
      setInfo({
        port,
        apiKey: GoBridge.getApiKey(),
        deviceId: GoBridge.getDeviceId(),
        guiAddress: GoBridge.getGuiAddress(),
        dataDir: GoBridge.getDataDir(),
        foldersRoot: GoBridge.getFoldersRoot(),
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // refresh storage fields without a daemon restart; picker re-anchors next open
  const refreshStorageState = useCallback(() => {
    setInfo(prev => {
      if (!prev) return prev;
      try {
        return {
          ...prev,
          foldersRoot: GoBridge.getFoldersRoot(),
        };
      } catch {
        return prev;
      }
    });
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start();
  }, [start]);

  const client = useMemo(() => {
    if (!info || !info.apiKey || !info.guiAddress) return null;
    return new SyncthingClient({ apiKey: info.apiKey, guiAddress: info.guiAddress });
  }, [info]);

  const restart = useCallback(() => {
    try {
      GoBridge.stopServer();
    } catch {
      // ignore
    }
    setInfo(null);
    startedRef.current = false;
    start();
  }, [start]);

  const value = useMemo<SyncthingContextValue>(
    () => ({ info, client, error, restart, refreshStorageState }),
    [info, client, error, restart, refreshStorageState],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSyncthing(): SyncthingContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useSyncthing must be used inside <SyncthingProvider>');
  }
  return v;
}

export function useSyncthingClient(): SyncthingClient {
  const { client } = useSyncthing();
  if (!client) {
    throw new Error('Daemon not ready - check useSyncthing().info first');
  }
  return client;
}
