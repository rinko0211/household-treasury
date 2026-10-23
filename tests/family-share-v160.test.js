'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const owner=fs.readFileSync('family-share-owner-v160.js','utf8');
const viewer=fs.readFileSync('family/family.js','utf8');
const page=fs.readFileSync('family/index.html','utf8');
const server=fs.readFileSync('supabase/functions/family-variable-share/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/family_variable_share_restricted_v160.sql','utf8');
const window={
 householdShareSyncContext:()=>({ready:true,blocked:false,revision:17,token:'synthetic'}),
 getTreasuryState:()=>({}),
 householdUsageLedgerV157:{
  period:()=>({start:'2026-10-16',end:'2026-11-17'}),
  calculate:()=>({start:'2026-10-16',end:'2026-11-17',normalUndetermined:300,reviewCount:2,
   usageRows:[
    {kind:'cash',amount:500,spendingClass:'NORMAL',costBucket:'VARIABLE',category:'FOOD',label:'PRIVATE MERCHANT'},
    {kind:'purchase',amount:1200,spendingClass:'NORMAL',costBucket:'VARIABLE',category:'CHILD',label:'PRIVATE MERCHANT2'},
    {kind:'purchase',amount:700,spendingClass:'NORMAL',costBucket:'FIXED',category:'OTHER'},
    {kind:'cash',amount:400,spendingClass:'SPECIAL',costBucket:'VARIABLE',category:'FOOD'},
    {kind:'investment',amount:5000,spendingClass:'NORMAL',costBucket:'VARIABLE',category:'OTHER'}
   ]})
 },
 householdExpenseUnifiedV148:{
  rowDetails:r=>r,
  usageBuckets:()=>[{id:'variable',amount:1700,items:[]}],
  categoryGroups:()=>[
   {key:'CHILD',label:'子ども',amount:1200,subcategories:[
    {key:'CHILD.OTHER',label:'その他',amount:1200,items:[
     {amount:1200,subcategory:'OTHER',date:'2026-10-18',label:'PRIVATE MERCHANT2'}
    ]}
   ]},
   {key:'FOOD',label:'食費',amount:500,subcategories:[
    {key:'FOOD.GROCERIES',label:'食料品',amount:500,items:[
     {amount:500,subcategory:'GROCERIES',date:'2026-10-17',label:'PRIVATE MERCHANT'}
    ]}
   ]}
  ]
 },
 householdSemanticV47:{CATEGORY_DEFS:{CHILD:{label:'子ども'},FOOD:{label:'食費'},OTHER:{label:'その他'}}},
 householdExpenseNatureV152:{subcategoryLabels:{'CHILD.OTHER':'その他','FOOD.GROCERIES':'食料品'}},
 addEventListener:()=>{}
};
const document={readyState:'loading',addEventListener:()=>{},getElementById:()=>null};
vm.runInNewContext(owner,{window,document,Intl,Date,localStorage:{getItem:()=>null,setItem:()=>{}},setTimeout:()=>{},clearTimeout:()=>{},URL});
const snapshot=window.householdFamilyShareV160.makeSnapshot();
assert.equal(snapshot.period_start,'2026-10-16');
assert.equal(snapshot.period_end,'2026-11-17');
assert.equal(snapshot.variable,1700);
assert.equal(snapshot.undetermined,300);
assert.equal(snapshot.review_count,2);
assert.equal(snapshot.source_revision,17);
assert.equal(snapshot.categories.reduce((sum,c)=>sum+c.amount,0),1700);
assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
assert.equal(snapshot.categories.length,2);
assert.equal(snapshot.categories[0].subcategories[0].days[0].amount,1200);
assert.equal(snapshot.categories[1].subcategories[0].days[0].date,'2026-10-17');
assert.ok(!JSON.stringify(snapshot).includes('5000'));
assert.ok(!JSON.stringify(snapshot).includes('synthetic'));
assert.ok(page.includes('閲覧専用'));
assert.ok(!page.includes('ログイン用パスワード'));
assert.ok(viewer.includes('location.hash.slice(1)'));
assert.ok(viewer.includes('x-share-token'));
assert.ok(!viewer.includes('service_role'));
assert.ok(server.includes("action==='view'"));
assert.ok(server.includes("action==='publish'"));
assert.ok(server.includes("auth.getUser(bearer)"));
assert.ok(server.includes("crypto.getRandomValues(new Uint8Array(32))"));
assert.ok(server.includes("crypto.subtle.digest('SHA-256'"));
assert.ok(migration.includes('enable row level security'));
assert.ok(migration.includes('revoke all on table public.family_variable_shares'));
console.log('FAMILY_SHARE_V160_PASS');
