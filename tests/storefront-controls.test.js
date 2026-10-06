const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const loader = source.slice(source.indexOf('async function loadGallery()'), source.indexOf('async function loadShopDesigners()'));
test('shop requests compose designer, print, style, search and price filters', async () => {
  const requests = [];
  const context = vm.createContext({ URLSearchParams, activeAccessory:'all', activeFilter:'Dress', activeAesthetic:'Boho', activePattern:'Floral', activeDesigner:'maker/a', activeShopWindow:'low', shopSearch:'velvet & gold', galleryRequest:0, shopStatus:null, productGrid:null, renderGallery(){}, apiRequest:async url => {requests.push(url); return {items:[]};} });
  vm.runInContext(loader, context);
  await vm.runInContext('loadGallery()', context);
  const params = new URL(requests[0], 'http://localhost').searchParams;
  assert.equal(params.get('style'),'Dress'); assert.equal(params.get('designer'),'maker/a');
  assert.equal(params.get('pattern'),'Floral'); assert.equal(params.get('aesthetic'),'Boho');
  assert.equal(params.get('sort'),'low'); assert.equal(params.get('q'),'velvet & gold');
  context.activeAccessory = 'accessories';
  await vm.runInContext('loadGallery()', context);
  const accessories = new URL(requests[1], 'http://localhost').searchParams;
  assert.equal(accessories.get('category'),'accessories'); assert.equal(accessories.has('style'),false);
});
test('slower earlier filter response cannot replace the latest selection', async () => {
  const pending=[];
  const context=vm.createContext({ URLSearchParams, activeAccessory:'all',activeFilter:'all',activeAesthetic:'all',activePattern:'all',activeDesigner:'all',activeShopWindow:'all',shopSearch:'',galleryRequest:0,shopStatus:null,productGrid:null,renderGallery(){},apiRequest:()=>new Promise(resolve=>pending.push(resolve)) });
  vm.runInContext(loader,context);
  const first=vm.runInContext('loadGallery()',context); context.activeFilter='Top';
  const second=vm.runInContext('loadGallery()',context);
  pending[1]({items:[{id:'top'}]}); await second; pending[0]({items:[{id:'dress'}]}); await first;
  assert.equal(context.galleryItems[0].id,'top');
});
