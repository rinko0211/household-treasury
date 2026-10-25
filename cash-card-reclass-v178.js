/* v178: safe, explicit cash-expense -> existing card-master purchase conversion.
   No cash or bank account balances are directly adjusted. The original record
   is retained for audit but removed from spending and cash-only views. */
(() => {
'use strict';
if(window.householdCashCardReclassV178)return;
const normalized=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[\s　（）()\[\]［］・\-_/．.,，。]/g,'');
const isoDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&
 !Number.isNaN(Date.parse(String(s)+'T00:00:00Z'));
const clone=x=>typeof structuredClone==='function'?structuredClone(x):JSON.parse(JSON.stringify(x));
const counted=x=>x?.count_in_spending!==false&&
 !['ABSORBED_DUPLICATE','RECLASSIFIED_CARD_PAYMENT'].includes(String(x?.reconciliation_status||''));
function plan(state,req){
 if(!state||typeof state!=='object'||!req||typeof req!=='object')throw Error('修正対象が不正です');
 const cash=state.cashExpenses||[],purchase=state.purchaseEvents||[];
 const id=String(req.id||''),originalIndex=cash.findIndex((x,i)=>String(x.id||'cash-expense:'+i)===id);
 if(originalIndex<0)throw Error('元の現金支出が見つかりません。明細を再読み込みしてください。');
 const original=cash[originalIndex];
 if(!counted(original)||original.card_purchase_id)throw Error('この現金支出はすでに修正済みです。二重計上を防ぐため再変換しません。');
 const master=(state.masters?.cards||[]).find(c=>String(c.id)===String(req.cardMasterId)&&c.active!==false);
 if(!master||!String(master.name||'').trim())throw Error('カードマスターを選択してください。');
 const date=String(req.date||''),name=String(req.description||'').trim(),amount=Number(req.amount);
 if(!isoDate(date)||!name||!Number.isSafeInteger(amount)||amount<=0)throw Error('利用日・内容・金額を確認してください。');
 if(req.economicType!=='EXPENSE'||!req.category)throw Error('カード購入へ変更できるのはカテゴリを設定した支出だけです。');
 const cycle=window.householdCardCycleV81;
 const closing=cycle?.closingDayValue?.(master);
 if(!Number.isInteger(closing)||closing<1||closing>31)throw Error('選択したカードに締め日がありません。Settings → カードマスターで設定してください。');
 const billingMonth=cycle?.billingMonthForDate?.(date,closing,1)||'';
 if(!/^\d{4}-\d{2}$/.test(billingMonth))throw Error('請求月が計算できません。利用日とカード設定を確認してください。');
 // Refuse ambiguous matches instead of silently counting two receipts for one purchase.
 const matches=(purchase||[]).filter(p=>{
   if(!counted(p))return false;
   if(String(p.source_cash_expense_id||'')===id)return true;
   const amountMatches=Math.abs(Number(p.original_amount)||0)===amount;
   if(!amountMatches||String(p.purchase_date||'')!==date)return false;
   const a=normalized(p.merchant_raw||p.merchant_normalized),b=normalized(name);
   return a.length>=3&&b.length>=3&&(a===b||a.includes(b)||b.includes(a));
 });
 const billingMatches=(state.cardBillingLines||[]).filter(l=>{
   if(String(l.purchase_date||'')!==date)return false;
   if(Math.abs(Number(l.original_amount)||0)!==amount)return false;
   const a=normalized(l.merchant_raw||l.merchant_normalized),b=normalized(name);
   return a.length>=3&&b.length>=3&&(a===b||a.includes(b)||b.includes(a));
 });
 if(matches.length||billingMatches.length)throw Error(
   '同日・同額・同店舗のカード購入が既にあります。二重計上を防ぐため変換を中止しました。明細照合で既存記録を確認してください。');
 const originalId=id;
 const purchaseId='cash-to-card:v178:'+originalId;
 if(purchase.some(p=>String(p.purchase_id||'')===purchaseId))throw Error('変換済みのカード購入IDが存在します。処理を中止しました。');
 const next=clone(state),old=next.cashExpenses[originalIndex],now=new Date().toISOString();
 const due=cycle?.paymentDateForSpend?.(master,date)||'';
 const scope=req.spendingClass==='SPECIAL'?'SPECIAL':'NORMAL';
 const item={
   purchase_id:purchaseId,source_cash_expense_id:originalId,source_original_id:originalId,
   source_file:old.source_file||'manual-cash-to-card-v178',
   source_receipt_description:old.description||name,
   source_receipt_date:old.date||date,
   purchase_date:date,merchant_raw:name,merchant_normalized:normalized(name),
   original_amount:amount,payment_amount:amount,purchase_total:amount,
   card:String(master.name),card_master_id:String(master.id),card_master_linked_at:now,
   payment_method:'CREDIT',payment_route:'CARD',record_kind:'CARD_PURCHASE',
   economic_type:'EXPENSE',spending_class:scope,expense_scope:scope,
   ordinary_or_special:scope,category:String(req.category),
   subcategory:String(req.subcategory||'OTHER'),
   billing_month:billingMonth,billing_month_source:'CARD_MASTER_AUTO',
   expected_settlement_status:'UNCONFIRMED',settlement_pending:true,
   no_card_settlement:false,count_in_spending:true,
   cost_nature:['FIXED','VARIABLE','REVIEW'].includes(req.costNature)?req.costNature:undefined,
   confidence:1,review_status:'RESOLVED',semantic_manual_override:true,
   semantic_transaction_edit_version:108,manual_corrected:true,
   manual_corrected_at:now,receipt_reconciliation_pending:true,
   payment_reclassification_reason:'MANUAL_CASH_TO_CARD_V178',
   note:old.note||'',
 };
 if(isoDate(due)){item.expected_settlement_date=due;item.settlement_due_date=due}
 else delete item.expected_settlement_status;
 if(!item.cost_nature)delete item.cost_nature;
 next.purchaseEvents=Array.isArray(next.purchaseEvents)?next.purchaseEvents:[];
 next.purchaseEvents.push(item);
 if(!old.id)old.id=originalId;
 old.count_in_spending=false;
 old.reconciliation_status='RECLASSIFIED_CARD_PAYMENT';
 old.payment_reclassification_reason='MANUAL_CASH_TO_CARD_V178';
 old.card_purchase_id=purchaseId;
 old.card_master_id=String(master.id);
 old.reclassified_at=now;
 return {next,purchase:item,amount,cardName:master.name,billingMonth,sourceId:originalId};
}
window.householdCashCardReclassV178={plan};
})();