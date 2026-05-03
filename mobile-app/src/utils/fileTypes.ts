// Lightweight extension lookups for the file browser. Keeps the big maps
// out of every screen component that needs to know "is this an image?".

export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'archive' | 'other';

const IMAGE_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'avif',
]);

const VIDEO_EXTS = new Set([
  'mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp',
]);

const AUDIO_EXTS = new Set([
  'mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'opus',
]);

const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'rtf', 'csv', 'tsv', 'log',
  'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cc', 'cpp', 'h', 'hpp', 'm', 'mm',
  'sh', 'bash', 'zsh', 'fish', 'ps1',
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  'sql', 'graphql', 'gql', 'proto',
  'gitignore', 'gitattributes', 'dockerignore', 'editorconfig',
  'lock', 'makefile', 'cmake', 'gradle',
]);

const ARCHIVE_EXTS = new Set([
  'zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'zst',
]);

export function fileExt(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0 || i === name.length - 1) return '';
  return name.slice(i + 1).toLowerCase();
}

export function fileKind(name: string): FileKind {
  const e = fileExt(name);
  if (!e) return 'other';
  if (IMAGE_EXTS.has(e)) return 'image';
  if (VIDEO_EXTS.has(e)) return 'video';
  if (AUDIO_EXTS.has(e)) return 'audio';
  if (e === 'pdf') return 'pdf';
  if (TEXT_EXTS.has(e)) return 'text';
  if (ARCHIVE_EXTS.has(e)) return 'archive';
  return 'other';
}

export function kindIconName(kind: FileKind, isDir: boolean): string {
  if (isDir) return 'folder';
  switch (kind) {
    case 'image': return 'image';
    case 'video': return 'videocam';
    case 'audio': return 'musical-note';
    case 'pdf': return 'book';
    case 'text': return 'document-text';
    case 'archive': return 'archive';
    default: return 'document';
  }
}

// Generic conflict filename: "<basename>.sync-conflict-<timestamp>-<id>.<ext>"
export function isConflict(name: string): boolean {
  return /\.sync-conflict-\d{8}-\d{6}-[A-Z0-9]+/.test(name);
}

const MARKDOWN_EXTS = new Set(['md', 'markdown', 'mdx']);

export function isMarkdown(name: string): boolean {
  return MARKDOWN_EXTS.has(fileExt(name));
}
