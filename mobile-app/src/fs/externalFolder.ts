import { Platform, Alert } from 'react-native';
import GoBridge from '../GoServerBridgeJSI';
import type { FolderConfig } from '../api/types';

/**
 * Result of a successful folder pick. `id` is opaque (a SAF tree URI on
 * Android, a UUID on iOS); `path` is what the syncthing folder config stores.
 */
export interface PickedExternalFolder {
  id: string;
  path: string;
  displayName: string;
  isUbiquitous: boolean;
}

interface PickResult {
  ok?: boolean;
  id?: string;
  path?: string;
  displayName?: string;
  isUbiquitous?: boolean;
}

/**
 * Present the system folder picker. Returns null if the user cancelled.
 * Cross-platform: Android opens SAF, iOS opens UIDocumentPickerViewController.
 */
export function pickExternalFolder(): PickedExternalFolder | null {
  const raw = GoBridge.pickExternalFolder();
  if (!raw) return null;
  let parsed: PickResult;
  try {
    parsed = JSON.parse(raw) as PickResult;
  } catch {
    return null;
  }
  if (!parsed.ok || !parsed.path) return null;
  return {
    id: parsed.id ?? parsed.path,
    path: parsed.path,
    displayName: parsed.displayName ?? '',
    isUbiquitous: !!parsed.isUbiquitous,
  };
}

/** Same shape as pickExternalFolder, but warns the user once if the picked
 *  folder is iCloud-backed (file materialization can use cellular + storage). */
export function pickExternalFolderWithICloudWarning(
  onAfterWarning?: (folder: PickedExternalFolder | null) => void,
): PickedExternalFolder | null {
  const folder = pickExternalFolder();
  if (folder?.isUbiquitous) {
    Alert.alert(
      'iCloud Drive folder',
      `Files in “${folder.displayName}” live in iCloud and may be downloaded on demand. ` +
        `Syncing this folder can use cellular data and free up storage as files move ` +
        `between devices.`,
      [{ text: 'OK', onPress: () => onAfterWarning?.(folder) }],
    );
  } else if (onAfterWarning) {
    onAfterWarning(folder);
  }
  return folder;
}

/**
 * True if the folder was added through the external/system picker rather than
 * managed inside the app sandbox. Used to drive permission/revoke UI.
 */
export function isExternalFolder(folder: FolderConfig, foldersRoot: string): boolean {
  if (Platform.OS === 'android') {
    return folder.filesystemType === 'saf';
  }
  if (Platform.OS === 'ios') {
    if (!foldersRoot) return false;
    const normalized = foldersRoot.endsWith('/') ? foldersRoot : `${foldersRoot}/`;
    return !folder.path.startsWith(normalized) && folder.path !== foldersRoot;
  }
  return false;
}

/** True if the syncthing-config-level filesystemType this folder should use is 'saf'. */
export function filesystemTypeForExternal(): 'saf' | 'basic' {
  return Platform.OS === 'android' ? 'saf' : 'basic';
}
