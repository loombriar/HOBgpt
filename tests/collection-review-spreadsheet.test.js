'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {proposeGarments}=require('../lib/designer-collection-drafts');
test('maps XLSX header and product rows to reviewable garment fields',()=>{
 const input='name | category | base_price | sale_price | image_urls | description | short_description | gender | tags | sku | brand | stock_quantity | weight_grams | colour\nPerla Elara | Bags & Accessories | 152 | 152 | https://example.test/image | <p>Beautiful bag</p> | Handmade bag | women | Luxury | SKU-1 | Atelier Emine | 100 | 600 | Çok Renkli';
 const result=proposeGarments(input);
 assert.equal(result.length,1);
 assert.equal(result[0].name,'Perla Elara');
 assert.equal(result[0].price,152);
 assert.equal(result[0].description,'Handmade bag');
 assert.equal(result[0].colors,'Çok Renkli');
 assert.equal(result[0].selected,false);
});
test('long extracted rows still create suggestions',()=>{
 const result=proposeGarments('name | description\nLong Coat | '+('details '.repeat(100)));
 assert.equal(result.length,1);
 assert.equal(result[0].name,'Long Coat');
});
