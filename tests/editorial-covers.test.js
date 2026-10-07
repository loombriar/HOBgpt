const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../atelier.js'), 'utf8');
const context = vm.createContext({ getProductImages: item => [{url: item.image}] });
vm.runInContext(source.slice(0, source.indexOf('function houseIcon')), context);
const choose = items => context.selectHouseCollectionCovers(items);

test('overlapping collection matches use each listing only once', () => {
  const pieces = [
    {id:'tulip', title:'Golden tulip', description:'Velvet details', style:'Dress'},
    {id:'velvet', title:'Velvet Gold', description:'', style:'Top'},
    {id:'purple', title:'Purple dress', description:'', style:'Dress'},
    {id:'lucky', title:'Lucky outfit', description:'', style:'Set / Outfit'},
  ];
  const covers = choose(pieces);
  assert.equal(covers['autumn-atelier'].id, 'tulip');
  assert.equal(covers['winter-briar'].id, 'velvet');
  assert.equal(covers['garden-party'].id, 'purple');
  assert.equal(covers['independent-by-design'].id, 'lucky');
  assert.equal(new Set(Object.values(covers).map(item => item.id)).size, 4);
});

test('small catalogs leave an empty cover rather than repeating a piece or using an unrelated one', () => {
  const covers = choose([{id:'only', title:'Velvet gold dress', description:'', style:'Dress'}]);
  assert.equal(Object.keys(covers).length, 1);
  assert.equal(covers['autumn-atelier'].id, 'only');
  const empty = choose([]);
  assert.equal(Object.keys(empty).length, 0);
});
