import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSyncthing } from '../../daemon/SyncthingContext';

/**
 * In-app guided tour.The coach drives the existing UI: it switches the current tab, points a spotlight at a target
 * (a FAB, an input row, etc.), and watches the daemon for completion so it
 * can auto-advance once the user actually does the thing.
 */

export type CoachTabKey = 'status' | 'folders' | 'devices' | 'settings';

export interface CoachStep {
  id: string;
  /** Tab to switch to before showing this step. Pass undefined for full-screen splash steps. */
  tab?: CoachTabKey;
  /** Coach target id to spotlight. Targets register themselves via useCoachTarget. */
  targetId?: string;
  title: string;
  body: string;
  /** Label for the primary button. Pass null for steps that auto-advance silently. */
  cta?: string | null;
  /**
   * Auto-advance trigger. The coach polls the daemon and resolves the predicate;
   * once it returns true the step advances on its own (no button required).
   */
  awaitAction?: 'devicesIncreased' | 'foldersIncreased';
}

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CoachContextValue {
  active: boolean;
  step: CoachStep | null;
  stepIndex: number;
  totalSteps: number;
  targetRect: TargetRect | null;
  start: () => void;
  next: () => void;
  skip: () => void;
  /** Targets call this when their layout settles; coach reads from the registry. */
  registerTarget: (
    id: string,
    rect: TargetRect | null,
    remeasure?: () => void,
    scrollIntoView?: () => void,
  ) => void;
}

const Ctx = createContext<CoachContextValue | null>(null);

const STEPS: CoachStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to SyncUp',
    body: 'Sync files between your devices, peer to peer. Your data never touches a server. Want a quick tour?',
    cta: 'Show me around',
  },
  {
    id: 'name',
    tab: 'settings',
    targetId: 'settings.deviceName',
    title: 'Name this device',
    body: 'Type a name here so peers can recognise it. You can edit it anytime.',
    cta: 'Next',
  },
  {
    id: 'pair',
    tab: 'devices',
    targetId: 'devices.fab',
    title: 'Pair another device',
    body: 'Tap the plus to scan or paste a peer device ID. The tutorial will move on once a peer is added.',
    cta: 'Got it',
    awaitAction: 'devicesIncreased',
  },
  {
    id: 'folder',
    tab: 'folders',
    targetId: 'folders.fab',
    title: 'Add your first folder',
    body: 'Tap the plus to pick a folder to sync. The tutorial will move on once a folder exists.',
    cta: 'Got it',
    awaitAction: 'foldersIncreased',
  },
  {
    id: 'done',
    title: 'You are set up',
    body: 'Folders sync as soon as a paired peer accepts them. Happy Syncing! ',
    cta: 'Finish',
  },
];

interface ProviderProps {
  children: React.ReactNode;
  /** Bridge to App.tsx so the coach can switch tabs. */
  onSetTab: (tab: CoachTabKey) => void;
  /** Fires once the user reaches the done step (or skips). */
  onDone: () => void;
}

export function CoachProvider({ children, onSetTab, onDone }: ProviderProps) {
  const { client, info } = useSyncthing();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const targetsRef = useRef<Map<string, TargetRect>>(new Map());
  // Re-measure callbacks keyed by target id. useCoachTarget registers one
  // when it mounts; we call it whenever a step needs a fresh rect (e.g. on
  // replay, where the target view hasn't relayouted but its position is
  // still good and we want to read it).
  const remeasurersRef = useRef<Map<string, () => void>>(new Map());
  // Scroll-into-view callbacks. When a target lives in a ScrollView, the
  // hook owner registers a function that scrolls the parent so the target
  // is visible before we measure it.
  const scrollersRef = useRef<Map<string, () => void>>(new Map());
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const stepTargetIdRef = useRef<string | undefined>(undefined);

  const step = active ? STEPS[stepIndex] ?? null : null;

  // Keep the ref in sync so registerTarget (which has a stable identity) can
  // see the current step's targetId without being re-created.
  useEffect(() => {
    stepTargetIdRef.current = step?.targetId;
  }, [step?.targetId]);

  // Switch tab when entering a step that requires it. Also re-resolve target.
  useEffect(() => {
    if (!step) {
      setTargetRect(null);
      return;
    }
    if (step.tab) onSetTab(step.tab);
    if (!step.targetId) {
      setTargetRect(null);
      return;
    }
    // Hide the spotlight while we set up, prevents a flash of the old rect
    // (or a half-resolved one) before scroll + measure complete.
    setTargetRect(null);
    // Step 1: scroll the target into view if it lives in a ScrollView.
    const scrollIntoView = scrollersRef.current.get(step.targetId);
    if (scrollIntoView) scrollIntoView();
    // Step 2: after scroll settles, ask the target to re-measure, then read.
    const remeasure = remeasurersRef.current.get(step.targetId);
    const settle = setTimeout(() => {
      if (remeasure) remeasure();
    }, 320);
    const reveal = setTimeout(() => {
      const r = step.targetId
        ? targetsRef.current.get(step.targetId) ?? null
        : null;
      setTargetRect(r);
    }, 420);
    return () => {
      clearTimeout(settle);
      clearTimeout(reveal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, active]);

  // Stable identity. useCoachTarget effects depend on this; if it changed
  // every render the cleanup would deregister our targets and the spotlight
  // would land on a null rect.
  const registerTarget = useCallback(
    (
      id: string,
      rect: TargetRect | null,
      remeasure?: () => void,
      scrollIntoView?: () => void,
    ) => {
      if (rect) {
        targetsRef.current.set(id, rect);
        if (remeasure) remeasurersRef.current.set(id, remeasure);
        if (scrollIntoView) scrollersRef.current.set(id, scrollIntoView);
      } else {
        targetsRef.current.delete(id);
        remeasurersRef.current.delete(id);
        scrollersRef.current.delete(id);
      }
      // If we're currently spotlighting this id, push the new rect through
      // immediately so layout shifts (keyboard open, scroll) keep the
      // spotlight glued to the element.
      if (stepTargetIdRef.current === id) {
        setTargetRect(rect);
      }
    },
    [],
  );

  // Auto-advance: poll the daemon for action-completion predicates.
  useEffect(() => {
    if (!step?.awaitAction || !client || !info?.deviceId) return;
    let cancelled = false;
    let baseline = -1;

    const sample = async (): Promise<number> => {
      try {
        if (step.awaitAction === 'devicesIncreased') {
          const list = await client.devices();
          return list.filter(d => d.deviceID !== info.deviceId).length;
        }
        if (step.awaitAction === 'foldersIncreased') {
          const list = await client.folders();
          return list.length;
        }
      } catch {
        return -1;
      }
      return -1;
    };

    const tick = async () => {
      const cur = await sample();
      if (cancelled || cur < 0) return;
      if (baseline < 0) {
        baseline = cur;
        return;
      }
      if (cur > baseline) {
        setStepIndex(i => Math.min(i + 1, STEPS.length - 1));
      }
    };

    tick();
    const id = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [step?.awaitAction, client, info?.deviceId, stepIndex]);

  const start = useCallback(() => {
    setActive(true);
    setStepIndex(0);
  }, []);

  const next = useCallback(() => {
    setStepIndex(i => {
      const ni = i + 1;
      if (ni >= STEPS.length) {
        setActive(false);
        onDone();
        return i;
      }
      return ni;
    });
  }, [onDone]);

  const skip = useCallback(() => {
    setActive(false);
    onDone();
  }, [onDone]);

  const value = useMemo<CoachContextValue>(
    () => ({
      active,
      step,
      stepIndex,
      totalSteps: STEPS.length,
      targetRect,
      start,
      next,
      skip,
      registerTarget,
    }),
    [active, step, stepIndex, targetRect, start, next, skip, registerTarget],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCoach(): CoachContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCoach must be used inside <CoachProvider>');
  return v;
}
