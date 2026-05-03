import type { FolderConfig } from '../api/types';

export type FolderPreset = 'generic' | 'obsidian';

export interface PresetDefaults {
  rescanIntervalS: number;
  fsWatcherEnabled: boolean;
  fsWatcherDelayS: number;
  ignorePerms: boolean;
  ignoreLines: string[];
}

// Obsidian rewrites .obsidian/workspace* on every focus change, so a
// long rescan interval shows a frozen UI; a short one + watcher is
// the right shape. Plugin caches and per-device UI state are excluded
// so two devices editing the same vault don't fight over them.
const OBSIDIAN_DEFAULTS: PresetDefaults = {
  rescanIntervalS: 30,
  fsWatcherEnabled: true,
  fsWatcherDelayS: 5,
  ignorePerms: true,
  ignoreLines: [
    '// SyncUp Obsidian preset',
    '.obsidian/workspace',
    '.obsidian/workspace.json',
    '.obsidian/workspace-mobile.json',
    '.obsidian/cache',
    '.obsidian/.metadata.json',
    '.obsidian/plugins/*/data.json',
    '.obsidian/plugins/*/.cache/',
    '.obsidian/community-plugins.json',
    '.trash/',
    '.DS_Store',
    'Thumbs.db',
  ],
};

const GENERIC_DEFAULTS: PresetDefaults = {
  rescanIntervalS: 3600,
  fsWatcherEnabled: true,
  fsWatcherDelayS: 10,
  ignorePerms: true,
  ignoreLines: [],
};

export function presetDefaults(preset: FolderPreset): PresetDefaults {
  return preset === 'obsidian' ? OBSIDIAN_DEFAULTS : GENERIC_DEFAULTS;
}

// SAF folders on Android can't be inotify-watched; preserve the existing
// rescan-only fallback regardless of preset.
export function applyPresetToFolder(
  folder: FolderConfig,
  preset: FolderPreset,
  opts: { isSaf?: boolean } = {},
): FolderConfig {
  const d = presetDefaults(preset);
  return {
    ...folder,
    rescanIntervalS: opts.isSaf ? 60 : d.rescanIntervalS,
    fsWatcherEnabled: opts.isSaf ? false : d.fsWatcherEnabled,
    fsWatcherDelayS: d.fsWatcherDelayS,
    ignorePerms: d.ignorePerms,
  };
}

export function isObsidianMarker(name: string): boolean {
  return name === '.obsidian';
}

export type IgnorePresetId = 'obsidian-minimal' | 'obsidian-recommended' | 'obsidian-strict';

export interface IgnorePreset {
  id: IgnorePresetId;
  label: string;
  description: string;
  lines: string[];
}

const MINIMAL_LINES = [
  '// SyncUp Obsidian preset (minimal)',
  '.obsidian/workspace',
  '.obsidian/workspace.json',
  '.obsidian/workspace-mobile.json',
  '.obsidian/cache',
  '.obsidian/.metadata.json',
  '.trash/',
  '.DS_Store',
  'Thumbs.db',
];

const RECOMMENDED_LINES = [
  '// SyncUp Obsidian preset (recommended)',
  '.obsidian/workspace',
  '.obsidian/workspace.json',
  '.obsidian/workspace-mobile.json',
  '.obsidian/cache',
  '.obsidian/.metadata.json',
  '.obsidian/plugins/*/data.json',
  '.obsidian/plugins/*/.cache/',
  '.obsidian/community-plugins.json',
  '.trash/',
  '.DS_Store',
  'Thumbs.db',
];

const STRICT_LINES = [
  '// SyncUp Obsidian preset (strict): only notes sync, .obsidian/ stays device-local',
  '.obsidian/',
  '.trash/',
  '.DS_Store',
  'Thumbs.db',
];

export const IGNORE_PRESETS: IgnorePreset[] = [
  {
    id: 'obsidian-minimal',
    label: 'Obsidian: minimal',
    description: 'Just the workspace state files that cause conflicts',
    lines: MINIMAL_LINES,
  },
  {
    id: 'obsidian-recommended',
    label: 'Obsidian: recommended',
    description: 'Workspace + plugin caches; theme & plugin list still sync',
    lines: RECOMMENDED_LINES,
  },
  {
    id: 'obsidian-strict',
    label: 'Obsidian: strict',
    description: 'Whole .obsidian/ stays per-device; only notes sync',
    lines: STRICT_LINES,
  },
];
