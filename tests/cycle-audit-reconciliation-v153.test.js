// node tests/cycle-audit-reconciliation-v153.test.js
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const listeners={},elements=new Map();
const document={readyState:'loading',addEventListener:(t,fn)=>(listeners[t]??=[]).push(fn),
  getElementById:id=>elements.get(id)||null,querySelector:()=>null};
const window={addEventListener:(t,fn)=>(listeners[t]??=[]).push(fn)};
const ctx={window,document,Intl,Date,Number,Math,JSON,String,Map,Set,CustomEvent:function(){},setTimeout:()=>{}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('cycle-audit-reconciliation-v153.js','utf8'),ctx);
const m=window.householdCycleAuditV153;
let tests=0;const eq=(actual,expected,note)=>{assert.equal(actual,expected,note);tests++};
const ok=(x,note)=>{assert.ok(x,note);tests++};
const id=(prefix,i)=>prefix+'-'+i;
const spend=(i,date,amount,desc,extra={})=>({
 id:id('cash',i),date,amount,description:desc,economic_type:'EXPENSE',category:'FOOD',
 ...extra
});
const card=(i,date,amount,merchant,cardName='MUFG/DC/JAL',extra={})=>({
 purchase_id:id('card',i),purchase_date:date,original_amount:amount,
 merchant_raw:merchant,card:cardName,billing_month:'2026-11',occurrence_index:1,
 economic_type:'EXPENSE',...extra
});
const bank=(i,date,amount,description,cashflow_type,economic_type,extra={})=>({
 id:id('bank',i),date,amount,description_raw:description,
 cashflow_type,economic_type,source:'Main',account:'main',balance_after:i,...extra
});
const cycle='cycle:2026-09-18:2026-10-16';
const hospital='hospital-card-id';
const state={
 cashExpenses:[
  spend(1,'2026-09-29',123870,'September cash'),
  spend(2,'2026-10-12',97940,'October cash'),
  spend(3,'2026-10-12',1980,'DEMZU',{purchase_total:1980,payment_method:'MIXED',
   payment_breakdown:[{method:'CASH',amount:980},{method:'VOUCHER',amount:1000}]}),
  spend(4,'2026-10-16',5506,'Yokomachi',{purchase_total:5506,payment_method:'MIXED',
   payment_breakdown:[{method:'CASH',amount:506},{method:'GIFT_CERTIFICATE',amount:5000}]}),
  spend(5,null,11551,'October month-only known spending',{month_attribution:'2026-10',audit_cycle:cycle}),
  spend(6,null,4000,'Bath ticket',{audit_cycle:cycle}),
  spend(7,null,14000,'Protein points',{audit_cycle:cycle,payment_method:'POINTS'}),
  spend(8,null,34569,'Unknown cash balance',{audit_cycle:cycle,
    cash_balance_residual_id:'residual-1',reallocates_not_adds:true,cash_balance_residual_allocated:0}),
  ...[1500,1710,5830].map((a,i)=>spend('hospital'+i,'2026-09-28',a,'Misawa hospital',
    {count_in_spending:false,reconciliation_status:'ABSORBED_DUPLICATE',absorbed_into_purchase_id:hospital}))
 ],
 purchaseEvents:[
  {...card('hospital','2026-09-28',9040,'Misawa Hospital'),purchase_id:hospital},
  card('sept','2026-09-22',60632,'September JAL genuine purchases'),
  card('oct','2026-10-10',70172,'October card genuine purchases'),
  card('d1','2026-09-18',3240,'Haneda terminal','Dカード'),
  card('d2','2026-09-18',7040,'JAL tickets','Dカード'),
  card('d3','2026-09-18',8424,'NUMBERSUGAR','Dカード'),
  card('d4','2026-09-25',1000,'Starbucks','Dカード',{potential_prepaid_topup:true,count_in_spending:true})
 ],
 cashTransactions:[
  bank(1,'2026-09-18',540288,'Sep salary','INCOME_SALARY','INCOME'),
  bank(2,'2026-09-29',54020,'Refund','INCOME_OTHER','INCOME'),
  bank(3,'2026-10-07',30000,'Additional salary','INCOME_SALARY','INCOME'),
  bank(4,'2026-09-30',831,'Interest','INTEREST','INCOME'),
  bank(5,'2026-10-16',541194,'Next salary','INCOME_SALARY','INCOME'),
  bank(6,'2026-09-30',-50000,'ATM cash withdrawal','CASH_WITHDRAWAL_UNCLASSIFIED','EXPENSE'),
  bank(7,'2026-10-13',-35000,'カード出金','UNKNOWN','EXPENSE'),
  bank(8,'2026-09-18',-48000,'Prado loan','DEBT_PRINCIPAL','DEBT_PRINCIPAL'),
  bank(9,'2026-09-18',-12000,'Lapin loan','DEBT_PRINCIPAL','DEBT_PRINCIPAL'),
  bank(10,'2026-09-28',-12000,'iDeCo','INVESTMENT_CONTRIBUTION','INVESTMENT'),
  bank(11,'2026-09-24',-3790,'Direct spending','HOUSEHOLD_EXPENSE','EXPENSE'),
  bank(12,'2026-10-10',-3650,'Direct October','HOUSEHOLD_EXPENSE','EXPENSE'),
  bank(13,'2026-10-15',-145,'Transfer bank fee','HOUSEHOLD_EXPENSE','EXPENSE',{reconciliation_disputed_difference:145}),
  bank(14,'2026-10-13',-10846,'ミツビシUFJニコス','DEBT_PRINCIPAL','DEBT_PRINCIPAL'),
  bank(15,'2026-10-13',-11475,'JCB settlement','CARD_SETTLEMENT','TRANSFER')
 ],
 cardSettlements:[{settlement_id:'confirmed-JALDC',bank_transaction_id:'bank-14',amount:10846,due_date:'2026-10-13',confirmed_bank_debit:true}],cardCashflowOverrides:[],auditMigrations:[{migration:'v153-sep-oct-audit'}]
};
// Card settlement could have old wrong principal classification. The underlying banking issuer
// is evidence of CARD SETTLEMENT, never a second loan.
let result=m.calculate(state);
eq(result.cash,258847,'DEMZU/Yokomachi full purchase including vouchers once');
eq(result.unknownCash,34569,'Cash residual once');
eq(result.card,139844,'Keep 9,040 JAL hospital once');
eq(result.dcard,19704,'D-card four confirmed expenditures');
eq(result.bankDirect,7585,'Complete bank direct cost including real disputed 145 fee');
eq(result.bankDirectAccepted,7440,'Audited verified subtotal');
eq(result.loan,60000,'Prado+Lapin principal only');
eq(result.investment,12000,'iDeCo preserved separately');
eq(result.income,625139,'Income excludes Oct 16 salary');
eq(result.consumption,460404,'Acceptance: audited consumption from records');
eq(result.consumptionAll,460549,'Complete actual cost includes bank fee');
eq(result.funds,532404,'Acceptance: all money uses');
eq(result.fundsAll,532549,'Complete use includes disputed fee');
eq(result.net,92735,'Acceptance: income less audited uses');
eq(result.netAll,92590,'True complete accounting includes real fee');
eq(result.datedSep,217036,'September 18–30 dated spending');
eq(result.datedOct,190799,'October including month-only known expenses; fee disclosed');
eq(result.undated,18000,'Only bath ticket and protein lack month/date');
ok(result.reconciliationBalanced,'Date-period cross-check reconciles');
// Removing absorption metadata causes a duplicative 9,040 in cash; flagged calculation must not double count.
const clone=o=>JSON.parse(JSON.stringify(o));
let broken=clone(state);broken.cashExpenses.filter(x=>x.absorbed_into_purchase_id).forEach(x=>{x.count_in_spending=true;x.reconciliation_status='NORMAL'});
assert.throws(()=>m.calculate(broken),/absorbed|吸収済み現金/);tests++;
// Prepaid charges and withdrawals must not inflate consumption.
let charge=clone(state);
charge.purchaseEvents.push(card('charge','2026-10-12',10000,'PASMO チャージ','Dカード',{economic_type:'TRANSFER'}));
eq(m.calculate(charge).consumption,460404,'PASMO top-up excluded');
const residual=m.reallocateResidual(state,{residualId:'residual-1',
 record:{id:'new-expense-1',amount:2000,date:'2026-10-04',description:'Recovered merchant'}});
eq(m.calculate(residual).consumption,460404,'Unknown cash reallocation keeps total unchanged');
eq(residual.cashExpenses.find(x=>x.id==='cash-8').amount,32569,'Residual shrinks');
eq(residual.cashExpenses.find(x=>x.id==='new-expense-1').amount,2000,'Known purchase inserted once');
assert.throws(()=>m.reallocateResidual(residual,{residualId:'residual-1',
 record:{id:'new-expense-1',amount:2000,description:'duplicate'}}));tests++;
// Generic patch strict preconditions and repeat application.
const patch={format:'household-treasury-cycle-reconciliation-v153',updates:[{
 array:'cashExpenses',id_key:'id',id:'cash-3',guard:{date:'2026-10-12',amount:1980},
 before:{payment_method:{present:true,value:'MIXED'}},
 set:{payment_method:'MIXED_VERIFIED'}
}],inserts:[{array:'cashExpenses',id_key:'id',id:'new-audit-row',
 record:spend('notused',null,350,'Reference cash',{id:'new-audit-row',audit_cycle:cycle})}],
 meta_additions:[]};
const p1=m.planPatch(state,patch);
eq(p1.changed.length,2,'Patch modifies exactly two rows');
const p2=m.planPatch(p1.next,patch);
eq(p2.changed.length,0,'Second application idempotent');
eq(JSON.stringify(p1.next),JSON.stringify(p2.next),'Full state byte-identical on rerun');
assert.throws(()=>m.planPatch(state,{...patch,updates:[{...patch.updates[0],guard:{amount:999}}]}));tests++;
eq(state.cashExpenses.find(x=>x.id==='cash-3').payment_method,'MIXED','Input remains unchanged by plan');
// Future stale manual override must not produce or revive an estimated bill.
{
 const st={masters:{cards:[{name:'Dカード',active:true,paymentMode:'FULL',settlementDay:10,closingDay:15}],fixedExpenses:[]},
   purchaseEvents:[],cardSettlements:[],cardCashflowOverrides:[]};
 const root={getTreasuryStateRaw:()=>st,
   householdPlanningV79:{baselineOf:()=>185000,forecastMode:()=> 'BASELINE',forecastAmountForCard:()=>185000}};
 const cc={window:root,Date,Number,String,Math,JSON,Map,Set,setTimeout:()=>{}};
 vm.createContext(cc);
 vm.runInContext(fs.readFileSync('card-cycle-v81.js','utf8'),cc);
 const today=new Date(),cur=String(today.getFullYear())+'-'+String(today.getMonth()+1).padStart(2,'0');
 const next=root.householdCardCycleV81.addMonths(cur,1);
 st.cardCashflowOverrides.push({id:'stale',key:'ESTIMATE|Dカード|'+next,card:'Dカード',billing_month:next,kind:'ESTIMATE',
   amount:185000,reconciliation_status:'SUSPENDED_UNVERIFIED',include_in_forecast:false,exclude_from_current_cashflow:true});
 const plan=root.householdCardCycleV81.buildPlan(120);
 ok(!plan.rows.some(x=>x.billing_month===next),'Suspended card override is never forecasted as actual or baseline');
 const baseline=root.householdCardCycleV81.baselinePreview(4);
 const item=baseline.find(x=>x.card==='Dカード').months.find(x=>x.ym===next);
 eq(item.source,'SUPPRESSED','Baseline preview explicitly marks stale D-card estimate');
 eq(item.amount,0,'Stale 185,000 yen not added to plan');
}

// v154 regression: same bank settlement, same deterministic ID, but real
// statement includes extra evidence and a different source filename.
{
 const bankId='synthetic-bank-1200',sid='audit:synthetic:jaldc',
  date='2026-10-13',amount=1200;
 const bankDebit={id:bankId,date,amount:-amount,description_raw:'Mitsubishi UFJ NICOS',
   cashflow_type:'CARD_SETTLEMENT',economic_type:'TRANSFER',
   account:'main',source:'test',balance_after:3000};
 const originalSettlement={settlement_id:sid,card:'JAL/DC系',due_date:date,amount,
   bank_transaction_id:bankId,source_file:'original-statement.csv',
   record_kind:'CARD_SETTLEMENT',economic_type:'TRANSFER',
   original_statement_hash:'source-signature-keep',purchase_ids:['actual-evidence-id']};
 const expectedSettlement={settlement_id:sid,card:'MUFG/DC/JAL',due_date:date,amount,
   bank_transaction_id:bankId,source_file:'bank-statement-reconciliation',
   record_kind:'CARD_SETTLEMENT',economic_type:'TRANSFER',confirmed_bank_debit:true};
 const base={cashTransactions:[bankDebit],cashExpenses:[],purchaseEvents:[],
   cardSettlements:[originalSettlement],cardCashflowOverrides:[]};
 const spec={format:m.FORMAT,updates:[],inserts:[
   {array:'cardSettlements',id_key:'settlement_id',id:sid,record:expectedSettlement}],meta_additions:[]};
 const result=m.planPatch(base,spec);
 eq(result.changed.length,0,'Equivalent existing JAL/DC settlement: no insert');
 eq(result.already.length,1,'Existing settlement is recognized without full JSON equality');
 eq(JSON.stringify(result.next),JSON.stringify(base),'Source file and additional provenance remain untouched');
 eq(m.planPatch(result.next,spec).changed.length,0,'Equivalent settlement rerun is idempotent');
 const reject=(changes,reason)=>{
   const v=clone(base);Object.assign(v.cardSettlements[0],changes);
   assert.throws(()=>m.planPatch(v,spec),/照合不一致|同一銀行引落/,'Must refuse '+reason);tests++;
 };
 reject({amount:1400},'different amount');
 reject({due_date:'2026-10-12'},'different date');
 reject({card:'KABU&'},'different card');
 reject({bank_transaction_id:'different-bank'},'different linked bank debit');
 reject({economic_type:'DEBT_PRINCIPAL'},'conflicting economic type');
 reject({confirmed_bank_debit:false},'explicit unconfirmed bank debit');
 reject({record_kind:'CASH_EXPENSE'},'not a card settlement');
 const another=clone(base);another.cardSettlements=[];
 another.cashTransactions[0].amount=-1300;
 assert.throws(()=>m.planPatch(another,spec),/同一銀行引落に別ID|照合不一致/);tests++;
 const duplicate=clone(base);duplicate.cardSettlements.push(
   {...clone(originalSettlement),settlement_id:'another',bank_transaction_id:bankId});
 assert.throws(()=>m.planPatch(duplicate,spec),/照合不一致/);tests++;
 // An already-applied field set must still have immutable source guards verified.
 const guarded={...spec,inserts:[],updates:[{
   array:'cashTransactions',id_key:'id',id:bankId,
   guard:{date:'2020-01-01'},before:{economic_type:{present:true,value:'TRANSFER'}},
   set:{economic_type:'TRANSFER'}
 }]};
 assert.throws(()=>m.planPatch(base,guarded),/元明細照合不一致/);tests++;
}

console.log('PASS '+tests+' cycle reconciliation and patch assertions');