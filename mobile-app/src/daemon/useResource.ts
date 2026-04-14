import { useCallback, useEffect, useRef, useState } from 'react';

export interface ResourceState<T> {
  data: T | null;
  error: string | null;
  /** Any fetch in flight, background polls included. */
  loading: boolean;
  /** Only user-initiated refreshes. Bind to RefreshControl. */
  refreshing: boolean;
  /** Silent refetch. */
  refetch: () => Promise<void>;
  /** User refresh - flips `refreshing`. */
  refresh: () => Promise<void>;
}

export interface UseResourceOptions {
  intervalMs?: number;
  enabled?: boolean;
}

// fetcher captured by ref so callers can pass inline closures without re-subscribing
export function useResource<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
  options: UseResourceOptions = {},
): ResourceState<T> {
  const { intervalMs = 0, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const cancelledRef = useRef(false);

  const runFetch = useCallback(async (asRefresh: boolean) => {
    setLoading(true);
    if (asRefresh) setRefreshing(true);
    try {
      const result = await fetcherRef.current();
      if (!cancelledRef.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (!cancelledRef.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
        if (asRefresh) setRefreshing(false);
      }
    }
  }, []);

  const refetch = useCallback(() => runFetch(false), [runFetch]);
  const refresh = useCallback(() => runFetch(true), [runFetch]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!enabled) return;
    refetch();
    if (intervalMs <= 0) return;
    const id = setInterval(refetch, intervalMs);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...deps]);

  return { data, error, loading, refreshing, refetch, refresh };
}
