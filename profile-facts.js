// Only accept fields on an object bearing the exact scanned profile identifier.
// A video happening to be on a profile/feed is not evidence of its author.
function profileFacts(doc, platform, id){
  const facts={},number=v=>Number.isSafeInteger(v)&&v>=0?v:null;
  function posts(x){
    // Never harvest a general feed, a pinned first item, or an arbitrary user's video.
    const list=x.aweme_list??x.awemeList??x.photoList;
    if(!Array.isArray(list)||!list.length || ![false,0].includes(x.has_more??x.hasMore) ||
       !(x.cursor===0 || x.min_cursor===0 || x.page===1) ||
       !(x.listType==='posts' || x.list_type==='posts' || x.type==='user_post'))return;
    const videos=[];
    for(const p of list){
      const author=p?.author,owner=platform==='douyin'?(author?.sec_uid??author?.secUid):(author?.userId??author?.user_id);
      const time=number(p?.create_time??p?.createTime),s=p?.statistics??p;
      if(owner!==id || !time)return;
      const ms=time<1e11?time*1000:time;if(ms>Date.now() || ms<946684800000)return;
      videos.push({ms,views:number(s.play_count??s.playCount??s.viewCount),comments:number(s.comment_count??s.commentCount)});
    }
    videos.sort((a,b)=>b.ms-a.ms);const v=videos[0];
    facts.daysSinceLatest=Math.floor((Date.now()-v.ms)/86400000);
    facts.latestViews=v.views;facts.latestComments=v.comments;
    const three=videos.slice(0,3);
    for(const [key,field] of [['views','last3AverageViews'],['comments','last3AverageComments']]){
      if(three.length===3 && three.every(v=>v[key]!==null))facts[field]=three.reduce((sum,v)=>sum+v[key],0)/3;
    }
  }
  const pending=[];
  for(const s of doc.querySelectorAll('script[type="application/json"],script#RENDER_DATA,script#__NEXT_DATA__')){
    const text=s.textContent.trim();if(!text || text.length>4000000)continue;
    try{pending.push(JSON.parse(text.startsWith('%')?decodeURIComponent(text):text));}catch{/* Unsupported page state. */}
  }
  let budget=60000;
  while(pending.length && --budget){
    const x=pending.pop();if(!x || typeof x!=='object')continue;
    posts(x);
    const ident=platform==='douyin'?(x.sec_uid??x.secUid):(x.user_id??x.userId);
    if(typeof ident==='string' && ident===id && (typeof x.nickname==='string' || typeof x.userName==='string')){
      const followers=number(x.follower_count??x.followerCount??x.fanCount), works=number(x.aweme_count??x.awemeCount??x.photoCount);
      if(followers!==null)facts.followerCount=followers;if(works!==null)facts.workCount=works;
    }
    for(const v of Object.values(x))if(v && typeof v==='object')pending.push(v);
  }
  return facts;
}
if(typeof module!=='undefined')module.exports=profileFacts;
