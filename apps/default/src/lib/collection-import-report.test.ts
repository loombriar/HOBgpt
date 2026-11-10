import {describe,it,expect} from 'vitest';
import {collectionImportReport} from './collection-import-report';

const source='name | sku | sale_price | image_urls\nDress | D1 | 89.99 | https://www.atelieremine.com/a.png\nDress | D2 | 99.99 | https://www.atelieremine.com/b.png';
const drafts=[
  {name:'Dress',sku:'D1',price:89.99,description:'',sizes:'',colors:'',imageUrls:['https://www.atelieremine.com/a.png']},
  {name:'Dress',sku:'D2',price:99.99,description:'',sizes:'',colors:'',imageUrls:['https://www.atelieremine.com/b.png']}
];
describe('collection SKU reconciliation',()=>{
  it('matches distinct SKUs despite duplicate names and flags duplicate names',()=>{
    const r=collectionImportReport(source,drafts);
    expect(r.matched).toBe(2);
    expect(r.issues.some(i=>i.problems.includes('Duplicate product name in source'))).toBe(true);
  });
  it('never substitutes a matching name for a mismatched SKU',()=>{
    const r=collectionImportReport(source,[{...drafts[0],sku:'WRONG'},drafts[1]]);
    expect(r.matched).toBe(1);
    expect(r.issues.some(i=>i.problems.includes('Missing or ambiguous in private review'))).toBe(true);
    expect(r.issues.some(i=>i.problems.includes('Private review entry has no matching source row'))).toBe(true);
  });
  it('detects duplicate source SKUs and changed image associations',()=>{
    const r=collectionImportReport(source.replace('D2','D1'),[{...drafts[0],imageUrls:['https://www.atelieremine.com/wrong.png']},drafts[1]]);
    expect(r.issues.some(i=>i.problems.includes('Duplicate SKU in source'))).toBe(true);
    expect(r.issues.some(i=>i.problems.includes('Image URLs differ from source'))).toBe(true);
  });
  it('flags missing SKU and mismatched image counts',()=>{
    const r=collectionImportReport(source.replace('D1 |',' |'),[{...drafts[0],sku:'',imageUrls:[]},{...drafts[1],imageUrls:[]}]);
    expect(r.issues.some(i=>i.problems.includes('Missing SKU in source'))).toBe(true);
    expect(r.issues.some(i=>i.problems.includes('Image URL count differs from source'))).toBe(true);
  });
});
