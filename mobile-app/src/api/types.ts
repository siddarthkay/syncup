// Subset we actually consume. Full schemas: https://docs.syncthing.net/dev/rest.html

export interface SystemStatus {
  myID: string;
  uptime: number;
  goroutines: number;
  cpuPercent: number;
  alloc: number;
  sys: number;
  tilde: string;
  pathSeparator: string;
  startTime: string;
  connectionServiceStatus?: Record<string, unknown>;
  discoveryEnabled?: boolean;
  discoveryErrors?: Record<string, string>;
  lastDialStatus?: Record<string, unknown>;
}

export interface SystemVersion {
  version: string;
  longVersion: string;
  codename: string;
  os: string;
  arch: string;
  isBeta: boolean;
  isCandidate: boolean;
  isRelease: boolean;
}

// Empty `type` = no versioning. `params` is string-keyed because the REST API
// serializes every versioner option as a string. We skip `external` (shell
// command, nonsensical on mobile).
export interface FolderVersioning {
  type: string;
  params: Record<string, string>;
  cleanupIntervalS: number;
  fsPath: string;
  fsType: string;
}

export type PullOrder =
  | 'random'
  | 'alphabetic'
  | 'smallestFirst'
  | 'largestFirst'
  | 'oldestFirst'
  | 'newestFirst';

// `unit` is '%' or a byte suffix ('kB', 'MB', 'GB', 'TB').
export interface MinDiskFree {
  value: number;
  unit: string;
}

export interface FolderConfig {
  id: string;
  label: string;
  filesystemType: string;
  path: string;
  type: 'sendreceive' | 'sendonly' | 'receiveonly' | 'receiveencrypted';
  devices: { deviceID: string; introducedBy: string; encryptionPassword: string }[];
  rescanIntervalS: number;
  fsWatcherEnabled: boolean;
  fsWatcherDelayS: number;
  ignorePerms: boolean;
  autoNormalize: boolean;
  paused: boolean;
  markerName: string;
  order: PullOrder;
  minDiskFree: MinDiskFree;
  syncOwnership: boolean;
  sendOwnership: boolean;
  syncXattrs: boolean;
  sendXattrs: boolean;
  versioning: FolderVersioning;
}

export interface DeviceConfig {
  deviceID: string;
  name: string;
  addresses: string[];
  compression: string;
  certName: string;
  introducer: boolean;
  paused: boolean;
  allowedNetworks: string[];
  autoAcceptFolders: boolean;
  maxSendKbps: number;
  maxRecvKbps: number;
}

export interface SystemLogMessage {
  when: string;
  level: number;
  message: string;
}

export interface SystemLogResponse {
  messages: SystemLogMessage[];
}

// REST tolerates partial PATCH so we only model the fields we edit.
// urAccepted: -1 declined, 0 undecided, >=1 accepted (consent version).
export interface Options {
  listenAddresses: string[];
  globalAnnounceEnabled: boolean;
  globalAnnounceServers: string[];
  localAnnounceEnabled: boolean;
  localAnnouncePort: number;
  relaysEnabled: boolean;
  natEnabled: boolean;
  maxSendKbps: number;
  maxRecvKbps: number;
  limitBandwidthInLan: boolean;
  urAccepted: number;
  startBrowser: boolean;
}

export interface Config {
  version: number;
  folders: FolderConfig[];
  devices: DeviceConfig[];
  options?: Options;
}

export type FolderState =
  | 'idle'
  | 'scanning'
  | 'syncing'
  | 'sync-waiting'
  | 'sync-preparing'
  | 'cleaning'
  | 'cleanWaiting'
  | 'error'
  | 'unknown';

export interface DbStatus {
  globalBytes: number;
  globalDeleted: number;
  globalDirectories: number;
  globalFiles: number;
  globalSymlinks: number;
  globalTotalItems: number;
  inSyncBytes: number;
  inSyncFiles: number;
  localBytes: number;
  localDeleted: number;
  localDirectories: number;
  localFiles: number;
  localSymlinks: number;
  localTotalItems: number;
  needBytes: number;
  needDeletes: number;
  needDirectories: number;
  needFiles: number;
  needSymlinks: number;
  needTotalItems: number;
  receiveOnlyChangedBytes: number;
  receiveOnlyChangedDeletes: number;
  receiveOnlyChangedDirectories: number;
  receiveOnlyChangedFiles: number;
  receiveOnlyChangedSymlinks: number;
  receiveOnlyTotalItems: number;
  sequence: number;
  state: FolderState;
  stateChanged: string;
  version: number;
  error?: string;
}

// `ignore` is raw .stignore lines, `expanded` is what syncthing compiled them
// into (flattened includes, etc). We only edit `ignore`.
export interface IgnoresResponse {
  ignore: string[] | null;
  expanded: string[] | null;
  errors?: string[] | null;
}

// `path` is relative to the folder root.
export interface FolderError {
  path: string;
  error: string;
}

// /rest/db/browse returns a tree of these. `type` is the stringified
// protocol.FileInfoType: "FILE_INFO_TYPE_FILE", "FILE_INFO_TYPE_DIRECTORY",
// or "FILE_INFO_TYPE_SYMLINK". `children` is omitted unless the call asked
// for more than one level of depth.
export interface NeedFile {
  name: string;
  size: number;
  type: string;
  modified: string;
  deleted: boolean;
  invalid: boolean;
  noPermissions: boolean;
  sequence: number;
  numBlocks: number;
}

export interface TreeEntry {
  name: string;
  modTime: string;
  size: number;
  type: string;
  children?: TreeEntry[];
}

export interface FolderErrorsResponse {
  folder: string;
  errors: FolderError[] | null;
}

export interface ConnectionInfo {
  at: string;
  inBytesTotal: number;
  outBytesTotal: number;
  startedAt: string;
  connected: boolean;
  paused: boolean;
  clientVersion: string;
  address: string;
  type: string;
  isLocal: boolean;
  crypto: string;
}

export interface ConnectionsTotal {
  at: string;
  inBytesTotal: number;
  outBytesTotal: number;
}

export interface Connections {
  connections: Record<string, ConnectionInfo>;
  total: ConnectionsTotal;
}

export interface Completion {
  completion: number;
  globalBytes: number;
  globalItems: number;
  needBytes: number;
  needDeletes: number;
  needItems: number;
  remoteState: string;
  sequence: number;
}

// /rest/cluster/pending/folders:
//   { "<folder-id>": { "offeredBy": { "<device-id>": PendingFolderOfferDetail } } }
export interface PendingFolderOfferDetail {
  time: string;
  label: string;
  receiveEncrypted: boolean;
  remoteEncrypted: boolean;
}

export interface PendingFolderEntry {
  offeredBy: Record<string, PendingFolderOfferDetail>;
}

export type PendingFolders = Record<string, PendingFolderEntry>;

// flattened: one row per (folder, offering device) pair
export interface PendingFolderOffer {
  folderId: string;
  deviceId: string;
  label: string;
  time: string;
  receiveEncrypted: boolean;
  remoteEncrypted: boolean;
}

export interface PendingDeviceEntry {
  time: string;
  name: string;
  address: string;
}

export type PendingDevices = Record<string, PendingDeviceEntry>;

export interface PendingDeviceOffer {
  deviceId: string;
  name: string;
  address: string;
  time: string;
}
