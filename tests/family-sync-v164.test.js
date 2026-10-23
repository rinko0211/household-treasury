'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('family-share-owner-v160.js','utf8');
const callbacks={},tasks=[],published=[],apiCalls=[];
let ready=false;
const window={
 addEventListener:(name,fn)=>{callbacks[name]=fn},
 householdShareSyncContext:()=>({token:'owner-private-jwt',ready,blocked:false,revision:332}),
 getTreasuryState:()=>({}),
 householdUsageLedgerV157:{
  period:()=>({start:'2026-10-16',end:'2026-11-17'}),
  calculate:()=>({start:'2026-10-16',end:'2026-11-17',normalUndetermined:900,reviewCount:4,usageRows:[]})
 },
 householdExpenseUnifiedV148:{
  usageBuckets:()=>[{id:'variable',amount:36085,items:[]}],
  categoryGroups:()=>[
   {key:'DAILY_GOODS',amount:16122,subcategories:[
    {key:'DAILY_GOODS.CLOTHING',amount:11460,items:[{date:'2026-10-20',amount:11460,subcategory:'CLOTHING',label:'REDACTED MERCHANT'}]},
    {key:'DAILY_GOODS.HOUSEHOLD',amount:4662,items:[{date:'2026-10-20',amount:4662,subcategory:'HOUSEHOLD'}]}
   ]},
   {key:'FOOD',amount:19963,subcategories:[{key:'FOOD.OTHER',amount:19963,items:[{date:'2026-10-21',amount:19963,subcategory:'OTHER'}]}]}
  ]
 },
 householdSemanticV47:{CATEGORY_DEFS:{DAILY_GOODS:{label:'日用品'},FOOD:{label:'食費'},OTHER:{label:'その他'}}},
 householdExpenseNatureV152:{subcategoryLabels:{
  'DAILY_GOODS.CLOTHING':'衣類','DAILY_GOODS.HOUSEHOLD':'生活用品','FOOD.OTHER':'その他'
 }}
};
const fetch=async(_url,request)=>{
 const b=JSON.parse(request.body);apiCalls.push(b.action);
 if(b.action==='owner')return{ok:true,json:async()=>({exists:true,enabled:true,budget:270000,snapshot_version:1,published_at:'2026-10-23T01:59:49Z'})};
 if(b.action==='publish'){published.push(b.snapshot);return{ok:true,json:async()=>({enabled:true})}};
 throw Error('Unexpected '+b.action);
};
const document={readyState:'loading',getElementById:()=>null,addEventListener:(n,fn)=>callbacks[n]=fn};
const setTimeout=(fn)=>{tasks.push(fn);return tasks.length},clearTimeout=()=>{};
vm.runInNewContext(source,{
 window,document,localStorage:{getItem:()=>null,setItem:()=>{}},setTimeout,clearTimeout,
 fetch,Intl,Date,Number,String,Math,Array,Set,Map,Error,JSON,URL
});
assert.equal(ready,false);
assert.ok(callbacks.householdShareCloudSyncedV160);
// Simulate cloud login and initialization resolving AFTER original UI setup.
ready=true;
callbacks.householdShareCloudSyncedV160();
for(let i=0;i<12&&tasks.length;i++){
 const task=tasks.shift();
 await task();
 for(let j=0;j<8;j++)await Promise.resolve();
}
assert.ok(apiCalls.includes('owner'),'Owner status fetched after delayed sync');
assert.ok(apiCalls.includes('publish'),'Share published even when enabled state was initially unknown');
assert.equal(published.length,1);
assert.equal(published[0].schema_version,2);
assert.equal(published[0].variable,36085);
assert.equal(published[0].categories.find(x=>x.key==='DAILY_GOODS').subcategories.length,2);
assert.ok(!JSON.stringify(published[0]).includes('REDACTED MERCHANT'),'Private merchant excluded');
console.log('FAMILY_SYNC_V164_DELAYED_INITIALIZATION_PASS');
