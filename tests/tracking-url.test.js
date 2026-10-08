const test = require('node:test');
const assert = require('node:assert/strict');
const {safeTrackingUrl} = require('../lib/tracking-url');
test('customer tracking URLs accept only the HTTPS EasyPost public tracking host',()=>{
  assert.equal(safeTrackingUrl('https://track.easypost.com/abc'),'https://track.easypost.com/abc');
  for(const value of [null, '', 'javascript:alert(1)', 'http://track.easypost.com/a', 'https://track.easypost.com.evil.test/a', 'https://user:pass@track.easypost.com/a', 'https://track.easypost.com:444/a']) assert.equal(safeTrackingUrl(value),null);
});
