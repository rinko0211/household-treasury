// node tests/purchase-usage-v157.test.js
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let tests=0;const eq=(a,b,m)=>{assert.equal(a,b,m);tests++},ok=(x,m)=>{assert.ok(x,m);tests++};
const C='cycle:2026-09-18:2026-10-16';
let seq=0;
const cash=(amount,date,label,kind='NORMAL',more={})=>({
 id:'cash-'+(++seq),description:label,amount,purchase_total:amount,
 date,economic_type:'EXPENSE',spending_class:kind,...more});
const purchase=(amount,date,label,kind='NORMAL',more={})=>({
 purchase_id:'purchase-'+(++seq),card:'SYNTHETIC_CARD',
 merchant_raw:label,purchase_date:date,original_amount:amount,
 billing_month:'2026-11',economic_type:'EXPENSE',spending_class:kind,
 occurrence_index:1,source_original_id:'purchase-'+seq,...more});
const bank=(amount,date,label,type,eco,more={})=>({
 id:'bank-'+(++seq),source:'SYNTHETIC BANK',account:'main',balance_after:seq,
 amount,date,description_raw:label,cashflow_type:type,economic_type:eco,...more});
const st={
 settings:{salaryDay:18,salary:540000},
 masters:{cards:[],fixedExpenses:[]},
 auditMigrations:[{migration:'v153-sep-oct-audit',period_start:'2026-09-18',period_end:'2026-10-16'}],
 cashExpenses:[
  cash(178640,'2026-09-20','Everyday groceries'),
  cash(21050,'2026-09-27','Holiday gifts','SPECIAL'),
  ...[[4000,'Undated bath'],[14000,'Undated protein'],[1300,'Undated transport'],
      [8500,'Undated fuel'],[871,'Undated stationery'],[880,'Undated snack'],
      [34569,'Cash balance residue']].map(([a,txt])=>
         cash(a,null,txt,'NORMAL',{audit_cycle:C,no_source_date:true})),
  cash(4100,'2026-10-16','Provisional grocery','NORMAL',
       {audit_cycle:C,cycle_start:'2026-09-18',cycle_end:'2026-10-16',provisional_attribution:true}),
  cash(5506,'2026-10-16','Voucher + cash purchase','NORMAL',
       {audit_cycle:C,provisional_attribution:true,payment_breakdown:[{type:'CASH',amount:506},{type:'GIFT',amount:5000}]}),
  cash(20000,'2026-10-16','Provisional souvenir','SPECIAL',
       {audit_cycle:C,provisional_attribution:true}),
  ...[1500,1710,5830].map(a=>cash(a,'2026-09-27','Hospital cash receipt','NORMAL',
       {count_in_spending:false,reconciliation_status:'ABSORBED_DUPLICATE',
       absorbed_into_purchase_id:'hospital-card'}))
 ],
 purchaseEvents:[
  {...purchase(9040,'2026-09-27','Hospital charge'),purchase_id:'hospital-card'},
  purchase(3240,'2026-09-18','Terminal purchase','NORMAL',{card:'Dカード'}),
  purchase(7040,'2026-09-18','Flight purchase','NORMAL',{card:'Dカード'}),
  purchase(8424,'2026-09-18','Sweets purchase','NORMAL',{card:'Dカード'}),
  purchase(1000,'2026-09-25','Cafe prepaid uncertain','NORMAL',
        {card:'Dカード',potential_prepaid_topup:true,review_status:'NEEDS_REVIEW'}),
  purchase(95487,'2026-10-10','Genuine other card purchases'),
  purchase(35317,'2026-10-01','Holiday trip','SPECIAL'),
  purchase(10000,'2026-09-25','Transit prepaid topup','NORMAL',
        {economic_type:'TRANSFER'})
 ],
 cashTransactions:[
  bank(540288,'2026-09-18','September salary','INCOME_SALARY','INCOME'),
  bank(54020,'2026-09-29','Insurance refund','OTHER_INCOME','INCOME'),
  bank(30000,'2026-10-07','Extra salary','INCOME_SALARY','INCOME'),
  bank(831,'2026-09-30','Interest','OTHER_INCOME','INCOME'),
  bank(541194,'2026-10-16','Next salary','INCOME_SALARY','INCOME'),
  bank(-48000,'2026-09-18','Car principal A','DEBT_PRINCIPAL','DEBT_PRINCIPAL'),
  bank(-12000,'2026-09-18','Car principal B','DEBT_PRINCIPAL','DEBT_PRINCIPAL'),
  bank(-12000,'2026-09-28','Investment iDeCo','INVESTMENT_CONTRIBUTION','INVESTMENT'),
  bank(-3790,'2026-09-24','Direct merchant','HOUSEHOLD_EXPENSE','EXPENSE'),
  bank(-3650,'2026-10-10','Direct merchant 2','HOUSEHOLD_EXPENSE','EXPENSE'),
  bank(-145,'2026-10-15','Extra bank fee','HOUSEHOLD_EXPENSE','EXPENSE',
      {reconciliation_disputed_difference:145}),
  bank(-124012,'2026-09-28','Card debit A','CARD_SETTLEMENT','TRANSFER'),
  bank(-11475,'2026-10-13','Card debit B','CARD_SETTLEMENT','TRANSFER'),
  bank(-10846,'2026-10-13','Card debit C','CARD_SETTLEMENT','TRANSFER'),
  bank(-50000,'2026-09-30','ATM withdrawal','CASH_WITHDRAWAL','TRANSFER'),
  bank(-35000,'2026-10-13','ATM withdrawal 2','CASH_WITHDRAWAL','TRANSFER'),
  bank(-150000,'2026-10-06','Household bank transfer','INTERNAL_TRANSFER','TRANSFER')
 ]};
const win={
 householdSemanticV47:{
  normalizeCategoryValue:x=>x||null,
  inferCategory:()=> 'FOOD',
  inferSubcategory:()=> 'GROCERIES'
 },
 householdExpenseNatureV152:{
  classify:()=>({nature:'VARIABLE'})
 }};
const doc={readyState:'loading',addEventListener:()=>{},getElementById:()=>null};
const ctx={window:win,document:doc,Date,Intl,Number,String,Set,Map,Math,JSON};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('treasury-ledger-v145.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('purchase-usage-ledger-v157.js','utf8'),ctx);
const api=win.householdUsageLedgerV157;
const r=api.calculate(st,'2026-09','payday');
eq(r.start,'2026-09-18','Actual audited cycle start');
eq(r.end,'2026-10-16','Actual audited cycle closes 16 October');
eq(r.subtotals.cashExpenses,293416,'All cash including explicit null dates and mixed tender');
eq(r.subtotals.purchaseEvents,159548,'Card use date spending, not card settlements');
eq(r.subtotals.directBank,7440,'Direct bank spending after separately disclosed disputed fee');
eq(r.ordinary,384037,'Approved ordinary spending');
eq(r.special,76367,'Approved special expenses');
eq(r.consumption,460404,'Approved total consumption');
eq(r.debt,60000,'Car principal outside of consumption');
eq(r.ideco,12000,'iDeCo outside of consumption');
eq(r.investment,0,'No invented investment');
eq(r.funds,532404,'Approved total uses');
eq(r.income,625139,'Salary from next cycle excluded');
eq(r.net,92735,'Approved net balance');
eq(r.unresolvedBankFee,145,'Unresolved bank fee kept separately');
eq(r.byKind.cash.filter(x=>!x.date).reduce((a,x)=>a+x.amount,0),64120,'Null-date audit-bound expenses counted');
eq(r.byKind.cash.filter(x=>x.provisional&&x.date).reduce((a,x)=>a+x.amount,0),29606,
  'Oct 16 provisional cash receipts included in audited cycle');
eq(r.byKind.purchase.filter(x=>x.label==='Hospital charge').length,1,'Hospital card only');
ok(r.byKind.cash.every(x=>x.label!=='Hospital cash receipt'),'Hospital cash receipts absorbed');
ok(r.reviewCount>=1,'Review flag retained');
const debit=api.bankFlow(st,'2026-09','payday');
eq(debit.buckets.find(x=>x.id==='cardSettlement').amount,146333,'Card settlements only in separate bank lens');
ok(!r.usageRows.some(x=>/Card debit/.test(x.label)),'No card debit in consumption');
const other=structuredClone(st);other.purchaseEvents.find(x=>x.merchant_raw==='Cafe prepaid uncertain').review_status='RESOLVED';
other.purchaseEvents.find(x=>x.merchant_raw==='Cafe prepaid uncertain').potential_prepaid_topup=false;
eq(api.calculate(other,'2026-09','payday').consumption,460404,'Review changes do not modify spending');
ok(api.calculate(other,'2026-09','payday').reviewCount<r.reviewCount,
 'Review flags are independent of money');
// v186: a manually reported expense and a future card receipt must not add twice.
const dual=structuredClone(st);
dual.cashExpenses.push(cash(5600,'2026-10-30','厚生費','NORMAL',
  {manual_reconciliation_pending:true,cost_nature:'VARIABLE'}));
dual.purchaseEvents.push(purchase(5600,'2026-10-30','厚生費'));
const baseNow=api.calculate(st,'2026-10','payday');
const reconciled=api.calculate(dual,'2026-10','payday');
eq(reconciled.consumption-baseNow.consumption,5600,
 'Manual welfare report superseded by matching later card purchase');
ok(!reconciled.byKind.cash.some(x=>x.label==='厚生費'),'Imported card is canonical');
const next=api.calculate(st,'2026-10','payday');
ok(!next.byKind.cash.some(x=>x.provisional&&x.date==='2026-10-16'),
   'Provisional previous-cycle receipts do not leak into next pay period');
ok(next.income>=541194,'Next cycle gets October 16 salary');
const cal=api.calculate(st,'2026-10','calendar');
eq(cal.start,'2026-10-01','Calendar start differs');
eq(cal.end,'2026-10-31','Calendar end differs');
ok(!cal.byKind.cash.some(x=>!x.date),'Null-date audit-only receipts are not assigned a fake calendar date');
const edited=structuredClone(st);
edited.cashExpenses[0].amount=123;edited.cashExpenses[0].purchase_total=178640;
eq(api.calculate(edited,'2026-09','payday').consumption,460404,
 'Mixed tender uses purchase_total once, never only the cash portion');

// Historical statement matching is READ-ONLY: newly imported UNKNOWN rows
// for a verified loan recipient must not inflate normal household consumption.
{
 const sample=structuredClone(st);
 const bankRecipient='東地方信用金庫　第一支店　普通預金　1234567　テスト名義';
 const transferRecipient='第一銀行　第二支店　普通預金　9998887　テスト送金先';
 sample.cashTransactions.push(
  bank(-12000,'2026-09-13',bankRecipient+'（依頼人名：TEST）','DEBT_PRINCIPAL','DEBT_PRINCIPAL'),
  bank(-50000,'2026-10-17',transferRecipient+'（依頼人名：TEST）','INTERNAL_TRANSFER','TRANSFER')
 );
 const loan=bank(-12000,'2026-10-19',bankRecipient+'（依頼人名：TEST　管理番号：02）','UNKNOWN','EXPENSE');
 const wife=bank(-30000,'2026-10-19',transferRecipient+'（依頼人名：TEST　管理番号：03）','UNKNOWN','EXPENSE');
 sample.cashTransactions.push(loan,wife);
 eq(api.bankKindWithHistory(loan,sample),'debt','Exact previously verified loan recipient is principal, not a living expense');
 eq(api.bankKindWithHistory(wife,sample),'transfer','Exact earlier transfer recipient remains a transfer');
 const v=api.calculate(sample,'2026-10','payday');
 eq(v.debt,12000,'Previously verified bank loan increases the new cycle debt exactly once');
 eq(v.consumption,0,'Previously verified loan and same-recipient transfer do not increase new-cycle purchases');
 eq(loan.economic_type,'EXPENSE','Read-only inference does not change imported raw evidence');
 const wrong=bank(-12001,'2026-10-19',bankRecipient+'（依頼人名：TEST）','UNKNOWN','EXPENSE');
 sample.cashTransactions.push(wrong);
 eq(api.bankKindWithHistory(wrong,sample),'expense','Different loan amount cannot inherit principal status');
 const third=bank(-12000,'2026-10-19','他行　その他支店　普通預金　8888888　テスト','UNKNOWN','EXPENSE');
 sample.cashTransactions.push(third);
 eq(api.bankKindWithHistory(third,sample),'expense','Different recipient cannot inherit principal status');
}


// v195: Verify the indexed duplicate filter against the original strict
// predicate for many imported rows; official purchases remain authoritative.
{
 const local={settings:{salaryDay:18},masters:{cards:[],fixedExpenses:[]},
   auditMigrations:[],cashExpenses:[],purchaseEvents:[],cashTransactions:[]};
 const date='2026-10-22',expenseCost=200;
 const norm=s=>String(s||'').normalize('NFKC').replace(/[\s　()（）._\-／/・]/g,'').toUpperCase();
 const value=r=>Math.abs(Number(r.purchase_total??r.original_amount??r.amount)||0);
 const included=r=>r.count_in_spending!==false&&r.reconciliation_status!=='ABSORBED_DUPLICATE'&&
   !r.is_refinanced&&!r.is_refinance_adjustment&&
   (!r.economic_type||String(r.economic_type).toUpperCase()==='EXPENSE');
 for(let i=0;i<250;i++){
   local.cashExpenses.push({
     id:'reported-'+i,date,description:'重複店'+i,amount:expenseCost,
     manual_reconciliation_pending:true,economic_type:'EXPENSE'
   });
   local.purchaseEvents.push({
     purchase_id:'card-'+i,purchase_date:date,
     card:'JAL',pdf_card_identity:'CARD-1',merchant_raw:'重複店'+i,
     billing_month:'2026-12',source_original_id:'source-'+i,
     original_amount:expenseCost,occurrence_index:1,economic_type:'EXPENSE'
   });
 }
 for(let i=0;i<100;i++){
   const label='固有店'+i,cost=300+i;
   local.cashExpenses.push({id:'unique-'+i,date,description:label,
     amount:cost,manual_reconciliation_pending:true,economic_type:'EXPENSE'});
   local.cashTransactions.push({
     id:'bank-duplicate-'+i,date,source:'UFJ',account:'main',
     balance_after:250000-i,amount:-cost,description_raw:label,
     cashflow_type:'HOUSEHOLD_EXPENSE',economic_type:'EXPENSE'
   });
 }
 // These official rows are ineligible for suppressing the manual report.
 for(const [i,extra] of [{count_in_spending:false},
     {economic_type:'TRANSFER'},{reconciliation_status:'ABSORBED_DUPLICATE'}].entries()){
   local.cashExpenses.push({id:'not-linked-'+i,date,description:'無効明細'+i,
     amount:expenseCost,manual_reconciliation_pending:true});
   local.purchaseEvents.push({purchase_id:'not-linked-pdf-'+i,
     purchase_date:date,card:'JAL',billing_month:'2026-12',
     merchant_raw:'無効明細'+i,source_original_id:'ineligible-'+i,
     original_amount:expenseCost,...extra});
 }
 local.cashExpenses.push({id:'different-date',date,
   description:'日付違い',amount:expenseCost,manual_reconciliation_pending:true});
 local.purchaseEvents.push({purchase_id:'different-date-pdf',
   purchase_date:'2026-10-23',card:'JAL',billing_month:'2026-12',
   merchant_raw:'日付違い',original_amount:expenseCost});
 // Confirm the original baseline predicate independently from the index.
 for(const reported of local.cashExpenses){
   const old=local.purchaseEvents.some(card=>included(card)&&
     card.purchase_date===reported.date&&value(card)===value(reported)&&
     norm(card.merchant_raw||card.merchant_normalized||'')===
       norm(reported.description||reported.name||''));
   const expect=reported.id.startsWith('reported-');
   eq(old,expect,'Brute-force oracle for '+reported.id);
 }
 const before=structuredClone(local);
 const output=api.calculate(local,'2026-10','calendar');
 eq(output.byKind.purchase.length,251,'250 canonical purchases plus a different-date purchase');
 eq(output.byKind.cash.length,104,'Manual rows with no qualifying card remain');
 eq(output.byKind.bank.length,0,'Bank duplicates of included manual cash are ignored');
 eq(output.subtotals.cashExpenses,local.cashExpenses.slice(250).reduce((sum,x)=>sum+value(x),0),
   'Only non-reconciled cash contributes to consumption');
 eq(output.subtotals.directBank,0,'Index excludes direct-bank duplicates');
 ok(output.byKind.cash.every(x=>!x.label.startsWith('重複店')),
   'All 250 duplicated manually reported receipts are suppressed');
 eq(JSON.stringify(local),JSON.stringify(before),'Indexing never mutates official or manual source records');
 const missingBank=structuredClone(local);
 missingBank.cashExpenses=missingBank.cashExpenses.filter(x=>x.id!=='unique-0');
 eq(api.calculate(missingBank,'2026-10','calendar').subtotals.directBank,300,
   'Without its cash equivalent, a direct bank transaction is restored');
}

console.log('PASS '+tests+' purchase-usage v157 assertions');
