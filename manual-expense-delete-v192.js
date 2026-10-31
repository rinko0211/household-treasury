(() => {
'use strict';
if(window.householdManualExpenseDeleteV192)return;
const stateNow=()=>{try{return(window.getTreasuryStateRaw||window.getTreasuryState)?.()||{}}catch{return {}}};
const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
function isOfficialCard(x){
 const source=String(x?.source_file||'');
 return Boolean(x?.mdc_import_v144||x?.pdf_card_identity||x?.mdc_pdf_signature_v168||
   x?.mdc_pdf_purchase_date||x?.mdc_incremental_import_v144||
   /^MDC_PDF_/i.test(source)||/^enavi\d/i.test(source)||
   /^(?:MUFG|JAL|DCARD|DC_CARD|D_CARD|楽天カード)/i.test(source)||
   x?.record_kind==='CARD_STATEMENT');
}
function manual(kind,x){
 if(!x||typeof x!=='object')return false;
 if(kind==='cash'||kind==='personal')return true;
 if(kind!=='purchase'||isOfficialCard(x))return false;
 const id=String(x.purchase_id||''),source=String(x.source_file||'');
 return /^receipt[:_-]/i.test(id)||!!x.source_cash_expense_id||
   !!x.source_original_id||String(x.dedup_key||'').startsWith('receipt:')||
   /^CHAT_REPORTED/i.test(source)||x.manual_entry===true||
   x.manually_created===true||String(x.entry_origin||'').toUpperCase()==='MANUAL'||
   (!source&&!x.imported_at);
}
function locate(st,identity){
 const match=String(identity||'').match(/^(cash|purchase|personal):(.+)$/);
 if(!match)return null;
 const kind=match[1],value=match[2],
   array=kind==='cash'?st.cashExpenses:kind==='purchase'?st.purchaseEvents:st.personalExpenses;
 if(!Array.isArray(array))return null;
 let index=-1;
 if(kind==='personal')index=array.findIndex((x,i)=>String(x?.id||i)===value);
 else if(/^\d+$/.test(value))index=Number(value);
 if(!Number.isSafeInteger(index)||index<0||index>=array.length)return null;
 const record=array[index];
 if(!manual(kind,record))return null;
 const id=kind==='cash'?(record.id||''):kind==='purchase'?(record.purchase_id||''):(record.id||index);
 const date=String(record.date||record.purchase_date||'');
 const label=String(record.description||record.merchant_raw||record.merchant_normalized||'手動入力');
 const amount=Math.abs(Number(record.amount??record.original_amount)||0);
 const signature=JSON.stringify([kind,id,date,label,amount,record.source_file||'']);
 return {kind,index,record,id:String(id),identity:kind+':'+(kind==='personal'?id:index),
   date,label,amount,signature};
}
function validate(st,identity,action){
 if(action!=='delete'&&action!=='restore')throw Error('不正な操作です。');
 const target=locate(st,identity);
 if(!target)throw Error('対象を特定できません。公式カード・PDF・銀行明細は削除できません。');
 const x=target.record;
 if(action==='delete'&&(x.count_in_spending===false||x.manually_deleted_v192===true))
   throw Error('すでに計上対象外です。');
 if(action==='restore'&&!(x.manually_deleted_v192===true&&x.count_in_spending===false))
   throw Error('この画面で削除した手動入力のみ復元できます。');
 return target;
}
function apply(identity,action='delete'){
 const original=validate(stateNow(),identity,action);
 if(typeof window.replaceTreasuryState!=='function'||
    typeof window.treasuryRecoverySnapshot!=='function')
   throw Error('安全な保存またはバックアップが利用できません。');
 const verb=action==='delete'?'削除':'復元';
 if(!window.confirm?.(original.date+'　'+original.label+'　'+yen(original.amount)+
   '\nこの手動明細を'+verb+'しますか？\n公式PDF・カード・銀行明細は変更しません。'))
   return {cancelled:true};
 const current=stateNow(),target=validate(current,identity,action);
 if(original.signature!==target.signature)throw Error('明細が変更されています。再表示してください。');
 const next=structuredClone(current);
 const arr=target.kind==='cash'?next.cashExpenses:target.kind==='purchase'?next.purchaseEvents:next.personalExpenses;
 const row=arr[target.index],now=new Date().toISOString();
 if(action==='delete'){
   row.manual_count_before_delete_v192=row.count_in_spending===undefined?null:row.count_in_spending;
   row.count_in_spending=false;
   row.manually_deleted_v192=true;
   row.manually_deleted_at_v192=now;
 }else{
   const originalCount=row.manual_count_before_delete_v192;
   if(originalCount===null||originalCount===undefined)delete row.count_in_spending;
   else row.count_in_spending=originalCount;
   delete row.manual_count_before_delete_v192;
   row.manually_deleted_v192=false;
   delete row.manually_deleted_at_v192;
 }
 row.manual_delete_audit_v192=[...(row.manual_delete_audit_v192||[]),
   {at:now,action,source:'EXPENSE_DETAILS'}];
 window.treasuryRecoverySnapshot('支出ページ：手動入力の'+verb+'前');
 if(window.replaceTreasuryState(next)===false)throw Error('保存できませんでした。');
 window.cloudSyncOnLocalSave?.();
 window.dispatchEvent?.(new CustomEvent('treasury:expenses-imported',{
   detail:{months:[target.date.slice(0,7)].filter(Boolean),source:'MANUAL_EXPENSE_DELETE_V192'}}));
 window.householdExpenseUnifiedV148?.render?.();
 return {identity:target.identity,action,amount:target.amount};
}
function removed(st=stateNow()){
 const results=[];
 for(const kind of ['cash','purchase','personal']){
   const arr=kind==='cash'?st.cashExpenses:kind==='purchase'?st.purchaseEvents:st.personalExpenses;
   for(const [i,row] of (arr||[]).entries()){
     if(row.manually_deleted_v192!==true||row.count_in_spending!==false)continue;
     const found=locate(st,kind+':'+(kind==='personal'?(row.id||i):i));
     if(found)results.push(found);
   }
 }
 return results.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,100);
}

// One-time recovery for old v190 imports that the prior UI wrongly let users
// exclude. Canonical PDF evidence is never deleted. This operation ONLY
// restores previously suppressed official rows after explicit confirmation.
function legacyExcludedPdf(st=stateNow()){
 return (st.purchaseEvents||[]).map((record,index)=>({record,index}))
   .filter(({record})=>record?.mdc_pdf_user_excluded_v190===true&&
     record.count_in_spending===false&&isOfficialCard(record))
   .map(({record,index})=>({index,date:record.purchase_date||'',
     label:record.merchant_raw||record.merchant_normalized||'JAL PDF',
     amount:Math.abs(Number(record.original_amount)||0),
     signature:JSON.stringify([record.purchase_id,record.purchase_date,record.original_amount,
       record.mdc_pdf_signature_v168||'',record.pdf_card_identity||''])}))
   .sort((a,b)=>b.date.localeCompare(a.date));
}
function restoreOldCanonical(index){
 if(!Number.isSafeInteger(index)||index<0)throw Error('対象が不正です。');
 const original=legacyExcludedPdf().find(x=>x.index===index);
 if(!original)throw Error('過去に除外された公式PDF明細ではありません。');
 if(typeof window.replaceTreasuryState!=='function'||
    typeof window.treasuryRecoverySnapshot!=='function')throw Error('安全な保存が利用できません。');
 if(!window.confirm?.(original.date+' '+original.label+' '+yen(original.amount)+
   '\n以前の除外を解除し、公式PDF明細を正本として再計上しますか？'+
   '\n同じ買い物の手動入力が残っている場合は、支出ページで手動入力を削除してください。'))
   return {cancelled:true};
 const st=stateNow(),fresh=legacyExcludedPdf(st).find(x=>x.index===index);
 if(!fresh||fresh.signature!==original.signature)throw Error('元のPDF明細が変更されています。');
 const next=structuredClone(st),row=next.purchaseEvents[index],prior=row.mdc_pdf_original_count_in_spending_v190;
 if(prior===undefined||prior===null)delete row.count_in_spending;
 else row.count_in_spending=prior;
 row.mdc_pdf_user_excluded_v190=false;
 delete row.mdc_pdf_original_count_in_spending_v190;
 delete row.mdc_pdf_excluded_at_v190;
 row.mdc_pdf_review_history_v190=[...(row.mdc_pdf_review_history_v190||[]),
   {at:new Date().toISOString(),operation:'restore',source:'EXPENSES_V192_RECOVERY'}];
 window.treasuryRecoverySnapshot('旧版で除外した正本PDFの復旧前');
 if(window.replaceTreasuryState(next)===false)throw Error('保存できませんでした。');
 window.cloudSyncOnLocalSave?.();
 window.householdExpenseUnifiedV148?.render?.();
 return {restored:true,index};
}

window.householdManualExpenseDeleteV192={isOfficialCard,manual,locate,validate,apply,removed,legacyExcludedPdf,restoreOldCanonical};
})();