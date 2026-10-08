import {afterEach,expect,it,vi} from 'vitest';
import {getCatalogProducts} from './marketplace';
afterEach(()=>vi.unstubAllGlobals());
it('keeps an empty moderated shop empty instead of restoring demo listings',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({items:[]})}));
  expect(await getCatalogProducts(false)).toEqual([]);
});
it('reports unavailable catalog data without restoring demo listings',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));
  await expect(getCatalogProducts(false)).rejects.toThrow('Marketplace gallery unavailable');
});
