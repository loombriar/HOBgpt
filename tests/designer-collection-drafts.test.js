'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { proposeGarments } = require('../lib/designer-collection-drafts');
test('proposes unverified catalog lines without inventing prices or availability', () => {
  const rows = proposeGarments('Summer Dress\nSummer Dress\nLinen Jacket');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Summer Dress');
  assert.equal(rows[0].price, null);
  assert.equal(rows[0].selected, false);
  assert.equal(rows[0].sizes, '');
});
test('limits candidate count', () => {
  const rows = proposeGarments(Array.from({length: 350}, (_, i) => 'Garment '+i).join('\n'));
  assert.equal(rows.length, 300);
});

test('preserves SKU and Atelier Emine photo URLs with the correct garment', () => {
  const rows='name | sale_price | sku | image_urls | description\nBlue Dress | 89.99 | BD-1 | https://www.atelieremine.com/a.png,https://www.atelieremine.com/b.png | Cotton dress\nRed Dress | 99.99 | RD-2 | https://www.atelieremine.com/c.png | Red cotton dress';
  const garments=proposeGarments(rows);
  assert.equal(garments.length,2);
  assert.equal(garments[0].sku,'BD-1');
  assert.deepEqual(garments[0].imageUrls,['https://www.atelieremine.com/a.png','https://www.atelieremine.com/b.png']);
  assert.deepEqual(garments[1].imageUrls,['https://www.atelieremine.com/c.png']);
});

test('preserves duplicate names and duplicate SKUs for review instead of silently dropping source rows', () => {
  const rows=proposeGarments('name | sku | price\\nDress | D-1 | 10\\nDress | D-2 | 12\\nOther | D-1 | 15');
  assert.equal(rows.length,3);
  assert.deepEqual(rows.map(g=>g.sku),['D-1','D-2','D-1']);
});
