'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('mdc-cross-source-reconcile-v166.js','utf8');
const base=()=>{
 const pdf=(id,date,amount,merchant,identity='JAL-1')=>({
   purchase_id:id,purchase_date:date,original_amount:amount,merchant_raw:merchant,
   pdf_card_identity:identity,card:'MUFG/DC/JAL',source_file:'MDC_PDF_2026-12_a.csv',
   economic_type:'EXPENSE',mdc_import_v144:true
 });
 return {
  cashExpenses:[
   {id:'cash-real',date:'2026-10-20',amount:500,description:'日常の現金買い物',payment_method:'CASH',economic_type:'EXPENSE'},
   {id:'cash-misroute',date:'2026-10-21',amount:430,description:'電車代［クレジット］',payment_method:'CASH',economic_type:'EXPENSE'}
  ],
  purchaseEvents:[
   {purchase_id:'receipt-1',source_cash_expense_id:'cash-expense:1',purchase_date:'2026-10-20',
    merchant_raw:'フードショップ［クレジット］',original_amount:1800,card:'カード未特定',
    payment_method:'CREDIT',receipt_reconciliation_pending:true,economic_type:'EXPENSE',source_file:'cycle.csv'},
   pdf('pdf-1','2026-10-20',1800,'フードショップ'),
   pdf('pdf-2','2026-10-21',430,'交通運賃'),
   pdf('pdf-3','2026-10-20',500,'別店舗'),
   {purchase_id:'other-card',purchase_date:'2026-10-20',original_amount:1800,merchant_raw:'フードショップ',
     card:'楽天カード',economic_type:'EXPENSE'},
   {purchase_id:'paypay-receipt',source_cash_expense_id:'cash-expense:2',purchase_date:'2026-10-20',
    original_amount:1800,merchant_raw:'フードショップ',card:'PayPay',payment_method:'PAYPAY',economic_type:'EXPENSE'}
  ]
 };
};
let db=base(),backups=[],events=[],synced=0;
const win={
 getTreasuryStateRaw:()=>db,
 treasuryRecoverySnapshot:name=>backups.push(name),
 replaceTreasuryState:next=>{db=next;return true},
 cloudSyncOnLocalSave:()=>{synced++},
 dispatchEvent:x=>events.push(x),
 householdExpenseUnifiedV148:{render:()=>{}},
 confirm:()=>true,
 addEventListener:()=>{}
};
const ctx={window:win,document:{readyState:'loading',addEventListener:()=>{},getElementById:()=>null},
 setTimeout:()=>{},Intl,Date,Number,Array,String,Object,Math,Set,Map,Error,
 structuredClone,CustomEvent:class CustomEvent{constructor(name,args){this.name=name;this.detail=args?.detail}}};
vm.createContext(ctx);vm.runInContext(source,ctx);
const api=win.householdJalCrossSourceV166;
assert.ok(api,'api exposed');
const matches=api.scan();
assert.equal(matches.length,3,'receipt plus two cash-coded candidates; unrelated card and PayPay excluded');
const card=matches.find(x=>x.kind==='purchase');
const misroutedCash=matches.find(x=>x.kind==='cash'&&x.index===1);
const independentCash=matches.find(x=>x.kind==='cash'&&x.index===0);
assert.ok(card&&card.identical,'receipt and PDF source merchant normalize');
assert.ok(misroutedCash,'legacy cash-coded card candidate shown');
assert.ok(independentCash.sourceMarkedCash,'true cash marked as manual conflict');
assert.equal(api.scanPdfPreview({entries:[{date:'2026-10-20',merchant:'フードショップ',amount:1800}]}).length,1);
assert.throws(()=>api.plan(db,[card.key,card.key]),/複数回/);
assert.throws(()=>api.plan(db,['purchase:99:1']),/候補がなくなり/);
const before=db.purchaseEvents.length,spendingStart=db.purchaseEvents
  .filter(x=>x.economic_type==='EXPENSE'&&x.count_in_spending!==false).reduce((sum,x)=>sum+Number(x.original_amount),0);
const result=api.apply([card.key,misroutedCash.key]);
assert.equal(result.count,2);
assert.equal(result.amount,2230);
assert.equal(db.purchaseEvents.length,before,'no record deleted');
assert.equal(db.purchaseEvents[0].reconciliation_status,'ABSORBED_DUPLICATE');
assert.equal(db.purchaseEvents[0].count_in_spending,false);
assert.equal(db.purchaseEvents[0].receipt_reconciliation_pending,false);
assert.equal(db.cashExpenses[1].count_in_spending,false);
assert.equal(db.cashExpenses[0].count_in_spending,undefined,'unselected cash preserved');
assert.equal(db.purchaseEvents[1].count_in_spending,undefined,'canonical PDF untouched');
assert.equal(backups.length,1,'backed up once before mutation');
assert.equal(synced,1);
assert.equal(api.scan().length,1,'only unselected real-cash ambiguous match remains');
assert.throws(()=>api.apply([card.key]),/候補がなくなり/,'idempotent/reuse prevented');
const spendingEnd=db.purchaseEvents.filter(x=>x.economic_type==='EXPENSE'&&x.count_in_spending!==false).reduce((sum,x)=>sum+Number(x.original_amount),0);
assert.equal(spendingStart-spendingEnd,1800,'receipts removed from spending but PDF retained');
console.log('JAL_CROSS_SOURCE_V166_PASS');
