'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const recon=fs.readFileSync('cashflow-reconciliation-v102.js','utf8');
const canonical=fs.readFileSync('cashflow-salary-canonical-v135.js','utf8');
let clock='2026-11-19T12:00:00Z';
class FixedDate extends Date{
 constructor(...a){super(...(a.length?a:[clock]))}
 static now(){return Date.parse(clock)}
}
const st={settings:{cash:415668,cashAsOf:'2026-11-05',salary:540000,salaryDay:18,reserve:200000},
 cashTransactions:[{date:'2026-11-05',balance_after:415196,source:'Rakuten Bank',account:'main',amount:0}],
 cardSettlements:[],events:[],rules:[],masters:{fixedExpenses:[],cards:[]},
 cashflowReconciliationV102:{history:[],pending:[]}};
const win={getTreasuryStateRaw:()=>st,addEventListener:()=>{}};
const ctx={window:win,document:{addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null},
 Date:FixedDate,Intl,Number,String,Math,Array,Set,Map,Object,JSON,Error,Promise,structuredClone,
 setTimeout:()=>0,clearTimeout:()=>{},localStorage:{getItem:()=>null},console};
vm.runInNewContext('function generated(days=90){return [];} function forecast(days=90){return {rows:[],low:st.settings.cash,endBalance:st.settings.cash}};\n'+recon+'\n'+canonical,{...ctx,st});
const api=win.householdCashflowReconciliationV102,sc=win.householdSalaryCanonicalV135;
const start=day=>api.planningStartBalanceFromState(st,day);
function salaryRows(day){return api.elapsedSalaryRows(st,day)}
function next(day){return Array.from(sc.normalize([],st,day,90)).filter(x=>x.type==='SALARY')}
assert.equal(start('2026-11-17'),415668);
assert.equal(start('2026-11-18'),415668,'Today salary only in future stream');
assert.equal(next('2026-11-18').filter(x=>x.date==='2026-11-18').length,1);
assert.equal(start('2026-11-19'),955668,'Salary must roll into projection after payday without CSV');
assert.equal(next('2026-11-19').some(x=>x.date==='2026-11-18'),false);
assert.equal(api.currentBalanceFromState(st,'2026-11-19'),415668,'Recorded balance remains unchanged');
st.cashflowReconciliationV102.history=[{key:'SALARY|2026-11-18|540000',date:'2026-11-18',name:'給与',type:'SALARY',amount:540000,status:'AWAITING_IMPORT'}];
st.cashflowReconciliationV102.pending=[{key:'SALARY|2026-11-18|530000',date:'2026-11-18',type:'SALARY',amount:530000}];
assert.equal(start('2026-11-19'),955668,'Stale pending and history cannot double count');
assert.equal(salaryRows('2026-12-19').length,2,'Multiple missed paydays reconstructed');
assert.equal(start('2026-12-19'),1495668);
st.settings.cashAsOf='2026-11-19';st.settings.cash=950000;
st.cashTransactions.push({date:'2026-11-18',amount:535000,balance_after:949528,source:'Rakuten Bank',account:'main',cashflow_type:'INCOME_SALARY'});
assert.equal(start('2026-11-20'),950000,'New anchor includes payroll; do not add again');
assert.equal(start('2026-11-19'),950000);
st.settings.cashAsOf='2026-11-17';st.settings.cash=951000;
st.cashTransactions.pop();
st.cashTransactions.push({date:'2026-11-17',amount:535000,balance_after:950528,source:'Rakuten Bank',account:'main',cashflow_type:'INCOME_SALARY'});
assert.equal(start('2026-11-19'),951000,'Early imported payroll already in balance');
st.cashTransactions.pop();st.settings.cashAsOf='2026-11-05';st.settings.cash=415668;
st.cashTransactions.push({date:'2026-11-05',amount:64,balance_after:415196,source:'Rakuten Bank',account:'main',cashflow_type:'INCOME_SALARY',description_raw:'給与受取ボーナス金利利息'});
assert.equal(start('2026-11-19'),955668,'Small interest cannot suppress salary');
st.cashTransactions=[];st.settings.cashAsOf='2026-10-15';st.settings.cash=100000;st.cashflowReconciliationV102={history:[],pending:[]};
assert.equal(start('2026-10-16'),100000);
assert.equal(next('2026-10-16').filter(x=>x.date==='2026-10-16').length,1);
assert.equal(start('2026-10-17'),640000,'Weekend-adjusted Friday payday rolls next day');
console.log('SALARY_ROLLFORWARD_V224_PASS');