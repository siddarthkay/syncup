import type { SyncthingEvent } from './EventsContext';

// covers the types Status subscribes to; unknown types fall through. payload
// shapes come from syncthing's lib/events/events.go, probed defensively so
// schema drift doesn't crash the ui.
export interface FormattedEvent {
  icon: string;
  text: string;
  time: string;
  tone: 'default' | 'success' | 'warning' | 'error';
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function shortId(id: unknown): string {
  if (typeof id !== 'string' || id.length === 0) return 'peer';
  return id.slice(0, 7);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function formatEvent(event: SyncthingEvent): FormattedEvent {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const time = formatTime(event.time);

  switch (event.type) {
    case 'StateChanged': {
      const folder = str(data.folder) ?? '?';
      const from = str(data.from);
      const to = str(data.to);
      const arrow = from && to ? `${from} → ${to}` : to ?? 'state changed';
      const tone: FormattedEvent['tone'] =
        to === 'idle' ? 'success' : to === 'error' ? 'error' : 'default';
      return { icon: '↻', text: `${folder}: ${arrow}`, time, tone };
    }

    case 'DeviceConnected': {
      const name = str(data.deviceName) ?? shortId(data.id);
      return { icon: '●', text: `Connected: ${name}`, time, tone: 'success' };
    }

    case 'DeviceDisconnected': {
      const name = str(data.deviceName) ?? shortId(data.id);
      const err = str(data.error);
      return {
        icon: '○',
        text: err ? `Disconnected: ${name} (${err})` : `Disconnected: ${name}`,
        time,
        tone: 'default',
      };
    }

    case 'FolderCompletion': {
      const folder = str(data.folder) ?? '?';
      const completion =
        typeof data.completion === 'number' ? Math.floor(data.completion) : undefined;
      const pct = completion != null ? `${completion}%` : '?%';
      return {
        icon: '✓',
        text: `${folder} ${pct} complete`,
        time,
        tone: completion === 100 ? 'success' : 'default',
      };
    }

    case 'FolderErrors': {
      const folder = str(data.folder) ?? '?';
      const errors = Array.isArray(data.errors) ? data.errors.length : 0;
      return {
        icon: '⚠',
        text: `${folder}: ${errors} error${errors === 1 ? '' : 's'}`,
        time,
        tone: 'error',
      };
    }

    case 'FolderPaused':
      return {
        icon: '⏸',
        text: `Paused ${str(data.id) ?? '?'}`,
        time,
        tone: 'warning',
      };

    case 'FolderResumed':
      return {
        icon: '▶',
        text: `Resumed ${str(data.id) ?? '?'}`,
        time,
        tone: 'success',
      };

    case 'ConfigSaved':
      return { icon: '✎', text: 'Config saved', time, tone: 'default' };

    case 'PendingFoldersChanged':
      return {
        icon: '+',
        text: 'Pending folder offers changed',
        time,
        tone: 'warning',
      };

    case 'PendingDevicesChanged':
      return {
        icon: '+',
        text: 'Pending device offers changed',
        time,
        tone: 'warning',
      };

    case 'StartupComplete':
      return { icon: '✓', text: 'Daemon started', time, tone: 'success' };

    default:
      return { icon: '·', text: event.type, time, tone: 'default' };
  }
}
