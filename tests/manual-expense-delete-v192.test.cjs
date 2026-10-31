'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('manual-expense-delete-v192.js','utf8');
let state={
 cashExpenses:[
  {id:'chat-cash',date:'2026-10-24',description:'パン屋 手動入力',amount:1000,
   economic_type:'EXPENSE',source_file:'Cash CSV'},
  {id:'structured-cash',date:'2026-10-25',description:'温泉',amount:4000,
   economic_type:'EXPENSE',source_file:'chat-receipts.csv',dedup_key:'receipt:2026-10-25:onsen'}
 ],
 purchaseEvents:[
  {purchase_id:'receipt:v168:receipt:2026-10-23:seven',source_file:'chat-generated.csv',
   card:'MUFG/DC/JAL',purchase_date:'2026-10-23',merchant_raw:'セブンイレブン 手動CSV',
   original_amount:2441,dedup_key:'receipt:2026-10-23:seven',economic_type:'EXPENSE'},
  {purchase_id:'official-pdf',source_file:'MDC_PDF_2026-12.csv',pdf_card_identity:'JAL-1234',
   mdc_import_v144:true,card:'MUFG/DC/JAL',purchase_date:'2026-10-23',
   merchant_raw:'セブンイレブン 公式PDF',original_amount:2441,economic_type:'EXPENSE'},
  {purchase_id:'official-rakuten',source_file:'enavi202610.csv',card:'Rakuten',
   purchase_date:'2026-10-23',merchant_raw:'公式楽天CSV',original_amount:3000,economic_type:'EXPENSE'},
  {purchase_id:'official-card-edited',source_file:'chat-generated.csv',card:'MUFG/DC/JAL',
   purchase_date:'2026-10-25',merchant_raw:'後でPDF紐づけ',
   original_amount:2500,mdc_pdf_signature_v168:'key',economic_type:'EXPENSE'}
 ],
 cashTransactions:[{id:'bank-1',date:'2026-10-23',amount:-2400,
  economic_type:'EXPENSE',source_file:'bank.csv'}],
 personalExpenses:[{id:'self-party',owner:'self',date:'2026-10-30',amount:6000,
  description:'飲み会',cycle_start:'2026-10-16'}],
 cardSettlements:[{id:'jal-billing',amount:10000}]
};
let snapshots=[],synced=0,draws=0,question=true,changeOnConfirm=null;
const win={
 getTreasuryStateRaw:()=>state,
 replaceTreasuryState:s=>{state=structuredClone(s);return true},
 treasuryRecoverySnapshot:label=>snapshots.push(label),
 cloudSyncOnLocalSave:()=>synced++,
 confirm:()=>{if(changeOnConfirm)changeOnConfirm();return question},
 householdExpenseUnifiedV148:{render:()=>draws++}
};
const ctx={window:win,document:{},structuredClone,Date,Intl,Number,Math,String,Object,Set,Map,JSON,Error};
vm.createContext(ctx);vm.runInContext(source,ctx);
const api=win.householdManualExpenseDeleteV192;
assert.ok(api);
assert.ok(api.locate(state,'cash:0'),'Manual cash deletable');
assert.ok(api.locate(state,'cash:1'),'Previously assistant-generated cash CSV deletable');
assert.ok(api.locate(state,'purchase:0'),'Assistant-generated receipt CSV deletable');
assert.equal(api.locate(state,'purchase:1'),null,'Official JAL PDF protected');
assert.equal(api.locate(state,'purchase:2'),null,'Official Rakuten CSV protected');
assert.equal(api.locate(state,'purchase:3'),null,'PDF linked edited receipt protected');
assert.equal(api.locate(state,'bank:0'),null,'Imported bank transaction protected');
assert.ok(api.locate(state,'personal:self-party'),'Personal chat-record deletable');
const original=structuredClone(state);
assert.throws(()=>api.apply('purchase:1','delete'),/公式カード/);
assert.throws(()=>api.apply('bank:0','delete'),/公式カード/);
assert.deepEqual(state,original);
question=false;
assert.equal(api.apply('cash:0','delete').cancelled,true,'Cancelled deletion no-op');
assert.equal(snapshots.length,0);
question=true;
const counted=()=>[...state.cashExpenses,...state.purchaseEvents,...state.personalExpenses]
 .filter(x=>x.count_in_spending!==false).reduce((v,x)=>v+Math.abs(Number(x.amount??x.original_amount)||0),0);
const before=counted();
let result=api.apply('cash:0','delete');
assert.equal(result.amount,1000);
assert.equal(counted(),before-1000);
assert.equal(state.cashExpenses[0].count_in_spending,false);
assert.equal(state.cashExpenses[0].manually_deleted_v192,true);
assert.equal(state.cashExpenses.length,2,'Manual record remains as tombstone for import deduplication');
assert.equal(state.purchaseEvents[1].count_in_spending,undefined,'Official PDF unchanged');
assert.equal(state.cardSettlements[0].amount,10000,'Card settlement untouched');
assert.equal(api.removed(state).length,1);
assert.throws(()=>api.apply('cash:0','delete'),/すでに計上対象外/);
result=api.apply('cash:0','restore');
assert.equal(counted(),before,'Undo restores exactly one purchase');
assert.equal(state.cashExpenses[0].count_in_spending,undefined,'Restores absent count_in_spending');
assert.equal(api.removed(state).length,0);
assert.equal(state.cashExpenses[0].manual_delete_audit_v192.length,2);
assert.equal(snapshots.length,2);
assert.equal(synced,2);
assert.equal(draws,2);
api.apply('purchase:0','delete');
assert.equal(state.purchaseEvents[0].count_in_spending,false);
assert.equal(state.purchaseEvents[1].count_in_spending,undefined,'Deleting receipt leaves PDF source intact');
assert.equal(state.purchaseEvents[0].dedup_key,'receipt:2026-10-23:seven');
api.apply('personal:self-party','delete');
assert.equal(state.personalExpenses[0].count_in_spending,false);
assert.ok(api.removed(state).some(x=>x.kind==='personal'));
api.apply('personal:self-party','restore');
assert.equal(state.personalExpenses[0].count_in_spending,undefined);
// A change between confirmation and save must stop the operation.
changeOnConfirm=()=>{state.cashExpenses[1].amount=4001};
assert.throws(()=>api.apply('cash:1','delete'),/変更/);
assert.equal(state.cashExpenses[1].count_in_spending,undefined);
assert.equal(state.purchaseEvents[1].count_in_spending,undefined);
const officialUI=fs.readFileSync('mdc-pdf-delta-v144.js','utf8');
const importUI=fs.readFileSync('mdc-pdf-import-v136.js','utf8');
assert.ok(!officialUI.includes('mdcRegisteredExcludeV190'));
assert.ok(!officialUI.includes('mdcRepairSelectedV144'));
assert.ok(!importUI.includes('mdcPdfManageRegisteredV190'));
const hub=fs.readFileSync('expense-unified-v148.js','utf8');
assert.ok(hub.includes('data-hub-delete'));
assert.ok(hub.includes('data-hub-restore'));
console.log('MANUAL_EXPENSE_DELETE_V192_PASS');
