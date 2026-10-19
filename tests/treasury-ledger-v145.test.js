// Run from repository root: node tests/treasury-ledger-v145.test.js
'use strict';
const assert=require('node:assert/strict');
global.window={};
const ledger=require('../treasury-ledger-v145.js');
const ref='2026-10-19';
const seed=()=>({
  settings:{salaryDay:18,salary:540000,cash:120000,cashAsOf:'2026-10-16'},
  cashTransactions:[],cashExpenses:[],purchaseEvents:[],cardSettlements:[],
  masters:{cards:[],fixedExpenses:[]},rules:[],events:[]
});
const calc=(st,month='2026-10',basis='payday',options={})=>ledger.calculate(st,month,basis,ref,options);
let assertions=0;
const eq=(actual,expected,description)=>{assert.equal(actual,expected,description);assertions++};
{
  const s=seed(),v=calc(s);
  eq(v.start,'2026-10-16','Sunday 18 -> Friday 16');
  eq(v.end,'2026-11-17','Next month cycle closes 17');
  eq(v.incomePending,0,'Past payroll is not invented');
  eq(calc(s,'2026-09').end,'2026-10-15','Previous cycle boundary');
  eq(calc(s,'2026-10','calendar').start,'2026-10-01','Calendar switch');
}
{
  const s=seed();
  s.cashTransactions=[
    {date:'2026-10-16',amount:540000,source:'Rakuten Bank',cashflow_type:'INCOME_SALARY',description_raw:'給与',balance_after:610000},
    {date:'2026-10-17',amount:-24000,source:'Rakuten Bank',cashflow_type:'DEBT_PAYMENT',description_raw:'車ローン',balance_after:586000},
    {date:'2026-10-18',amount:-16000,source:'Rakuten Bank',cashflow_type:'CARD_SETTLEMENT',description_raw:'楽天カード',balance_after:570000},
    {date:'2026-10-19',amount:-40000,source:'Rakuten Bank',cashflow_type:'INTERNAL_TRANSFER',is_transfer:true,description_raw:'楽天証券',balance_after:530000}
  ];
  s.masters.fixedExpenses.push({id:'car',name:'車ローン',day:17,amount:24000,cadence:'MONTHLY',paymentRoute:'DIRECT',category:'LOAN'});
  s.cardSettlements=[{settlement_id:'first',card:'Rakuten',due_date:'2026-10-18',amount:16000},
    {settlement_id:'different-file-same-bill',card:'Rakuten',due_date:'2026-10-18',amount:16000}];
  s.purchaseEvents=[{card:'Rakuten',purchase_date:'2026-10-17',billing_month:'2026-10',merchant_raw:'食料品',
    economic_type:'EXPENSE',original_amount:16000,occurrence_index:1}];
  const v=calc(s);
  eq(v.incomeActual,540000,'Verified payroll only');
  eq(v.incomePending,0,'No second salary');
  eq(v.outActual,80000,'Debt, card and brokerage transfer included once');
  eq(v.outPending,24000,'Next-month car loan remains scheduled');
  eq(v.groups.find(g=>g.kind==='card').actual,16000,'Card debit counted once');
  eq(v.groups.find(g=>g.kind==='card').pending,0,'Duplicate bill records omitted');
  eq(v.groups.find(g=>g.kind==='debt').actual,24000,'Actual loan repayment counted');
  eq(v.groups.find(g=>g.kind==='investment').actual,40000,'Broker remittance is savings allocation');
  eq(v.spentActual,16000,'Broker transfer and card debit excluded from economic expense');
  eq(v.remainderActual,460000,'Net change matches verified flow');
  eq(ledger.annual(s,2026,'payday',ref).incomeActual,540000,'Annual income includes payroll once');
}
{
  const s=seed();s.settings.salary=0;
  s.events=[{date:'2026-12-10',name:'冬のボーナス',amount:550000,type:'INCOME_BONUS'}];
  const v=calc(s,'2026-12','calendar');
  eq(v.incomeActual,0,'Future bonus not confirmed');
  eq(v.incomePending,550000,'Explicit future bonus included as plan');
  eq(ledger.annual(s,2026,'calendar',ref).bonusPending,550000,'Bonus plan annualized');
}
{
  const s=seed();s.settings.salary=0;
  s.masters.fixedExpenses=[
    {id:'tax',name:'自動車税',amount:50000,cadence:'ANNUAL',dueMonth:5,day:31,paymentRoute:'DIRECT'},
    {id:'old-washer',name:'洗濯機',amount:120000,cadence:'ANNUAL',dueMonth:12,day:25,paymentRoute:'DIRECT'}
  ];
  eq(calc(s,'2026-05','calendar').outPending,50000,'Genuine annual tax included');
  eq(calc(s,'2026-12','calendar').outPending,0,'One-off washer not repeated');
}
{
  const s=seed();s.settings.salary=0;
  s.cashExpenses=[
    {id:'cash1',date:'2026-10-17',amount:1000,description:'カフェ'},
    {id:'cash2',date:'2026-10-17',amount:1000,description:'カフェ'}
  ];
  eq(calc(s).outActual,2000,'Two legitimate cash payments are preserved');
  s.purchaseEvents=[
    {card:'JAL',pdf_card_identity:'JAL-1',purchase_date:'2026-10-17',billing_month:'2026-11',merchant_raw:'同店',original_amount:900,occurrence_index:1},
    {card:'JAL',pdf_card_identity:'JAL-1',purchase_date:'2026-10-17',billing_month:'2026-11',merchant_raw:'同店',original_amount:900,occurrence_index:1},
    {card:'JAL',pdf_card_identity:'JAL-1',purchase_date:'2026-10-17',billing_month:'2026-11',merchant_raw:'同店',original_amount:900,occurrence_index:2},
    {card:'dカード',purchase_date:'2026-10-17',billing_month:'2026-11',merchant_raw:'PASMOチャージ',original_amount:10000,economic_type:'TRANSFER'}
  ];
  eq(calc(s).spentActual,3800,'Duplicate PDF row suppressed; second purchase kept; topup neutral');
}
{
  const s=seed();s.settings.salary=0;
  s.events=[{date:'2026-10-20',name:'内部振替',amount:-25000,economic_type:'TRANSFER'}];
  eq(calc(s).outPending,0,'Explicit internal transfer ignored');
}
{
  const s=seed();s.settings.salary=0;
  s.masters.fixedExpenses=[{id:'gas',name:'ガス',amount:5000,day:20,cadence:'MONTHLY',paymentRoute:'DIRECT'}];
  s.events=[{date:'2026-10-20',name:'ガス',amount:-5000}];
  eq(calc(s).outPending,5000,'Manual event and master for same payment counted once');
}
{
  const s=seed();s.settings.salary=0;
  const estimate={date:'2026-11-10',card:'JAL',amount:-12000,type:'CARD_REVOLVING_PAYMENT'};
  eq(calc(s,'2026-10','payday',{revolvingEstimates:[estimate]}).groups.find(g=>g.kind==='debt').pending,
    12000,'Revolving forecast included');
  s.cardSettlements=[{card:'JAL',due_date:'2026-11-10',amount:12000}];
  eq(calc(s,'2026-10','payday',{revolvingEstimates:[estimate]}).groups.find(g=>g.kind==='debt').pending,
    0,'Revolving forecast replaced by settlement');
}
{
  const s=seed(),a=ledger.annual(s,2026,'payday',ref);
  eq(a.periods.length,12,'Annual report comprises 12 periods');
  eq(a.periods[0].start,'2026-01-16','First cycle begins on prior banking day');
  eq(a.periods[11].end,'2027-01-17','Last annual payroll cycle includes next January');
}
{
  const s=seed();s.settings.salary=0;
  s.cashTransactions=[{date:'2026-10-18',amount:-17000,cashflow_type:'CARD_SETTLEMENT',description_raw:'楽天カード'}];
  s.cardSettlements=[{card:'Rakuten',due_date:'2026-10-18',amount:16000}];
  const v=calc(s);
  eq(v.outActual,17000,'Bank actual wins when card estimate differs');
  eq(v.outPending,0,'No duplicate pending for mismatched but identified card debit');
  assert.ok(v.warnings.some(x=>x.includes('差があります')));assertions++;
  s.cardSettlements=[];
  eq(calc(s,'2026-10','payday',{cardEstimates:[{date:'2026-10-18',card:'Rakuten',amount:-16000}]}).outPending,
    0,'Issuer-matched bank debit suppresses different card forecast amount');
}
{
  const s=seed();s.settings.salary=0;
  s.cashTransactions=[{date:'2026-10-17',amount:-10000,cashflow_type:'UNKNOWN',description_raw:'カード出金 ENET'}];
  eq(calc(s).outActual,0,'ATM cash withdrawal is not a new economic outflow');
  eq(calc(s).spentActual,0,'ATM cash withdrawal is not household consumption');
}
console.log('PASS '+assertions+' treasury ledger v145 assertions');
