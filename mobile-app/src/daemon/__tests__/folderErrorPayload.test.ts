import {
  buildFolderErrorPayload,
  buildSample,
} from '../folderErrorPayload';

describe('buildFolderErrorPayload', () => {
  it('returns null when the event has no folder id', () => {
    expect(buildFolderErrorPayload({ errors: [{ path: 'a.txt' }] })).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(buildFolderErrorPayload(null)).toBeNull();
    expect(buildFolderErrorPayload(undefined)).toBeNull();
  });

  it('returns count=0 and empty sample when the folder has no errors', () => {
    expect(buildFolderErrorPayload({ folder: 'docs', errors: [] })).toEqual({
      folderId: 'docs',
      count: 0,
      sample: '',
    });
  });

  it('handles a missing errors array as empty', () => {
    expect(buildFolderErrorPayload({ folder: 'docs' })).toEqual({
      folderId: 'docs',
      count: 0,
      sample: '',
    });
  });

  it('counts errors and derives the sample from the first entry', () => {
    expect(
      buildFolderErrorPayload({
        folder: 'docs',
        errors: [
          { path: 'a.txt', error: 'permission denied' },
          { path: 'b.txt', error: 'disk full' },
        ],
      }),
    ).toEqual({
      folderId: 'docs',
      count: 2,
      sample: 'a.txt: permission denied',
    });
  });

  it('uses just the path when the first error has no message', () => {
    expect(
      buildFolderErrorPayload({
        folder: 'docs',
        errors: [{ path: 'only-path.txt' }],
      }),
    ).toEqual({
      folderId: 'docs',
      count: 1,
      sample: 'only-path.txt',
    });
  });

  it('ignores a leading error without a path (preserves count)', () => {
    // daemon still reported it, we just can't show a useful sample
    expect(
      buildFolderErrorPayload({
        folder: 'docs',
        errors: [{ error: 'some failure' }, { path: 'b.txt' }],
      }),
    ).toEqual({
      folderId: 'docs',
      count: 2,
      sample: '',
    });
  });

  it('tolerates non-array errors field', () => {
    expect(
      buildFolderErrorPayload({
        folder: 'docs',
        // @ts-expect-error - testing a malformed payload
        errors: 'not an array',
      }),
    ).toEqual({
      folderId: 'docs',
      count: 0,
      sample: '',
    });
  });
});

describe('buildSample', () => {
  it('returns empty string for undefined', () => {
    expect(buildSample(undefined)).toBe('');
  });

  it('returns empty string when path is missing', () => {
    expect(buildSample({ error: 'orphan error' })).toBe('');
  });

  it('returns just the path when error is missing or empty', () => {
    expect(buildSample({ path: 'x.txt' })).toBe('x.txt');
    expect(buildSample({ path: 'x.txt', error: '' })).toBe('x.txt');
  });

  it('joins path and error with a colon', () => {
    expect(buildSample({ path: 'x.txt', error: 'boom' })).toBe('x.txt: boom');
  });
});
