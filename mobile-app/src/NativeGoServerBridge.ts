import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  readonly startServer: () => number;
  readonly stopServer: () => boolean;
  readonly getServerPort: () => number;
  readonly getApiKey: () => string;
  readonly getDeviceId: () => string;
  readonly getGuiAddress: () => string;
  readonly getDataDir: () => string;
  readonly listSubdirs: (path: string) => string;
  readonly mkdirSubdir: (parent: string, name: string) => string;
  readonly removeDir: (path: string) => string;
  readonly copyFile: (src: string, dst: string) => string;
  readonly resolvePath: (path: string) => string;
  readonly zipDir: (srcDir: string, dstPath: string) => string;
  readonly setSuspended: (suspended: boolean) => void;
  readonly getWifiOnlySync: () => boolean;
  readonly setWifiOnlySync: (enabled: boolean) => boolean;
  readonly getChargingOnlySync: () => boolean;
  readonly setChargingOnlySync: (enabled: boolean) => boolean;
  readonly getAllowMeteredWifi: () => boolean;
  readonly setAllowMeteredWifi: (enabled: boolean) => boolean;
  readonly getAllowMobileData: () => boolean;
  readonly setAllowMobileData: (enabled: boolean) => boolean;
  readonly openBatteryOptimizationSettings: () => boolean;
  readonly openFolderInFileManager: (path: string) => boolean;
  readonly getFoldersRoot: () => string;
  readonly setFoldersRoot: (path: string) => boolean;
  readonly maybeNotifyFolderErrors: (
    folderId: string,
    count: number,
    label: string,
    sampleError: string,
  ) => boolean;
  /**
   * Present the system folder picker. Cross-platform: Android wraps SAF
   * (`ACTION_OPEN_DOCUMENT_TREE`), iOS wraps `UIDocumentPickerViewController`
   * + security-scoped bookmarks. Returns JSON string:
   *   { ok: true, id, path, displayName, isUbiquitous }  on success,
   *   ""                                                  on cancel.
   */
  readonly pickExternalFolder: () => string;
  /**
   * JSON array of currently-persisted external folders:
   *   [{ id, path, displayName, isStale }]
   * On Android `id === path === content://...`. On iOS `id` is an opaque UUID
   * and `path` is the resolved POSIX path.
   */
  readonly getPersistedExternalFolders: () => string;
  /** Drop access for the folder; returns true if it existed. */
  readonly revokeExternalFolder: (path: string) => boolean;
  /** User-facing name (e.g. "Downloads") for an external folder. */
  readonly getExternalFolderDisplayName: (path: string) => string;
  /** True if the persisted access is still valid (and on iOS, not stale). */
  readonly validateExternalFolder: (path: string) => boolean;
  /**
   * Android-only: copy a SAF file into the app cache so RN preview can load
   * it via file:// URI. Returns the cache path or "" on failure. iOS doesn't
   * need this — once scope is held the path is already a real POSIX file.
   */
  readonly copySafFileToCache: (treeURI: string, relativePath: string) => string;
  /**
   * iOS-only: present QLPreviewController over a list of local file paths.
   * `pathsJson` is a JSON-encoded string array. Asynchronous; returns nothing
   * meaningful — the UI is presented on the key window's root VC. No-op on
   * Android (use the JS-side FilePreviewModal instead).
   */
  readonly previewFileNative: (pathsJson: string, startIndex: number) => void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('GoServerBridge');
