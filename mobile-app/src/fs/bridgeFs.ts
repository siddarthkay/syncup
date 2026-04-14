import GoBridge from '../GoServerBridgeJSI';

export interface FsEntry {
  name: string;
  isDir: boolean;
  /** Bytes; 0 for directories. */
  size: number;
  /** RFC3339 from the daemon, or empty if stat failed. */
  modTime: string;
}

export interface FsListing {
  path: string;
  entries: FsEntry[];
}

interface RawResult {
  path?: string;
  entries?: FsEntry[];
  error?: string;
}

function parse(raw: string): RawResult {
  try {
    return JSON.parse(raw) as RawResult;
  } catch (e) {
    return { error: `bad JSON from native bridge: ${String(e)}` };
  }
}

export function listSubdirs(path: string): FsListing {
  const r = parse(GoBridge.listSubdirs(path));
  if (r.error) throw new Error(r.error);
  return { path: r.path ?? path, entries: r.entries ?? [] };
}

export function mkdirSubdir(parent: string, name: string): string {
  const r = parse(GoBridge.mkdirSubdir(parent, name));
  if (r.error) throw new Error(r.error);
  if (!r.path) throw new Error('mkdirSubdir returned no path');
  return r.path;
}

export function removeDir(path: string): void {
  const r = parse(GoBridge.removeDir(path));
  if (r.error) throw new Error(r.error);
}

export function resolvePath(path: string): string {
  const r = parse(GoBridge.resolvePath(path));
  if (r.error) throw new Error(r.error);
  if (!r.path) throw new Error('resolvePath returned no path');
  return r.path;
}

export function zipDir(srcDir: string, dstPath: string): string {
  const r = parse(GoBridge.zipDir(srcDir, dstPath));
  if (r.error) throw new Error(r.error);
  if (!r.path) throw new Error('zipDir returned no path');
  return r.path;
}

export function copyFile(src: string, dst: string): string {
  const r = parse(GoBridge.copyFile(src, dst));
  if (r.error) throw new Error(r.error);
  if (!r.path) throw new Error('copyFile returned no path');
  return r.path;
}
