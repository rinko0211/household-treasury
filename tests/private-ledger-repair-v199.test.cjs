'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('private-ledger-repair-v199.js','utf8');
const fmt='HOUSEHOLD_TREASURY_PRIVATE_LEDGER_V199';
const specimen=()=>({
 purchaseEvents:[
  {purchase_id:'kabu:first',card:'KABU&',source_file:'old.csv',purchase_date:'2026-10-01',
    merchant_raw:'ＫＡＢＵ＆（プラス／プレミアム）',original_amount:500},
  {purchase_id:'kabu:second',card:'KABU&',source_file:'new.csv',purchase_date:'2026-10-01',
    merchant_raw:'ＫＡＢＵ＆〔プラス／プレミアム〕',original_amount:500}
 ],
 cashTransactions:[
  {id:'b1',date:'2026-10-19',amount:-12000,economic_type:'EXPENSE',expense_scope:'NORMAL',
    spending_class:'NORMAL',category:'OTHER',subcategory:'OTHER'}
 ],
 personalExpenses:[{id:'personal:original',owner:'self',amount:6000,date:'2026-10-30',
   description:'飲み会',cycle_start:'2026-10-16',cycle_end:'2026-11-17'}],
 cardSettlements:[{settlement_id:'kabu:2026-11-10',card:'KABU&',due_date:'2026-11-10',amount:500,
   purchase_ids:['kabu:second']}]
});
function setup(){
 let st=specimen(),saved=0,snapshots=0,sync=0,registration;
 const win={
  householdUnifiedRepairDeskV161:{register:x=>{registration=x}},
  getTreasuryStateRaw:()=>st,
  treasuryRecoverySnapshot:()=>snapshots++,
  replaceTreasuryState:x=>{st=structuredClone(x);saved++;return true},
  cloudSyncOnLocalSave:()=>sync++
 };
 vm.runInNewContext(code,{window:win,structuredClone,Number,Array,String,Date,Object,Set,Error});
 return{win,get state(){return st},get saved(){return saved},
   get snapshots(){return snapshots},get sync(){return sync},get registration(){return registration}};
}
const ref=(id,merchant)=>({id,date:'2026-10-01',card:'KABU&',merchant,amount:500});
const patch={format:fmt,entries:[
 {op:'suppress_duplicate',duplicate:ref('kabu:second','ＫＡＢＵ＆〔プラス／プレミアム〕'),
   canonical:ref('kabu:first','ＫＡＢＵ＆（プラス／プレミアム）')},
 {op:'bank_classification',id:'b1',date:'2026-10-19',amount:-12000,to:'DEBT_PRINCIPAL',vehicle_loan:'LAPIN'},
 {op:'add_personal',record:{id:'personal:extra',owner:'self',date:'2026-10-30',amount:3000,
   description:'追加飲み会',cycle_start:'2026-10-16',cycle_end:'2026-11-17'}},
 {op:'add_purchase',record:{purchase_id:'image:1',card:'Dカード',purchase_date:'2026-10-29',
   merchant_raw:'ohora_jp',original_amount:6578,billing_month:'2026-12',
   category:'DAILY_GOODS',subcategory:'BEAUTY',spending_class:'NORMAL',
   cost_nature:'REVIEW',source_file:'SCREENSHOT',payment_method:'1回払い'}},
 {op:'add_settlement',record:{settlement_id:'kabu:2026-12-10',card:'KABU&',
   due_date:'2026-12-10',amount:8730,purchase_ids:['kabu:first']}}
]};
test('verified private adjustments apply atomically and do not reapply',()=>{
 const e=setup();assert.equal(e.registration.format,fmt);
 const p=e.win.householdPrivateLedgerRepairV199.plan(e.state,patch);
 assert.equal(p.changed,5);assert.equal(p.total,500+3000+6578);
 assert.equal(e.state.purchaseEvents.length,2,'preview must not mutate state');
 const out=e.win.householdPrivateLedgerRepairV199.apply(patch);
 assert.equal(out.changed,5);assert.equal(e.saved,1);assert.equal(e.snapshots,1);assert.equal(e.sync,1);
 assert.equal(e.state.purchaseEvents[1].count_in_spending,false);
 assert.equal(e.state.purchaseEvents[0].count_in_spending,undefined);
 assert.deepEqual(e.state.cardSettlements[0].purchase_ids,['kabu:first']);
 assert.equal(e.state.cashTransactions[0].economic_type,'DEBT_PRINCIPAL');
 assert.equal(e.state.personalExpenses.reduce((a,x)=>a+x.amount,0),9000);
 assert.equal(e.state.purchaseEvents.length,3);
 const again=e.win.householdPrivateLedgerRepairV199.apply(patch);
 assert.equal(again.alreadyApplied,true);
 assert.equal(e.saved,1);
});
test('tampered original bank or purchase blocks the entire patch',()=>{
 const e=setup();
 const bad=structuredClone(patch);bad.entries[1].amount=-12001;
 assert.throws(()=>e.win.householdPrivateLedgerRepairV199.apply(bad),/銀行原本/);
 assert.equal(e.saved,0);assert.equal(e.snapshots,0);
 assert.equal(e.state.purchaseEvents[1].count_in_spending,undefined);
});
test('duplicate purchaser identity and conflicting IDs are rejected',()=>{
 const e=setup();
 const bad=structuredClone(patch);bad.entries[0].canonical.amount=501;
 assert.throws(()=>e.win.householdPrivateLedgerRepairV199.plan(e.state,bad),/カード原本/);
 const doubled=structuredClone(patch);
 doubled.entries.push(doubled.entries[3]);
 assert.throws(()=>e.win.householdPrivateLedgerRepairV199.plan(e.state,doubled),/重複/);
 assert.equal(e.saved,0);
});
