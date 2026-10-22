// node tests/payment-reclass-v159.test.js
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const noop=()=>{};
const doc={readyState:'loading',addEventListener:noop};
const window={addEventListener:noop};
vm.runInNewContext(fs.readFileSync('cash-expense-analytics-v106.js','utf8'),{window,document:doc});
const x=window.householdExpenseAnalyticsV106;
const info={rows:[
 ['日付','内容','金額','カテゴリー','区分'],
 ['2026-10-17','果物［現金］','100','食費','NORMAL'],
 ['2026-10-17','野菜［PayPay］','200','食費','NORMAL'],
 ['2026-10-17','飲料［交通系IC］','300','食費','NORMAL'],
 ['2026-10-17','菓子［クレジット・カード不明・明細突合対象］','400','食費','NORMAL'],
 ['2026-10-17','日用品［MUFG/DC/JALカード末尾0492・12/10引落予定］','500','日用品','NORMAL']
 ],hi:0,encoding:'utf-8'};
const st={cashExpenses:[],purchaseEvents:[]};
const r=x.parseCashExpenseCsv(info,{name:'synthetic.csv'},st);
assert.equal(r.added,5);assert.equal(r.cashAdded,1);assert.equal(r.purchaseAdded,2);assert.equal(r.electronicAdded,2);
assert.equal(st.cashExpenses[0].amount,100);
assert.equal(st.purchaseEvents.reduce((n,p)=>n+p.original_amount,0),1400);
assert.equal(st.purchaseEvents.find(p=>p.card==='MUFG/DC/JAL').expected_settlement_date,'2026-12-10');
assert.equal(st.purchaseEvents.find(p=>p.card==='カード未特定').receipt_reconciliation_pending,true);
assert.equal(st.purchaseEvents.find(p=>p.card==='交通系IC').no_card_settlement,true);

const w2={};vm.runInNewContext(fs.readFileSync('expense-nature-rules-v152.js','utf8'),{window:w2});
const nat=w2.householdExpenseNatureV152;
const sem={normalizeCategoryValue:x=>x,inferSubcategory:(c,l,x)=>x};
const cls=x=>nat.classify({source:{economic_type:'EXPENSE',category:'FOOD',subcategory:'GROCERIES',cost_nature:x},category:'FOOD',subcategory:'GROCERIES',semantic:sem,kind:'purchase'});
assert.equal(cls('FIXED').nature,'FIXED');
assert.equal(cls('REVIEW').nature,'REVIEW');
assert.equal(cls('VARIABLE').nature,'VARIABLE');

const w3={};
vm.runInNewContext(fs.readFileSync('payment-reclass-patch-v159.js','utf8'),{window:w3,document:doc,structuredClone:global.structuredClone,CustomEvent:class{}});
const pApi=w3.householdPaymentReclassV159;
const purchase=st.purchaseEvents.find(p=>p.card==='カード未特定');
const before={id:purchase.source_cash_expense_id,date:purchase.purchase_date,description:purchase.source_receipt_description,amount:purchase.original_amount,source_file:'synthetic.csv',payment_method:'CASH'};
const patch={format:pApi.FORMAT,entries:[{before,purchase}]},inState={cashExpenses:[{...before}],purchaseEvents:[]};
const first=pApi.plan(inState,patch);
assert.equal(first.changed,1);assert.equal(first.total,400);
assert.equal(first.next.cashExpenses.length,0);assert.equal(first.next.purchaseEvents.length,1);
const second=pApi.plan(first.next,patch);assert.equal(second.changed,0);assert.equal(second.skipped,1);
assert.throws(()=>pApi.plan({cashExpenses:[{...before,amount:401}],purchaseEvents:[]},patch),/照合不一致/);
assert.equal(inState.cashExpenses.length,1,'Original state remains untouched');
console.log('PASS v159 mixed payment, individual nature, strict/idempotent private patch (synthetic only)');
