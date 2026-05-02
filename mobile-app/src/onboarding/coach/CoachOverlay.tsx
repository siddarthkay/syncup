import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { colors } from '../../components/ui';
import { useCoach } from './CoachContext';

const TOOLTIP_WIDTH = 320;
const TOOLTIP_GAP = 16;
const PADDING = 12;
// Apple-ish smooth easing (close to UICubicTimingParameters with control points
// matching the default sheet presentation curve). 
const APPLE_EASE = Easing.bezier(0.32, 0.72, 0, 1);

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export function CoachOverlay() {
  const { active, step, targetRect, stepIndex, totalSteps, next, skip } = useCoach();
  const insets = useSafeAreaInsets();
  const win = Dimensions.get('window');

  // Cutout geometry, animated in lockstep across mask + glow.
  const cx = useRef(new Animated.Value(win.width / 2)).current;
  const cy = useRef(new Animated.Value(win.height / 2)).current;
  const cw = useRef(new Animated.Value(0)).current;
  const ch = useRef(new Animated.Value(0)).current;
  const cr = useRef(new Animated.Value(16)).current; // corner radius

  const dimOpacity = useRef(new Animated.Value(0)).current;
  const tipOpacity = useRef(new Animated.Value(0)).current;
  const tipTranslate = useRef(new Animated.Value(8)).current;

  // The card visible right now. Held in state so we cross-fade between two
  // step copies cleanly.
  const [renderStep, setRenderStep] = useState(step);

  // Decide a corner radius that matches the target shape. A roughly square,
  // FAB-sized target gets a circular cutout (radius == half side); everything
  // else gets a continuous-feeling 16px radius.
  const targetRadius = useMemo(() => {
    if (!targetRect) return 16;
    const ar = targetRect.width / targetRect.height;
    const small = Math.max(targetRect.width, targetRect.height) <= 96;
    if (small && ar > 0.85 && ar < 1.15) {
      return (Math.max(targetRect.width, targetRect.height) + PADDING * 2) / 2;
    }
    return 18;
  }, [targetRect]);

  // Backdrop fade
  useEffect(() => {
    Animated.timing(dimOpacity, {
      toValue: active ? 1 : 0,
      duration: active ? 320 : 220,
      easing: APPLE_EASE,
      useNativeDriver: true,
    }).start();
  }, [active, dimOpacity]);

  // Glide cutout geometry to the new step.
  useEffect(() => {
    const r = targetRect ?? null;
    const tx = r ? r.x - PADDING : win.width / 2;
    const ty = r ? r.y - PADDING : win.height / 2;
    const tw = r ? r.width + PADDING * 2 : 0;
    const th = r ? r.height + PADDING * 2 : 0;
    const config = { duration: 420, easing: APPLE_EASE, useNativeDriver: false };
    Animated.parallel([
      Animated.timing(cx, { toValue: tx, ...config }),
      Animated.timing(cy, { toValue: ty, ...config }),
      Animated.timing(cw, { toValue: tw, ...config }),
      Animated.timing(ch, { toValue: th, ...config }),
      Animated.timing(cr, { toValue: targetRadius, ...config }),
    ]).start();
  }, [targetRect, targetRadius, cx, cy, cw, ch, cr, win.width, win.height]);

  // Tooltip cross-fade
  useEffect(() => {
    if (!active || !step) return;
    Animated.timing(tipOpacity, {
      toValue: 0,
      duration: 140,
      easing: APPLE_EASE,
      useNativeDriver: true,
    }).start(() => {
      setRenderStep(step);
      tipTranslate.setValue(8);
      Animated.parallel([
        Animated.timing(tipOpacity, {
          toValue: 1,
          duration: 260,
          easing: APPLE_EASE,
          useNativeDriver: true,
        }),
        Animated.timing(tipTranslate, {
          toValue: 0,
          duration: 320,
          easing: APPLE_EASE,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [stepIndex, active, step, tipOpacity, tipTranslate]);

    const staticCutout = useMemo(() => {
    if (!targetRect) return null;
    return {
      x: targetRect.x - PADDING,
      y: targetRect.y - PADDING,
      w: targetRect.width + PADDING * 2,
      h: targetRect.height + PADDING * 2,
    };
  }, [targetRect]);

  const tooltipTop = useMemo(() => {
    if (!staticCutout) return win.height / 2 - 110;
    const tooltipHeight = 220;
    const below = staticCutout.y + staticCutout.h + TOOLTIP_GAP;
    if (below + tooltipHeight + insets.bottom < win.height) return below;
    return Math.max(insets.top + 12, staticCutout.y - tooltipHeight - TOOLTIP_GAP);
  }, [staticCutout, win.height, insets.bottom, insets.top]);

  const tooltipLeft = Math.max(
    16,
    Math.min((win.width - TOOLTIP_WIDTH) / 2, win.width - TOOLTIP_WIDTH - 16),
  );

  if (!active || !renderStep) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: dimOpacity }]}
        pointerEvents="none"
      >
        <Svg width={win.width} height={win.height}>
          <Defs>
            <Mask id="coachMask">
              <Rect x="0" y="0" width={win.width} height={win.height} fill="white" />
              <AnimatedRect
                x={cx}
                y={cy}
                width={cw}
                height={ch}
                rx={cr}
                ry={cr}
                fill="black"
              />
            </Mask>
          </Defs>

          <Rect
            x="0"
            y="0"
            width={win.width}
            height={win.height}
            fill="rgba(8,11,16,0.82)"
            mask="url(#coachMask)"
          />
        </Svg>
      </Animated.View>

      {/* Touch shields. They swallow taps so the user can't accidentally
          interact with the dimmed UI behind them, but they DON'T skip the
          tour, only the explicit Skip button does. */}
      {staticCutout ? (
        <>
          <View
            style={[styles.tapCatcher, { left: 0, top: 0, right: 0, height: staticCutout.y }]}
            onStartShouldSetResponder={() => true}
          />
          <View
            style={[
              styles.tapCatcher,
              { left: 0, top: staticCutout.y, width: staticCutout.x, height: staticCutout.h },
            ]}
            onStartShouldSetResponder={() => true}
          />
          <View
            style={[
              styles.tapCatcher,
              {
                left: staticCutout.x + staticCutout.w,
                top: staticCutout.y,
                right: 0,
                height: staticCutout.h,
              },
            ]}
            onStartShouldSetResponder={() => true}
          />
          <View
            style={[
              styles.tapCatcher,
              { left: 0, top: staticCutout.y + staticCutout.h, right: 0, bottom: 0 },
            ]}
            onStartShouldSetResponder={() => true}
          />
        </>
      ) : (
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
        />
      )}

      <Animated.View
        style={[
          styles.tooltip,
          {
            top: tooltipTop,
            left: tooltipLeft,
            opacity: tipOpacity,
            transform: [{ translateY: tipTranslate }],
          },
        ]}
      >
        <Text style={styles.eyebrow}>
          Step {Math.min(stepIndex + 1, totalSteps)} of {totalSteps}
        </Text>
        <Text style={styles.title}>{renderStep.title}</Text>
        <Text style={styles.body}>{renderStep.body}</Text>
        <View style={styles.actions}>
          {stepIndex === 0 ? (
            <TouchableOpacity onPress={skip} hitSlop={12}>
              <Text style={styles.skipText}>Skip tour</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          <TouchableOpacity onPress={next} style={styles.cta} activeOpacity={0.85}>
            <Text style={styles.ctaText}>
              {stepIndex === 0 || stepIndex === totalSteps - 1
                ? renderStep.cta ?? 'Next'
                : 'Skip to next'}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  tapCatcher: { position: 'absolute' },
  tooltip: {
    position: 'absolute',
    width: TOOLTIP_WIDTH,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  eyebrow: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  body: {
    color: colors.textDim,
    fontSize: 13.5,
    lineHeight: 19,
    marginBottom: 14,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipText: { color: colors.textDim, fontSize: 13.5 },
  cta: {
    backgroundColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  ctaText: { color: '#fff', fontSize: 13.5, fontWeight: '600' },
});
