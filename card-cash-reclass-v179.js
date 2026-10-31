/* v179: explicit card-purchase -> cash-expense reclassification.
   A linked card statement or installment must be reconciled at its source,
   rather than silently rewritten as cash. No bank balances are rewritten. */
(() => {
'use strict';
if(window.householdCardCashReclassV179)return;
const norm=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[\s　（）()\[\]［］・\-_/．.,，。]/g,'');
const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&
 Number.isFinite(Date.parse(String(s)+'T00:00:00Z'))&&
 new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const clone=o=>typeof structuredClone==='function'?structuredClone(o):JSON.parse(JSON.stringify(o));
const active=o=>o?.count_in_spending!==false&&
 !['ABSORBED_DUPLICATE','RECLASSIFIED_CARD_PAYMENT','RECLASSIFIED_CASH_PAYMENT'].includes(String(o?.reconciliation_status||''));
const status=o=>String(o?.reconciliation_status||'').toUpperCase();
function statementSource(p){
 if(p.mdc_import_v144||p.pdf_card_identity||p.pdf_statement_id||
    /^MDC_PDF_/i.test(String(p.source_file||''))||/\.pdf(?:$|\?)/i.test(String(p.source_file||'')))
   return true;
 if(['STATEMENT','CONFIRMED','PDF'].includes(String(p.billing_month_source||'').toUpperCase()))return true;
 if(p.detail_reconciled===true||p.statement_reconciled===true||p.card_settlement_id||p.settlement_id||
    p.bank_transaction_id||p.is_refinanced||p.is_refinance_adjustment)return true;
 if(Number(p.installment_number||0)>1||Number(p.installment_count||p.installment_total||0)>1||
    Number(p.occurrence_index||1)>1)return true;
 return false;
}
function hasBillingLine(st,p,purchaseId){
 return (st.cardBillingLines||[]).some(l=>{
   if(p.purchase_id&&String(l.purchase_id||'')===String(p.purchase_id))return true;
   if(String(l.purchase_id||'')===purchaseId)return true;
   if(String(l.purchase_date||'')!==String(p.purchase_date||''))return false;
   if(Math.abs(Number(l.original_amount||0))!==Math.abs(Number(p.original_amount||0)))return false;
   if(norm(l.card)!==norm(p.card))return false;
   const a=norm(l.merchant_raw||l.merchant_normalized),b=norm(p.merchant_raw||p.merchant_normalized);
   return a.length>=3&&b.length>=3&&(a===b||a.includes(b)||b.includes(a));
 });
}
function plan(st,req){
 if(!st||typeof st!=='object'||!req||typeof req!=='object')throw Error('修正対象が不正です');
 const purchases=st.purchaseEvents||[],cash=st.cashExpenses||[];
 const id=String(req.id||'');
 const index=purchases.findIndex((o,i)=>String(o.purchase_id||'purchase:'+i)===id);
 if(index<0)throw Error('カード購入明細が見つかりません。画面を再読み込みしてください。');
 const purchase=purchases[index],purchaseId=String(purchase.purchase_id||id);
 if(!active(purchase)||purchase.cash_expense_id)throw Error('このカード購入はすでに修正済みです。');
 if(String(purchase.economic_type||'EXPENSE')!=='EXPENSE')throw Error('支出以外のカード記録は現金支出へ変更できません。');
 if(statementSource(purchase)||hasBillingLine(st,purchase,purchaseId))
   throw Error('PDF・カード請求明細との紐付け、または分割払いがあります。確定したカード明細を現金には変更できません。原本を照合してください。');
 const date=String(req.date||''),name=String(req.description||'').trim(),amount=Number(req.amount);
 if(!isDate(date)||!name||!Number.isSafeInteger(amount)||amount<=0)
   throw Error('利用日・内容・金額を確認してください。');
 if(!req.category||req.economicType!=='EXPENSE')throw Error('カテゴリを設定した支出だけ現金へ変更できます。');
 const sourceId=String(purchase.source_cash_expense_id||'');
 const sourceCash=sourceId?cash.find(c=>String(c.id||'')===sourceId):null;
 let restore=false;
 if(sourceCash){
   restore=String(sourceCash.card_purchase_id||'')===purchaseId&&
     sourceCash.count_in_spending===false&&status(sourceCash)==='RECLASSIFIED_CARD_PAYMENT';
   if(!restore)throw Error('元の現金記録が別の状態になっています。重複を避けるため変更できません。');
 }
 const duplicates=cash.filter(c=>{
   if(c===sourceCash||!active(c))return false;
   if(String(c.date||'')!==date||Math.abs(Number(c.amount)||0)!==amount)return false;
   const a=norm(c.description||c.description_raw),b=norm(name);
   return a.length>=3&&b.length>=3&&(a===b||a.includes(b)||b.includes(a));
 });
 if(duplicates.length)throw Error('同日・同額・同じ内容の現金支出がすでにあります。二重計上を防ぐため変換を中止しました。');
 const cashId=restore?sourceId:'card-to-cash:v179:'+purchaseId;
 if(!restore&&cash.some(c=>String(c.id||'')===cashId))throw Error('変換済みの現金記録があります。');
 const next=clone(st),oldPurchase=next.purchaseEvents[index],now=new Date().toISOString();
 const scope=req.spendingClass==='SPECIAL'?'SPECIAL':'NORMAL';
 const nature=['FIXED','VARIABLE','REVIEW'].includes(req.costNature)?req.costNature:null;
 const cashRow=restore?next.cashExpenses.find(c=>String(c.id)===cashId):{
   id:cashId,source_file:purchase.source_file||'manual-card-to-cash-v179',
   source_purchase_id:purchaseId,source_original_id:purchase.source_original_id||purchaseId,
   source:'Manual card-to-cash correction'
 };
 Object.assign(cashRow,{
   id:cashId,date,description:name,amount,
   record_kind:'CASH_EXPENSE',payment_method:'CASH',
   economic_type:'EXPENSE',spending_class:scope,expense_scope:scope,
   ordinary_or_special:scope,category:String(req.category),
   subcategory:String(req.subcategory||'OTHER'),
   count_in_spending:true,review_status:'RESOLVED',
   semantic_manual_override:true,semantic_transaction_edit_version:108,
   confidence:1,manual_corrected:true,manual_corrected_at:now,
   source_purchase_id:purchaseId,
   payment_reclassification_reason:'MANUAL_CARD_TO_CASH_V179',
   note:purchase.note||cashRow.note||''
 });
 if(nature)cashRow.cost_nature=nature;else delete cashRow.cost_nature;
 if(['FIXED','VARIABLE','PERSONAL','REVIEW'].includes(req.expenseBucket))
   cashRow.expense_bucket_v193=req.expenseBucket;
 else delete cashRow.expense_bucket_v193;
 if(req.expenseBucket==='PERSONAL'&&['wife','self'].includes(req.personalOwner))
   cashRow.personal_owner_v193=req.personalOwner;
 else delete cashRow.personal_owner_v193;
 delete cashRow.reconciliation_status;
 delete cashRow.card_purchase_id;
 delete cashRow.card_master_id;
 delete cashRow.reclassified_at;
 if(!restore){next.cashExpenses=Array.isArray(next.cashExpenses)?next.cashExpenses:[];next.cashExpenses.push(cashRow)}
 if(!oldPurchase.purchase_id)oldPurchase.purchase_id=purchaseId;
 oldPurchase.count_in_spending=false;
 oldPurchase.reconciliation_status='RECLASSIFIED_CASH_PAYMENT';
 oldPurchase.cash_expense_id=cashId;
 oldPurchase.payment_reclassification_reason='MANUAL_CARD_TO_CASH_V179';
 oldPurchase.reclassified_at=now;
 return {next,cash:cashRow,original:oldPurchase,amount,sourceId:purchaseId,restored:restore};
}
window.householdCardCashReclassV179={plan};
})();