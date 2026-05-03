import {
  applyResolutions,
  merge2,
  splitLines,
  unresolvedConflictIds,
  type ConflictResolution,
} from '../markdownMerge';

describe('splitLines', () => {
  it('returns empty array on empty string', () => {
    expect(splitLines('')).toEqual([]);
  });

  it('normalizes CRLF and CR to LF', () => {
    expect(splitLines('a\r\nb\rc')).toEqual(['a', 'b', 'c']);
  });

  it('preserves trailing empty lines from terminal newlines', () => {
    // 'a\n' is "line a, then nothing after the separator" — split keeps the
    // trailing empty so a round-trip preserves the final newline shape.
    expect(splitLines('a\n')).toEqual(['a', '']);
  });
});

describe('merge2', () => {
  it('reports no conflicts when sides are identical', () => {
    const r = merge2('hello\nworld', 'hello\nworld');
    expect(r.hasConflicts).toBe(false);
    expect(applyResolutions(r, {})).toBe('hello\nworld');
  });

  it('auto-merges when only A added lines and B is unchanged', () => {
    const a = 'top\nA-added\nshared';
    const b = 'top\nshared';
    const r = merge2(a, b);
    expect(r.hasConflicts).toBe(false);
    expect(applyResolutions(r, {})).toBe('top\nA-added\nshared');
  });

  it('auto-merges when only B added lines and A is unchanged', () => {
    const a = 'top\nshared';
    const b = 'top\nB-added\nshared';
    const r = merge2(a, b);
    expect(r.hasConflicts).toBe(false);
    expect(applyResolutions(r, {})).toBe('top\nB-added\nshared');
  });

  it('auto-merges non-overlapping additions on both sides', () => {
    // Common prefix and suffix; A added one line at top, B added another at
    // bottom. With our LCS-anchored merge there is no conflict here.
    const a = 'A-only\nshared-1\nshared-2';
    const b = 'shared-1\nshared-2\nB-only';
    const r = merge2(a, b);
    expect(r.hasConflicts).toBe(false);
    expect(applyResolutions(r, {})).toBe('A-only\nshared-1\nshared-2\nB-only');
  });

  it('produces a conflict hunk when both sides edit the same line', () => {
    const a = 'top\nA-version\nbottom';
    const b = 'top\nB-version\nbottom';
    const r = merge2(a, b);
    expect(r.hasConflicts).toBe(true);
    const conflicts = r.hunks.filter(h => h.kind === 'conflict');
    expect(conflicts).toHaveLength(1);
    if (conflicts[0].kind === 'conflict') {
      expect(conflicts[0].a).toEqual(['A-version']);
      expect(conflicts[0].b).toEqual(['B-version']);
    }
  });

  it('applies pick=a / pick=b / pick=both resolutions correctly', () => {
    const r = merge2('top\nA-version\nbottom', 'top\nB-version\nbottom');
    const conflict = r.hunks.find(h => h.kind === 'conflict');
    if (!conflict || conflict.kind !== 'conflict') throw new Error('expected conflict');
    const id = conflict.id;

    const pickA: Record<number, ConflictResolution> = { [id]: { pick: 'a' } };
    expect(applyResolutions(r, pickA)).toBe('top\nA-version\nbottom');

    const pickB: Record<number, ConflictResolution> = { [id]: { pick: 'b' } };
    expect(applyResolutions(r, pickB)).toBe('top\nB-version\nbottom');

    const both: Record<number, ConflictResolution> = { [id]: { pick: 'both-ab' } };
    expect(applyResolutions(r, both)).toBe('top\nA-version\nB-version\nbottom');

    const bothBA: Record<number, ConflictResolution> = { [id]: { pick: 'both-ba' } };
    expect(applyResolutions(r, bothBA)).toBe('top\nB-version\nA-version\nbottom');
  });

  it('applies a custom resolution', () => {
    const r = merge2('top\nA\nbottom', 'top\nB\nbottom');
    const conflict = r.hunks.find(h => h.kind === 'conflict');
    if (!conflict || conflict.kind !== 'conflict') throw new Error('expected conflict');
    const resolutions: Record<number, ConflictResolution> = {
      [conflict.id]: { pick: 'custom', customLines: ['MERGED'] },
    };
    expect(applyResolutions(r, resolutions)).toBe('top\nMERGED\nbottom');
  });

  it('emits conflict markers when called with no resolution', () => {
    const r = merge2('top\nA\nbottom', 'top\nB\nbottom');
    const out = applyResolutions(r, {});
    expect(out).toContain('<<<<<<< this device');
    expect(out).toContain('=======');
    expect(out).toContain('>>>>>>> other device');
  });

  it('handles one-sided empty input', () => {
    expect(applyResolutions(merge2('', 'only B'), {})).toBe('only B');
    expect(applyResolutions(merge2('only A', ''), {})).toBe('only A');
  });

  it('reports unresolved conflict ids accurately', () => {
    const r = merge2('top\nA1\nmiddle\nA2\nbottom', 'top\nB1\nmiddle\nB2\nbottom');
    const conflicts = r.hunks.filter(h => h.kind === 'conflict');
    expect(conflicts).toHaveLength(2);
    expect(unresolvedConflictIds(r, {})).toHaveLength(2);
    if (conflicts[0].kind !== 'conflict') throw new Error('unreachable');
    const partial: Record<number, ConflictResolution> = {
      [conflicts[0].id]: { pick: 'a' },
    };
    expect(unresolvedConflictIds(r, partial)).toHaveLength(1);
  });

  it('treats a deleted line on one side and unchanged on the other as a clean delete', () => {
    // A removed the middle line, B kept it. With no shared "base" we can't
    // tell who deleted vs who added — so we expect the algorithm to keep
    // both, which means *no* lines disappear silently. This documents the
    // 2-way limitation so future-you is not surprised.
    const a = 'top\nbottom';
    const b = 'top\nmiddle\nbottom';
    const r = merge2(a, b);
    expect(r.hasConflicts).toBe(false);
    expect(applyResolutions(r, {})).toBe('top\nmiddle\nbottom');
  });
});
