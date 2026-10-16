const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

test('Creative House keeps complete task sections in sync with forms and category history', () => {
  const ids = ['profile-form', 'event-profile-form', 'event-form', 'post-form', 'project-request-form', 'creative-inquiry-form'];
  const sectionIds = ['your-profile', 'event-profile-editor', 'post-event', 'post', 'casting-commissioning', 'private-inquiries'];
  const nodes = new Map();
  const sections = sectionIds.map(id => ({ id, hidden: false, contains: form => form.section.id === id }));
  ids.forEach((id, i) => nodes.set(id, { id, section: sections[i], hidden: false, closest() { return this.section; }, scrollIntoView() {} }));
  nodes.set('profile-start', { hidden: false });
  nodes.set('creative-workflow-help', { textContent: '' });
  const buttons = ['browse', 'profile', 'event', 'casting', 'request', 'inquiry'].map(kind => ({
    dataset: { creativeWorkflow: kind }, attributes: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(type, handler) { this[type] = handler; },
  }));
  const listeners = {};
  const location = { hash: '' };
  vm.runInNewContext(readFileSync('creative-house-workflows.js', 'utf8'), {
    document: { getElementById: id => nodes.get(id), addEventListener() {}, querySelectorAll: selector => selector === '[data-creative-workflow]' ? buttons : [] },
    location, window: { matchMedia: () => ({ matches: false }), addEventListener: (type, fn) => { listeners[type] = fn; } },
  });
  assert.ok(sections.slice(0, 5).every(section => section.hidden));
  assert.equal(sections[5].hidden, false, 'incoming inquiries stay available');
  buttons[2].click();
  assert.equal(sections[2].hidden, false);
  assert.equal(nodes.get('event-form').hidden, false);
  assert.equal(sections[0].hidden, true);
  location.hash = '#your-profile'; listeners.hashchange();
  assert.equal(sections[0].hidden, false);
  assert.equal(sections[1].hidden, true);
  location.hash = '#event-profile-editor'; listeners.hashchange();
  assert.equal(sections[0].hidden, true);
  assert.equal(sections[1].hidden, false);
  listeners['creative-profile-role']({detail:{role:'photographer'}});
  assert.equal(sections[0].hidden, false);
  assert.equal(sections[1].hidden, true);
  assert.equal(nodes.get('profile-start').hidden, false);
  location.hash = '#opportunities'; listeners.hashchange();
  assert.ok(sections.slice(0, 5).every(section => section.hidden));
  assert.equal(buttons[0].attributes['aria-pressed'], 'true');
});
