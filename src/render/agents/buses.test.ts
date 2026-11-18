import { describe, expect, it } from 'vitest';
import { nextLeg } from './buses';

describe('bus legs', () => {
  const route: [number, number][] = [[1, 1], [2, 1], [3, 1]];
  it('drives the route back from the far end, and out again from the near one', () => {
    expect(nextLeg(route, [3, 1])).toEqual([[2, 1], [1, 1]]);
    expect(nextLeg(route, [1, 1])).toEqual([[2, 1], [3, 1]]);
  });
});
