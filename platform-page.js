const platformInput = document.querySelector('#platform');
const tabInput = document.querySelector('#tabs');
const message = document.querySelector('#message');
const collected = new Map();
let collectionGeneration = 0;
const reviewedProfiles = document.querySelector('#reviewed-profiles');
function clearCollection() {
  collected.clear(); collectionGeneration++;
  reviewedProfiles.replaceChildren();
}
function verifiedProfile(row) {
  try {
    const url = new URL(row.profileUrl);
    const expectedHost = platformInput.value === 'douyin' ? 'www.douyin.com' : 'www.kuaishou.com';
    const expectedPath = platformInput.value === 'douyin' ? `/user/${row.id}` : `/profile/${row.id}`;
    return url.protocol === 'https:' && url.hostname === expectedHost && url.pathname.replace(/\/$/, '') === expectedPath
      && !url.username && !url.password && !url.port && !url.search && !url.hash;
  } catch { return false; }
}
AvatarReview.mount(document.querySelector('#avatar-review'), () => [...collected.values()].map(row => ({ ...row, generation: collectionGeneration })), rows => {
  reviewedProfiles.replaceChildren();
  const heading = document.createElement('h2'); heading.textContent = '已人工复核的账号'; reviewedProfiles.append(heading);
  const note = document.createElement('p'); note.textContent = '打开主页后，请再次核对头像、名称和 ID，再自行决定是否取关。此处不会自动操作平台按钮。'; reviewedProfiles.append(note);
  for (const row of rows) {
    const current = collected.get(row.id);
    if (!current || row.generation !== collectionGeneration || current.profileUrl !== row.profileUrl || !verifiedProfile(current)) continue;
    const item = document.createElement('p');
    item.append(document.createTextNode(`${current.name} · ${current.id} `));
    const link = document.createElement('a'); link.href = current.profileUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '打开主页，手动取关';
    item.append(link); reviewedProfiles.append(item);
  }
});
async function refreshTabs() {
  clearCollection();
  tabInput.replaceChildren();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    let host; try { host = new URL(tab.url).hostname; } catch { continue; }
    const allowed = platformInput.value === 'douyin' ? ['www.douyin.com'] : ['www.kuaishou.com'];
    if (!allowed.includes(host)) continue;
    const option = document.createElement('option'); option.value = tab.id; option.textContent = tab.title || tab.url; tabInput.append(option);
  }
}
function target() { if (!tabInput.value) throw new Error('先打开并刷新平台关注列表页面'); return Number(tabInput.value); }
document.querySelector('#refresh').onclick = refreshTabs;
platformInput.onchange = () => { clearCollection(); refreshTabs(); message.textContent = '已切换平台，内存采集结果已清空'; };
tabInput.onchange = () => { clearCollection(); message.textContent = '已切换标签页，请重新选区'; };
document.querySelector('#pick').onclick = async () => {
  try { clearCollection(); const id = target(); await chrome.tabs.update(id,{active:true}); await PlatformAdapters.pick(id,platformInput.value); message.textContent = '区域已选择，可以采集'; }
  catch(error) { message.textContent = error.message; }
};
document.querySelector('#collect').onclick = async () => {
  try { const generation = collectionGeneration; const result = await PlatformAdapters.collect(target(),platformInput.value); if (generation !== collectionGeneration) return; collectionGeneration++; result.records.forEach(row => collected.set(row.id,row)); reviewedProfiles.replaceChildren(); message.textContent = `已收集 ${collected.size} 个主页标识，完整性未确认。${result.warnings.join('；')}`; }
  catch(error) { message.textContent = error.message; }
};
document.querySelector('#download').onclick = () => {
  if (!collected.size) { message.textContent = '没有可导出记录'; return; }
  const clean = value => String(value).replace(/[\r\n\t]/g,' ');
  const text = [...collected.values()].map(row => `${clean(row.name)}\t${clean(row.id)}`).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF',text],{type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a'); link.href=url; link.download=`${platformInput.value}-部分名单.txt`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
};
refreshTabs().catch(error => { message.textContent = error.message; });
