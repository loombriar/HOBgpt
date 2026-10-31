import { afterEach, describe, expect, it, vi } from 'vitest';
import { CART_KEY, readCartIds } from './cart-storage';

afterEach(() => vi.unstubAllGlobals());

function savedCart(raw: string | null) {
  const getItem = vi.fn(() => raw);
  vi.stubGlobal('window', { localStorage: { getItem } });
  return getItem;
}

describe('saved cart recovery', () => {
  it.each([null, '{broken', 'null', '{}', '42', '"piece"'])('recovers invalid cart data %s', raw => {
    savedCart(raw);
    expect(readCartIds()).toEqual([]);
  });

  it('preserves valid piece order and drops duplicates and invalid entries', () => {
    const getItem = savedCart(JSON.stringify(['piece-b', null, 3, '', ' ', {}, 'piece-a', 'piece-b']));
    expect(readCartIds()).toEqual(['piece-b', 'piece-a']);
    expect(getItem).toHaveBeenCalledWith(CART_KEY);
  });

  it('recovers when browser storage access throws', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('Storage blocked'); } });
    expect(readCartIds()).toEqual([]);
  });
});
