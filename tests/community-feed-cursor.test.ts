import { describe, expect, test } from 'bun:test';
import { nextFeedCursor, nextFeedPosition } from '../src/lib/communityFeedCursor';

const position = (id: string, createdAt = '2026-10-26T12:00:00Z') => ({ id, createdAt });

describe('mixed community feed pagination', () => {
  test('continues comments after posts run out, and posts after comments run out', () => {
    expect(nextFeedCursor([], [position('b'), position('a')], 2)).toEqual({ posts: false, comments: position('a') });
    expect(nextFeedCursor([position('b'), position('a')], [], 2)).toEqual({ posts: position('a'), comments: false });
    expect(nextFeedCursor([], [], 2)).toBeUndefined();
  });

  test('uses chronological cursor even when personalization rearranges posts', () => {
    const older = position('z', '2026-10-25T12:00:00Z');
    expect(nextFeedPosition([older, position('a')], 2)).toEqual(older);
  });

  test('uses the id to continue through comments with identical timestamps', () => {
    expect(nextFeedPosition([position('c'), position('a'), position('b')], 3)).toEqual(position('a'));
  });
});
