'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const file=fs.readFileSync('mdc-pdf-delta-v144.js','utf8');
let state={
 cashExpenses:[{id:'preexisting-cash',date:'2026-10-01',amount:1500,description:'独立した現金'}],
 purchaseEvents:[
 {purchase_id:'pdf-1',card:'MUFG/DC/JAL',pdf_card_identity:'JAL-A',
  purchase_date:'2026-10-23',merchant_raw:'コンビニA',original_amount:1200,
  billing_month:'2026-12',source_file:'MDC_PDF_2026-12-a.csv',
  mdc_import_v144:true,economic_type:'EXPENSE',category:'FOOD'},
 {purchase_id:'pdf-2',card:'MUFG/DC/JAL',pdf_card_identity:'JAL-A',
  purchase_date:'2026-10-24',merchant_raw:'飲食店',original_amount:2200,
  billing_month:'2026-12',source_file:'MDC_PDF_2026-12-a.csv',
  mdc_import_v144:true,economic_type:'EXPENSE',count_in_spending:true},
 {purchase_id:'card-other',card:'Rakuten',purchase_date:'2026-10-24',
  merchant_raw:'別カード',original_amount:1900,economic_type:'EXPENSE'},
 {purchase_id:'pdf-old-ignored',card:'MUFG/DC/JAL',pdf_card_identity:'JAL-A',
  purchase_date:'2026-10-25',merchant_raw:'過去の重複',original_amount:500,
  mdc_import_v144:true,reconciliation_status:'ABSORBED_DUPLICATE',
  count_in_spending:false,economic_type:'EXPENSE'},
 {purchase_id:'pdf-prev',card:'MUFG/DC/JAL',pdf_card_identity:'JAL-A',
  purchase_date:'2026-09-20',merchant_raw:'前の請求月',original_amount:600,
  billing_month:'2026-11',source_file:'MDC_PDF_2026-11.csv',
  mdc_import_v144:true,economic_type:'EXPENSE'},
 ],
 cardSettlements:[{settlement_id:'jal-2026-12',amount:3000,due_date:'2026-12-10'}]
};
const original=structuredClone(state);
let backups=[],syncs=0,events=[],confirmed=0,refreshed=0;
const win={getTreasuryStateRaw:()=>state,
 replaceTreasuryState:x=>{state=structuredClone(x);return true},
 treasuryRecoverySnapshot:x=>backups.push(x),
 cloudSyncOnLocalSave:()=>{syncs++},
 dispatchEvent:x=>events.push(x),
 confirm:()=>{confirmed++;return true},
 householdExpenseUnifiedV148:{render:()=>refreshed++},
 addEventListener:()=>{}};
const ctx={window:win,document:{readyState:'loading',addEventListener:()=>{},getElementById:()=>null},
 setTimeout:()=>{},Date,Intl,Number,Math,String,Array,Object,Set,Map,JSON,Error,
 structuredClone,CustomEvent:class{constructor(name,{detail}){this.type=name;this.detail=detail}}};
vm.createContext(ctx);vm.runInContext(file,ctx);
const api=win.householdMdcPdfDeltaV144;
const spending=()=>state.purchaseEvents.filter(x=>x.count_in_spending!==false&&
 x.reconciliation_status!=='ABSORBED_DUPLICATE')
 .reduce((a,x)=>a+Number(x.original_amount),0);
assert.equal(spending(),5900);
const december=api.registeredRowsV190(state,'2026-12');
assert.equal(december.rows.length,2,'One billing month selection');
assert.equal(december.month,'2026-12');
assert.deepEqual(Array.from(december.months),['2026-12','2026-11']);
assert.ok(!december.rows.some(x=>x.record.purchase_id==='pdf-old-ignored'),
 'Unrelated absorbed duplicates cannot be restored');
assert.equal(api.reviewPostImportV190(state,[0,1],'exclude').total,3400);
assert.throws(()=>api.reviewPostImportV190(state,[2],'exclude'),/計上対象外/);
assert.throws(()=>api.reviewPostImportV190(state,[3],'restore'),/計上対象外/);
assert.equal(JSON.stringify(state),JSON.stringify(original),'Read-only preview');
let result=api.applyPostImportV190([0,1],'exclude');
assert.equal(result.count,2);
assert.equal(result.amount,3400);
assert.equal(spending(),2500,'Exclusion reduces economic purchases only');
assert.equal(state.purchaseEvents[0].count_in_spending,false);
assert.equal(state.purchaseEvents[1].count_in_spending,false);
assert.equal(state.purchaseEvents[0].mdc_pdf_user_excluded_v190,true);
assert.equal(state.purchaseEvents[1].mdc_pdf_user_excluded_v190,true);
assert.equal(state.purchaseEvents[0].mdc_pdf_review_history_v190[0].operation,'exclude');
assert.equal(state.cardSettlements[0].amount,3000,'PDF billing settlement unaffected');
assert.equal(state.cashExpenses[0].amount,1500,'Cash records unaffected');
assert.equal(backups.length,1);
assert.equal(syncs,1);
assert.equal(refreshed,1);
assert.ok(events.at(-1).detail.months.includes('2026-10'));
const revised=api.registeredRowsV190(state,'2026-12');
assert.equal(revised.rows.filter(x=>x.record.mdc_pdf_user_excluded_v190).length,2);
assert.throws(()=>api.applyPostImportV190([0],'exclude'),/すでに計上対象外/);
result=api.applyPostImportV190([0],'restore');
assert.equal(result.count,1);
assert.equal(state.purchaseEvents[0].count_in_spending,undefined,
 'Restore original undefined flag not artificially true');
assert.equal(state.purchaseEvents[1].count_in_spending,false);
assert.equal(spending(),3700);
assert.equal(state.purchaseEvents[0].mdc_pdf_review_history_v190.length,2);
result=api.applyPostImportV190([1],'restore');
assert.equal(state.purchaseEvents[1].count_in_spending,true,'Restore original explicit true');
assert.equal(spending(),5900);
assert.equal(backups.length,3);
assert.equal(syncs,3);
assert.equal(refreshed,3);
assert.equal(confirmed,3);
assert.equal(state.purchaseEvents.length,5,'Never delete transaction records');
assert.deepEqual(state.cardSettlements,original.cardSettlements);
let approved=false;
win.confirm=()=>approved;
result=api.applyPostImportV190([0],'exclude');
assert.equal(result.cancelled,true);
assert.equal(spending(),5900);
assert.equal(backups.length,3,'Cancellation before snapshot/save');
// Updated source after confirmation must be revalidated.
win.confirm=()=>{state.purchaseEvents[0].purchase_id='changed';return true};
assert.throws(()=>api.applyPostImportV190([0],'exclude'),/更新/);
assert.equal(backups.length,3,'No backup/save on stale record');
const ui=fs.readFileSync('mdc-pdf-delta-v144.js','utf8');
assert.ok(ui.includes('mdcRegisteredReviewV190'));
assert.ok(ui.includes('mdcRegisteredSelectAllV190'));
assert.ok(ui.includes('mdcRegisteredExcludeV190'));
assert.ok(ui.includes('mdcRegisteredRestoreV190'));
assert.ok(ui.includes('MDC_PDF_POST_IMPORT_V190'));
console.log('MDC_PDF_POST_IMPORT_V190_PASS');
