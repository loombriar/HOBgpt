'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const scripts = [
  'designer-spotlight-config.js',
  'designer-spotlight.js',
  'admin-designer-spotlight.js'
];

test('spotlight assets remain available while public homepage promotions are paused', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  for (const script of scripts) {
    assert.ok(fs.statSync(path.join(root, script)).isFile(), script + ' is missing');
    if (script === 'admin-designer-spotlight.js') {
      assert.ok(html.includes('src="/' + script + '"'), 'Admin spotlight editor must remain available');
    } else {
      assert.ok(!html.includes('src="/' + script + '"'), 'Paused promotion must not be restored by ' + script);
    }
    assert.ok(server.includes("'" + script + "'"), script + ' is not registered for serving');
  }
  assert.match(server, /app\.get\('\/' \+ asset, \(_req, res\) =>/);
  assert.match(server, /res\.sendFile\(path\.join\(rootDir, asset\)\)/);
});
