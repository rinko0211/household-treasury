'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('expense-budget-metrics-v203.js','utf8');
function env(){const window={};vm.runInNewContext(source,{window,Number,String,Array,Map,Set,Object,Date,Math,Intl,RegExp});return window.householdExpenseBudgetV203}
const state={masters:{fixedExpenses:[
{id:'loan',name:'プラドローン',economic_type:'DEBT_PRINCIPAL',amount:48000,cadence:'MONTHLY'},
{id:'net',name:'Wi-Fi',economic_type:'EXPENSE',amount:4500,cadence:'MONTHLY'},
{id:'mars',name:'メルスプラン',economic_type:'EXPENSE',amount:5060,cadence:'MONTHLY'},
{id:'apple',name:'Apple',economic_type:'EXPENSE',amount:1080,cadence:'MONTHLY'},
{id:'transfer',name:'妻お小遣い',economic_type:'EXPENSE',amount:40000,cadence:'MONTHLY'},
{id:'ideco',name:'iDeCo',economic_type:'INVESTMENT',amount:12000,cadence:'MONTHLY'},
{id:'winter',name:'電気（冬）',economic_type:'EXPENSE',amount:15000,
 cadence:'SEMI_FIXED',activeMonths:[11,12,1,2,3]},
{id:'summer',name:'電気（夏）',economic_type:'EXPENSE',amount:10000,
 cadence:'SEMI_FIXED',activeMonths:[5,6,7,8,9,10]},
{id:'annual',name:'車保険',economic_type:'EXPENSE',amount:60000,cadence:'ANNUAL'},
{id:'special',name:'一時費用',economic_type:'EXPENSE',spending_class:'SPECIAL',amount:5000,cadence:'MONTHLY'}]},
personalExpenseBudgets:{wife:40000,self:20000}};
test('fixed monthly master includes actual recurring products despite variable default rule',()=>{
 const a=env();const nov=a.planned(state,'2026-11');
 assert.equal(nov.fixed,48000+4500+5060+1080+15000);
 assert.equal(nov.ideco,12000);
 assert.equal(a.planned(state,'2026-10').fixed,48000+4500+5060+1080+10000);
});
test('variable budget comes only from actual configured owner budget',()=>{
 const a=env();
 assert.equal(a.get(state,'2026-11','variable',156598,null),null);
 const found=a.get(state,'2026-11','variable',156598,270000);
 assert.equal(found.budget,270000);
 assert.equal(found.ratio.toFixed(1),'58.0');
 assert.match(found.text,/270,000/);
 assert.equal(found.over,false);
});
test('wife and self personal budgets add up, not transfer inflows',()=>{
 const a=env(),p=a.get(state,'2026-11','personal',49000);
 assert.equal(p.budget,60000);assert.equal(p.ratio.toFixed(1),'81.7');
});
test('fixed percentage and investment are not consumption budgets',()=>{
 const a=env(),fixed=a.get(state,'2026-11','fixed',93000);
 assert.equal(fixed.budget,73640);
 assert.equal(fixed.over,true);
 assert.equal(fixed.kind,'月額計画');
 assert.equal(a.get(state,'2026-11','investment',5000),null);
 assert.equal(a.get(state,'2026-11','ideco',12000).ratio,100);
});
test('budget unavailable never claims 100%, nonmonth and missing master return null',()=>{
 const a=env();
 assert.equal(a.get({personalExpenseBudgets:{}},'2026-11','personal',7000),null);
 assert.equal(a.get({masters:{}},'2026-11','fixed',7000),null);
 assert.equal(a.get(state,'2026-14','fixed',7000),null);
 assert.equal(a.get(state,'2026-11','variable',1000,0),null);
});


test('render full-width budget progress with remaining and accessible percent',()=>{
 const a=env(),m=a.get(state,'2026-11','variable',156598,270000);
 const html=a.progress(m,'変動費');
 assert.match(html,/hub-budget-good/);
 assert.match(html,/月予算 ¥270,000/);
 assert.match(html,/58\.0% 使用/);
 assert.match(html,/残り ¥113,402/);
 assert.match(html,/role="progressbar"/);
 assert.match(html,/aria-valuetext="58\.0パーセント"/);
 assert.match(html,/style="width:58\.00%"/);
 assert.ok(!html.includes('undefined'));
});
test('orange at 80%, red at 100%; actual percent is not capped when over budget',()=>{
 const a=env();
 let html=a.progress(a.get(state,'2026-11','variable',215999,270000),'変動費');
 assert.match(html,/hub-budget-good/);
 assert.match(html,/80\.0% 使用/);
 html=a.progress(a.get(state,'2026-11','variable',216000,270000),'変動費');
 assert.match(html,/hub-budget-warn/);
 html=a.progress(a.get(state,'2026-11','variable',270000,270000),'変動費');
 assert.match(html,/hub-budget-over/);
 assert.match(html,/style="width:100\.00%"/);
 html=a.progress(a.get(state,'2026-11','variable',303480,270000),'変動費');
 assert.match(html,/112\.4% 使用/);
 assert.match(html,/予算超過 ¥33,480/);
 assert.match(html,/aria-valuenow="100\.0"/);
 assert.match(html,/aria-valuetext="112\.4パーセント"/);
 assert.match(html,/style="width:100\.00%"/);
});
test('plan and personal use distinct remaining labels and no phantom bar',()=>{
 const a=env();
 let html=a.progress(a.get(state,'2026-11','fixed',100000),'定期費');
 assert.match(html,/月額計画/);
 assert.match(html,/計画との差額 ¥26,360/);
 html=a.progress(a.get(state,'2026-11','personal',49000),'個人費');
 assert.match(html,/個人費枠 ¥60,000/);
 assert.match(html,/残り ¥11,000/);
 html=a.progress(a.get(state,'2026-11','ideco',6000),'iDeCo');
 assert.match(html,/月額拠出 ¥12,000/);
 assert.match(html,/拠出予定残 ¥6,000/);
 assert.equal(a.progress(a.get(state,'2026-11','special',2500),'特別費'),'');
 assert.equal(a.progress(a.get(state,'2026-11','variable',1000,null),'変動費'),'');
 assert.equal(a.progress(null),'');
});
test('progress labels escape dynamic text',()=>{
 const a=env();
 const html=a.progress(a.get(state,'2026-11','variable',1000,2000),'<img src=x onerror=alert(1)>');
 assert.ok(!html.includes('aria-label="<img'));
 assert.match(html,/&lt;img/);
});
