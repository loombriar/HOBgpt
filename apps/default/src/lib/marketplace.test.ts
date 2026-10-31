import {afterEach,expect,it,vi} from 'vitest';
import {getCatalogProducts,getPersistentFavoriteIds,SAVED_PRODUCTS_KEY} from './marketplace';
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

it.each([401, 503])('preserves guest favorites when transfer returns HTTP %s',async status=>{
 const stored=JSON.stringify(['guest-piece']);
 const getItem=vi.fn(()=>stored),setItem=vi.fn(),dispatchEvent=vi.fn();
 vi.stubGlobal('window',{localStorage:{getItem,setItem},dispatchEvent});
 const request=vi.fn().mockResolvedValue(new Response('{}',{status}));
 vi.stubGlobal('fetch',request);
 await expect(getPersistentFavoriteIds('__house_session__')).rejects.toThrow('Saved pieces could not be transferred');
 expect(request).toHaveBeenCalledTimes(1);
 expect(request.mock.calls[0][0]).toBe('/api/my/favorites/merge');
 expect(setItem).not.toHaveBeenCalled();
 expect(dispatchEvent).not.toHaveBeenCalled();
});
it('loads and caches account favorites only after guest transfer succeeds',async()=>{
 const setItem=vi.fn(),dispatchEvent=vi.fn();
 vi.stubGlobal('window',{localStorage:{getItem:()=>JSON.stringify(['guest-piece']),setItem},dispatchEvent});
 const request=vi.fn().mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response(JSON.stringify({ids:['guest-piece','account-piece']})));
 vi.stubGlobal('fetch',request);
 expect(await getPersistentFavoriteIds('__house_session__')).toEqual(['guest-piece','account-piece']);
 expect(request.mock.calls.map(call=>call[0])).toEqual(['/api/my/favorites/merge','/api/my/favorites']);
 expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({listingIds:['guest-piece']});
 expect(setItem).toHaveBeenCalledWith(SAVED_PRODUCTS_KEY,JSON.stringify(['guest-piece','account-piece']));
});
it('preserves guest favorites when the transfer connection fails',async()=>{
 const setItem=vi.fn();
 vi.stubGlobal('window',{localStorage:{getItem:()=>JSON.stringify(['guest-piece']),setItem}});
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('Connection interrupted')));
 await expect(getPersistentFavoriteIds('__house_session__')).rejects.toThrow('Connection interrupted');
 expect(setItem).not.toHaveBeenCalled();
});
