import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { copyFile } from '../fs/bridgeFs';

export type FolderStructure = 'flat' | 'byDate' | 'byYearMonth';
export type MediaFilter = 'photo' | 'video' | 'all';

export interface PhotoBackupConfig {
  enabled: boolean;
  folderId: string;
  folderPath: string;
  folderLabel: string;
  structure: FolderStructure;
  mediaFilter: MediaFilter;
}

export interface BackupProgress {
  phase: 'idle' | 'scanning' | 'copying' | 'done' | 'error';
  total: number;
  copied: number;
  skipped: number;
  errorMessage?: string;
  lastSkipReason?: string;
}

const CONFIG_KEY = 'photoBackup:config';
const BACKED_UP_KEY = 'photoBackup:assetIds';

export async function loadConfig(): Promise<PhotoBackupConfig | null> {
  const raw = await AsyncStorage.getItem(CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PhotoBackupConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: PhotoBackupConfig): Promise<void> {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export async function clearConfig(): Promise<void> {
  await AsyncStorage.removeItem(CONFIG_KEY);
  await AsyncStorage.removeItem(BACKED_UP_KEY);
}

async function loadBackedUpIds(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(BACKED_UP_KEY);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

async function saveBackedUpIds(ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(BACKED_UP_KEY, JSON.stringify(Array.from(ids)));
}

function destPath(
  asset: MediaLibrary.Asset,
  structure: FolderStructure,
): string {
  const name = asset.filename;
  // creationTime is milliseconds on iOS, seconds on some Android versions
  const raw = asset.creationTime;
  const date = new Date(raw < 1e12 ? raw * 1000 : raw);

  switch (structure) {
    case 'byDate': {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}/${name}`;
    }
    case 'byYearMonth': {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      return `${y}/${m}/${name}`;
    }
    case 'flat':
    default:
      return name;
  }
}

export async function runBackup(
  config: PhotoBackupConfig,
  onProgress: (p: BackupProgress) => void,
  signal?: { cancelled: boolean },
  refreshFolderPath?: () => Promise<string | null>,
): Promise<BackupProgress> {
  const progress: BackupProgress = {
    phase: 'scanning',
    total: 0,
    copied: 0,
    skipped: 0,
  };
  onProgress({ ...progress });

  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    progress.phase = 'error';
    progress.errorMessage = 'Photo library permission denied. Grant access in Settings.';
    onProgress({ ...progress });
    return progress;
  }

  // Always use the LIVE folder path from the daemon, not the stale
  // one saved in config. iOS rotates container UUIDs on reinstall,
  // making stored absolute paths invalid.
  let folderPath = config.folderPath;
  if (refreshFolderPath) {
    const fresh = await refreshFolderPath();
    if (fresh) {
      folderPath = fresh;
      if (folderPath !== config.folderPath) {
        await saveConfig({ ...config, folderPath });
      }
    }
  }

  const backedUp = await loadBackedUpIds();

  const mediaType: MediaLibrary.MediaTypeValue[] = (() => {
    switch (config.mediaFilter) {
      case 'photo':
        return [MediaLibrary.MediaType.photo];
      case 'video':
        return [MediaLibrary.MediaType.video];
      default:
        return [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video];
    }
  })();

  let hasMore = true;
  let after: string | undefined;
  const toBackUp: MediaLibrary.Asset[] = [];

  while (hasMore) {
    if (signal?.cancelled) break;
    const page = await MediaLibrary.getAssetsAsync({
      mediaType,
      first: 100,
      after,
      sortBy: [MediaLibrary.SortBy.creationTime],
    });
    for (const asset of page.assets) {
      if (!backedUp.has(asset.id)) {
        toBackUp.push(asset);
      }
    }
    hasMore = page.hasNextPage;
    after = page.endCursor;
  }

  progress.total = toBackUp.length;
  progress.phase = 'copying';
  onProgress({ ...progress });

  if (toBackUp.length === 0) {
    progress.phase = 'done';
    onProgress({ ...progress });
    return progress;
  }

  const plainPath = folderPath.replace(/^file:\/\//, '');
  const folderUri = `file://${plainPath}`;

  for (const asset of toBackUp) {
    if (signal?.cancelled) break;

    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset);

      // Build a list of candidate source URIs. localUri is preferred
      // (it's a file:// path for on-device assets). asset.uri is the
      // fallback and may be a content:// (Android) or ph:// (iOS) URI.
      const candidates: string[] = [];
      if (info.localUri) candidates.push(info.localUri);
      if (asset.uri && asset.uri !== info.localUri) candidates.push(asset.uri);

      if (candidates.length === 0) {
        progress.skipped++;
        progress.lastSkipReason = `"${asset.filename}": no URI available (iCloud-only?)`;
        onProgress({ ...progress });
        continue;
      }

      const rel = destPath(asset, config.structure);
      const targetUri = `${folderUri}/${rel}`;

      const lastSlash = targetUri.lastIndexOf('/');
      if (lastSlash > 0) {
        const parentDir = targetUri.slice(0, lastSlash);
        try {
          await FileSystem.makeDirectoryAsync(parentDir, { intermediates: true });
        } catch {
          // directory may already exist
        }
      }

      const exists = await FileSystem.getInfoAsync(targetUri);
      if (exists.exists) {
        backedUp.add(asset.id);
        progress.skipped++;
        progress.lastSkipReason = `"${asset.filename}" already on disk`;
        onProgress({ ...progress });
        continue;
      }

      // Use the Go bridge for the copy. It has direct filesystem access
      // without expo-file-system's sandbox restrictions, and handles
      // any path the daemon can write to.
      let copied = false;
      let lastErr = '';

      for (const sourceUri of candidates) {
        if (copied) break;
        // strip file:// prefix for the Go bridge which takes plain paths
        const srcPath = sourceUri.replace(/^file:\/\//, '');
        const dstPath = targetUri.replace(/^file:\/\//, '');
        try {
          copyFile(srcPath, dstPath);
          copied = true;
          break;
        } catch (e) {
          lastErr = `${srcPath.substring(srcPath.lastIndexOf('/') + 1)}: ${e instanceof Error ? e.message : String(e)}`;
        }
      }

      if (copied) {
        backedUp.add(asset.id);
        progress.copied++;
      } else {
        progress.skipped++;
        progress.lastSkipReason = `"${asset.filename}": ${lastErr}`;
      }
      onProgress({ ...progress });

      if (progress.copied % 20 === 0 && progress.copied > 0) {
        await saveBackedUpIds(backedUp);
      }
    } catch (e) {
      progress.skipped++;
      progress.lastSkipReason = `"${asset.filename}": ${e instanceof Error ? e.message : String(e)}`;
      onProgress({ ...progress });
    }
  }

  await saveBackedUpIds(backedUp);
  progress.phase = 'done';
  onProgress({ ...progress });
  return progress;
}
