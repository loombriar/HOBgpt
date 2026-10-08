const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');

test('Mess Around stays in its menu with Find out first', () => {
 const nav=html.match(/aria-label="Mess Around options"[^>]*>([\s\S]*?)<\/div>/)[1];
 assert.match(nav.trim(), /^<a href="\/fashion-personality">Find out…<\/a>/);
 assert.ok(!html.includes('id="mess-around"'));
 const shell=read('apps/default/src/components/HouseShell.tsx');
 assert.equal((shell.match(/\['Find out…', '\/fashion-personality'\],\['Find Your Fashion Personality'/g)||[]).length,2);
 assert.ok(!shell.includes('/#mess-around'));
});

test('Suite shortcuts reuse the existing entry point and focus the requested feature', () => {
  const source = read('atelier.js');
  const handlers = [];
  const targets = new Map();
  let opened = 0;
  const buttons = ['measurement-profile-name', 'visitor-favorites-title'].map(id => {
    targets.set(id, { matches: () => id === 'measurement-profile-name', scrollIntoView(options) { this.scrolled = options.block; }, setAttribute(key, value) { this[key] = value; }, focus(options) { this.focused = options.preventScroll; } });
    return { dataset: { messAroundSuite: id }, addEventListener(event, handler) { assert.equal(event, 'click'); handlers.push(handler); } };
  });
  const context = vm.createContext({ document: { querySelectorAll: () => buttons }, byId: id => id === 'visitor-suite-btn' ? { click() { opened++; } } : targets.get(id) });
  vm.runInContext(source.slice(source.indexOf('// Reuse the Suite entry point')), context);
  handlers.forEach(handler => handler());
  assert.equal(opened, 2);
  for (const target of targets.values()) { assert.equal(target.scrolled, 'nearest'); assert.equal(target.focused, true); }
  assert.equal(targets.get('visitor-favorites-title').tabindex, '-1');
  assert.equal(targets.get('measurement-profile-name').tabindex, undefined);
});
