import { afterEach, expect, it, vi } from 'vitest';
import { readProductIds } from './product-id-storage';
import { getSavedProductIds, SAVED_PRODUCTS_KEY } from './marketplace';

afterEach(() => vi.unstubAllGlobals());

it.each(['access', 'read'])('recovers saved pieces and likes when storage fails during %s', failure => {
  vi.stubGlobal('window', {
    get localStorage() {
      if (failure === 'access') throw new Error('SecurityError');
      return { getItem() { throw new Error('Storage unavailable'); } };
    },
  });
  expect(getSavedProductIds()).toEqual([]);
  expect(readProductIds('house-of-briar:liked-products')).toEqual([]);
});
it.each([null, '{broken', 'null', '{}', '5'])('recovers unreadable saved data %s', raw => {
  vi.stubGlobal('window', { localStorage: { getItem: () => raw } });
  expect(getSavedProductIds()).toEqual([]);
});
it('keeps valid saved identifiers and reads the saved-products key', () => {
  const getItem = vi.fn(() => JSON.stringify(['piece-a', null, 2, {}, 'piece-b']));
  vi.stubGlobal('window', { localStorage: { getItem } });
  expect(getSavedProductIds()).toEqual(['piece-a', 'piece-b']);
  expect(getItem).toHaveBeenCalledWith(SAVED_PRODUCTS_KEY);
});
it('works without a browser window', () => {
  vi.stubGlobal('window', undefined);
  expect(getSavedProductIds()).toEqual([]);
});
