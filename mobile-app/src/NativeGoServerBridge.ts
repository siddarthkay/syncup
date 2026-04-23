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
  readonly pickSafFolder: () => string;
  readonly getSafPersistedUris: () => string;
  readonly revokeSafPermission: (uri: string) => boolean;
  readonly getSafDisplayName: (uri: string) => string;
  readonly validateSafPermission: (uri: string) => boolean;
  readonly copySafFileToCache: (treeURI: string, relativePath: string) => string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('GoServerBridge');
