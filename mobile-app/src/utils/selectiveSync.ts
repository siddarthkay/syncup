// Selective sync via .stignore manipulation. A folder is "selective" when
// its ignore list ends with a catch-all `*` and every preceding line is
// a `!/path` un-ignore.

const SPECIAL_CHARS = ['\\', '!', '*', '?', '[', ']', '{', '}'];

function escapePath(path: string): string {
  let out = path;
  for (const ch of SPECIAL_CHARS) {
    out = out.split(ch).join('\\' + ch);
  }
  return out;
}

function unescapePath(line: string): string {
  let out = line;
  for (const ch of SPECIAL_CHARS) {
    out = out.split('\\' + ch).join(ch);
  }
  return out;
}

function ignoreLineForPath(path: string): string {
  return '!/' + escapePath(path);
}

function pathForIgnoreLine(line: string): string {
  return unescapePath(line.replace(/^!\//, ''));
}

export function isSelectiveIgnoreList(lines: string[]): boolean {
  if (lines.length === 0) return false;
  for (let i = 0; i < lines.length; i++) {
    if (i === lines.length - 1) {
      if (lines[i] !== '*') return false;
    } else {
      if (!lines[i].startsWith('!')) return false;
    }
  }
  return true;
}

export function getSelectedPaths(lines: string[]): string[] {
  const paths: string[] = [];
  for (const line of lines) {
    if (line.startsWith('!')) {
      paths.push(pathForIgnoreLine(line));
    }
  }
  return paths;
}

export function isPathSelected(lines: string[], path: string): boolean {
  const targetLine = ignoreLineForPath(path);
  for (const line of lines) {
    if (line === targetLine) return true;
    // parent directory selected = this path is implicitly selected
    if (line.startsWith('!') && targetLine.startsWith(line + '/')) return true;
  }
  return false;
}

export function enableSelective(lines: string[]): string[] {
  // if already selective, return as-is
  if (isSelectiveIgnoreList(lines)) return lines;
  // start fresh: ignore everything
  return ['*'];
}

export function disableSelective(): string[] {
  return [];
}

export function selectPath(lines: string[], path: string): string[] {
  const line = ignoreLineForPath(path);
  if (lines.includes(line)) return lines;

  // remove any children that are already selected (parent covers them)
  const filtered = lines.filter(l => {
    if (!l.startsWith('!')) return true;
    return !l.startsWith(line + '/');
  });

  // insert before the `*` at the end
  const starIdx = filtered.lastIndexOf('*');
  if (starIdx >= 0) {
    filtered.splice(starIdx, 0, line);
  } else {
    filtered.push(line);
    filtered.push('*');
  }
  return filtered;
}

export function deselectPath(lines: string[], path: string): string[] {
  const line = ignoreLineForPath(path);
  return lines.filter(l => l !== line);
}

export function togglePath(lines: string[], path: string): string[] {
  if (isPathSelected(lines, path)) {
    return deselectPath(lines, path);
  }
  return selectPath(lines, path);
}
