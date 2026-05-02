import { useCallback, useEffect, useRef } from 'react';
import {
  findNodeHandle,
  Platform,
  ScrollView,
  StatusBar,
  UIManager,
  View,
} from 'react-native';
import { useCoach } from './CoachContext';

// measureInWindow returns y in window coordinates. On iOS that's the same
// coordinate space we render the SVG overlay in (covers the entire screen
// including the status bar). On Android with a translucent / drawn-under
// status bar, the measurement omits the status bar height while our overlay
// still covers it — so we add it back to keep the cutout glued to the target.
const Y_OFFSET = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

interface Options {
  /**
   * Parent ScrollView that contains this target. When provided, the coach can
   * scroll the parent so the spotlight isn't behind the screen edge before
   * measuring. Pass the same ref you bind to the <ScrollView ref={...}>.
   */
  scrollRef?: React.RefObject<ScrollView | null>;
  /**
   * Pixels of padding to leave above the target when scrolling it into view.
   * Defaults to 64 to clear most app headers / tab bars.
   */
  scrollPadding?: number;
}

/**
 * Bind to any View to expose it as a coach spotlight target.
 *
 *   const ref = useCoachTarget('devices.fab');
 *   <View ref={ref.ref} onLayout={ref.onLayout}>...</View>
 *
 * If the target lives inside a ScrollView, pass a `scrollRef` so the coach
 * can scroll the target into view before showing the spotlight.
 */
export function useCoachTarget(id: string, options: Options = {}) {
  const { registerTarget } = useCoach();
  const viewRef = useRef<View | null>(null);
  const { scrollRef, scrollPadding = 64 } = options;

  const measure = useCallback(() => {
    const node = viewRef.current;
    if (!node) return;
    const handle = findNodeHandle(node);
    if (handle == null) return;
    UIManager.measureInWindow(handle, (x, y, width, height) => {
      if (width === 0 && height === 0) return;
      registerTarget(
        id,
        { x, y: y + Y_OFFSET, width, height },
        measure,
        scrollIntoViewIfNeeded,
      );
    });
    // scrollIntoViewIfNeeded is defined below; ESLint can't see through that
    // because both close over `viewRef` / `scrollRef` so it's safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, registerTarget]);

  // Scroll the target into view by computing its offset within the
  // ScrollView's content frame. Implemented via measureLayout against the
  // scrollable's inner node so we get a position relative to the scroll
  // origin, not the window.
  const scrollIntoViewIfNeeded = useCallback(() => {
    const scrollNode = scrollRef?.current;
    const targetNode = viewRef.current;
    if (!scrollNode || !targetNode) return;
    const scrollHandle = findNodeHandle(scrollNode);
    const targetHandle = findNodeHandle(targetNode);
    if (scrollHandle == null || targetHandle == null) return;
    UIManager.measureLayout(
      targetHandle,
      scrollHandle,
      () => {
        // measureLayout error: silent, target probably remounted mid-frame.
      },
      (_x, y) => {
        const top = Math.max(0, y - scrollPadding);
        scrollNode.scrollTo({ x: 0, y: top, animated: true });
      },
    );
  }, [scrollRef, scrollPadding]);

  useEffect(() => {
    return () => {
      registerTarget(id, null);
    };
  }, [id, registerTarget]);

  return {
    ref: viewRef,
    onLayout: measure,
  };
}
