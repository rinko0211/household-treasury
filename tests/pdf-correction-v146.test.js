// Execute: node tests/pdf-correction-v146.test.js
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('mdc-pdf-record-manager-v146.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const treasury=fs.readFileSync('monthly-treasury-v142.js','utf8');
let count=0;
function eq(a,b,label){assert.equal(a,b,label);count++}
const clone=x=>JSON.parse(JSON.stringify(x));
const make=()=>({
 settings:{cash:189274},cashTransactions:[{amount:-7000,balance_after:189274}],
 purchaseEvents:[
  {purchase_id:'a',source_file:'MDC_PDF_2026-11_old.csv',card:'MUFG/DC/JAL',pdf_card_identity:'JAL-A',purchase_date:'2026-10-10',merchant_raw:'正しい利用',original_amount:1100,billing_month:'2026-11'},
  {purchase_id:'b',source_file:'MDC_PDF_2026-11_old.csv',card:'MUFG/DC/JAL',pdf_card_identity:'JAL-A',purchase_date:'2026-10-11',merchant_raw:'誤読取の利用',original_amount:5100,billing_month:'2026-11'},
  {purchase_id:'c',source_file:'MDC_PDF_2026-11_new.csv',card:'MUFG/DC/JAL',pdf_card_identity:'JAL-A',purchase_date:'2026-10-12',merchant_raw:'新規の利用',original_amount:1800,billing_month:'2026-11'},
  {purchase_id:'d',source_file:'dcard.csv',card:'dカード',purchase_date:'2026-10-13',merchant_raw:'他カード',original_amount:2200,billing_month:'2026-11'}],
 imports:[
  {file:'MDC_PDF_2026-11_old.csv',type:'mufg_dc_jal_card',sha256:'old'},
  {file:'MDC_PDF_2026-11_new.csv',type:'mufg_dc_jal_card',sha256:'new'},
  {file:'dcard.csv',type:'dcard_csv',sha256:'dcard'}
 ],
 cardSettlements:[{card:'JAL',due_date:'2026-11-10',amount:8000}]
});
let state=make(),history=[],syncs=0,saves=0;
const app={
 getTreasuryStateRaw:()=>state,
 replaceTreasuryState:next=>{state=clone(next);saves++;return true},
 treasuryRecoverySnapshot:why=>{history.push({why,backup:clone(state)});return true},
 cloudSyncOnLocalSave:()=>{syncs++},
 addEventListener:()=>{},dispatchEvent:()=>{},setTreasurySaveStatus:()=>{}
};
const doc={readyState:'loading',addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null};
const context={window:app,document:doc,structuredClone:clone,CustomEvent:class {},setTimeout:()=>{},
 Intl,Number,String,JSON,Math,Set,Map,Array,Error};
vm.runInNewContext(source,context);
const api=app.householdPdfRecordManagerV146;
eq(api.rows().length,3,'All PDF/JAL rows appear, d-card excluded');
eq(api.sources().length,2,'Both old and updated PDF files are listed');
const bad=api.rows().find(x=>x.record.purchase_id==='b');
eq(api.planDeletion(state,[{index:bad.index,token:bad.token}]).count,1,'Delete exactly one wrong PDF row');
assert.throws(()=>api.planDeletion(state,[{index:bad.index,token:'stale'}]));count++;
eq(api.applyDeletion([{index:bad.index,token:bad.token}]).count,1,'One-row delete persists');
eq(state.purchaseEvents.length,3,'Exactly one purchase removed');
eq(state.cashTransactions[0].balance_after,189274,'Bank data unchanged');
eq(state.imports.length,3,'Partial-source import metadata preserved');
eq(state.purchaseEvents.some(x=>x.purchase_id==='d'),true,'Other card preserved');
const remainingOld=api.rows().find(x=>x.record.purchase_id==='a');
eq(api.applyDeletion([{index:remainingOld.index,token:remainingOld.token}]).count,1,'Whole old PDF deletion persists');
eq(state.imports.some(x=>x.sha256==='old'),false,'Deleted PDF digest cleared for corrected reimport');
eq(state.imports.some(x=>x.sha256==='new'),true,'Updated PDF import retained');
eq(history.length,2,'Recovery history before each mutation');
eq(syncs,2,'Cloud sync requested for each change');
eq(saves,2,'Both changes persisted via replaceTreasuryState');
eq(state.settings.cash,189274,'Reported bank cash unmodified');
eq(state.purchaseEvents.map(x=>x.purchase_id).join(','),'c,d','Exact records retained');
eq(html.includes('id="monthlyTreasuryTabV142"'),true,'Permanent monthly navigation installed');
eq(treasury.includes("tab.onclick=()=>"),true,'Dynamic tab fallback wired');
eq(treasury.includes("treasuryCycleCalendarV146").valueOf(),true,'Mobile calendar toggle exists');
eq(treasury.includes("treasuryLensEconomicV146"),true,'Mobile spending toggle exists');
console.log('PASS '+count+' PDF correction and mobile-cycle regression assertions');
