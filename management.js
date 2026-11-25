function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['\uFEFF', text], {type}));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.querySelector('#export-txt').addEventListener('click', () => {
  if (!followingList.length) { setStatus('尚未取得关注名单。'); return; }
  const clean = value => String(value).replace(/[\t\r\n]/g, ' ');
  downloadText(`bilibili-${listComplete ? '已核对' : '部分或未核对'}-${followingList.length}.txt`,
    followingList.map(row => `${clean(row.name)}\t${clean(row.mid)}`).join('\r\n'));
});
const ruleEditor = document.querySelector('#rules-editor');
document.querySelector('#apply-keep').onclick = () => {
  if (queueRunning) return;
  const ids = document.querySelector('#keep-ids').value.trim().split(/\s+/).filter(Boolean);
  if (ids.some(id => !/^[1-9]\d*$/.test(id))) { setStatus('保留名单须为数字 UID，用换行或空格分隔。'); return; }
  keepIds = new Set(ids);
  records.forEach(record => { if (keepIds.has(String(record.mid))) record.selected = false; });
  renderResults();
  setStatus(`本页已保护 ${keepIds.size} 个 UID，已从候选和勾选中移除。`);
};
ruleEditor.value = JSON.stringify({version:1,name:'30天未投稿或最近视频播放低于1000',group:{mode:'any',conditions:[{field:'daysSinceLatest',op:'gte',value:30},{mode:'all',conditions:[{field:'daysSinceLatest',op:'gte',value:7},{field:'latestViews',op:'lt',value:1000}]}]}},null,2);
function applyCustomRule(record) {
  if (!customRules) return;
  const recent = record.latest?.recent || [];
  const result = FollowRules.evaluate(customRules, {
    workCount: record.latest?.workCount ?? null,
    daysSinceLatest: record.latest?.publishedAt ? daysSince(record.latest.publishedAt) : null,
    latestViews: record.latest?.views ?? null,
    last3AverageViews: recent.length === 3 && recent.every(v => Number.isFinite(v.views)) ? recent.reduce((sum,v) => sum + v.views,0)/3 : null,
    accountStatus: null
  });
  record.candidate = result.match;
  record.reasons = result.match ? [customRules.name || '自定义规则', ...result.reasons] : [];
  record.selected = false;
}
document.querySelector('#rules-apply').addEventListener('click', () => {
  try {
    if (scanRunning || elements.rescan.disabled) throw new Error('请等待当前任务结束');
    customRules = FollowRules.parse(ruleEditor.value);
    records.forEach(applyCustomRule);
    saveSnapshot(); renderResults();
    document.querySelector('#rules-message').textContent = '已应用；未知数据不命中，请重新勾选候选';
  } catch (error) { document.querySelector('#rules-message').textContent = error.message; }
});
document.querySelector('#rules-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 100000) { document.querySelector('#rules-message').textContent = '规则文件不能超过 100 KB'; return; }
  ruleEditor.value = await file.text();
});
document.querySelector('#rules-export').addEventListener('click', () => {
  downloadText('following-rules.json', ruleEditor.value, 'application/json');
});

// The review only prepares candidates. The existing queue still requires its
// own confirmations and account check before it can send a write request.
let avatarSnapshot = null;
function getAvatarReviewRows() {
  if (scanRunning || queueRunning || !scanOwner) {
    avatarSnapshot = null;
    return [];
  }
  const rows = followingList.filter(row => !keepIds.has(String(row.mid))).map(row => ({
    id: String(row.mid), name: row.name || `UID ${row.mid}`,
    avatarUrl: row.face || '', profileUrl: `https://space.bilibili.com/${row.mid}`
  }));
  avatarSnapshot = { owner: String(scanOwner), list: followingList, rows: new Map(rows.map(row => [row.id, row])) };
  return rows;
}

async function acceptAvatarReview(confirmedRows) {
  const snapshot = avatarSnapshot;
  const isCurrent = () => snapshot && snapshot === avatarSnapshot && !scanRunning && !queueRunning &&
    snapshot.list === followingList && snapshot.owner === String(scanOwner);
  try {
    if (!isCurrent()) throw new Error('名单或任务状态已变化，请重新打开头像复核。');
    if (!Array.isArray(confirmedRows)) throw new Error('复核结果格式错误。');
    const ids = [...new Set(confirmedRows.map(row => String(typeof row === 'object' && row ? row.id : row)))];
    if (ids.some(id => !snapshot.rows.has(id))) throw new Error('复核结果包含当前名单以外的账号，请重新复核。');
    const current = await getNavigation();
    if (!isCurrent() || String(current.mid) !== snapshot.owner) throw new Error('账号或关注名单已变化，请重新扫描后复核。');
    const byId = new Map(records.map(record => [String(record.mid), record]));
    const source = new Map(followingList.map(row => [String(row.mid), row]));
    records.forEach(record => { record.selected = false; });
    let count = 0;
    for (const id of ids) {
      if (keepIds.has(id)) continue;
      let record = byId.get(id);
      if (record?.unfollowResult) continue;
      if (!record) {
        record = { ...source.get(id), latest: null, reasons: [], candidate: false, selected: false,
          status: '仅人工头像复核，未采集作品数据', scannedAt: new Date().toISOString(), reviewOnly: true };
        records.push(record);
        byId.set(id, record);
      }
      record.candidate = true;
      record.selected = true;
      record.reasons = [...new Set([...(record.reasons || []), '头像复核：用户已确认'])];
      count += 1;
    }
    saveSnapshot(); renderResults();
    setStatus(`头像复核已加入 ${count} 个待确认取关账号；保留名单和已有操作记录已跳过。`, '尚未取关，请在候选表复核后使用取关按钮并完成双重确认。');
  } catch (error) {
    setStatus(`头像复核未应用：${shortError(error)}`);
    throw error;
  }
}
AvatarReview.mount(document.querySelector('#avatar-review'), getAvatarReviewRows, acceptAvatarReview);
