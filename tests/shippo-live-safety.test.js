const test = require('node:test');
const assert = require('node:assert/strict');
const {safeLabelUrl} = require('../lib/shipping-labels');
const {testOrderAvailable} = require('../lib/postage-test-order');

test('label documents require trusted HTTPS hosts', () => {
  assert.equal(safeLabelUrl('https://goshippo.com/labels/abc.pdf'), true);
  assert.equal(safeLabelUrl('https://files.goshippo.com/labels/abc.pdf'), true);
  assert.equal(safeLabelUrl('https://shippo-delivery.s3.amazonaws.com/a.pdf'), true);
  for (const url of [
    'http://goshippo.com/labels/a.pdf',
    'https://goshippo.com.evil.example/a.pdf',
    'https://evil.example/a.pdf',
    'https://user:pass@goshippo.com/a.pdf',
    'javascript:alert(1)',
    'not a url'
  ]) assert.equal(safeLabelUrl(url), false, url);
});

test('practice order creation cannot be enabled in production', () => {
  const base = {
    RAILWAY_PROJECT_ID:'2e6e0159-67a1-4b29-b070-6b99db63fabc',
    RAILWAY_ENVIRONMENT_NAME:'testing',
    SHIPPO_LABELS_MODE:'test',
    SHIPPO_TEST_API_KEY:'shippo_test_placeholder',
    STRIPE_SECRET_KEY:'sk_test_placeholder'
  };
  assert.equal(testOrderAvailable(base), true);
  assert.equal(testOrderAvailable({...base,RAILWAY_ENVIRONMENT_NAME:'production'}), false);
  assert.equal(testOrderAvailable({...base,SHIPPO_TEST_API_KEY:'shippo_live_placeholder'}), false);
  assert.equal(testOrderAvailable({...base,STRIPE_SECRET_KEY:'sk_live_placeholder'}), false);
});
