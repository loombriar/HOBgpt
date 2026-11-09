'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {proposeGarments}=require('../lib/designer-collection-drafts');
test('reviews every product in a ninety-item spreadsheet without the old thirty-product cap',()=>{
  const rows=['name | base_price | short_description | colour'];
  for(let i=0;i<90;i++)rows.push('Product '+i+' | 152 | Custom-made bag | Blue');
  const candidates=proposeGarments(rows.join('\n'));
  assert.equal(candidates.length,90);
  assert.equal(candidates[89].name,'Product 89');
  assert.equal(candidates[89].price,152);
  assert.equal(candidates[89].colors,'Blue');
  assert.equal(candidates[89].selected,false);
});
