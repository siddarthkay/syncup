import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'onboarding:completed:v1';

/**
 * One-shot onboarding gate. Resolves to:
 *   'unknown'  —> still reading from disk; render nothing yet
 *   'pending'  —> first launch (or explicit reset); show the flow
 *   'done'     —> flow has been completed (or skipped) at least once
 *
 * `complete()` flips the persisted value and updates state synchronously
 * for the caller. `reset()` is wired into the Settings screen for QA.
 */
export type OnboardingState = 'unknown' | 'pending' | 'done';

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>('unknown');

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(KEY)
      .then(v => {
        if (cancelled) return;
        setState(v === '1' ? 'done' : 'pending');
      })
      .catch(() => {
        if (cancelled) return;
        // a read failure shouldn't trap the user in onboarding forever;
        // assume done so the app boots normally.
        setState('done');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const complete = useCallback(() => {
    setState('done');
    AsyncStorage.setItem(KEY, '1').catch(() => {});
  }, []);

  const reset = useCallback(() => {
    setState('pending');
    AsyncStorage.removeItem(KEY).catch(() => {});
  }, []);

  return { state, complete, reset };
}
