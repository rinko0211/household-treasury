'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const cardSrc=fs.readFileSync('card-cycle-v81.js','utf8');
const reconcSrc=fs.readFileSync('cashflow-reconciliation-v102.js','utf8');
const loader=fs.readFileSync('sync-state-sanitizer-v22.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert.ok(html.includes('sync-state-sanitizer-v22.js?v=220'));
assert.ok(sw.includes('./sync-state-sanitizer-v22.js?v=220'));
assert.ok(cardSrc.includes('function buildPlan(days=180,fromDate)'), 'historical card plan required');
assert.ok(reconcSrc.includes('elapsedCardEstimateOccurrences'), 'elapsed card estimate carry-forward required');
assert.ok(reconcSrc.includes('...(model.pending||[])'), 'unsent historical pending must never vanish');
assert.ok(reconcSrc.includes('cardEstimateReplacedByStatement'), 'confirmed settlements must replace estimates');
assert.ok(loader.includes('./card-cycle-v81.js?v=218'));
assert.ok(loader.includes('./cashflow-reconciliation-v102.js?v=218'));
assert.ok(sw.includes('./card-cycle-v81.js?v=218'));
assert.ok(sw.includes('./cashflow-reconciliation-v102.js?v=218'));
function run({date='2026-11-11',cash=415668,cashAsOf='2026-11-05',
 includePending=true,statementJAL=0,jalEstimate=134620}={}){
 const st={
  settings:{cash,cashAsOf,reserve:200000},cashTransactions:[
   {date:cashAsOf,balance_after:cash,source:'Rakuten Bank',account:'main',amount:0}
  ],
  cardSettlements:[{card:'KABU&',due_date:'2026-11-10',amount:21230},
   ...(statementJAL?[{card:'MUFG/DC/JAL',due_date:'2026-11-10',amount:statementJAL}]:[])],
  cardCashflowOverrides:[
   {kind:'ESTIMATE',card:'JAL/DC系',billing_month:'2026-11',date:'2026-11-10',amount:jalEstimate},
   {kind:'ESTIMATE',card:'Dカード',billing_month:'2026-11',date:'2026-11-10',amount:20000}],
  purchaseEvents:[],events:[],rules:[],
  masters:{fixedExpenses:[],cards:[
   {id:'jal',name:'JAL/DC系',settlementDay:10,closingDay:15,paymentMode:'FULL',monthlyBaselineAmount:250000,forecastMode:'BASELINE'},
   {id:'d',name:'Dカード',settlementDay:10,closingDay:15,paymentMode:'FULL',monthlyBaselineAmount:20000,forecastMode:'BASELINE'},
   {id:'kabu',name:'KABU&',settlementDay:10,paymentMode:'FULL',monthlyBaselineAmount:15000,forecastMode:'BASELINE'}]}
 };
 const dateClass=class FixedDate extends Date{
  constructor(...args){super(...(args.length?args:[date+'T08:00:00Z']))}
  static now(){return Date.parse(date+'T08:00:00Z')}
 };
 const win={
  getTreasuryStateRaw:()=>st,
  addEventListener:()=>{},
  householdPlanningV79:{
   baselineOf:c=>Number(c.monthlyBaselineAmount)||0,
   forecastMode:c=>c.forecastMode||'COMPONENTS',
   forecastAmountForCard:(c,comp)=>Math.max(Number(c.monthlyBaselineAmount)||0,comp)}
 };
 const timers=[];
 const ctx={window:win,document:{addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null},
  Date:dateClass,Intl,Number,String,Math,Array,Set,Map,Object,JSON,Error,Promise,
  structuredClone,localStorage:{getItem:()=>null},setTimeout:fn=>{timers.push(fn);return timers.length},
  clearTimeout:()=>{},Event:class{},console};
 vm.runInNewContext('function generated(days=90){return [];}\n'+cardSrc+'\n'+reconcSrc,ctx);
 const api=win.householdCashflowReconciliationV102;
 assert.ok(api,'reconciliation must load');
 return {st,api,cardApi:win.householdCardCycleV81,timers};
}
{
 const {st,api,cardApi}=run();
 const plan=cardApi.buildPlan(6,'2026-11-05');
 assert.equal(plan.rows.find(x=>x.card==='JAL/DC系')?.amount,-134620);
 assert.equal(plan.rows.find(x=>x.card==='Dカード')?.amount,-20000);
 assert.ok(!plan.rows.some(x=>x.card==='KABU&'),'confirmed KABU statement suppresses estimate');
 const elapsed=api.backfillCandidates(st,'2026-11-05','2026-11-11').filter(x=>x.date==='2026-11-10');
 assert.equal(elapsed.filter(x=>x.type==='CARD_ESTIMATE').length,2);
 assert.equal(elapsed.filter(x=>x.type==='CARD_SETTLEMENT').length,1);
 assert.equal(elapsed.reduce((a,x)=>a+x.amount,0),-175850);
 assert.equal(api.planningStartBalanceFromState(st,'2026-11-11'),239818,
  'Last-bank-balance forecast must subtract BOTH planned cards and confirmed KABU');
}
{
 const {st,api}=run({includePending:false});
 // No previous pending snapshot: planned card estimate is still reconstructed.
 assert.equal(api.planningStartBalanceFromState(st,'2026-11-11'),239818);
}
{
 const {st,api}=run({statementJAL:132000});
 st.cashflowReconciliationV102={history:[],pending:[
  {key:'CARD|JALDC系|2026-11-10|-134620',date:'2026-11-10',card:'JAL/DC系',type:'CARD_ESTIMATE',amount:-134620,billing_month:'2026-11'}
 ]};
 assert.equal(api.planningStartBalanceFromState(st,'2026-11-11'),242438,
  'Verified JAL statement must replace stale estimate, not add to it');
 const elapsed=api.backfillCandidates(st,'2026-11-05','2026-11-11');
 assert.ok(!elapsed.some(x=>x.type==='CARD_ESTIMATE'&&x.card==='JAL/DC系'));
}
{
 const {st,api}=run({jalEstimate:140000});
 st.cashflowReconciliationV102={history:[],pending:[
  {key:'CARD|JALDC系|2026-11-10|-134620',date:'2026-11-10',card:'JAL/DC系',type:'CARD_ESTIMATE',amount:-134620,billing_month:'2026-11'}
 ]};
 assert.equal(api.planningStartBalanceFromState(st,'2026-11-11'),234438,
  'New authoritative card override must replace earlier pending estimate');
}
{
 const {st,api}=run({cash:239818,cashAsOf:'2026-11-10'});
 assert.equal(api.planningStartBalanceFromState(st,'2026-11-11'),239818,
  'A newly imported bank balance must not deduct old card claims twice');
}
{
 const {st,api,cardApi}=run({date:'2026-11-10'});
 assert.equal(api.planningStartBalanceFromState(st,'2026-11-10'),415668,
  'Payment on today must not be deducted before future-event stream');
 const plan=cardApi.buildPlan(1,'2026-11-10');
 assert.ok(plan.rows.some(x=>x.card==='JAL/DC系'&&x.amount===-134620),
  'Today’s card payment remains visible as a future event');
}
console.log('ELAPSED_CARD_FORECAST_V218_PASS');
