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
