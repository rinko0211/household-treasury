'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const salarySource = fs.readFileSync('cashflow-salary-canonical-v135.js','utf8');
const rolloverSource = fs.readFileSync('cashflow-reconciliation-v102.js','utf8');

function clock(day) {
  return class FixedDate extends Date {
    constructor(...args) { if(args.length===0) super(day+'T12:00:00'); else super(...args); }
    static now() { return Date.parse(day+'T12:00:00'); }
  };
}
function bank(date,amount,balance,account='main') {
  return {date,amount,balance_after:balance,account,source:'Rakuten Bank',
    cashflow_type:'INCOME_SALARY',description_raw:'給与'};
}
function fixture(asOf='2026-10-10',cash=200000) {
  return {settings:{cash,cashAsOf:asOf,salary:500000,salaryDay:18,reserve:200000},
    cashTransactions:[bank('2026-10-07',30000,190000),bank('2026-10-10',-1000,cash-14)],
    events:[],rules:[],cardSettlements:[],masters:{fixedExpenses:[]},
    cashflowReconciliationV102:{pending:[],history:[]}};
}
function salaryRun(st,day,previous=()=>[]) {
  const ctx={window:{getTreasuryStateRaw:()=>st},Date:clock(day),generated:previous,console};
  vm.runInNewContext(salarySource,ctx,{filename:'cashflow-salary-canonical-v135.js'});
  return {rows:ctx.generated(120),api:ctx.window.householdSalaryCanonicalV135};
}
function rollforward(st,day) {
  const ctx={window:{getTreasuryStateRaw:()=>st,addEventListener(){}},
    document:{addEventListener(){}},Date:clock(day),generated:()=>[],
    forecast:()=>({rows:[],low:0,endBalance:0}),setTimeout(){},clearTimeout(){},
    structuredClone:(x)=>JSON.parse(JSON.stringify(x)),console};
  vm.runInNewContext(rolloverSource,ctx,{filename:'cashflow-reconciliation-v102.js'});
  return ctx.window.householdCashflowReconciliationV102.planningStartBalanceFromState(st,day);
}
function salaryOn(rows,date) {
  return rows.filter(e=>e.date===date&&Number(e.amount)===500000&&
    (String(e.type||'').includes('SALARY')||/給与/.test(e.name||'')));
}

test('October 7 supplementary 30000 must not suppress October 18 monthly salary',()=>{
  const {rows}=salaryRun(fixture(),'2026-10-13');
  assert.equal(salaryOn(rows,'2026-10-18').length,1);
  assert.equal(salaryOn(rows,'2026-11-18').length,1);
});
test('real normal paycheck in already imported balance removes duplicate forecast',()=>{
  const st=fixture('2026-10-17',700000);
  st.cashTransactions.push(bank('2026-10-16',510000,690000));
  const {rows}=salaryRun(st,'2026-10-13',()=>[
    {date:'2026-10-18',amount:500000,name:'給与',type:'SALARY',generated:true,source:'settings_salary'}
  ]);
  assert.equal(salaryOn(rows,'2026-10-18').length,0);
  assert.equal(salaryOn(rows,'2026-11-18').length,1);
});
test('mislabeled tiny interest must never count as a monthly paycheck',()=>{
  const st=fixture();
  st.cashTransactions.push(bank('2026-10-10',65,200000));
  assert.equal(salaryOn(salaryRun(st,'2026-10-13').rows,'2026-10-18').length,1);
});
test('bonus on December 10 must coexist with December 18 paycheck',()=>{
  const st=fixture(),bonus={date:'2026-12-10',name:'Winter bonus estimated',type:'INCOME_BONUS',amount:600000};
  const rows=salaryRun(st,'2026-10-13',()=>[bonus]).rows;
  assert.equal(rows.filter(x=>x.name===bonus.name).length,1);
  assert.equal(salaryOn(rows,'2026-12-18').length,1);
});
test('salary rules and automatic salary rows are consolidated to one paycheck',()=>{
  const st=fixture();
  const rows=salaryRun(st,'2026-10-13',()=>[
    {date:'2026-10-18',name:'給与',type:'INCOME_SALARY',amount:500000,generated:true,source:'rule'},
    {date:'2026-10-18',name:'給与',type:'SALARY',amount:500000,generated:true,source:'settings_salary'},
    {date:'2026-10-25',name:'水道',amount:-5500,type:'MASTER_FIXED'}
  ]).rows;
  assert.equal(salaryOn(rows,'2026-10-18').length,1);
  assert.equal(rows.find(x=>x.name==='水道').amount,-5500);
});
test('salary on date remains future; next day it rolls into projected balance',()=>{
  const st=fixture();
  assert.equal(rollforward(st,'2026-10-13'),200000);
  assert.equal(rollforward(st,'2026-10-18'),200000);
  assert.equal(salaryOn(salaryRun(st,'2026-10-18').rows,'2026-10-18').length,1);
  assert.equal(rollforward(st,'2026-10-19'),700000);
  assert.equal(salaryOn(salaryRun(st,'2026-10-19').rows,'2026-10-18').length,0);
});
test('new CSV balance absorbs previous paycheck without adding it twice',()=>{
  const st=fixture('2026-10-20',700000);
  st.cashTransactions.push(bank('2026-10-18',500000,690000));
  st.cashTransactions.push(bank('2026-10-20',0,699986));
  assert.equal(rollforward(st,'2026-10-21'),700000);
  assert.equal(salaryOn(salaryRun(st,'2026-10-17').rows,'2026-10-18').length,0);
});
test('elapsed one-off debit and salary both roll forward when CSV is stale',()=>{
  const st=fixture();
  st.events.push({id:'one-off',date:'2026-10-14',name:'振替',amount:-5000,recurring:'NONE'});
  const projected=rollforward(st,'2026-10-19');
  assert.equal(projected,695000);
});
