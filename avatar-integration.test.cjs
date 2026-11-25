const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('management.js', 'utf8');
function setup() {
  const context = { scanRunning: false, queueRunning: false, scanOwner: '1',
    followingList: [{mid:2,name:'A',face:'https://example.test/a'},{mid:3,name:'B'},{mid:4,name:'C'}],
    keepIds: new Set(['4']), records:[{mid:3,candidate:true,selected:true,reasons:[],unfollowResult:{ok:true}}],
    getNavigation: async () => ({mid:'1'}), saveSnapshot(){}, renderResults(){}, setStatus(){}, shortError:e=>e.message,
    document:{querySelector:()=>({})}, AvatarReview:{mount(){}}, console };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('let avatarSnapshot')),context);
  return context;
}
(async()=>{
  let c=setup();
  let rows=vm.runInContext('getAvatarReviewRows()',c);
  assert.equal(rows.length,2);
  await c.acceptAvatarReview([rows[0]]);
  assert.equal(c.records.find(r=>r.mid===2).selected,true);
  assert.equal(c.records.find(r=>r.mid===3).selected,false);
  assert.equal(c.records.find(r=>r.mid===3).unfollowResult.ok,true);
  c=setup(); rows=c.getAvatarReviewRows(); c.followingList=[...c.followingList];
  await assert.rejects(()=>c.acceptAvatarReview(rows),/名单/);
  c=setup(); rows=c.getAvatarReviewRows(); c.getNavigation=async()=>({mid:99});
  await assert.rejects(()=>c.acceptAvatarReview(rows),/账号/);
  c=setup(); rows=c.getAvatarReviewRows(); c.keepIds.add('2');
  await c.acceptAvatarReview([rows[0]]);
  assert.equal(c.records.length,1);
  console.log('Avatar Bilibili integration: confirmation, logs, stale list, account, keep-list passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
