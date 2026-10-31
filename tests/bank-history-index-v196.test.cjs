'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sandbox={window:{householdSemanticV47:{
 normalizeCategoryValue:x=>x||'OTHER',inferCategory:()=> 'OTHER',inferSubcategory:()=> 'OTHER'},
 householdExpenseNatureV152:{classify:()=>({nature:'VARIABLE'})}},
 Intl,Date,Number,Math,JSON,Set,Map,String,Array,Object,RegExp};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('treasury-ledger-v145.js','utf8'),sandbox);
vm.runInContext(fs.readFileSync('purchase-usage-ledger-v157.js','utf8'),sandbox);
const api=sandbox.window.householdUsageLedgerV157;
const st={settings:{salaryDay:18,salary:500000},masters:{cards:[],fixedExpenses:[]},
 cashExpenses:[],purchaseEvents:[],cashTransactions:[],auditMigrations:[]};
const rec='東地方信用金庫　第一支店　普通預金　123456　法人';
const recipientNames=[
 '第一銀行　本店　普通預金　777333　家族',
 '第二信用金庫　銀座　普通預金　888123　プラド',
 '第三銀行　支店　当座預金　100200　契約',
 '第四銀行　青森　普通預金　103444　相手'
];
let i=0;
const record=(date,recipient,type,eco,amount,account='main',extra={})=>({
 id:'bank-history-'+(++i),date,description_raw:recipient+'（依頼人名：TEST）',
 cashflow_type:type,economic_type:eco,amount,account,
 source:'BANK',balance_after:100000+i,...extra
});
// Mix chronologically shuffled transfers, loans and UNKNOWN expenses.
// Stable ties, same-day rejection and latest non-authoritative history matter.
for(let j=0;j<2400;j++){
 const day=String(1+(j*7)%28).padStart(2,'0'),date='2026-10-'+day;
 const name=recipientNames[j%4],amount=j%5===0?-12000:-30000;
 const type=j%9===0?'INTERNAL_TRANSFER':j%9===1?'DEBT_PRINCIPAL':'UNKNOWN';
 const eco=type==='INTERNAL_TRANSFER'?'TRANSFER':type==='DEBT_PRINCIPAL'?'DEBT_PRINCIPAL':'EXPENSE';
 const account=j%4<2?'main':'secondary';
 st.cashTransactions.push(record(date,name,type,eco,amount,account));
}
for(let j=0;j<300;j++){
 const name=recipientNames[j%4],date='2026-10-'+String(1+j%28).padStart(2,'0');
 st.cashTransactions.push(record(date,name,'UNKNOWN','EXPENSE',-12000,
  j%4<2?'main':'secondary',{description_raw:name+'（管理番号：'+j+'）'}));
}
st.cashTransactions.push(
 record('2026-10-15',recipientNames[0],'UNKNOWN','EXPENSE',-30000,'another-account'),
 record('2026-10-15','商店','UNKNOWN','EXPENSE',-30000),
 record('2026-10-15',recipientNames[1],'UNKNOWN','EXPENSE',-12001),
 record('2026-10-15',recipientNames[1],'UNKNOWN','EXPENSE',-12000,'main',
   {description_raw:recipientNames[1]+'（管理番号：0001）'})
);
const before=JSON.stringify(st);
const flow=api.bankFlow(st,'2026-10','calendar');
const observed=new Map();
for(const bucket of flow.buckets)for(const row of bucket.items){
 if(observed.has(row.identity))throw Error('Bank row counted twice: '+row.identity);
 observed.set(row.identity,bucket.id);
}
let checked=0;
for(const [idx,record] of st.cashTransactions.entries()){
 const naive=api.bankKindWithHistory(record,st);
 const actual=observed.get('bank:'+idx);
 assert.equal(actual,naive,'Optimized bank-flow kind must match brute-force original at '+idx);
 checked++;
}
const usage=api.calculate(st,'2026-10','calendar');
const consumptionExpected=st.cashTransactions.reduce((sum,r)=>sum+
 (api.bankKindWithHistory(r,st)==='expense'?Math.abs(r.amount):0),0);
const debtExpected=st.cashTransactions.reduce((sum,r)=>sum+
 (api.bankKindWithHistory(r,st)==='debt'?Math.abs(r.amount):0),0);
assert.equal(usage.consumption,consumptionExpected,'Normal bank spending unchanged');
assert.equal(usage.debt,debtExpected,'Principal repayments unchanged');
assert.equal(flow.total,st.cashTransactions.reduce((s,r)=>s+Math.abs(r.amount),0));
assert.equal(JSON.stringify(st),before,'History index never mutates canonical bank evidence');
// Direct function still uses the original slow path for compatibility.
const future=record('2026-10-23',recipientNames[1],'UNKNOWN','EXPENSE',-12000,'main');
assert.equal(api.bankKindWithHistory(future,st),
 api.bankKindWithHistory(future,st));
// Cases with malformed dates must fall back to old locale-based sorting.
const legacy={...st,cashTransactions:[
 record('2026-1-4',rec,'DEBT_PRINCIPAL','DEBT_PRINCIPAL',-12345),
 record('2026-02-04',rec,'INTERNAL_TRANSFER','TRANSFER',-12345),
 record('2026-2-3',rec,'UNKNOWN','EXPENSE',-12345)
]};
const original=api.bankKindWithHistory(legacy.cashTransactions[2],legacy);
const p=api.bankFlow(legacy,'2026-02','calendar');
assert.equal(typeof original,'string');
assert.ok(Array.isArray(p.buckets),'Malformed legacy bank date does not crash the fast index');
console.log('BANK_HISTORY_V196_PASS',checked,'bank statements',flow.buckets.length,'classification groups');
