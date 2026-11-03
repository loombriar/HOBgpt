'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('public account-deletion route is registered before React SPA fallback', () => {
  const root = path.join(__dirname, '..');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'account-deletion.html'), 'utf8');
  const route = "app.get(['/account-deletion', '/account-deletion.html']";
  const routeIndex = server.indexOf(route);
  assert.ok(routeIndex !== -1, 'public route must exist');
  assert.ok(routeIndex < server.indexOf("const sendFrontend ="), 'route must precede SPA fallback');
  const handler = server.slice(routeIndex, routeIndex + 320);
  assert.match(handler, /res\.sendFile\(path\.join\(rootDir, 'account-deletion\.html'\)\)/);
  assert.match(page, /Request deletion of your House of Briar account/);
  assert.match(page, /Request deletion without signing in/);
});
