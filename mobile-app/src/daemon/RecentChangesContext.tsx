import React, { createContext, useContext, useEffect, useState } from 'react';
import { useEvents } from './EventsContext';

// ring buffer of ItemFinished events; subscribed at app root so we don't miss
// changes that happen while another screen is mounted. cap at 100.

export interface RecentChange {
  id: number;
  time: string;
  folder: string;
  item: string;
  type: string; // file | dir | symlink
  action: string; // update | delete | metadata
  error: string | null;
}

interface ItemFinishedData {
  folder?: string;
  item?: string;
  type?: string;
  action?: string;
  error?: string | null;
}

interface RecentChangesContextValue {
  changes: RecentChange[];
  clear: () => void;
}

const Ctx = createContext<RecentChangesContextValue | null>(null);
const MAX_ENTRIES = 100;

export function RecentChangesProvider({ children }: { children: React.ReactNode }) {
  const { subscribe } = useEvents();
  const [changes, setChanges] = useState<RecentChange[]>([]);

  useEffect(() => {
    const unsubscribe = subscribe(['ItemFinished'], evt => {
      const d = (evt.data ?? {}) as ItemFinishedData;
      if (!d.folder || !d.item) return;
      const next: RecentChange = {
        id: evt.id,
        time: evt.time,
        folder: d.folder,
        item: d.item,
        type: d.type ?? 'file',
        action: d.action ?? 'update',
        error: d.error ? String(d.error) : null,
      };
      setChanges(prev => {
        const out = [next, ...prev];
        if (out.length > MAX_ENTRIES) out.length = MAX_ENTRIES;
        return out;
      });
    });
    return unsubscribe;
  }, [subscribe]);

  const clear = () => setChanges([]);

  return <Ctx.Provider value={{ changes, clear }}>{children}</Ctx.Provider>;
}

export function useRecentChanges(): RecentChangesContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRecentChanges must be used inside <RecentChangesProvider>');
  return v;
}
