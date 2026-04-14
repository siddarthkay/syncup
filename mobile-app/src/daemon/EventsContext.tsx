import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useSyncthing } from './SyncthingContext';

// long-poll /rest/events; 2s backoff on error, AbortController cancels on unmount.

export interface SyncthingEvent {
  id: number;
  globalID: number;
  type: string;
  time: string;
  data: unknown;
}

type Subscriber = {
  types: ReadonlySet<string>;
  callback: (event: SyncthingEvent) => void;
};

interface EventsContextValue {
  lastEventId: number;
  connected: boolean;
  subscribe: (types: readonly string[], callback: (event: SyncthingEvent) => void) => () => void;
}

const Ctx = createContext<EventsContextValue | null>(null);

export function EventsProvider({ children }: { children: React.ReactNode }) {
  const { info } = useSyncthing();
  const subscribersRef = useRef<Set<Subscriber>>(new Set());
  const [lastEventId, setLastEventId] = useState(0);
  const [connected, setConnected] = useState(false);

  const subscribe = useCallback(
    (types: readonly string[], callback: (event: SyncthingEvent) => void) => {
      const sub: Subscriber = {
        types: new Set(types),
        callback,
      };
      subscribersRef.current.add(sub);
      return () => {
        subscribersRef.current.delete(sub);
      };
    },
    [],
  );

  useEffect(() => {
    if (!info?.guiAddress || !info?.apiKey) {
      setConnected(false);
      return;
    }

    const abort = new AbortController();
    let cancelled = false;
    let since = 0;
    const baseUrl = `http://${info.guiAddress}`;

    const loop = async () => {
      while (!cancelled) {
        const url = `${baseUrl}/rest/events?since=${since}&timeout=60`;
        try {
          const res = await fetch(url, {
            headers: { 'X-API-Key': info.apiKey },
            signal: abort.signal,
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const events = (await res.json()) as SyncthingEvent[];
          if (cancelled) return;
          if (!connected) setConnected(true);
          if (events.length > 0) {
            const latest = events[events.length - 1].id;
            since = latest;
            setLastEventId(latest);
            // snapshot so a callback can unsubscribe itself mid-iteration
            const snapshot = Array.from(subscribersRef.current);
            for (const event of events) {
              for (const sub of snapshot) {
                if (sub.types.has(event.type)) {
                  try {
                    sub.callback(event);
                  } catch {
                    // one bad subscriber shouldn't kill the loop
                  }
                }
              }
            }
          }
        } catch (e) {
          if (cancelled) return;
          if (e instanceof Error && e.name === 'AbortError') return;
          setConnected(false);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    };

    loop();

    return () => {
      cancelled = true;
      abort.abort();
      setConnected(false);
    };
    // only re-run when daemon address/key rotate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.guiAddress, info?.apiKey]);

  return (
    <Ctx.Provider value={{ lastEventId, connected, subscribe }}>
      {children}
    </Ctx.Provider>
  );
}

export function useEvents(): EventsContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useEvents must be used inside <EventsProvider>');
  }
  return v;
}

export function useEventTrigger(
  types: readonly string[],
  callback: (event: SyncthingEvent) => void,
) {
  const { subscribe } = useEvents();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  // join so a new array literal doesn't re-subscribe every render
  const typesKey = types.join(',');
  useEffect(() => {
    const unsubscribe = subscribe(types, evt => callbackRef.current(evt));
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, typesKey]);
}

export function useEventLog(
  types: readonly string[],
  maxEntries = 20,
): SyncthingEvent[] {
  const { subscribe } = useEvents();
  const [entries, setEntries] = useState<SyncthingEvent[]>([]);
  const typesKey = types.join(',');
  useEffect(() => {
    const unsubscribe = subscribe(types, evt => {
      setEntries(prev => [evt, ...prev].slice(0, maxEntries));
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, typesKey, maxEntries]);
  return entries;
}
