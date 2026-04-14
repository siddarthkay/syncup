import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

export const colors = {
  bg: '#0b0e14',
  card: '#161b22',
  border: '#21262d',
  text: '#e6edf3',
  textDim: '#8a94a6',
  accent: '#1f6feb',
  error: '#ff6b6b',
  errorBg: '#3a1415',
  errorBorder: '#7a2125',
  success: '#3fb950',
  warning: '#d29922',
} as const;

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.cardTitle}>{children}</Text>;
}

interface RowProps {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
  multiline?: boolean;
}

export function Row({ label, value, mono, valueColor, multiline }: RowProps) {
  if (multiline) {
    return (
      <View style={styles.rowStacked}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text
          style={[styles.rowValueStacked, mono && styles.mono, valueColor ? { color: valueColor } : null]}
          selectable
        >
          {value}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, mono && styles.mono, valueColor ? { color: valueColor } : null]}
        numberOfLines={2}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

export function ErrorBox({ title, message }: { title?: string; message: string }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorTitle}>{title ?? 'Error'}</Text>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

interface ProgressProps {
  /** 0..1, clamped. */
  value: number;
  /** Default 4; bump to ~8 for prominent display. */
  height?: number;
  /** Fill color; defaults to accent. */
  tint?: string;
}

export function Progress({ value, height = 4, tint = colors.accent }: ProgressProps) {
  const clamped = Math.max(0, Math.min(1, isFinite(value) ? value : 0));
  return (
    <View style={[progressStyles.track, { height, borderRadius: height / 2 }]}>
      <View
        style={[
          progressStyles.fill,
          {
            width: `${clamped * 100}%`,
            backgroundColor: tint,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: {
    backgroundColor: colors.border,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
  },
});

export function Pill({ text, tone = 'default' }: { text: string; tone?: 'default' | 'success' | 'warning' | 'error' }) {
  const toneStyle = {
    default: { bg: '#21262d', fg: colors.textDim },
    success: { bg: '#0d2e18', fg: colors.success },
    warning: { bg: '#2b1d00', fg: colors.warning },
    error: { bg: colors.errorBg, fg: colors.error },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: toneStyle.bg }]}>
      <Text style={[styles.pillText, { color: toneStyle.fg }]}>{text}</Text>
    </View>
  );
}

export function formatBytes(n: number | undefined): string {
  if (!n || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

export function formatUptime(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function shortDeviceId(id: string | undefined): string {
  if (!id) return '';
  return id.split('-').slice(0, 2).join('-') + '…';
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowStacked: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.textDim, fontSize: 13, flex: 1 },
  rowValue: { color: colors.text, fontSize: 13, flex: 2, textAlign: 'right' },
  rowValueStacked: { color: colors.text, fontSize: 12, marginTop: 4 },
  mono: { fontFamily: 'Menlo' },
  errorBox: {
    backgroundColor: colors.errorBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  errorTitle: { color: colors.error, fontWeight: '600', marginBottom: 6 },
  errorText: { color: '#ffccd0', fontSize: 13 },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
});
