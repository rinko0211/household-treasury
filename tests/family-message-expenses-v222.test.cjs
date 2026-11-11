'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const owner=fs.readFileSync('family-share-owner-v160.js','utf8');
const css=fs.readFileSync('ui-modern-v169.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
assert.match(owner,/function mountMessageEditor\(/);
assert.match(owner,/expenses\.prepend\(panel\)/);
assert.match(owner,/publishButton\.click\(\)/);
assert.match(css,/#expenses>\.family-message-editor-v222/);
assert.match(html,/family-share-owner-v160\.js\?v=222/);
assert.match(sw,/family-share-owner-v160\.js\?v=222/);
assert.doesNotMatch(owner.slice(owner.indexOf("panel.innerHTML='<div class=\"title\">家族用"),owner.indexOf("cloud.parentElement.appendChild(panel)")),/id="familyShareMessageV215"/,'Editor must not appear in Settings panel');
const els=new Map(),calls=[],local=new Map(),events=[];
class Node{
 constructor(id=''){this.id=id;this.style={};this.classList={add:()=>{}};this.handlers={};
  this.children=[];this.value='';this.disabled=false;this.parentElement=null;this.textContent='';
 }
 set innerHTML(s){
  this._html=String(s);
  for(const m of this._html.matchAll(/id="([^"]+)"/g))if(!els.has(m[1]))els.set(m[1],new Node(m[1]));
 }
 get innerHTML(){return this._html||''}
 appendChild(child){child.parentElement=this;this.children.push(child);return child}
 prepend(child){child.parentElement=this;this.children.unshift(child);return child}
 setAttribute(){}
 closest(){return null}
 addEventListener(type,fn){this.handlers[type]=fn}
 click(){if(typeof this.onclick==='function')this.onclick();this.handlers.click?.()}
}
const expenses=new Node('expenses'),cloudDetail=new Node('cloudDetail'),settings=new Node('settings'),cloudCard=new Node('cloudCard');
cloudDetail.closest=()=>cloudCard;cloudCard.parentElement=settings;
els.set('expenses',expenses);els.set('cloudDetail',cloudDetail);
const doc={readyState:'loading',getElementById:id=>els.get(id)||null,
 querySelector:()=>null,createElement:()=>new Node(),addEventListener:()=>{}};
const win={
 householdShareSyncContext:()=>({ready:true,blocked:false,revision:12,token:'test-jwt'}),
 getTreasuryState:()=>({}),
 householdUsageLedgerV157:{period:()=>({start:'2026-10-16',end:'2026-11-17'}),
 calculate:()=>({start:'2026-10-16',end:'2026-11-17',normalUndetermined:0,reviewCount:0,usageRows:[]})},
 householdExpenseUnifiedV148:{usageBuckets:()=>[{id:'variable',amount:0,items:[]}],
 categoryGroups:()=>[],rowDetails:x=>x},
 householdSemanticV47:{CATEGORY_DEFS:{OTHER:{label:'その他'}}},
 householdExpenseNatureV152:{subcategoryLabels:{}},
 householdPersonalLedgerV186:{presentation:()=>({matched:new Set()})},
 addEventListener:()=>{},dispatchEvent:()=>events.push('dispatch')
};
const store={getItem:k=>local.has(k)?local.get(k):null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)};
const fetch=async(_url,options)=>{
 const payload=JSON.parse(options.body);calls.push(payload);
 return {ok:true,json:async()=>payload.action==='owner'?
  {exists:true,enabled:true,budget:270000,note:'前回の公開文',snapshot_version:2}: {enabled:true}};
};
vm.runInNewContext(owner,{window:win,document:doc,localStorage:store,fetch,
 Intl,Date,Number,String,Array,Map,Set,Object,Math,JSON,RegExp,Error,URL,
 Event:class{},setTimeout:()=>1,clearTimeout:()=>{},console});
async function test(){
 assert.ok(win.householdFamilyShareV160.mount());
 await Promise.resolve();await Promise.resolve();
 const editorPanel=els.get('familyShareMessageEditorV222');
 const settingsPanel=els.get('familySharePanelV160');
 assert.equal(editorPanel.parentElement,expenses,'Editor must be a child of Expenses, not Settings');
 assert.equal(expenses.children[0],editorPanel,'Editor must be prominent at top of Expenses');
 assert.equal(settingsPanel.parentElement,settings,'Budget/link panel remains in Settings');
 assert.ok(!settingsPanel.innerHTML.includes('id="familyShareMessageV215"'));
 const textarea=els.get('familyShareMessageV215'),counter=els.get('familyShareMessageCountV215');
 assert.equal(textarea.value,'前回の公開文','The published note appears as initial editor value');
 textarea.value='今日はありがとう！';textarea.handlers.input();
 assert.equal(store.getItem('householdFamilyShareNoteDraftV215'),'今日はありがとう！');
 assert.ok(counter.textContent.includes('160文字'));
 const p=els.get('familyShareNotePublishV222');
 p.click();await Promise.resolve();await Promise.resolve();await Promise.resolve();
 const publishes=calls.filter(x=>x.action==='publish');
 assert.equal(publishes.length,1,'Exactly one publish from the new Expenses button');
 assert.equal(publishes[0].snapshot.note,'今日はありがとう！');
 assert.equal(publishes[0].manual_trigger,'wife-publish-button-v206');
 assert.equal(store.getItem('householdFamilyShareNoteDraftV215'),null,'Draft only cleared on successful publish');
 assert.equal(expenses.children.length,1,'Cloud refresh must not recreate the editor');
 win.householdFamilyShareV160.mountMessageEditor();
 assert.equal(expenses.children.length,1,'Mount is idempotent');
 console.log('FAMILY_MESSAGE_EXPENSES_V222_PASS');
}
test().catch(err=>{console.error(err);process.exitCode=1});
