'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const test=require('node:test');
const src=fs.readFileSync('wife-personal-reference-v205.js','utf8');
function fixture(extra={}){
 const base={personalExpenses:[{id:'wife-handover',owner:'wife',amount:40000,
  cycle_start:'2026-10-16',cycle_end:'2026-11-17',count_in_spending:true}],
 purchaseEvents:[
 {purchase_id:'wife-card',purchase_date:'2026-10-31',original_amount:930,
  merchant_raw:'妻の買物',card:'JAL/DC',economic_type:'EXPENSE',
  expense_bucket_v193:'PERSONAL',personal_owner_v193:'wife',
  billing_month:'2026-12',count_in_spending:true},
 {purchase_id:'self-card',purchase_date:'2026-10-31',original_amount:250,
  merchant_raw:'本人の買物',economic_type:'EXPENSE',
  expense_bucket_v193:'PERSONAL',personal_owner_v193:'self'}
 ],cashExpenses:[
 {id:'wife-cash',date:'2026-10-31',amount:500,description:'妻の買物（現金）',
  economic_type:'EXPENSE',expense_bucket_v193:'PERSONAL',
  personal_owner_v193:'wife',count_in_spending:true}
 ]};
 return {...base,...extra};
}
function engine(original=fixture()){
 let data=structuredClone(original),writes=0,backs=0,syncs=0,answer=true;
 const root={
  getTreasuryStateRaw:()=>data,
  replaceTreasuryState:next=>{data=structuredClone(next);writes++;return true},
  treasuryRecoverySnapshot:()=>{backs++},
  cloudSyncOnLocalSave:()=>{syncs++},
  confirm:()=>answer,dispatchEvent:()=>{},
  householdExpenseUnifiedV148:{render:()=>{}}
 };
 const context={window:root,structuredClone,Date,Intl,Number,String,
  Object,Array,RegExp,Error,JSON,CustomEvent:class {}};
 vm.runInNewContext(src,context,{filename:'wife-personal-reference-v205.js'});
 return {api:root.householdWifeReferenceV205,root,
  get state(){return data},get writes(){return writes},
  get backs(){return backs},get syncs(){return syncs},
  reject:()=>{answer=false}};
}
test('mark existing wife personal card purchase reference-only without modifying allowance',()=>{
 const e=engine(),r=e.api.apply('purchase:0','REFERENCE');
 assert.equal(r.changed,true);assert.equal(e.writes,1);
 assert.equal(e.backs,1);assert.equal(e.syncs,1);
 assert.equal(e.state.personalExpenses[0].amount,40000);
 assert.equal(e.state.purchaseEvents[0].count_in_spending,false);
 assert.equal(e.state.purchaseEvents[0].reference_only_v200,true);
 assert.equal(e.state.purchaseEvents[0].wife_card_claim_preserved_v205,true);
 assert.equal(e.state.purchaseEvents[0].billing_month,'2026-12');
 assert.equal(e.state.purchaseEvents[0].original_amount,930);
 const restored=e.api.apply('purchase:0','COUNTED');
 assert.equal(restored.changed,true);
 assert.equal(e.state.purchaseEvents[0].count_in_spending,true);
 assert.equal(e.state.purchaseEvents[0].reference_only_v200,undefined);
 assert.equal(e.state.personalExpenses[0].amount,40000);
});
test('existing wife cash expense can also be a reference, original cash record remains',()=>{
 const e=engine();
 e.api.apply('cash:0','REFERENCE');
 assert.equal(e.state.cashExpenses.length,1);
 assert.equal(e.state.cashExpenses[0].amount,500);
 assert.equal(e.state.cashExpenses[0].count_in_spending,false);
 e.api.apply('cash:0','COUNTED');
 assert.equal(e.state.cashExpenses[0].count_in_spending,true);
});
test('cannot reference self, bank, absent wife allowance, wrong cycle or excluded duplicate',()=>{
 const e=engine();
 assert.throws(()=>e.api.plan(e.state,'purchase:1','REFERENCE'),/条件/);
 assert.throws(()=>e.api.plan(e.state,'bank:0','REFERENCE'),/識別子/);
 const other=engine(fixture({personalExpenses:[]}));
 assert.throws(()=>other.api.plan(other.state,'purchase:0','REFERENCE'),/条件/);
 const dupe=fixture();dupe.purchaseEvents[0].count_in_spending=false;
 dupe.purchaseEvents[0].reconciliation_status='ABSORBED_DUPLICATE';
 assert.equal(engine(dupe).api.eligibility(dupe,'purchase',0),null);
});
test('no changes when user cancels and duplicate actions are rejected',()=>{
 const e=engine();e.reject();
 const r=e.api.apply('purchase:0','REFERENCE');
 assert.equal(r.cancelled,true);assert.equal(e.writes,0);
 const p=e.api.plan(e.state,'purchase:0','REFERENCE');
 assert.equal(p.changed,true);
 e.root.confirm=()=>true;e.api.apply('purchase:0','REFERENCE');
 assert.throws(()=>e.api.plan(e.state,'purchase:0','REFERENCE'),/すでに/);
});
test('pre-existing legacy v200 wife reference can be restored',()=>{
 const st=fixture();
 st.purchaseEvents[0].count_in_spending=false;
 st.purchaseEvents[0].reference_only_v200=true;
 const e=engine(st);assert.equal(e.api.eligibility(e.state,'purchase',0).mode,'REFERENCE');
 e.api.apply('purchase:0','COUNTED');
 assert.equal(e.state.purchaseEvents[0].count_in_spending,true);
 assert.equal(e.state.purchaseEvents[0].reference_only_v200,undefined);
});
test('source rows without explicit count flag preserve original undefined after roundtrip',()=>{
 const st=fixture();delete st.cashExpenses[0].count_in_spending;
 const e=engine(st);e.api.apply('cash:0','REFERENCE');e.api.apply('cash:0','COUNTED');
 assert.equal(Object.hasOwn(e.state.cashExpenses[0],'count_in_spending'),false);
});
