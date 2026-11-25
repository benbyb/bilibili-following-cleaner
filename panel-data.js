const names={bilibili:'哔哩哔哩',douyin:'抖音',kuaishou:'快手'};
function route(raw) {
  let u;try{u=new URL(raw);}catch{return null;}
  if(u.protocol!=='https:')return null;
  const mid=u.hostname==='space.bilibili.com' && /^\/(\d+)\/relation\/follow\/?$/.exec(u.pathname)?.[1];
  if(mid)return {platform:'bilibili',mid};
  if(u.hostname==='www.douyin.com' && /^\/follow\/?$/.test(u.pathname))return {platform:'douyin'};
  if(u.hostname==='www.kuaishou.com')return {platform:'kuaishou'};
  return null;
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function active(){return (await chrome.tabs.query({active:true,currentWindow:true}))[0];}
async function api(path,opt={}){
  const r=await fetch('https://api.bilibili.com'+path,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(20000),...opt});
  if(!r.ok) throw Error('平台 HTTP '+r.status);
  const d=await r.json();if(d.code!==0)throw Error(d.message || '平台拒绝请求');return d.data;
}
async function msg(c,type,extra={}){
  const d=await chrome.tabs.sendMessage(c.tabId,{type:'panel:'+type,key:c.key,who:c.who,...extra});
  if(!d?.ok)throw Error(d?.error || '页面未响应，请刷新平台页面');return d;
}
async function guard(c){
  const t=await active();if(!t || t.id!==c.tabId || t.url!==c.url || c.cancelled)throw Error('任务已停止或标签页已变化');
}
async function bind(){
  const t=await active(), parsed=route(t?.url);
  if(!parsed)throw Error('请先打开哔哩哔哩、抖音或快手的「我的关注」页面');
  const c={...parsed,tabId:t.id,url:t.url};
  if(c.platform==='bilibili'){
    const nav=await api('/x/web-interface/nav');
    if(!nav?.isLogin || String(nav.mid)!==c.mid)throw Error('请登录并打开自己的 B 站关注列表');
    c.key=getMixinKey(getImageKey(nav.wbi_img?.img_url)+getImageKey(nav.wbi_img?.sub_url));
  }else Object.assign(c,await msg(c,'context'));
  await guard(c);return c;
}
function fields(g){return g.conditions ? g.conditions.flatMap(fields) : [g.field];}
function num(x){return Number.isFinite(x) && x>=0 ? x:null;}
function avg3(list,key){return list.length===3 && list.every(v=>num(v[key])!==null)?list.reduce((sum,v)=>sum+v[key],0)/3:null;}
async function scanData(c,rule,progress){
  await guard(c);
  if(c.platform!=='bilibili')return msg(c,'scan',{fields:fields(rule.group)});
  const rows=new Map(), needed=fields(rule.group);let total=null,note='';
  try {
    for(let page=1;page<=200;page++){
      await guard(c);
      const data=await api('/x/relation/followings?vmid='+c.mid+'&ps=50&pn='+page+'&order=desc&order_type=attention');
      if(!Array.isArray(data?.list))throw Error('名单格式无法识别');
      const size=rows.size;total=num(data.total);
      for(const item of data.list){
        if(!Number.isSafeInteger(item.mid) || item.mid<=0)continue;
        const id=String(item.mid);rows.set(id,{id,name:item.uname || id,avatarUrl:item.face,profileUrl:'https://space.bilibili.com/'+id});
      }
      progress('已读取 '+rows.size+' / '+(total??'未知')+' 人');
      if(rows.size===total || data.list.length<50 || rows.size===size)break;
      await delay(1200);
    }
    let i=0;
    const video=needed.some(f=>['workCount','daysSinceLatest','latestViews','latestComments','last3AverageViews','last3AverageComments'].includes(f));
    if(video && c.key.length!==32)throw Error('无法读取作品信息');
    if(video || needed.includes('followerCount'))for(const row of rows.values()){
      await guard(c);progress('核对账号资料 '+(++i)+' / '+rows.size+' · '+row.name);
      if(video){
        const q=encodeWbi({mid:row.id,pn:1,ps:3,order:'pubdate',platform:'web',web_location:1550101},c.key);
        const d=await api('/x/space/wbi/arc/search?'+q);
        const videos=d?.list?.vlist;if(!Array.isArray(videos))throw Error('作品数据未能核实');
        const list=videos.slice().sort((a,b)=>b.created-a.created).slice(0,3), latest=list[0];
        row.workCount=num(d?.page?.count);row.latestViews=num(latest?.play);row.latestComments=num(latest?.comment);
        row.last3AverageViews=avg3(list,'play');row.last3AverageComments=avg3(list,'comment');
        if(num(latest?.created)>0 && latest.created<=Date.now()/1000)row.daysSinceLatest=Math.floor((Date.now()/1000-latest.created)/86400);
      }
      if(needed.includes('followerCount')){await guard(c);row.followerCount=num((await api('/x/relation/stat?vmid='+row.id))?.follower);}
      await delay(1200);
    }
  }catch(e){if(!rows.size || c.cancelled)throw e;note='读取中断：'+e.message+'。保留已读数据，未读字段为未知。';}
  await guard(c);return {rows:[...rows.values()],total,complete:rows.size===total,note};
}
async function unfollow(c,id){
  await guard(c);
  if(!c.approved?.has(id))throw Error('不在本次确认名单中');
  if(c.platform!=='bilibili')return msg(c,'unfollow',{id});
  const nav=await api('/x/web-interface/nav');if(!nav?.isLogin || String(nav.mid)!==c.mid)throw Error('登录账号已变化');
  const relation=()=>api('/x/relation?fid='+encodeURIComponent(id));
  if(![2,6].includes((await relation())?.attribute))throw Error('当前关注关系无法确认');
  const token=(await chrome.tabs.sendMessage(c.tabId,{type:'request-csrf-token'}))?.token;
  if(!token)throw Error('登录凭据不可用');
  await guard(c);
  try{await api('/x/relation/modify',{method:'POST',body:new URLSearchParams({fid:id,act:'2',re_src:'11',csrf:token})});
    const attr=(await relation())?.attribute;if(attr!==0)throw Error('关注关系尚未确认');
  }catch(e){throw Error('结果待核实：'+e.message+'；不自动重试');}
}
