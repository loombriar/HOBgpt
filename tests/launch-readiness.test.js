'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const source = path.resolve(__dirname, '..', 'scripts', 'check-launch-readiness.js');
const required = [
  'docs/release-acceptance-evidence.md',
  'docs/admin-totp-enrollment-recovery.md',
  'docs/admin-role-permissions.md',
  '.github/workflows/ci.yml',
  '.github/workflows/backend-safety.yml',
  'tests/commerce.test.js',
  'tests/admin-roles.test.js',
  'tests/admin-mfa.test.js',
  'tests/admin-session-lifecycle.test.js',
  'e2e/admin-review-loop.spec.js',
  'tests/payout-transfer-integration.test.js',
  'mobile/ANDROID-DEVICE-TESTS.md',
];

function fixture(t, evidence = 'Overall release signoff: INCOMPLETE.') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hob-launch-gate-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const file of required) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, file === 'docs/release-acceptance-evidence.md' ? evidence : 'fixture');
  }
  const script = path.join(root, 'scripts', 'check-launch-readiness.js');
  fs.mkdirSync(path.dirname(script), {recursive: true});
  fs.copyFileSync(source, script);
  return {root, script};
}

function run(script) {
  return spawnSync(process.execPath, [script], {encoding: 'utf8', timeout: 10000});
}

test('static gate passes only with all prerequisites and explicit incomplete signoff', t => {
  const {script} = fixture(t);
  const result = run(script);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /manual NO-GO gates/);
});

test('static gate fails closed when a required security regression file is missing', t => {
  const {root, script} = fixture(t);
  fs.rmSync(path.join(root, 'tests', 'admin-mfa.test.js'));
  const result = run(script);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /FAIL tests\/admin-mfa\.test\.js/);
});

test('static gate refuses a release document that no longer marks signoff incomplete', t => {
  const {script} = fixture(t, 'Overall release signoff: COMPLETE.');
  const result = run(script);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /INCOMPLETE signoff/);
});
