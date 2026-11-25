const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('dashboard.js', 'utf8');
const queue = source.slice(source.indexOf('async function runUnfollowQueue'), source.indexOf('function exportCsv'));
async function scenario({ rejectPost = false, rejectVerify = false, owner = '1', stop = false }) {
  let writes = 0;
  const records = [2, 3].map(mid => ({ mid, name: String(mid), candidate: true, selected: true }));
  const element = () => ({ append() {}, prepend() {}, textContent: '', disabled: false });
  const context = {
    records, scanOwner: '1', config: {}, followingCount: 2, followingList: [], listComplete: true,
    queuePaused: false, queueStopped: false, chrome: { storage: { local: { set: async () => {} } } },
    getNavigation: async () => ({ mid: owner }), requestCsrfToken: async () => 'test',
    window: { confirm: () => true, prompt: () => '取关 2' },
    document: { createElement: element, querySelector: element },
    setStatus() {}, renderResults() {}, saveSnapshot() {}, shortError: e => e.message,
    setInterval: () => 1, clearInterval() {}, wait: async () => { if (stop) context.queueStopped = true; },
    unfollowOne: async () => { writes++; if (rejectPost) throw Object.assign(new Error('rejected'), { apiRejected: true }); },
    fetchApi: async () => { if (rejectVerify) throw Object.assign(new Error('verify failed'), { apiRejected: true }); return { attribute: 0 }; }
  };
  vm.createContext(context);
  await vm.runInContext(queue + '\nrunUnfollowQueue()', context);
  return { records, writes };
}
(async () => {
  let result = await scenario({});
  assert.equal(result.writes, 2); assert.ok(result.records.every(r => r.unfollowResult.ok));
  result = await scenario({ rejectPost: true });
  assert.equal(result.writes, 1); assert.equal(result.records[0].unfollowResult.state, '失败（平台拒绝）');
  result = await scenario({ rejectVerify: true });
  assert.equal(result.writes, 1); assert.equal(result.records[0].unfollowResult.state, '结果待核实');
  assert.equal(result.records[1].unfollowResult.state, '已跳过');
  result = await scenario({ owner: 'other' }); assert.equal(result.writes, 0);
  result = await scenario({ stop: true }); assert.equal(result.writes, 1);
  console.log('Queue checks passed: success, rejection, uncertain verification, owner mismatch, stop.');
})().catch(error => { console.error(error); process.exitCode = 1; });
