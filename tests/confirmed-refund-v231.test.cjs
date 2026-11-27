'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
let state={cashExpenses:[{id:'cash1',date:'2026-11-03',amount:1000,description:'cash',economic_type:'EXPENSE'}],
purchaseEvents:[{purchase_id:'p1',purchase_date:'2026-11-04',original_amount:4000,payment_amount:4000,card:'TEST',merchant_raw:'shop',economic_type:'EXPENSE'}],
cashTransactions:[{id:'bank1',date:'2026-11-05',amount:-2000,economic_type:'EXPENSE',description_raw:'bank shop'},{id:'settlement',date:'2026-11-06',amount:-4000,cashflow_type:'CARD_SETTLEMENT',description_raw:'card'}]};
const w={treasuryLedgerV145:{period:()=>({start:'2026-11-01',end:'2026-11-30',basis:'calendar'})},
getTreasuryStateRaw:()=>state,replaceTreasuryState:s=>{state=s;return true},treasuryRecoverySnapshot:()=>{},cloudSyncOnLocalSave:()=>{},
householdExpenseNatureV152:{classify:()=>({nature:'VARIABLE'})}};
const c=vm.createContext({window:w,document:{readyState:'loading',addEventListener(){}},structuredClone,Intl,Date});
for(const p of ['purchase-usage-ledger-v157.js','expense-unified-v148.js'])vm.runInContext(fs.readFileSync(p,'utf8'),c);
const h=w.householdExpenseUnifiedV148,l=w.householdUsageLedgerV157;
const calc=()=>l.calculate(state,'2026-11','calendar');
const set=(kind,id,amount)=>h.setRefund(kind,id,amount,h.refundTarget(state,kind,id).signature);
assert.equal(calc().consumption,7000);
assert.equal(set('purchase','p1',1500),true);
assert.equal(calc().consumption,5500);
assert.equal(calc().byKind.purchase[0].grossAmount,4000);
assert.equal(calc().byKind.purchase[0].refundAmount,1500);
assert.equal(state.purchaseEvents[0].original_amount,4000);
assert.equal(state.purchaseEvents[0].payment_amount,4000);
assert.equal(set('purchase','p1',1500),false);
assert.throws(()=>set('purchase','p1',4001));
assert.throws(()=>set('purchase','p1',-1));
assert.equal(set('purchase','p1',4000),true);
assert.equal(calc().byKind.purchase[0].amount,0);
assert.equal(set('cash_expense','cash1',1000),true);
assert.equal(set('cash','bank1',500),true);
assert.equal(calc().consumption,1500);
assert.equal(l.bankFlow(state,'2026-11','calendar').total,6000);
assert.equal(h.refundTarget(state,'cash','settlement'),null);
const signature=h.refundTarget(state,'purchase','p1').signature;
assert.equal(set('purchase','p1',0),true);
assert.throws(()=>h.setRefund('purchase','p1',100,signature));
assert.equal(calc().consumption,5500);
assert.equal(state.purchaseEvents[0].refund_audit_v231.length,3);
console.log('CONFIRMED_REFUND_V231_PASS');
