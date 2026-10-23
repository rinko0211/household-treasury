'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('card-budget-allocation-v170.js','utf8');
const window={addEventListener:()=>{}},document={readyState:'loading',addEventListener:()=>{}};
vm.runInNewContext(src,{window,document,Intl,Date,Number,String,Array,Object,Math,Map,Set,Error,structuredClone});
const api=window.householdCardBudgetV170;
assert.ok(api);
const plan={format:api.FORMAT,family_daily_budget:200000,homecoming_card_budget:20000,
 by_card:{rakuten:90000,jal:110000,dcard:20000},
 fixed_projection_overrides:{'fx-mobile':2000}};
const st={masters:{cards:[
 {id:'rak',name:'楽天カード',paymentMode:'FULL',monthlyBaselineAmount:30000},
 {id:'jal',name:'JAL/DC系',paymentMode:'FULL',monthlyBaselineAmount:50000},
 {id:'d',name:'Dカード',paymentMode:'FULL',monthlyBaselineAmount:10000},
 {id:'kabu',name:'KABU&',paymentMode:'FULL',monthlyBaselineAmount:9000}
 ],fixedExpenses:[
 {id:'fx-insurance',name:'Insurance',amount:8000,economic_type:'EXPENSE',expense_scope:'NORMAL',
  cadence:'MONTHLY',paymentRoute:'CARD',paymentCard:'Rakuten'},
 {id:'fx-contact',name:'Contact',amount:4000,economic_type:'EXPENSE',expense_scope:'NORMAL',
  cadence:'MONTHLY',paymentRoute:'CARD',paymentCard:'JAL/DC系'},
 {id:'fx-mobile',name:'Mobile',amount:9000,economic_type:'EXPENSE',expense_scope:'NORMAL',
  cadence:'MONTHLY',paymentRoute:'CARD',paymentCard:'Dカード'},
 {id:'fx-internet',name:'Wi-Fi',amount:1500,economic_type:'EXPENSE',expense_scope:'NORMAL',
  cadence:'MONTHLY',paymentRoute:'CARD',paymentCard:'Dカード'},
 {id:'fx-electric',name:'Electric',amount:12000,economic_type:'EXPENSE',expense_scope:'NORMAL',
  cadence:'MONTHLY',paymentRoute:'CARD',paymentCard:'KABU&'},
 {id:'fx-loan',name:'Car loan',amount:50000,economic_type:'DEBT_PRINCIPAL',expense_scope:'DEBT',
  cadence:'MONTHLY',paymentRoute:'DIRECT'},
 {id:'fx-annual',name:'Annual',amount:60000,economic_type:'EXPENSE',expense_scope:'NORMAL',
  cadence:'ANNUAL',paymentRoute:'CARD',paymentCard:'Rakuten'}
 ]},purchaseEvents:[{original_amount:12345}],cardSettlements:[{amount:5000}],assets:{bank:50000}};
const p=api.preview(st,plan);
assert.equal(p.familyCard,220000);
assert.equal(p.variableTotal,220000);
assert.equal(p.fixedTotal,15500);
assert.equal(p.total,235500);
assert.equal(p.entries.map(x=>x.total).join(','),'98000,114000,23500');
assert.equal(p.entries[2].fixed.items.find(x=>x.id==='fx-mobile').masterAmount,9000);
assert.equal(p.entries[2].fixed.items.find(x=>x.id==='fx-mobile').amount,2000);
assert.equal(st.masters.fixedExpenses.find(x=>x.id==='fx-mobile').amount,9000,'Forecast adjustment does not mutate master');
// Future payment-card reassignment is a projection and must not mutate
// the real source master or insert loan principal into any card settlement.
const newCardRoute=structuredClone(plan);
newCardRoute.fixed_card_assignments={'fx-electric':'rakuten','fx-loan':'jal'};
const shifted=api.preview(st,newCardRoute);
assert.equal(shifted.fixedTotal,27500,'Reassigned monthly utility adds 12k to Rakuten');
assert.equal(shifted.entries[0].total,110000,'Rakuten receives utility projected charge');
assert.equal(shifted.entries[1].total,114000,'Principal must never become a JAL charge');
assert.equal(st.masters.fixedExpenses.find(x=>x.id==='fx-electric').paymentCard,'KABU&','Original master unmodified');
assert.equal(api.fixedCandidates(st,newCardRoute).some(x=>x.id==='fx-loan'),false,'Loan principal excluded from card setup');
const submitted=api.propose(st,plan);
assert.equal(submitted.changes.length,3);
assert.equal(submitted.next.masters.cards.slice(0,3).map(x=>x.monthlyBaselineAmount).join(','),'98000,114000,23500');
assert.equal(submitted.next.masters.cards[3].monthlyBaselineAmount,9000,'Other credit card ignored');
assert.equal(st.masters.cards[0].monthlyBaselineAmount,30000,'Input untouched');
assert.equal(JSON.stringify(submitted.next.purchaseEvents),JSON.stringify(st.purchaseEvents));
assert.equal(JSON.stringify(submitted.next.cardSettlements),JSON.stringify(st.cardSettlements));
assert.equal(submitted.next.assets.bank,50000);
assert.equal(api.propose(submitted.next,plan).changes.length,0,'Second application creates no new forecasts');
const missing=structuredClone(plan);missing.by_card.dcard=19000;
assert.throws(()=>api.validated(missing),/一致/,'Mismatched allocations blocked until edited');
const revolving=structuredClone(st);revolving.masters.cards[1].paymentMode='REVOLVING';
assert.throws(()=>api.propose(revolving,plan),/リボ/);
const duplicate=structuredClone(st);duplicate.masters.cards.push({...duplicate.masters.cards[0],id:'duplicate'});
assert.throws(()=>api.propose(duplicate,plan),/一意/);
assert.throws(()=>api.validated({...plan,format:'INVALID'}),/専用/);
console.log('BUDGET_LED_CARD_SETTLEMENT_V170_PASS');
