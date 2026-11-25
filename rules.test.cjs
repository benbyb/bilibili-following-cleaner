const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('./rules.js');
const sample = require('./rules.json');
test('threshold boundaries and missing data', () => {
  assert.equal(rules.evaluate(sample, {daysSinceLatest: 30}).match, true);
  assert.equal(rules.evaluate(sample, {daysSinceLatest: 29, latestViews: 1000}).state, 'false');
  for (const value of [null, undefined, '', '0', NaN, Infinity, -1]) {
    assert.equal(rules.evaluate(sample, {latestViews:value}).state, 'unknown');
  }
  assert.equal(rules.evaluate(sample, {latestViews:0}).match, true);
});
test('three valued logic and nested conditions', () => {
  const rule = structuredClone(sample);
  rule.group.mode = 'all';
  assert.equal(rules.evaluate(rule, {daysSinceLatest:40}).state, 'unknown');
  assert.equal(rules.evaluate(rule, {daysSinceLatest:10}).state, 'false');
  rule.group.conditions.push({mode:'any',conditions:[{field:'workCount',op:'eq',value:0}]});
  assert.equal(rules.evaluate(rule, {daysSinceLatest:40,latestViews:10,workCount:0}).match, true);
});
test('reject executable and malformed imports', () => {
  assert.throws(() => rules.parse('alert(1)'));
  assert.throws(() => rules.validate({...sample, script:'alert(1)'}));
  const bad = structuredClone(sample);
  bad.group.conditions[0].field = '__proto__';
  assert.throws(() => rules.validate(bad));
  assert.throws(() => rules.validate({...sample, group:{mode:'all',conditions:[]}}));
});
test('unknown account status never becomes an assertion', () => {
  const rule = {version:1,name:'状态',group:{mode:'all',conditions:[{field:'accountStatus',op:'eq',value:'已注销'}]}};
  assert.equal(rules.evaluate(rule,{accountStatus:'未知'}).state,'unknown');
  assert.equal(rules.evaluate(rule,{accountStatus:'已注销'}).match,true);
});
