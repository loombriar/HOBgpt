#!/usr/bin/env node
// Safe, read-only release gate: never inspect secret values or contact providers.
const fs = require('node:fs');
const path = require('node:path');
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
let failed = false;
for (const file of required) {
  const exists = fs.existsSync(path.resolve(__dirname, '..', file));
  console.log((exists ? 'PASS ' : 'FAIL ') + file);
  if (!exists) failed = true;
}
const evidencePath = path.resolve(__dirname, '..', 'docs/release-acceptance-evidence.md');
const evidence = fs.existsSync(evidencePath) ? fs.readFileSync(evidencePath, 'utf8') : '';
if (!/signoff:\s*INCOMPLETE/i.test(evidence)) {
  console.error('FAIL: release evidence must explicitly retain INCOMPLETE signoff until operator verification');
  failed = true;
}
if (failed) process.exitCode = 1;
else console.log('Static prerequisites PASS. Provider, incident, staging and device acceptance remain manual NO-GO gates.');
