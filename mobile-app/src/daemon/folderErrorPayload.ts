// pure helpers split out of SyncNotifier so tests don't need bridge mocks

export interface FolderErrorItem {
  path?: string;
  error?: string;
}

export interface FolderErrorsEventData {
  folder?: string;
  errors?: FolderErrorItem[];
}

export interface FolderErrorPayload {
  folderId: string;
  count: number;
  sample: string;
}

// null = malformed, caller skips the bridge call
export function buildFolderErrorPayload(
  data: FolderErrorsEventData | null | undefined,
): FolderErrorPayload | null {
  if (!data) return null;
  const folderId = data.folder;
  if (!folderId) return null;

  const errors = Array.isArray(data.errors) ? data.errors : [];
  const count = errors.length;

  const sample = buildSample(errors[0]);
  return { folderId, count, sample };
}

export function buildSample(first: FolderErrorItem | undefined): string {
  if (!first?.path) return '';
  if (first.error && first.error.length > 0) {
    return `${first.path}: ${first.error}`;
  }
  return first.path;
}
