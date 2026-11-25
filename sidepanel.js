'use strict';
const $=id=>document.getElementById(id), el=t=>document.createElement(t);
const labels={daysSinceLatest:'距最近投稿（天）',latestViews:'最近作品播放量',last3AverageViews:'近三条平均播放量',latestComments:'最近作品评论数',last3AverageComments:'近三条平均评论数',workCount:'作品总数',followerCount:'粉丝数',accountStatus:'平台明确状态',avatarUrl:'头像完整 URL'};
const ops={lt:'小于',lte:'不高于',eq:'等于',gte:'至少',gt:'大于'};
let ctx=null,rows=[],hits=[],marked=new Set(),imported=null,page=0,busy='',paused=false,revision=0,activeId=null,windowId=null,finalIds=null;
const options=(obj)=>{const s=el('select');for(const [k,v] of Object.entries(obj))s.add(new Option(v,k));return s;};
function add(field='workCount',op='eq',value=0){
  const div=el('div');div.className='condition';const f=options(labels),o=options(ops),v=el('input'),rm=el('button');
  f.ariaLabel='筛选指标';o.ariaLabel='比较方式';v.ariaLabel='比较值';rm.textContent='移除';f.value=field;o.value=op;v.value=value;
  function type(){const str=['accountStatus','avatarUrl'].includes(f.value);o.disabled=str;if(str)o.value='eq';v.type=str?'text':'number';v.min='0';v.placeholder=f.value==='accountStatus'?'已注销／已封禁／已禁言／限制投稿':'https://…';}
  f.onchange=()=>{v.value=['accountStatus','avatarUrl'].includes(f.value)?'':0;type();};rm.onclick=()=>div.remove();type();div.append(f,o,v,rm);$('conditions').append(div);
  div.read=()=>{if(!v.value.trim())throw Error('请填写规则值');return {field:f.value,op:o.value,value:v.type==='number'?Number(v.value):v.value.trim()};};
}
function rule(){return imported || FollowRules.validate({version:1,name:'当前侧栏规则',group:{mode:$('mode').value,conditions:[...$('conditions').children].map(x=>x.read())}});}
function render(){
  const n=Math.max(1,Math.ceil(hits.length/40));page=Math.min(page,n-1);
  $('page').textContent=(page+1)+' / '+n;$('rows').replaceChildren();
  for(const r of hits.slice(page*40,page*40+40)){
    const b=el('button'),why=el('small');b.className='candidate';b.setAttribute('aria-pressed',marked.has(r.id));b.disabled=!!busy || !!finalIds || !!r.attempted;
    b.append((marked.has(r.id)?'已标红 · ':'')+r.name+' · '+r.id);why.textContent=r.reasons.join('；');b.append(why);
    b.onclick=()=>{if(marked.has(r.id))marked.delete(r.id);else marked.add(r.id);render();};$('rows').append(b);
  }
  $('prev').disabled=page===0;$('next').disabled=page+1>=n;
  $('summary').textContent='已读取 '+rows.length+' 人 · 命中 '+hits.length+' 人 · 标红 '+marked.size+' 人';
  $('review').disabled=!!busy || !!finalIds || !marked.size || !ctx || (ctx.platform!=='bilibili' && !ctx.who);
  $('txt').disabled=!rows.length;$('settings').disabled=!!busy || !!finalIds;$('scan').disabled=!!busy || !!finalIds;
  $('stop').disabled=!busy;$('pause').disabled=busy!=='queue';$('pause').textContent=paused?'继续':'暂停';
}
async function identify(){
  const stamp=++revision;if(ctx){ctx.cancelled=true;if(ctx.platform!=='bilibili')msg(ctx,'stop').catch(()=>{});}
  ctx=null;rows=[];hits=[];marked.clear();finalIds=null;page=0;paused=false;busy='';
  $('finalBox').hidden=true;$('log').replaceChildren();$('progress').textContent='';$('scanInfo').textContent='';render();
  const t=await active();if(stamp!==revision)return;activeId=t?.id;
  const platform=route(t?.url)?.platform;$('site').textContent=platform?'当前平台 · '+names[platform]:'请打开自己的关注列表（B站／抖音／快手）';
}
$('scan').onclick=async()=>{
  const stamp=revision;let local;
  try{
    const selected=rule();busy='scan';rows=[];hits=[];marked.clear();page=0;ctx=null;$('log').replaceChildren();$('progress').textContent='';
    render();$('scanInfo').textContent='正在识别关注列表…';local=await bind();
    if(stamp!==revision || busy!=='scan')return;ctx=local;
    const result=await scanData(local,selected,s=>{if(stamp===revision)$('scanInfo').textContent=s;});
    if(stamp!==revision || ctx!==local || local.cancelled)return;
    rows=result.rows;let unknown=0;
    for(const r of rows){const x=FollowRules.evaluate(selected,r);if(x.match){r.reasons=x.reasons;hits.push(r);}else if(x.state==='unknown')unknown++;}
    $('scanInfo').textContent=(result.complete?'人数已与平台总数核对。':'名单完整性未确认。')+'有 '+unknown+' 人因数据不足无法判断。'+(result.note || '');
  }catch(e){if(stamp===revision)$('scanInfo').textContent=e.message;}
  finally{if(stamp===revision){busy='';render();}}
};
$('txt').onclick=()=>{
  const clean=s=>String(s).replace(/[\r\n\t]/g,' ');const u=URL.createObjectURL(new Blob(['\uFEFF名称\t平台ID\r\n',...rows.map(r=>clean(r.name)+'\t'+clean(r.id)+'\r\n')],{type:'text/plain;charset=utf-8'}));
  const a=el('a');a.href=u;a.download=ctx.platform+'-following.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
};
$('review').onclick=()=>{
  if(!ctx || busy || !marked.size)return;
  finalIds=hits.filter(r=>marked.has(r.id) && !r.attempted).map(r=>r.id);
  $('question').textContent='仅取消 '+names[ctx.platform]+' 已标红的 '+finalIds.length+' 个账号。未标红账号不受影响。';
  $('go').textContent='确认取关这 '+finalIds.length+' 人';$('finalBox').hidden=false;render();
};
$('back').onclick=()=>{finalIds=null;$('finalBox').hidden=true;render();};
$('go').onclick=async()=>{
  if(!finalIds?.length || busy || !ctx)return;
  const ids=finalIds,local=ctx,stamp=revision;finalIds=null;$('finalBox').hidden=true;busy='queue';paused=false;local.cancelled=false;local.approved=new Set(ids);
  const log=$('log'), lines=new Map(), records=new Map(hits.map(r=>[r.id,r]));log.replaceChildren();$('queueDetails').open=true;
  function state(id,s){lines.get(id).textContent=records.get(id).name+'（'+id+'）· '+s;}
  ids.forEach(id=>{const li=el('li');lines.set(id,li);log.append(li);state(id,'等待');});render();
  let completed=0,last='';const start=Date.now();
  function progress(){const elapsed=(Date.now()-start)/1000;const per=completed?elapsed/completed:0;
    $('progress').textContent=(paused?'已暂停 · ':'')+'已确认成功 '+completed+' / '+ids.length+(per?' · '+(60/per).toFixed(1)+' 人/分钟 · 预计剩余 '+Math.ceil(per*(ids.length-completed)/60)+' 分钟':' · 正在估算时间');}
  const timer=setInterval(()=>{if(stamp===revision)progress();},1000);
  try{await navigator.locks.request('following-cleaner-write',{ifAvailable:true},async lock=>{
    if(!lock)throw Error('另一个窗口正在处理队列');progress();
    for(const id of ids){
      while(paused && !local.cancelled)await delay(200);
      if(local.cancelled)break;await guard(local);if(local.cancelled)break;
      state(id,'正在处理');records.get(id).attempted=true;
      try{await unfollow(local,id);state(id,'成功');completed++;if(stamp===revision)marked.delete(id);}
      catch(e){state(id,e.message.includes('待核实')?'待核实 · '+e.message:'失败／未确认 · '+e.message);throw e;}
      if(completed<ids.length && !local.cancelled)await delay(2000);
    }
  });}catch(e){last=e.message;}finally{
    clearInterval(timer);local.approved.clear();
    if(stamp===revision){for(const id of ids)if(!records.get(id).attempted)state(id,'未执行');
      busy='';paused=false;progress();$('progress').textContent=(last?'已停止：'+last:local.cancelled?'已停止':'队列结束')+' · 已确认成功 '+completed+' / '+ids.length;render();}
  }
};
$('pause').onclick=()=>{paused=!paused;render();};
$('stop').onclick=()=>{if(busy==='scan'){identify();$('scanInfo').textContent='已停止扫描';return;}if(ctx)ctx.cancelled=true;paused=false;$('progress').textContent='正在停止，已发出的操作不能撤回';};
$('file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>100000)throw Error('文件超过 100 KB');imported=FollowRules.parse(await file.text());$('imported').textContent='使用导入规则：'+imported.name+' · '+JSON.stringify(imported.group);for(const id of ['mode','add','conditions'])$(id).hidden=true;}catch(err){$('imported').textContent='导入失败：'+err.message+'；请重新选择或恢复表单规则';imported=null;for(const id of ['mode','add','conditions'])$(id).hidden=false;}};
$('reset').onclick=()=>{imported=null;$('file').value='';$('imported').textContent='';for(const id of ['mode','add','conditions'])$(id).hidden=false;};
$('add').onclick=()=>add();$('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};
add('daysSinceLatest','gte',30);add('latestViews','lt',1000);
chrome.tabs.onActivated.addListener(x=>{if(x.windowId===windowId)identify();});
chrome.tabs.onUpdated.addListener((id,change)=>{if(id===activeId && (change.url || change.status==='loading'))identify();});
chrome.runtime.onMessage.addListener((m,s)=>{if(m?.type==='panel-progress' && busy==='scan' && s.tab?.id===ctx?.tabId && m.key===ctx?.key)$('scanInfo').textContent=m.text;});
chrome.windows.getCurrent().then(w=>{windowId=w.id;identify();});
