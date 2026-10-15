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
it('shows the designer supplied size instead of labelling every garment one of one',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({items:[{id:'sized',title:'Dress',price:50,size:'Large'},{id:'unsized',title:'Top',price:30}]})}));
  const items=await getCatalogProducts(false);
  expect(items[0].fieldValues['/attributes/@sizex']).toBe('Large');
  expect(items[1].fieldValues['/attributes/@sizex']).toBe('See measurements');
});
