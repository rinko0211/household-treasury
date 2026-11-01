'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),
 vm=require('node:vm'),fs=require('node:fs');
const owner=fs.readFileSync('family-share-owner-v160.js','utf8');
const edge=fs.readFileSync('supabase/functions/family-variable-share/index.ts','utf8');
function env(){
 const calls=[],listeners={};
 const win={
  householdShareSyncContext:()=>({ready:true,blocked:false,revision:17,token:'test-jwt'}),
  getTreasuryState:()=>({}),
  householdUsageLedgerV157:{
   period:()=>({start:'2026-10-16',end:'2026-11-17'}),
   calculate:()=>({start:'2026-10-16',end:'2026-11-17',usageRows:[],
     normalUndetermined:0,reviewCount:0})
  },
  householdExpenseUnifiedV148:{
   usageBuckets:()=>[{id:'variable',amount:0,items:[]}],
   categoryGroups:()=>[],rowDetails:r=>r
  },
  householdSemanticV47:{CATEGORY_DEFS:{OTHER:{label:'その他'}}},
  householdExpenseNatureV152:{subcategoryLabels:{}},
  householdPersonalLedgerV186:{presentation:()=>({matched:new Set()})},
  dispatchEvent:()=>{},
  addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn)}
 };
 const doc={readyState:'loading',addEventListener:()=>{},getElementById:()=>null};
 const fetch=async(url,opts)=>{
  const body=JSON.parse(opts.body);calls.push(body);
  const payload=body.action==='owner'?
   {exists:true,enabled:true,budget:270000,published_at:'2026-10-31T20:00:00Z',snapshot_version:2}:
   {enabled:true,published_at:'2026-11-01T07:30:00Z'};
  return {ok:true,json:async()=>payload};
 };
 const ctx={window:win,document:doc,fetch,Date,Intl,Number,
  String,Math,Array,Object,Map,Set,RegExp,Error,
  localStorage:{getItem:()=>null,setItem:()=>{}},
  setTimeout:()=>{},clearTimeout:()=>{},URL,Event:class {}};
 vm.runInNewContext(owner,ctx,{filename:'family-share-owner-v160.js'});
 return {api:win.householdFamilyShareV160,listeners,calls};
}
test('reload status and cloud re-sync never change published timestamp',async()=>{
 const x=env();
 await x.api.refreshStatus(true);
 assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].action,'owner');
 x.listeners.householdShareCloudSyncedV160[0]();
 await new Promise(r=>setImmediate(r));
 assert.equal(x.calls.filter(c=>c.action==='publish').length,0);
 assert.ok(x.calls.every(c=>c.action==='owner'));
});
test('the explicit owner button publish is the sole writer of published_at',async()=>{
 const x=env();
 await x.api.publish();
 const publish=x.calls.filter(c=>c.action==='publish');
 assert.equal(publish.length,1);
 assert.equal(publish[0].manual_trigger,'wife-publish-button-v206');
 assert.equal(publish[0].snapshot.variable,0);
 assert.equal(publish[0].snapshot.schema_version,2);
 assert.equal(publish[0].snapshot.source_revision,17);
});
test('old auto publish cannot call the backend publish action',()=>{
 assert.match(edge,/input\?\.manual_trigger!=='wife-publish-button-v206'/);
 assert.match(edge,/published_at:now,updated_at:now/);
 assert.match(edge,/if\(action==='owner'\)/);
 assert.match(edge,/if\(action==='view'\)/);
 assert.doesNotMatch(owner,/publish\(true\)/);
 assert.doesNotMatch(owner,/autoTimer=setTimeout/);
});
