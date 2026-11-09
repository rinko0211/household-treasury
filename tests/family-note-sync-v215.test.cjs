'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const owner=fs.readFileSync('family-share-owner-v160.js','utf8');
const viewer=fs.readFileSync('family/family.js','utf8');
const familyHtml=fs.readFileSync('family/index.html','utf8');
const edge=fs.readFileSync('supabase/functions/family-variable-share/index.ts','utf8');
const sync=fs.readFileSync('sync-v24.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const appHtml=fs.readFileSync('index.html','utf8');
assert.ok(owner.includes('familyShareMessageV215'));
assert.ok(owner.includes("localStorage.setItem(NOTE_DRAFT_KEY,editor.value)"));
assert.ok(owner.includes('localStorage.removeItem?.(NOTE_DRAFT_KEY)'));
assert.ok(owner.includes("const snapshot={...makeSnapshot(),note};"));
assert.ok(familyHtml.includes('id="familyShareMessagePanelV215"'));
assert.ok(familyHtml.includes('family.js?v=215'));
assert.ok(viewer.includes("typeof v.note==='string'?v.note.trim():''"));
assert.ok(viewer.includes("$('familyShareMessageTextV215').textContent=note"));
assert.ok(!viewer.includes("$('familyShareMessageTextV215').innerHTML"));
assert.ok(edge.includes("typeof note!=='string'||note.length>160"));
assert.ok(edge.includes("note:note.trim()"));
assert.ok(edge.includes("note:String(data?.snapshot?.note??'')"));
assert.ok(edge.includes("!Object.hasOwn(input.snapshot,'note')"),'Old tab must not erase a saved note');
assert.ok(appHtml.includes('./family-share-owner-v160.js?v=215'));
assert.ok(appHtml.includes('./sync-v26.js?v=216'));
assert.ok(sw.includes('./family-share-owner-v160.js?v=215'));
assert.ok(sw.includes('./sync-v24.js?v=216'));
assert.ok(sw.includes('./family/family.js?v=215'));
assert.ok(sync.includes('Never replay writes after an ambiguous timeout'));
assert.ok(sync.includes("lastSuccessfulCheckAt>30000"));
assert.ok(sync.includes("lastSuccessfulCheckAt=Date.now()"));
assert.ok(sync.includes("fingerprint(stateNow())!==fingerprint(current)"));
const results=[];
const message={value:'今週もありがとう！'};
const window={
 householdShareSyncContext:()=>({ready:true,blocked:false,revision:12,token:'fake-jwt'}),
 getTreasuryState:()=>({}),
 householdUsageLedgerV157:{period:()=>({start:'2026-10-16',end:'2026-11-17'}),
 calculate:()=>({start:'2026-10-16',end:'2026-11-17',normalUndetermined:0,reviewCount:0,usageRows:[]})},
 householdExpenseUnifiedV148:{usageBuckets:()=>[{id:'variable',amount:0,items:[]}],
 categoryGroups:()=>[],rowDetails:x=>x},
 householdSemanticV47:{CATEGORY_DEFS:{OTHER:{label:'その他'}}},
 householdExpenseNatureV152:{subcategoryLabels:{}},
 householdPersonalLedgerV186:{presentation:()=>({matched:new Set()})},
 addEventListener:()=>{},dispatchEvent:()=>{}
};
const document={readyState:'loading',addEventListener:()=>{},
 getElementById:id=>id==='familyShareMessageV215'?message:null};
vm.runInNewContext(owner,{
 window,document,fetch:async(_url,options)=>{
  const data=JSON.parse(options.body);
  results.push(data);
  return {ok:true,json:async()=>({enabled:true})};
 },localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
 setTimeout:()=>{},clearTimeout:()=>{},Intl,Date,Number,String,Math,Array,Object,Set,Map,Error,JSON,URL
});
async function run(){
 await window.householdFamilyShareV160.publish();
 const payload=results.find(x=>x.action==='publish');
 assert.equal(payload.snapshot.note,'今週もありがとう！');
 assert.equal(payload.manual_trigger,'wife-publish-button-v206');
 assert.equal(payload.snapshot.source_revision,12);
 // Isolate the read-only retry logic without running Supabase client bootstrap.
 const remoteFn=sync.match(/async function fetchRemote\(\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(remoteFn,'safe remote read function');
 let attempts=0;
 const ctx={
 SUPABASE_URL:'https://example.invalid',user:{id:'example'},Date,
 encodeURIComponent,restHeaders:()=>({}),Array,Promise,
 navigator:{onLine:true},
 setTimeout:fn=>{fn();return 1},
 fetchJson:async()=>{
  attempts++;
  if(attempts<3)throw Error('クラウド取得失敗 (503)');
  return [{revision:13}];
 }};
 vm.runInNewContext(remoteFn+';this.remote=fetchRemote;',ctx);
 const row=await ctx.remote();
 assert.equal(row.revision,13);
 assert.equal(attempts,3,'Transient GET recovers after bounded retries');
 ctx.fetchJson=async()=>{attempts++;throw Error('クラウド取得失敗 (401)')};
 attempts=0;
 await assert.rejects(ctx.remote(),/401/);
 assert.equal(attempts,1,'Authentication errors must never retry');
 console.log('FAMILY_NOTE_SYNC_V215_PASS');
}
run().catch(e=>{console.error(e);process.exitCode=1});
