'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('cross-source-audit-v201.js','utf8');
const make=(rows={})=>{
 let state={
  purchaseEvents:rows.purchaseEvents||[],cashExpenses:rows.cashExpenses||[],
  cashTransactions:rows.cashTransactions||[],cardSettlements:rows.cardSettlements||[],
  personalExpenses:rows.personalExpenses||[],crossSourceReviewDecisionsV201:[]
 };
 let writes=0,backups=0,syncs=0;
 const win={
  getTreasuryStateRaw:()=>state,
  replaceTreasuryState:st=>{state=structuredClone(st);writes++;return true},
  treasuryRecoverySnapshot:()=>backups++,
  cloudSyncOnLocalSave:()=>syncs++
 };
 const doc={readyState:'loading',addEventListener:()=>{},getElementById:()=>null};
 vm.runInNewContext(source,{window:win,document:doc,Intl,Number,String,Object,Date,
    Array,Map,Set,Math,JSON,RegExp,Error,structuredClone});
 return {audit:win.householdCrossSourceAuditV201,
  get state(){return state},get writes(){return writes},
  get backups(){return backups},get syncs(){return syncs}};
};
const entry=(id,source,extra={})=>({
 purchase_id:id,card:'KABU&',source_file:source,record_kind:'CARD_PURCHASE',
 purchase_date:'2026-10-01',merchant_raw:'KABU&（プラス）',
 original_amount:500,occurrence_index:1,economic_type:'EXPENSE',...extra
});
const selections=list=>list.map(x=>({key:x.key,keepSig:x.keepSig,
  duplicateSig:x.duplicateSig,action:'DUPLICATE'}));
test('same purchase in renamed file is a candidate, not automatically excluded',()=>{
 const e=make({purchaseEvents:[
  entry('id-old','old-export.csv'),
  entry('id-new','new-export.csv',{merchant_raw:'ＫＡＢＵ＆〔プラス〕'})]});
 const v=e.audit.scan();
 assert.equal(v.high,1);assert.equal(v.review,0);assert.equal(v.blocked,0);
 assert.equal(e.state.purchaseEvents[0].count_in_spending,undefined);
 assert.equal(e.writes,0);
 const chosen=selections(v.candidates);
 assert.equal(e.audit.plan(e.state,chosen).amount,500);
 const done=e.audit.apply(chosen,true);
 assert.equal(done.excluded,1);assert.equal(done.amount,500);
 assert.equal(e.state.purchaseEvents.filter(x=>x.count_in_spending===false).length,1);
 assert.equal(e.state.purchaseEvents.length,2,'original records remain');
 assert.equal(e.writes,1);assert.equal(e.backups,1);assert.equal(e.syncs,1);
 assert.equal(e.audit.scan().candidates.length,0);
 assert.throws(()=>e.audit.apply(chosen,true),/照合対象/);
});
test('two legitimate purchases in the same file are not automatically collapsed',()=>{
 const e=make({purchaseEvents:[entry('a','same.csv',{occurrence_index:1}),
  entry('b','same.csv',{occurrence_index:2})]});
 assert.equal(e.audit.scan().candidates.length,0);
 assert.equal(e.writes,0);
});
test('different cards and distinct physical identifiers are blocked',()=>{
 const e=make({purchaseEvents:[
  entry('a','file-a.csv',{card:'MUFG/DC/JAL',pdf_card_identity:'CARD-1111'}),
  entry('b','file-b.csv',{card:'dカード',pdf_card_identity:'CARD-2222'})]});
 const v=e.audit.scan();
 assert.equal(v.blocked,1);
 assert.throws(()=>e.audit.apply(selections(v.candidates),true),/一致しない/);
 assert.equal(e.writes,0);
});
test('a cash-coded old CSV and a PDF needs manual review; card settlements are ignored',()=>{
 const e=make({
  cashExpenses:[{id:'manual',date:'2026-10-10',description:'セブンイレブン 青森',
      source_file:'old-cash.csv',amount:1500,economic_type:'EXPENSE',payment_method:'CASH'}],
  purchaseEvents:[{purchase_id:'pdf1',date:'',purchase_date:'2026-10-10',
      merchant_raw:'セブンイレブン 青森',card:'MUFG/DC/JAL',
      source_file:'MDC_PDF_sample.csv',original_amount:1500,
      pdf_card_identity:'card-last4',mdc_import_v144:true}],
  cardSettlements:[{settlement_id:'b',amount:1500,due_date:'2026-11-10'}]});
 const v=e.audit.scan();
 assert.equal(v.review,1);assert.equal(v.scanned,2);
 const done=e.audit.apply(selections(v.candidates),true);
 assert.equal(done.excluded,1);
 assert.equal(e.state.cashExpenses[0].count_in_spending,false);
 assert.equal(e.state.purchaseEvents[0].count_in_spending,undefined);
 assert.equal(e.state.cardSettlements.length,1);
});
test('receipt date shift within three days is reviewable, not an automatic duplicate',()=>{
 const e=make({purchaseEvents:[
  {purchase_id:'r',card:'MUFG/DC/JAL',purchase_date:'2026-10-01',
    merchant_raw:'セブンイレブン　三沢',original_amount:950,
    source_file:'receipt.csv',receipt_reconciliation_pending:true},
  {purchase_id:'p',card:'MUFG/DC/JAL',purchase_date:'2026-10-03',
    merchant_raw:'セブンイレブン　三沢',original_amount:950,
    source_file:'MDC_PDF_2026.csv',mdc_import_v144:true,pdf_card_identity:'same'}
 ]});
 const v=e.audit.scan();assert.equal(v.review,1);
 assert.equal(v.candidates[0].keep.type,'pdf');
});
test('known excluded and reference-only expenses never enter overlap scan',()=>{
 const e=make({purchaseEvents:[
  entry('counted','a.csv'),
  entry('excluded','b.csv',{count_in_spending:false}),
  entry('wife-reference','c.csv',{reference_only_v200:true,count_in_spending:false}),
  entry('old-tombstone','d.csv',{manually_deleted_v192:true}),
  entry('refinanced','e.csv',{is_refinanced:true})]});
 assert.equal(e.audit.scan().scanned,1);
 assert.equal(e.audit.scan().candidates.length,0);
});
test('reviewed separate purchases remain counted, with no future warning',()=>{
 const e=make({purchaseEvents:[entry('a','a.csv'),entry('b','b.csv')]});
 const p=e.audit.scan().candidates[0];
 const select=[{key:p.key,keepSig:p.keepSig,duplicateSig:p.duplicateSig,action:'SEPARATE'}];
 const result=e.audit.apply(select,true);
 assert.equal(result.excluded,0);assert.equal(result.amount,0);
 assert.equal(e.audit.scan().candidates.length,0);
 assert.equal(e.state.purchaseEvents.every(x=>x.count_in_spending!==false),true);
 assert.equal(e.state.crossSourceReviewDecisionsV201.length,1);
});
test('one source cannot be matched to two others in a single batch',()=>{
 const e=make({purchaseEvents:[entry('a','a.csv'),entry('b','b.csv'),entry('c','c.csv')]});
 const p=e.audit.scan().candidates;
 assert.ok(p.length>=2);
 assert.throws(()=>e.audit.plan(e.state,selections(p.slice(0,2))),/1対1/);
 assert.equal(e.writes,0);
});
test('tombstoned source and changed candidate signatures stop application before save',()=>{
 const e=make({purchaseEvents:[entry('a','a.csv'),entry('b','b.csv')]});
 const p=e.audit.scan().candidates[0];
 const choice=selections([p]);
 e.state.purchaseEvents[1].original_amount=600;
 assert.throws(()=>e.audit.apply(choice,true),/照合対象/);
 assert.equal(e.writes,0);
});
