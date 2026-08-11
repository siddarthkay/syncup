import type { SystemStatus, SystemVersion } from '../api/types';

export interface LogFileMeta {
  version?: SystemVersion | null;
  status?: SystemStatus | null;
  platform?: string | null;
  exportedAt: string;
  logBytes?: number | null;
}

export function logFileName(exportedAt: string): string {
  const stamp = exportedAt.replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `syncup-log-${stamp || 'export'}.txt`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatLogHeader(meta: LogFileMeta): string {
  return [
    '# SyncUp daemon log',
    `exported: ${meta.exportedAt}`,
    meta.platform ? `platform: ${meta.platform}` : null,
    meta.version ? `syncthing: ${meta.version.longVersion}` : null,
    meta.version ? `build: ${meta.version.os}/${meta.version.arch}` : null,
    meta.status ? `device id: ${meta.status.myID}` : null,
    meta.status ? `uptime: ${meta.status.uptime}s` : null,
    meta.status ? `goroutines: ${meta.status.goroutines}` : null,
    meta.logBytes != null ? `log size: ${formatBytes(meta.logBytes)}` : null,
    '',
  ]
    .filter((l): l is string => l !== null)
    .join('\n')
    .concat('\n');
}
