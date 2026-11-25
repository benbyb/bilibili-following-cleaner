const test = require('node:test');
const assert = require('node:assert/strict');
const {imageUrl,pixelKey} = require('./avatar-review.js');
test('full URL comparison preserves query and rejects executable/credential URLs', () => {
  assert.equal(imageUrl('https://example.com/a?size=1'), 'https://example.com/a?size=1');
  assert.notEqual(imageUrl('https://example.com/a?size=1'), imageUrl('https://example.com/a?size=2'));
  for (const value of ['javascript:alert(1)', 'data:image/png;base64,abc', 'https://name:pass@example.com/a', null]) assert.equal(imageUrl(value),null);
});
test('pixel identity compares complete bytes instead of lossy hash', () => {
  assert.equal(pixelKey([0,1,254,255]),'0001feff');
  assert.notEqual(pixelKey([0,1]),pixelKey([1,0]));
});
