'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const src=fs.readFileSync('handoff-audit-readonly-v141.js','utf8');
const sample={
  settings:{cash:189274,cashAsOf:'2026-10-10'},
  masters:{fixedExpenses:[{name:'洗濯機',amount:120000,cadence:'ANNUAL',active:true}]},
  cashExpenses:[{amount:980,date:'2026-10-12'}],
  purchaseEvents:[{card:'dカード',economic_type:'EXPENSE',original_amount:19704},
    {card:'dカード',economic_type:'TRANSFER',original_amount:10000}],
  cardSettlements:[],
  cashTransactions:[
    {account:'main',source:'Rakuten Bank',date:'2026-10-10',amount:100,balance_after:189274},
    {account:'main',date:'2026-09-30',amount:-50000,economic_type:'EXPENSE',
     cashflow_type:'CASH_WITHDRAWAL_UNCLASSIFIED'}],
  cashflowReconciliationV102:{pending:[{date:'2027-02-19',name:'妻 通常生活費',amount:-230000}]},
  rules:[]
};
function run(st=sample){
  const ctx={window:{getTreasuryStateRaw:()=>st,addEventListener(){}},document:{readyState:'loading',addEventListener(){}},
    URLSearchParams,location:{search:''},Intl,Date};
  vm.runInNewContext(src,ctx);
  return ctx.window.householdHandoffAuditV141;
}
test('report identifies snapshot age, dcard transfer, stale planned 230k and misclassified ATM',()=>{
  const x=run().audit(sample);
  assert.equal(x.readOnly,true);
  assert.equal(x.snapshotDate,'2026-10-10');
  assert.equal(x.oldWifeActive,0);
  assert.equal(x.atmWrongClassAmount,50000);
  assert.equal(x.dcardConsumptionAmount,19704);
  assert.equal(x.dcardTransferAmount,10000);
  assert.equal(x.recurringOneShotCount,1);
});
test('audit does not modify source ledger or stored event IDs',()=>{
  const original=JSON.stringify(sample);
  run().audit(sample);
  assert.equal(JSON.stringify(sample),original);
});
test('a live recurring 230k master is distinguished from stale derived pending',()=>{
  const st=JSON.parse(JSON.stringify(sample));
  st.masters.fixedExpenses.push({name:'妻 通常生活費',active:true,cadence:'MONTHLY',amount:230000});
  const x=run(st).audit(st);
  assert.equal(x.oldWifeActive,1);
  assert.equal(x.oldWifeStalePending,1);
});
