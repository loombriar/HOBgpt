const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const loader = source.slice(source.indexOf('async function loadGallery()'), source.indexOf('async function loadShopDesigners()'));
test('shop requests compose designer, print, style, search and price filters', async () => {
  const requests = [];
  const context = vm.createContext({ URLSearchParams, activeMeasurements:null, activeAccessory:'all', activeFilter:'Dress', activeAesthetic:'Boho', activePattern:'Floral', activeDesigner:'maker/a', activeShopWindow:'low', shopSearch:'velvet & gold', galleryRequest:0, shopStatus:null, productGrid:null, renderGallery(){}, apiRequest:async url => {requests.push(url); return {items:[]};} });
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
  const context=vm.createContext({ URLSearchParams, activeMeasurements:null, activeAccessory:'all',activeFilter:'all',activeAesthetic:'all',activePattern:'all',activeDesigner:'all',activeShopWindow:'all',shopSearch:'',galleryRequest:0,shopStatus:null,productGrid:null,renderGallery(){},apiRequest:()=>new Promise(resolve=>pending.push(resolve)) });
  vm.runInContext(loader,context);
  const first=vm.runInContext('loadGallery()',context); context.activeFilter='Top';
  const second=vm.runInContext('loadGallery()',context);
  pending[1]({items:[{id:'top'}]}); await second; pending[0]({items:[{id:'dress'}]}); await first;
  assert.equal(context.galleryItems[0].id,'top');
});
test('switching between garments and accessories clears the conflicting selection', () => {
  const controls = new Map();
  const byId=id=>{if(!controls.has(id))controls.set(id,{value:'all',reset(){},handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},dispatchEvent(){}});return controls.get(id);};
  const start=source.indexOf("byId('shop-garment-filter')?.addEventListener('change'");
  const end=source.indexOf("for (const id of ['shop-garment-filter', 'shop-aesthetic-filter'",start);
  const context=vm.createContext({byId,Event,setMessage(){},activeMeasurements:null,searchTimer:null,activeAccessory:'all',activeFilter:'all',activeAesthetic:'all',activeDesigner:'all',activePattern:'all',activeShopWindow:'all',shopSearch:'',loadGallery(){},setTimeout,clearTimeout});
  vm.runInContext(source.slice(start,end),context);
  byId('shop-accessory-filter').handlers.change({target:{value:'Purse / Bag'}});
  assert.equal(context.activeAccessory,'Purse / Bag'); assert.equal(context.activeFilter,'all');
  byId('shop-garment-filter').handlers.change({target:{value:'Dress'}});
  assert.equal(context.activeFilter,'Dress'); assert.equal(context.activeAccessory,'all');
  byId('shop-clear-filters').handlers.click();
  assert.equal(context.activeFilter,'all'); assert.equal(context.activeDesigner,'all');
});

test('measurement searches send body values in a POST body, keeping them out of URLs', async () => {
  let request;
  const context=vm.createContext({URLSearchParams,activeMeasurements:{bust:35,waist:33},activeAccessory:'all',activeFilter:'Dress',activeAesthetic:'all',activePattern:'all',activeDesigner:'maker',activeShopWindow:'all',shopSearch:'',galleryRequest:0,shopStatus:null,productGrid:null,renderGallery(){},apiRequest:async(url,options)=>{request={url,options};return {items:[]};}});
  vm.runInContext(loader,context);await vm.runInContext('loadGallery()',context);
  assert.equal(request.url,'/api/gallery/search');assert.equal(request.options.method,'POST');assert.equal(request.options.headers['Content-Type'],'application/json');
  assert.deepEqual(JSON.parse(request.options.body),{filters:{style:'Dress',designer:'maker'},measurements:{bust:35,waist:33}});
});
