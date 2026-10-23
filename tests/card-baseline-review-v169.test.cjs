'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('card-baseline-review-v169.js','utf8');
const window={addEventListener:()=>{}},document={readyState:'loading',addEventListener:()=>{}};
vm.runInNewContext(src,{window,document,Intl,Date,Number,String,Array,Object,Math,Map,Set,Error,structuredClone});
const api=window.householdCardBaselineReviewV169;
assert.ok(api);
let data={masters:{cards:[
 {id:'card-rakuten',name:'楽天カード',paymentMode:'FULL',monthlyBaselineAmount:0},
 {id:'card-jal-dc',name:'JAL/DC系',paymentMode:'FULL'},
 {id:'card-d',name:'Dカード',paymentMode:'FULL',monthlyBaselineAmount:50000},
 {id:'other',name:'KABU&',paymentMode:'FULL',monthlyBaselineAmount:18000}
]},cashExpenses:[{amount:5000}],purchaseEvents:[{original_amount:8000}],
 cardSettlements:[{card:'Rakuten',amount:124012}],assets:{bank:150000}};
const list=api.review(data);
assert.equal(list.length,3);
assert.equal(list.map(x=>x.amount).join(','),'75000,70000,20000');
assert.equal(list.map(x=>x.current).join(','),'0,0,50000');
const plan=api.update(data,['rakuten','jal','dcard']);
assert.equal(plan.changes.length,3);
assert.equal(plan.next.masters.cards.slice(0,3).map(x=>x.monthlyBaselineAmount).join(','),'75000,70000,20000');
assert.ok(plan.next.masters.cards.slice(0,3).every(x=>x.forecastMode==='BASELINE'));
assert.equal(plan.next.masters.cards[3].monthlyBaselineAmount,18000,'Unrelated card remains unchanged');
assert.equal(data.masters.cards[2].monthlyBaselineAmount,50000,'Do not mutate input before approval');
assert.equal(JSON.stringify(plan.next.cashExpenses),JSON.stringify(data.cashExpenses),'Cash expenses unchanged');
assert.equal(JSON.stringify(plan.next.purchaseEvents),JSON.stringify(data.purchaseEvents),'Purchase amounts unchanged');
assert.equal(JSON.stringify(plan.next.cardSettlements),JSON.stringify(data.cardSettlements),'Card bill originals unchanged');
assert.equal(plan.next.assets.bank,150000,'Asset balances unchanged');
assert.equal(api.update(plan.next,['rakuten','jal','dcard']).changes.length,0,'Repeat action is idempotent');
const revolving=structuredClone(data);revolving.masters.cards[1].paymentMode='REVOLVING';
assert.throws(()=>api.update(revolving,['jal']),/リボ/,'Do not override revolving forecasts');
const duplicate=structuredClone(data);duplicate.masters.cards.push({...duplicate.masters.cards[0],id:'dup'});
assert.throws(()=>api.update(duplicate,['rakuten']),/識別/);
console.log('CARD_BASELINES_V169_PASS');
