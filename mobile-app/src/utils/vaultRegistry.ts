import AsyncStorage from '@react-native-async-storage/async-storage';
import GoBridge from '../GoServerBridgeJSI';

// Two parallel maps in AsyncStorage:
//   - vaults: which folders the user (or auto-detection) has flagged as
//     Obsidian vaults. We render the watchdog hint and "Open in Obsidian"
//     button on these.
//   - lastSyncs: epoch-ms when each vault folder was last seen idle with
//     zero need bytes. The fetcher in FoldersScreen records this; the
//     card reads it back to show "last synced N min ago".
//
// AsyncStorage is fine here — payloads are tiny (a JSON object keyed by
// folder ID). We don't need a sync-bridge to native because the watchdog
// is in-app surface only in this phase. A native push notification on
// stale sync would require touching BackgroundErrorNotifier.swift, which
// is out of scope.

const VAULTS_KEY = 'syncup.vaults.v1';
const LAST_SYNCS_KEY = 'syncup.vault-last-syncs.v1';

type VaultMap = Record<string, true>;
type LastSyncMap = Record<string, number>;

export const VAULT_STALE_THRESHOLD_MS = 60 * 60 * 1000;

async function readMap<T extends object>(key: string): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {} as T;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

async function writeMap(key: string, value: object): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort
  }
  void pushRegistryToNative();
}

// Mirror to native UserDefaults so the iOS background task can fire a
// stale-vault notification without going through AsyncStorage. Best-effort:
// any failure means the notification just won't fire — sync itself is
// unaffected.
export async function pushRegistryToNative(): Promise<void> {
  try {
    const [vaultsMap, lastSyncs] = await Promise.all([
      readMap<VaultMap>(VAULTS_KEY),
      readMap<LastSyncMap>(LAST_SYNCS_KEY),
    ]);
    const payload = {
      vaults: Object.keys(vaultsMap),
      lastSyncs,
    };
    GoBridge.setVaultRegistry(JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export async function loadVaults(): Promise<Set<string>> {
  const map = await readMap<VaultMap>(VAULTS_KEY);
  return new Set(Object.keys(map));
}

export async function markAsVault(folderId: string): Promise<void> {
  const map = await readMap<VaultMap>(VAULTS_KEY);
  if (map[folderId]) return;
  map[folderId] = true;
  await writeMap(VAULTS_KEY, map);
}

export async function unmarkVault(folderId: string): Promise<void> {
  const map = await readMap<VaultMap>(VAULTS_KEY);
  if (!map[folderId]) return;
  delete map[folderId];
  await writeMap(VAULTS_KEY, map);
}

export async function forgetFolder(folderId: string): Promise<void> {
  // Drop both maps in one pass so a deleted folder doesn't leave behind
  // stale "last sync" or vault entries.
  const [vaults, lastSyncs] = await Promise.all([
    readMap<VaultMap>(VAULTS_KEY),
    readMap<LastSyncMap>(LAST_SYNCS_KEY),
  ]);
  let dirty = false;
  if (vaults[folderId]) {
    delete vaults[folderId];
    await writeMap(VAULTS_KEY, vaults);
    dirty = true;
  }
  if (lastSyncs[folderId] !== undefined) {
    delete lastSyncs[folderId];
    await writeMap(LAST_SYNCS_KEY, lastSyncs);
    dirty = true;
  }
  void dirty;
}

export async function loadLastSyncs(): Promise<LastSyncMap> {
  return readMap<LastSyncMap>(LAST_SYNCS_KEY);
}

export async function recordSync(folderId: string, ts: number): Promise<void> {
  const map = await readMap<LastSyncMap>(LAST_SYNCS_KEY);
  // Don't write back-in-time updates (e.g. a stale poll arriving after a
  // newer one) — they'd flicker the UI.
  if ((map[folderId] ?? 0) >= ts) return;
  map[folderId] = ts;
  await writeMap(LAST_SYNCS_KEY, map);
}

export function formatRelativeTime(now: number, then: number): string {
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function isStale(lastSyncMs: number, now = Date.now()): boolean {
  return now - lastSyncMs > VAULT_STALE_THRESHOLD_MS;
}
