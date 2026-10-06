const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Price / New sorting composes with garment and print filtering', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const render = script.slice(script.indexOf('function renderGallery()'), script.indexOf('async function loadGallery()'));
  const element = () => ({ children: [], classList: { add() {} }, setAttribute() {}, addEventListener() {}, append(...children) { this.children.push(...children); }, appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; } });
  const grid = element();
  const context = vm.createContext({
    document: { createElement: element }, productGrid: grid,
    makeElement: (_, className, textContent) => Object.assign(element(), { className, textContent }),
    getProductImages: () => [], getFavoriteIds: () => [], renderItemBadges() {}, categoryLabel: value => value,
    galleryItems: [
      { id: 'a', title: 'Old floral', category: 'apparel', style: 'Dress', pattern: 'Floral', price: 300, createdAt: '2026-10-01' },
      { id: 'b', title: 'New floral', category: 'apparel', style: 'Dress', pattern: 'Floral', price: 100, created_at: '2026-10-05' },
      { id: 'c', title: 'Solid top', category: 'apparel', style: 'Top', pattern: 'Solid', price: 200, createdAt: '2026-10-03' }
    ], activeFilter: 'apparel', activeAccessory: 'all', activeAesthetic: 'all', activePattern: 'all', shopSearch: '', activeShopWindow: 'all'
  });
  vm.runInContext(render, context);
  const titles = () => grid.children.map(card => card.children[1].children.find(child => child.className === 'card-title')?.textContent);
  context.activeShopWindow = 'low'; vm.runInContext('renderGallery()', context);
  assert.deepEqual(titles(), ['New floral', 'Solid top', 'Old floral']);
  context.activeShopWindow = 'high'; vm.runInContext('renderGallery()', context);
  assert.deepEqual(titles(), ['Old floral', 'Solid top', 'New floral']);
  context.activeShopWindow = 'new'; vm.runInContext('renderGallery()', context);
  assert.deepEqual(titles(), ['New floral', 'Solid top', 'Old floral']);
  context.activeFilter = 'Dress'; context.activePattern = 'Floral'; vm.runInContext('renderGallery()', context);
  assert.deepEqual(titles(), ['New floral', 'Old floral']);
});
