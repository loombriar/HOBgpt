const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');

test('Mess Around is the first navigation category and sits near the top before the shop', () => {
  const nav = html.match(/<nav class="sewing-nav"[\s\S]*?<\/nav>/)[0];
  assert.match(nav, /<details class="nav-dropdown"><summary class="nav-hotspot">Mess Around/);
  assert.match(nav, /href="\/#mess-around"/);
  assert.ok(nav.indexOf('Mess Around') < nav.indexOf('>Shop <'));
  assert.ok(html.indexOf('id="mess-around"') < html.indexOf('id="shop"'));
  const section = html.match(/<section id="mess-around"[\s\S]*?<\/section>/)[0];
  assert.equal((section.match(/class="mess-around-card"/g) || []).length, 10);
  for (const feature of ['The Briar Runway', 'AI styling companion', 'Photo try-on', 'Your measurement avatar', 'Heart your favorites', 'Mood &amp; seasonal collections', 'Designer stories', 'Designer lookbooks', 'Find a style from a photo', 'Collect House badges']) {
    assert.ok(section.includes(feature), feature);
  }
  for (const [, id] of section.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(section, /sign-in/i);
  assert.match(section, /consent/);
  assert.match(section, /not a fit guarantee/);
});

test('both marketplace navigation layouts link to the root feature directory', () => {
  const shell = read('apps/default/src/components/HouseShell.tsx');
  assert.equal((shell.match(/title:\s*'Mess Around'/g) || []).length, 2);
  assert.equal((shell.match(/\['Find out…',\s*'\/#mess-around'\]/g) || []).length, 2);
  assert.equal((shell.match(/href=\{href\}/g) || []).length, 2);
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
