const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('scan is read-only; marking and final confirmation authorize only the selected account',async()=>{
  class E{
    constructor(){this.children=[];this.value='';}
    set value(v){this._value=String(v);}get value(){return this._value;}
    append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}
    add(x){this.children.push(x);if(this.children.length===1)this.value=x.value;}
    setAttribute(k,v){this[k]=v;}
  }
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new E());return elements.get(id);};
  const event={addListener(){}}, writes=[];
  const c={document:{createElement:()=>new E(),getElementById:get},Option:class{constructor(text,value){Object.assign(this,{text,value});}},
    chrome:{tabs:{onActivated:event,onUpdated:event},windows:{getCurrent:async()=>({id:1})},runtime:{onMessage:event}},
    navigator:{locks:{request:async(_,__,fn)=>fn(true)}},setInterval:()=>1,clearInterval(){},
    active:async()=>({id:8,url:'fixture'}),route:()=>({platform:'bilibili'}),names:{bilibili:'B站'},
    bind:async()=>({platform:'bilibili',tabId:8}),scanData:async()=>({rows:[{id:'a',name:'甲',latestViews:12},{id:'b',name:'乙',latestViews:0},{id:'c',name:'丙'}]}),
    guard:async()=>{},unfollow:async(ctx,id)=>{assert.deepEqual([...ctx.approved],[id]);writes.push(id);},FollowRules:require('./rules.js')};
  vm.createContext(c);vm.runInContext(fs.readFileSync('sidepanel.js','utf8'),c);await new Promise(r=>setImmediate(r));
  get('mode').value='any';await get('scan').onclick();assert.deepEqual(writes,[]);
  assert.equal(get('rows').children.length,2);assert.equal(get('review').disabled,true);
  get('rows').children[0].onclick();get('rows').children[0].onclick(); // red then undo
  get('rows').children[1].onclick();get('review').onclick();assert.deepEqual(writes,[]);
  get('back').onclick();assert.deepEqual(writes,[]);get('review').onclick();
  await get('go').onclick();assert.deepEqual(writes,['b']);assert.match(get('progress').textContent,/成功 1 \/ 1/);
});
