import { afterEach, expect, it, vi } from 'vitest';
import { readCheckoutSnapshot } from './checkout-snapshot';
afterEach(() => vi.unstubAllGlobals());
const valid = { ids: ['piece'], items: [{ id: 'piece', name: 'Dress', amount: 90, quantity: 1 }], subtotal: 90 };
function save(value: unknown) { vi.stubGlobal('window', { localStorage: { getItem: () => JSON.stringify(value) } }); }
it('restores a valid checkout display snapshot', () => { save(valid); expect(readCheckoutSnapshot()).toEqual(valid); });
it.each([
 null, {}, {...valid, subtotal: '90'}, {...valid, subtotal: -1}, {...valid, ids: [null]},
 {...valid, items: [null]}, {...valid, items: [{...valid.items[0], amount:'90'}]},
 {...valid, items: [{...valid.items[0], quantity:2}]}, {...valid, items: [{...valid.items[0], id:'other'}]},
 {...valid, ids:['piece','piece'], items:[valid.items[0],valid.items[0]]},
 {...valid, items: [{...valid.items[0], name:null}]}, {...valid, items:[]},
])('ignores damaged or mismatched snapshot %#', value => { save(value); expect(readCheckoutSnapshot()).toBeNull(); });
it('ignores malformed JSON', () => { vi.stubGlobal('window', { localStorage:{getItem:()=>'{broken'} }); expect(readCheckoutSnapshot()).toBeNull(); });
it('ignores denied storage access', () => { vi.stubGlobal('window', { get localStorage(){throw new Error('Denied');} }); expect(readCheckoutSnapshot()).toBeNull(); });
