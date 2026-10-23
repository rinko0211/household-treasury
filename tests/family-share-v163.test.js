'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const owner=fs.readFileSync('family-share-owner-v160.js','utf8');
const server=fs.readFileSync('supabase/functions/family-variable-share/index.ts','utf8');
const viewer=fs.readFileSync('family/family.js','utf8');
const page=fs.readFileSync('family/index.html','utf8');
const css=fs.readFileSync('family/family.css','utf8');
const sources={
 FOOD:[{key:'FOOD.GROCERIES',label:'食料品',items:[
   {date:'2026-10-17',amount:700,subcategory:'GROCERIES',label:'PRIVATE SHOP A',card:'SECRET'},
   {date:'2026-10-17',amount:1300,subcategory:'GROCERIES',label:'PRIVATE SHOP B',account:'SECRET'}
 ]},{key:'FOOD.CAFE',label:'カフェ',items:[
   {date:'2026-10-20',amount:3000,subcategory:'CAFE',label:'PRIVATE SHOP C'}
 ]}],
 DAILY_GOODS:[{key:'DAILY_GOODS.CLOTHING',label:'衣類',items:[
   {date:'2026-10-20',amount:11460,subcategory:'CLOTHING',label:'PRIVATE SHOP D'}
 ]},{key:'DAILY_GOODS.HOUSEHOLD',label:'生活用品',items:[
   {date:'2026-10-21',amount:5540,subcategory:'HOUSEHOLD',label:'PRIVATE SHOP E'}
 ]}]
};
const groups=Object.entries(sources).map(([key,subcategories])=>({
 key,label:key,subcategories:subcategories.map(s=>({...s,amount:s.items.reduce((a,x)=>a+x.amount,0)})),
 amount:subcategories.reduce((a,s)=>a+s.items.reduce((a,x)=>a+x.amount,0),0)
}));
const window={
 householdShareSyncContext:()=>({ready:true,blocked:false,revision:123,token:'PRIVATE TOKEN'}),
 getTreasuryState:()=>({}),
 householdUsageLedgerV157:{
  period:()=>({start:'2026-10-16',end:'2026-11-17'}),
  calculate:()=>({start:'2026-10-16',end:'2026-11-17',normalUndetermined:900,reviewCount:1,usageRows:[]})
 },
 householdExpenseUnifiedV148:{usageBuckets:()=>[{id:'variable',amount:22000,items:[]}],categoryGroups:()=>groups},
 householdSemanticV47:{CATEGORY_DEFS:{FOOD:{label:'食費'},DAILY_GOODS:{label:'日用品'},OTHER:{label:'その他'}}},
 householdExpenseNatureV152:{subcategoryLabels:{
  'FOOD.GROCERIES':'食料品','FOOD.CAFE':'カフェ',
  'DAILY_GOODS.CLOTHING':'衣類','DAILY_GOODS.HOUSEHOLD':'生活用品'
 }},
 addEventListener:()=>{}
};
const document={readyState:'loading',addEventListener:()=>{},getElementById:()=>null};
vm.runInNewContext(owner,{window,document,Intl,Date,localStorage:{getItem:()=>null,setItem:()=>{}},setTimeout:()=>{},clearTimeout:()=>{},URL});
const snapshot=window.householdFamilyShareV160.makeSnapshot();
assert.equal(snapshot.variable,22000);
assert.equal(snapshot.categories.length,2);
const food=snapshot.categories.find(c=>c.key==='FOOD'),goods=snapshot.categories.find(c=>c.key==='DAILY_GOODS');
assert.equal(food.amount,5000);
assert.equal(goods.amount,17000);
assert.equal(goods.subcategories[0].amount,11460);
assert.equal(goods.subcategories[1].amount,5540);
assert.equal(food.subcategories[0].days[0].amount,2000);
assert.equal(food.subcategories[0].days[0].count,2);
assert.equal(snapshot.categories.reduce((t,c)=>t+c.amount,0),22000);
assert.equal(snapshot.categories.reduce((t,c)=>t+c.subcategories.reduce((v,s)=>v+s.days.reduce((q,d)=>q+d.amount,0),0),0),22000);
assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
assert.ok(!JSON.stringify(snapshot).includes('SECRET'));
assert.ok(!JSON.stringify(snapshot).includes('account'));
assert.ok(!JSON.stringify(snapshot).includes('card'));
assert.ok(!JSON.stringify(snapshot).includes('merchant'));
assert.ok(!JSON.stringify(snapshot).includes('source_cash_expense_id'));
// Execute the Edge Function's pure sanitizer in a Node VM to verify
// canonical names, strict sums and compatibility with earlier snapshots.
const piece=server.slice(server.indexOf('const MAJOR_NAMES'),server.indexOf('Deno.serve('))
 .replace(/const MAJOR_NAMES:Record<string,string>/,'const MAJOR_NAMES')
 .replace(/const MINOR_NAMES:Record<string,string>/,'const MINOR_NAMES')
 .replace('function cleanSnapshot(v:any)','function cleanSnapshot(v)')
 .replaceAll('new Set<string>()','new Set()');
const clean=new Function('numeric',piece+';return cleanSnapshot;')(
 (n,max=5000000)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=max
);
const canonical=clean(JSON.parse(JSON.stringify(snapshot)));
assert.equal(canonical.categories.find(c=>c.key==='FOOD').label,'食費');
assert.equal(canonical.categories.find(c=>c.key==='DAILY_GOODS').label,'日用品');
assert.equal(canonical.variable,22000);
assert.equal(canonical.categories.find(c=>c.key==='FOOD').subcategories[0].days[0].count,2);
const tainted=JSON.parse(JSON.stringify(snapshot));
tainted.categories[0].label='PRIVATE LEAK';
tainted.categories[0].subcategories[0].label='PRIVATE LEAK';
const normalized=clean(tainted);
assert.ok(!JSON.stringify(normalized).includes('PRIVATE LEAK'),'Server derives names from audited taxonomy');
const invalid=JSON.parse(JSON.stringify(snapshot));
invalid.categories[0].subcategories[0].days[0].amount++;
assert.throws(()=>clean(invalid),/合計/);
const invalidKey=JSON.parse(JSON.stringify(snapshot));invalidKey.categories[0].key='CUSTOM_MERCHANT';
assert.throws(()=>clean(invalidKey),/コード/);
const prior=clean({...snapshot,variable:500,categories:[{label:'食費',amount:500}]});
assert.equal(prior.categories[0].amount,500,'v160 snapshots stay readable');
assert.ok(viewer.includes("aria-expanded")&&viewer.includes("major-row")&&viewer.includes("minor-row"));
assert.ok(viewer.includes("day-details")&&viewer.includes("rowButton("));
assert.ok(page.includes('閲覧専用')&&page.includes('family.js?v=163'));
assert.ok(css.includes('color-scheme:dark')&&css.includes('.major-row')&&css.includes('.minor-row'));
assert.ok(!page.includes('ログイン用パスワード'));
console.log('FAMILY_SHARE_V163_PASS');
