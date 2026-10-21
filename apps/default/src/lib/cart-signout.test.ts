import { afterEach, expect, it, vi } from 'vitest';
import { clearHouseCartOnSignOut } from './cart-signout';

afterEach(() => vi.unstubAllGlobals());

it('clears the cart and notifies open cart views during sign-out', () => {
  const removeItem = vi.fn();
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', { localStorage: { removeItem }, dispatchEvent });
  clearHouseCartOnSignOut();
  expect(removeItem).toHaveBeenCalledWith('house-of-briar:cart');
  expect(dispatchEvent.mock.calls[0][0].type).toBe('house-of-briar-cart');
});

it.each(['access', 'remove'])('does not interrupt sign-out when storage fails during %s', failure => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', {
    get localStorage() {
      if (failure === 'access') throw new Error('Storage blocked');
      return { removeItem() { throw new Error('Storage blocked'); } };
    },
    dispatchEvent,
  });
  expect(() => clearHouseCartOnSignOut()).not.toThrow();
  expect(dispatchEvent.mock.calls[0][0].type).toBe('house-of-briar-cart');
});
