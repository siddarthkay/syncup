// Line-based 2-way merge.
//
// We don't have a true common ancestor for Syncthing conflicts (the
// protocol doesn't track one — the conflict is just "both sides changed
// since their last shared state, and the resolver has to decide"). A
// 3-way merge needs a base; without one we use a 2-way LCS-anchored
// merge:
//   - Auto-merge runs of lines that one side added and the other left
//     untouched.
//   - Mark runs where both sides diverge as conflict hunks for the user
//     to resolve.
//
// The non-goal: sub-line / character-level merge. For prose notes that's
// usually noise. Line granularity matches how people edit markdown (one
// paragraph or list item at a time).

export interface MergedHunk {
  kind: 'merged';
  lines: string[];
}

export interface ConflictHunk {
  kind: 'conflict';
  // index into the result.hunks array — used as a stable key by the UI.
  id: number;
  a: string[];
  b: string[];
}

export type MergeHunk = MergedHunk | ConflictHunk;

export interface MergeResult {
  hunks: MergeHunk[];
  hasConflicts: boolean;
}

export interface ConflictResolution {
  // 'a' / 'b' picks one side; 'both-ab' / 'both-ba' keeps both in order;
  // 'custom' uses the user-edited text in `customLines`.
  pick: 'a' | 'b' | 'both-ab' | 'both-ba' | 'custom';
  customLines?: string[];
}

export function splitLines(text: string): string[] {
  // Normalize to LF so Windows-edited copies don't collide with mobile-
  // edited copies on \r alone. Keeping a trailing empty for "ends with
  // newline" preservation would complicate the UI without adding value
  // for typical markdown.
  const norm = text.replace(/\r\n?/g, '\n');
  if (norm === '') return [];
  return norm.split('\n');
}

export function joinLines(lines: string[]): string {
  return lines.join('\n');
}

// Patience-style LCS would give nicer-looking diffs on prose, but classic
// O(N*M) DP is good enough for typical note files (<1000 lines) and keeps
// this file dependency-free.
function lcsAnchors(a: string[], b: string[]): { i: number; j: number }[] {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return [];
  // Use a flat Int32Array for speed and memory.
  const dp = new Int32Array((m + 1) * (n + 1));
  const w = n + 1;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i * w + j] = dp[(i - 1) * w + (j - 1)] + 1;
      } else {
        const up = dp[(i - 1) * w + j];
        const left = dp[i * w + (j - 1)];
        dp[i * w + j] = up >= left ? up : left;
      }
    }
  }
  const out: { i: number; j: number }[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.push({ i: i - 1, j: j - 1 });
      i--;
      j--;
    } else if (dp[(i - 1) * w + j] >= dp[i * w + (j - 1)]) {
      i--;
    } else {
      j--;
    }
  }
  return out.reverse();
}

export function merge2(aText: string, bText: string): MergeResult {
  const a = splitLines(aText);
  const b = splitLines(bText);
  const anchors = lcsAnchors(a, b);
  const hunks: MergeHunk[] = [];
  let conflictId = 0;
  let ai = 0;
  let bi = 0;

  const emitGap = (aSlice: string[], bSlice: string[]) => {
    if (aSlice.length === 0 && bSlice.length === 0) return;
    if (aSlice.length === 0) {
      hunks.push({ kind: 'merged', lines: bSlice });
      return;
    }
    if (bSlice.length === 0) {
      hunks.push({ kind: 'merged', lines: aSlice });
      return;
    }
    if (aSlice.length === bSlice.length && aSlice.every((line, i) => line === bSlice[i])) {
      hunks.push({ kind: 'merged', lines: aSlice });
      return;
    }
    hunks.push({
      kind: 'conflict',
      id: conflictId++,
      a: aSlice,
      b: bSlice,
    });
  };

  for (const anchor of anchors) {
    emitGap(a.slice(ai, anchor.i), b.slice(bi, anchor.j));
    hunks.push({ kind: 'merged', lines: [a[anchor.i]] });
    ai = anchor.i + 1;
    bi = anchor.j + 1;
  }
  emitGap(a.slice(ai), b.slice(bi));

  // Collapse consecutive merged hunks for tidier rendering.
  const collapsed: MergeHunk[] = [];
  for (const h of hunks) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.kind === 'merged' && h.kind === 'merged') {
      last.lines = [...last.lines, ...h.lines];
    } else {
      collapsed.push(h);
    }
  }

  return {
    hunks: collapsed,
    hasConflicts: collapsed.some(h => h.kind === 'conflict'),
  };
}

export function applyResolutions(
  result: MergeResult,
  resolutions: Record<number, ConflictResolution>,
): string {
  const out: string[] = [];
  for (const hunk of result.hunks) {
    if (hunk.kind === 'merged') {
      out.push(...hunk.lines);
      continue;
    }
    const r = resolutions[hunk.id];
    if (!r) {
      // Unresolved — caller should have gated on hasUnresolvedConflicts.
      // Keeping both sides labelled is the safest fallback.
      out.push('<<<<<<< this device');
      out.push(...hunk.a);
      out.push('=======');
      out.push(...hunk.b);
      out.push('>>>>>>> other device');
      continue;
    }
    switch (r.pick) {
      case 'a':
        out.push(...hunk.a);
        break;
      case 'b':
        out.push(...hunk.b);
        break;
      case 'both-ab':
        out.push(...hunk.a, ...hunk.b);
        break;
      case 'both-ba':
        out.push(...hunk.b, ...hunk.a);
        break;
      case 'custom':
        out.push(...(r.customLines ?? []));
        break;
    }
  }
  return joinLines(out);
}

export function unresolvedConflictIds(
  result: MergeResult,
  resolutions: Record<number, ConflictResolution>,
): number[] {
  return result.hunks
    .filter((h): h is ConflictHunk => h.kind === 'conflict')
    .map(h => h.id)
    .filter(id => !resolutions[id]);
}
