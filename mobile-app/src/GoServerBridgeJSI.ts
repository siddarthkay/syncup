import NativeGoServerBridge from './NativeGoServerBridge';

export interface GoServerBridgeInterface {
  startServer(): number;
  stopServer(): boolean;
  getServerPort(): number;
  getApiKey(): string;
  getDeviceId(): string;
  getGuiAddress(): string;
  getDataDir(): string;
  listSubdirs(path: string): string;
  mkdirSubdir(parent: string, name: string): string;
  removeDir(path: string): string;
  copyFile(src: string, dst: string): string;
  resolvePath(path: string): string;
  zipDir(srcDir: string, dstPath: string): string;
  setSuspended(suspended: boolean): void;
  getWifiOnlySync(): boolean;
  setWifiOnlySync(enabled: boolean): boolean;
  getChargingOnlySync(): boolean;
  setChargingOnlySync(enabled: boolean): boolean;
  getAllowMeteredWifi(): boolean;
  setAllowMeteredWifi(enabled: boolean): boolean;
  getAllowMobileData(): boolean;
  setAllowMobileData(enabled: boolean): boolean;
  openBatteryOptimizationSettings(): boolean;
  openFolderInFileManager(path: string): boolean;
  getFoldersRoot(): string;
  setFoldersRoot(path: string): boolean;
  hasAllFilesAccess(): boolean;
  requestAllFilesAccess(): boolean;
  maybeNotifyFolderErrors(
    folderId: string,
    count: number,
    label: string,
    sampleError: string,
  ): boolean;
  pickSafFolder(): string;
  getSafPersistedUris(): string;
  revokeSafPermission(uri: string): boolean;
  getSafDisplayName(uri: string): string;
  validateSafPermission(uri: string): boolean;
  copySafFileToCache(treeURI: string, relativePath: string): string;
}

class GoServerBridgeJSI implements GoServerBridgeInterface {
  startServer(): number {
    return NativeGoServerBridge.startServer();
  }

  stopServer(): boolean {
    return NativeGoServerBridge.stopServer();
  }

  getServerPort(): number {
    return NativeGoServerBridge.getServerPort();
  }

  getApiKey(): string {
    return NativeGoServerBridge.getApiKey();
  }

  getDeviceId(): string {
    return NativeGoServerBridge.getDeviceId();
  }

  getGuiAddress(): string {
    return NativeGoServerBridge.getGuiAddress();
  }

  getDataDir(): string {
    return NativeGoServerBridge.getDataDir();
  }

  listSubdirs(path: string): string {
    return NativeGoServerBridge.listSubdirs(path);
  }

  mkdirSubdir(parent: string, name: string): string {
    return NativeGoServerBridge.mkdirSubdir(parent, name);
  }

  removeDir(path: string): string {
    return NativeGoServerBridge.removeDir(path);
  }

  copyFile(src: string, dst: string): string {
    return NativeGoServerBridge.copyFile(src, dst);
  }

  resolvePath(path: string): string {
    return NativeGoServerBridge.resolvePath(path);
  }

  zipDir(srcDir: string, dstPath: string): string {
    return NativeGoServerBridge.zipDir(srcDir, dstPath);
  }

  setSuspended(suspended: boolean): void {
    NativeGoServerBridge.setSuspended(suspended);
  }

  getWifiOnlySync(): boolean {
    return NativeGoServerBridge.getWifiOnlySync();
  }

  setWifiOnlySync(enabled: boolean): boolean {
    return NativeGoServerBridge.setWifiOnlySync(enabled);
  }

  getChargingOnlySync(): boolean {
    return NativeGoServerBridge.getChargingOnlySync();
  }

  setChargingOnlySync(enabled: boolean): boolean {
    return NativeGoServerBridge.setChargingOnlySync(enabled);
  }

  getAllowMeteredWifi(): boolean {
    return NativeGoServerBridge.getAllowMeteredWifi();
  }

  setAllowMeteredWifi(enabled: boolean): boolean {
    return NativeGoServerBridge.setAllowMeteredWifi(enabled);
  }

  getAllowMobileData(): boolean {
    return NativeGoServerBridge.getAllowMobileData();
  }

  setAllowMobileData(enabled: boolean): boolean {
    return NativeGoServerBridge.setAllowMobileData(enabled);
  }

  openBatteryOptimizationSettings(): boolean {
    return NativeGoServerBridge.openBatteryOptimizationSettings();
  }

  openFolderInFileManager(path: string): boolean {
    return NativeGoServerBridge.openFolderInFileManager(path);
  }

  getFoldersRoot(): string {
    return NativeGoServerBridge.getFoldersRoot();
  }

  setFoldersRoot(path: string): boolean {
    return NativeGoServerBridge.setFoldersRoot(path);
  }

  hasAllFilesAccess(): boolean {
    return NativeGoServerBridge.hasAllFilesAccess();
  }

  requestAllFilesAccess(): boolean {
    return NativeGoServerBridge.requestAllFilesAccess();
  }

  maybeNotifyFolderErrors(
    folderId: string,
    count: number,
    label: string,
    sampleError: string,
  ): boolean {
    return NativeGoServerBridge.maybeNotifyFolderErrors(
      folderId,
      count,
      label,
      sampleError,
    );
  }
  pickSafFolder(): string {
    return NativeGoServerBridge.pickSafFolder();
  }

  getSafPersistedUris(): string {
    return NativeGoServerBridge.getSafPersistedUris();
  }

  revokeSafPermission(uri: string): boolean {
    return NativeGoServerBridge.revokeSafPermission(uri);
  }

  getSafDisplayName(uri: string): string {
    return NativeGoServerBridge.getSafDisplayName(uri);
  }

  validateSafPermission(uri: string): boolean {
    return NativeGoServerBridge.validateSafPermission(uri);
  }

  copySafFileToCache(treeURI: string, relativePath: string): string {
    return NativeGoServerBridge.copySafFileToCache(treeURI, relativePath);
  }
}

export default new GoServerBridgeJSI();
