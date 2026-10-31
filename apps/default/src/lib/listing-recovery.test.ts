import {describe,it,expect} from 'vitest';
import {readListingRecovery,writeListingRecovery} from './listing-recovery';
const values={name:'Linen shirt',price:'',description:'Hand finished',garmentMeasurements:'',fitNotes:'',materials:'',careInstructions:'',aesthetic:'',seoTitle:'',seoDescription:'',seoTags:'',shareImageUrl:'',handlingMin:'',handlingMax:'',internationalShipping:false,sku:'',stockQuantity:'1',lowStockThreshold:'1',category:'Clothing',style:'',stockPlacement:'floor' as const,pieceType:'One of a Kind' as const,step:2};
describe('unfinished listing recovery',()=>{
 it('round trips incomplete text and current step without requiring price or photos',()=>{
  const entries=new Map<string,string>();const storage={setItem:(k:string,v:string)=>{entries.set(k,v);},removeItem:(k:string)=>{entries.delete(k);}};
  writeListingRecovery(storage,'designer-one',values);
  expect(readListingRecovery(entries.get('designer-one')!)).toEqual(values);
  expect(entries.has('designer-two')).toBe(false);
  writeListingRecovery(storage,'designer-one',{...values,name:'',description:''});
  expect(entries.size).toBe(0);
 });
 it('rejects corrupt, incomplete, wrong-version and unsafe step data',()=>{
  for(const raw of ['broken','null',JSON.stringify({version:2,values}),JSON.stringify({version:1,values:{name:'Hi'}}),JSON.stringify({version:1,values:{...values,step:9}}),JSON.stringify({version:1,values:{...values,pieceType:'unknown'}})])expect(readListingRecovery(raw)).toBeNull();
 });
 it('does not restore extra credential or consent properties',()=>{
  const recovered=readListingRecovery(JSON.stringify({version:1,values:{...values,token:'secret',rulesAccepted:true}}));
  expect(recovered).not.toHaveProperty('token');expect(recovered).not.toHaveProperty('rulesAccepted');
 });
});
