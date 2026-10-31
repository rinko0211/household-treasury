/* Private, exact-match, idempotent ledger repair. No household data is stored in the repository. */
(() => {
'use strict';
const FORMAT='HOUSEHOLD_TREASURY_PRIVATE_LEDGER_V199';
const desk=window.householdUnifiedRepairDeskV161;
if (!desk || window.householdPrivateLedgerRepairV199) return;
const getState=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
const digits=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const norm=s=>String(s||'').normalize('NFKC')
  .replace(/[\s　()（）［］\[\]〔〕【】・\-_/]/g,'').toUpperCase();
const cardNorm=s=>norm(s).replace(/カード$/,'');
const amount=x=>Math.abs(Number(x)||0);
const date=x=>/^20\d\d-\d\d-\d\d$/.test(String(x||''));
const same=(a,b)=>String(a)===String(b);
function assert(ok,msg){if(!ok)throw Error(msg)}
function exactPurchase(x,ref){
 return x&&same(x.purchase_id,ref.id)&&same(x.purchase_date,ref.date)&&
   amount(x.original_amount)===Number(ref.amount)&&cardNorm(x.card)===cardNorm(ref.card)&&
   norm(x.merchant_raw||x.merchant_normalized)===norm(ref.merchant);
}
function ensurePurchaseRef(ref){
 assert(ref&&typeof ref==='object'&&typeof ref.id==='string'&&
  date(ref.date)&&digits(ref.amount)&&typeof ref.merchant==='string'&&ref.merchant&&
  typeof ref.card==='string'&&ref.card,'カード照合キーが不正です');
}
function plan(input,patch){
 assert(patch?.format===FORMAT&&Array.isArray(patch.entries)&&patch.entries.length>0&&
   patch.entries.length<=40,'修正ファイル形式または件数が不正です');
 const next=structuredClone(input||{});
 for(const key of ['purchaseEvents','cashTransactions','personalExpenses','cardSettlements'])
   next[key]=Array.isArray(next[key])?next[key]:[];
 let changed=0,total=0;
 const keys=new Set();
 for(const entry of patch.entries){
  assert(entry&&typeof entry==='object'&&typeof entry.op==='string','修正操作が不正です');
  const key=entry.op+':'+String(entry.id||entry.duplicate?.id||entry.record?.id||'');
  assert(!keys.has(key),'修正操作の重複があります');keys.add(key);
  if(entry.op==='suppress_duplicate'){
   ensurePurchaseRef(entry.duplicate);ensurePurchaseRef(entry.canonical);
   const find=r=>next.purchaseEvents.find(x=>String(x.purchase_id)===r.id);
   const dupe=find(entry.duplicate),canonical=find(entry.canonical);
   assert(exactPurchase(dupe,entry.duplicate)&&exactPurchase(canonical,entry.canonical),
     'カード原本のID・日付・金額・店舗が一致しません');
   assert(dupe!==canonical&&cardNorm(dupe.card)==='KABU&'&&
     cardNorm(canonical.card)==='KABU&'&&
     dupe.purchase_date===canonical.purchase_date&&
     amount(dupe.original_amount)===amount(canonical.original_amount)&&
     norm(dupe.merchant_raw)===norm(canonical.merchant_raw)&&
     String(dupe.source_file||'')!==String(canonical.source_file||'')&&
     canonical.count_in_spending!==false,'同一購入・正本の検証に失敗しました');
   if(dupe.count_in_spending===false&&dupe.reconciliation_status==='ABSORBED_DUPLICATE'){
     assert(dupe.kabu_canonical_purchase_id===canonical.purchase_id,
       '既存の除外先が異なります');
     continue;
   }
   assert(dupe.count_in_spending!==false,'別の理由で除外された明細です');
   dupe.kabu_original_count_v199=dupe.count_in_spending===undefined?null:dupe.count_in_spending;
   dupe.kabu_original_status_v199=dupe.reconciliation_status===undefined?null:dupe.reconciliation_status;
   dupe.count_in_spending=false;
   dupe.reconciliation_status='ABSORBED_DUPLICATE';
   dupe.kabu_canonical_purchase_id=String(canonical.purchase_id);
   dupe.private_verified_v199=true;
   for(const s of next.cardSettlements){
     if(!Array.isArray(s.purchase_ids))continue;
     s.purchase_ids=[...new Set(s.purchase_ids.map(id=>id===dupe.purchase_id?canonical.purchase_id:id))];
   }
   changed++;total+=Number(entry.duplicate.amount);
  }else if(entry.op==='bank_classification'){
   assert(typeof entry.id==='string'&&date(entry.date)&&Number.isSafeInteger(entry.amount)&&
     entry.amount<0&&['TRANSFER','DEBT_PRINCIPAL'].includes(entry.to),'銀行分類の指定が不正です');
   const r=next.cashTransactions.find(x=>String(x.id)===entry.id);
   assert(r&&same(r.date,entry.date)&&Number(r.amount)===entry.amount,
     '銀行原本のID・日付・金額が一致しません');
   if(r.economic_type===entry.to&&r.expense_scope===(entry.to==='TRANSFER'?'TRANSFER':'DEBT'))continue;
   assert(r.economic_type==='EXPENSE'&&r.expense_scope==='NORMAL',
     '銀行明細が修正前の状態と異なります');
   const loan=entry.to==='DEBT_PRINCIPAL';
   r.economic_type=entry.to;r.ordinary_or_special=loan?'DEBT':'TRANSFER';
   r.expense_scope=loan?'DEBT':'TRANSFER';r.spending_class=null;
   r.category=null;r.subcategory=null;r.is_transfer=!loan;
   r.cashflow_type=loan?'DEBT_PRINCIPAL':'INTERNAL_TRANSFER';
   if(loan){
     assert(['LAPIN','PRADO'].includes(entry.vehicle_loan),'ローン種別を指定してください');
     r.vehicle_loan=entry.vehicle_loan;r.cost_nature='FIXED';
   }
   r.private_verified_v199=true;
   changed++;
  }else if(entry.op==='add_purchase'){
   const r=entry.record;ensurePurchaseRef({id:r?.purchase_id,date:r?.purchase_date,
     amount:r?.original_amount,merchant:r?.merchant_raw,card:r?.card});
   assert(/^20\d\d-\d\d$/.test(String(r.billing_month))&&
     typeof r.source_file==='string'&&r.source_file&&
     typeof r.category==='string'&&typeof r.subcategory==='string'&&
     ['NORMAL','SPECIAL'].includes(r.spending_class)&&
     ['FIXED','VARIABLE','REVIEW'].includes(r.cost_nature),
     '購入明細の必須項目が不正です');
   const old=next.purchaseEvents.find(x=>String(x.purchase_id)===r.purchase_id);
   if(old){
     assert(exactPurchase(old,{id:r.purchase_id,date:r.purchase_date,
       amount:r.original_amount,merchant:r.merchant_raw,card:r.card}),
       '同一購入IDに異なる明細が存在します');
     continue;
   }
   // If the user already entered this screenshot, never add it again.
   if(next.purchaseEvents.some(x=>x.count_in_spending!==false&&
     x.purchase_date===r.purchase_date&&amount(x.original_amount)===Number(r.original_amount)&&
     cardNorm(x.card)===cardNorm(r.card)&&norm(x.merchant_raw||x.merchant_normalized)===norm(r.merchant_raw)))
     continue;
   next.purchaseEvents.push({...r,record_kind:'CARD_PURCHASE',economic_type:'EXPENSE',
     expense_scope:r.spending_class,ordinary_or_special:r.spending_class,
     original_amount:Number(r.original_amount),count_in_spending:true,
     source:'USER_VERIFIED_SCREENSHOT',private_verified_v199:true});
   changed++;total+=Number(r.original_amount);
  }else if(entry.op==='add_personal'){
   const r=entry.record;
   assert(r&&typeof r.id==='string'&&['wife','self'].includes(r.owner)&&digits(r.amount)&&
     date(r.date)&&date(r.cycle_start)&&date(r.cycle_end)&&
     typeof r.description==='string'&&r.description,'個人費の指定が不正です');
   const old=next.personalExpenses.find(x=>String(x.id)===r.id);
   if(old){
     assert(old.owner===r.owner&&Number(old.amount)===Number(r.amount)&&
       old.date===r.date&&old.description===r.description,'個人費IDが既存記録と衝突しています');
     continue;
   }
   next.personalExpenses.push({...r,amount:Number(r.amount),
     source:'CHAT_REPORTED',private_verified_v199:true});
   changed++;total+=Number(r.amount);
  }else if(entry.op==='add_settlement'){
   const r=entry.record;
   assert(r&&typeof r.settlement_id==='string'&&typeof r.card==='string'&&
     date(r.due_date)&&digits(r.amount)&&Array.isArray(r.purchase_ids)&&
     r.purchase_ids.length>0,'請求予定の形式が不正です');
   const existing=next.cardSettlements.find(x=>x.settlement_id===r.settlement_id);
   if(existing){
     assert(Number(existing.amount)===Number(r.amount)&&existing.due_date===r.due_date,
       '既存請求予定額と異なります');
     continue;
   }
   assert(r.purchase_ids.every(id=>next.purchaseEvents.some(x=>x.purchase_id===id&&
     cardNorm(x.card)===cardNorm(r.card))),'請求対象の購入IDがありません');
   next.cardSettlements.push({...r,record_kind:'CARD_SETTLEMENT',economic_type:'TRANSFER',
     expense_scope:'TRANSFER',ordinary_or_special:'TRANSFER',spending_class:null,
     source_file:'USER_VERIFIED_SCREENSHOT',estimated:true,private_verified_v199:true});
   changed++;
  }else throw Error('未対応の修正操作です: '+entry.op);
 }
 return {next,changed,total};
}
function apply(patch){
 const before=getState(),p=plan(before,patch);
 if(!p.changed)return {changed:0,alreadyApplied:true};
 assert(typeof window.replaceTreasuryState==='function'&&
   typeof window.treasuryRecoverySnapshot==='function','保存または復旧機能を利用できません');
 window.treasuryRecoverySnapshot('画像・個人費・重複の原本照合済み修正直前');
 assert(window.replaceTreasuryState(p.next)!==false,'保存に失敗しました');
 window.cloudSyncOnLocalSave?.();
 window.dispatchEvent?.(new CustomEvent('treasury:expenses-imported',{detail:{source:FORMAT}}));
 window.householdExpenseUnifiedV148?.render?.();
 return {changed:p.changed};
}
desk.register({format:FORMAT,label:'画像・個人費・原本照合済み明細の修正',
 preview:patch=>{const p=plan(getState(),patch);return{count:p.changed,amount:p.total};},
 apply});
window.householdPrivateLedgerRepairV199={plan,apply,FORMAT};
})();