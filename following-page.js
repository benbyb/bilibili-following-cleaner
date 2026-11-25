/* Read only the following list, never the surrounding feed. */
(() => {
  const dy = location.hostname === 'www.douyin.com';
  const profile = dy ? /^\/user\/([\w-]+)\/?$/ : /^\/profile\/([\w-]+)\/?$/;
  const nonce = crypto.randomUUID();
  const visible = el => !!el?.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const identity = a => {
    try { const u = new URL(a.href); return u.origin === location.origin && profile.exec(u.pathname)?.[1] || ''; } catch {return '';}
  };
  function owner() {
    const ids = new Set([...document.querySelectorAll('header a[href],nav a[href],[data-e2e="user-info"] a[href]')]
      .filter(a => visible(a) && (a.closest('[data-e2e="user-info"]') || /^(我|我的|个人主页)$/.test(a.textContent.trim()) || a.getAttribute('aria-label') === '我的主页'))
      .map(identity).filter(Boolean));
    return ids.size === 1 ? [...ids][0] : '';
  }
  function root() {
    const explicit = [...document.querySelectorAll('[data-e2e="following-list"],[data-e2e="follow-user-list"],[data-following-list],[aria-label="我的关注"],[aria-label="关注列表"]')].filter(el=>visible(el) && el.querySelector('a[href]') && !el.querySelector('video'));
    if (explicit.length === 1) return explicit[0];
    if (!dy || location.pathname.replace(/\/$/,'') !== '/follow') return null;
    const input = [...document.querySelectorAll('input[placeholder]')].find(el=>visible(el) && /搜索用户.*抖音号/.test(el.placeholder));
    for(let el=input?.parentElement; el && el!==document.body; el=el.parentElement) {
      if(el.querySelector('video,main video,[data-e2e="feed-active-video"]')) return null;
      if([...el.querySelectorAll('a[href]')].some(identity)) return el;
    }
    return null;
  }
  function rowFor(anchor, box, id) {
    for(let el=anchor; el && el!==box; el=el.parentElement) {
      if([...el.querySelectorAll('a[href]')].some(a=>identity(a) && identity(a)!==id)) break;
      if(el.matches('li,[role="listitem"],[data-e2e*="user-item"],[data-following-row]')) return el;
    }
    return anchor;
  }
  const count = value => /^\d+$/.test(value || '') && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  let scanned = null, serial = 0;
  function collect(box, result) {
    for(const a of box.querySelectorAll('a[href]')) {
      const id=identity(a); if(!id || !visible(a)) continue;
      const el=rowFor(a,box,id), img=a.querySelector('img'), name=(a.title || a.innerText || img?.alt || '').trim();
      if(!name || name.length>160) continue;
      const status = el.querySelector('[data-e2e="account-status"],[data-account-status]')?.textContent.trim();
      result.set(id,{id,name,avatarUrl:img?.currentSrc || null,
        accountStatus:['已封禁','已注销','已禁言','限制投稿'].includes(status)?status:null,
        workCount:count(el.getAttribute('data-work-count')), followerCount:count(el.getAttribute('data-follower-count')),
        profileUrl:new URL(a.href).origin+new URL(a.href).pathname});
    }
  }
  chrome.runtime.onMessage.addListener((m,s,reply)=>{
    if(s.id!==chrome.runtime.id || !m?.type?.startsWith('panel:')) return;
    (async()=>{
      if(m.type==='panel:stop') {serial++;scanned=null;return {};}
      const box=root(), key=nonce+'|'+location.href, who=owner();
      if(!box || (dy && location.pathname.replace(/\/$/,'')!=='/follow')) throw Error('未识别到独立的关注列表。请打开自己的关注列表；扩展不会改扫推荐视频。');
      if(m.type==='panel:context') return {key,who};
      if(m.key!==key || m.who!==who) throw Error('页面或登录身份已变化，请重新扫描');
      if(m.type==='panel:scan'){
        const run=++serial, rows=new Map(); scanned=null;
        const progress=text=>chrome.runtime.sendMessage({type:'panel-progress',key,text}).catch(()=>{});
        const scroller=[box,...box.querySelectorAll('*')].find(el=>el.scrollHeight>el.clientHeight+8 && /auto|scroll/.test(getComputedStyle(el).overflowY) && el.querySelector('a[href]'));
        const check=()=>{if(serial!==run || !box.isConnected || location.href!==key.slice(nonce.length+1) || owner()!==who) throw Error('扫描已停止：页面或身份改变');};
        const initial=scroller?.scrollTop;
        try {
          if(scroller){scroller.scrollTop=0;await wait(350);}
          for(let i=0;i<1500;i++){
            check();collect(box,rows);if(i%5===0)progress('已读取 '+rows.size+' 个有主页标识的账号');if(!scroller) break;
            const before=scroller.scrollTop;
            scroller.scrollTop+=Math.max(1,scroller.clientHeight*0.8);
            await wait(450);if(scroller.scrollTop===before){await wait(650);check();collect(box,rows);if(scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-2) break;}
          }
          let note='';
          const detailFields=(m.fields||[]).filter(f=>['workCount','followerCount','latestViews','latestComments','daysSinceLatest','last3AverageViews','last3AverageComments'].includes(f));
          if(detailFields.length){
            let empty=0,idx=0;
            for(const row of rows.values()){
              check();idx++;if(!detailFields.some(f=>row[f]==null))continue;
              progress('核对可读资料 '+idx+' / '+rows.size+' · '+row.name);
              try{
                const r=await fetch(row.profileUrl,{credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(12000)});
                if(!r.ok)throw Error('HTTP '+r.status);
                const html=await r.text();if(html.length>5000000)throw Error('页面过大');
                const facts=profileFacts(new DOMParser().parseFromString(html,'text/html'),dy?'douyin':'kuaishou',row.id);
                Object.assign(row,facts);empty=detailFields.some(f=>facts[f]!=null)?0:empty+1;
                if(empty>=3)throw Error('连续三份资料未提供可核验字段');
              }catch(e){note='资料补充已停止：'+e.message+'。';break;}
              check();await wait(1200);
            }
          }
          check();scanned={ids:new Set(rows.keys()),box,key,who};
          return {rows:[...rows.values()],complete:false,note:note+'仅统计关注列表中能绑定主页 ID 的账号，未核实完整性。未提供的指标按未知处理。'+(!who?' 未能核验当前账号，只读。':'')};
        } finally {if(scroller?.isConnected) scroller.scrollTop=initial;}
      }
      if(m.type!=='panel:unfollow' || !who || !scanned?.ids.has(m.id) || scanned.box!==box || scanned.key!==key || scanned.who!==who) throw Error('身份或名单无法核验，未执行');
      if(!dy && !(/^\/follow(?:ing)?\/?$/.test(location.pathname) || profile.exec(location.pathname)?.[1]===who))throw Error('快手页面尚不能确认是本人的关注页，不执行取关');
      const findRow=()=>{const a=[...box.querySelectorAll('a[href]')].find(a=>identity(a)===m.id && visible(a));return a && rowFor(a,box,m.id);};
      const controls=label=>[...(findRow()?.querySelectorAll('button,[role="button"]') || [])].filter(el=>visible(el) && el.textContent.trim()===label);
      const direct=controls('取消关注'), toggle=controls('已关注');
      if(direct.length===1)direct[0].click();
      else if(!direct.length && toggle.length===1){
        toggle[0].click();await wait(350);
        if(!box.isConnected || owner()!==who || nonce+'|'+location.href!==key)throw Error('结果待核实：页面已变化');
        const confirm=controls('取消关注');
        if(confirm.length===1 && !controls('关注').length)confirm[0].click();
      }else throw Error('目标行没有唯一的关注关系按钮，未操作；可在平台手动复核');
      for(let i=0;i<12;i++){await wait(250);if(!box.isConnected || owner()!==who || nonce+'|'+location.href!==key) break;if(controls('关注').length===1 && !controls('取消关注').length)return {};}
      throw Error('结果待核实：页面未确认已取消关注，不自动重试');
    })().then(data=>reply({ok:true,...data}),e=>reply({ok:false,error:e.message}));return true;
  });
})();
