/* v205: reversible, wife-only reference classification. The paid wife allowance
   remains counted; itemized wife spending is optional supporting detail. */
(() => {
'use strict';
if(window.householdWifeReferenceV205)return;
const iso=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
const assert=(yes,message)=>{if(!yes)throw Error(message)};
function entry(st,kind,index){
 if(!['cash','purchase'].includes(kind)||!Number.isSafeInteger(index)||index<0)return null;
 const items=kind==='cash'?st.cashExpenses:st.purchaseEvents;
 const r=Array.isArray(items)?items[index]:null;
 return r?{kind,index,r,identity:kind+':'+index}:null;
}
function wifePurchase(r){
 return String(r?.expense_bucket_v193||'').toUpperCase()==='PERSONAL'&&
   String(r?.personal_owner_v193||'').toLowerCase()==='wife'&&
   String(r?.economic_type||'EXPENSE').toUpperCase()==='EXPENSE';
}
function reference(r){
 return r?.reference_only_v200===true&&r.count_in_spending===false&&wifePurchase(r);
}
function covered(st,r,kind){
 const day=kind==='purchase'?r.purchase_date:r.date;
 if(!iso(day))return false;
 return (st.personalExpenses||[]).some(x=>
  x.owner==='wife'&&x.count_in_spending!==false&&x.manually_deleted_v192!==true&&
  Number(x.amount)>0&&iso(x.cycle_start)&&iso(x.cycle_end)&&
  x.cycle_start<=day&&x.cycle_end>=day);
}
function signature(e){
 const r=e.r;
 return JSON.stringify([e.kind,r.id||r.purchase_id||e.index,
   r.date||r.purchase_date,r.description||r.merchant_raw||r.merchant_normalized,
   Number(r.amount??r.original_amount),r.source_file||'',
   r.expense_bucket_v193,r.personal_owner_v193,r.count_in_spending,r.reference_only_v200]);
}
function eligibility(st,kind,index){
 const e=entry(st,kind,index);
 if(!e||!wifePurchase(e.r))return null;
 if(e.r.manually_deleted_v192||e.r.reconciliation_status==='ABSORBED_DUPLICATE'||
   e.r.reconciliation_status==='RECLASSIFIED_CASH_PAYMENT'||e.r.is_refinanced)return null;
 if(reference(e.r))return {...e,mode:'REFERENCE'};
 if(e.r.count_in_spending===false)return null;
 if(!covered(st,e.r,kind))return null;
 return {...e,mode:'COUNTED'};
}
function setRecord(st,kind,r,mode){
 assert(['purchase','cash'].includes(kind),'銀行原本・個人費引渡しは参考へ変更できません');
 assert(['REFERENCE','COUNTED'].includes(mode),'計上区分が不正です');
 assert(wifePurchase(r),'妻の個人費と指定された支出明細だけ変更できます');
 const already=reference(r);
 if(mode==='REFERENCE'){
  if(already)return false;
  assert(r.count_in_spending!==false&&!r.manually_deleted_v192&&
    !['ABSORBED_DUPLICATE','RECLASSIFIED_CASH_PAYMENT'].includes(r.reconciliation_status),
    '別の理由で計上除外された明細は変更できません');
  assert(covered(st,r,kind),'同じ給与サイクルに計上済みの妻の個人費がありません');
  r.wife_original_count_v205=r.count_in_spending===undefined?null:r.count_in_spending;
  r.count_in_spending=false;
  r.reference_only_v200=true;
  r.wife_personal_reference_v205=true;
  if(kind==='purchase')r.wife_card_claim_preserved_v205=true;
  r.wife_reference_changed_at_v205=new Date().toISOString();
  return true;
 }
 if(!already){
  assert(r.count_in_spending!==false,'別の理由で計上除外された明細です');
  return false;
 }
 if(r.wife_personal_reference_v205===true&&r.wife_original_count_v205===null)
   delete r.count_in_spending;
 else if(r.wife_personal_reference_v205===true&&r.wife_original_count_v205!==undefined)
   r.count_in_spending=r.wife_original_count_v205;
 else r.count_in_spending=true; // Supports pre-existing v200 reference rows.
 delete r.reference_only_v200;
 delete r.wife_personal_reference_v205;
 delete r.wife_card_claim_preserved_v205;
 delete r.wife_original_count_v205;
 delete r.wife_reference_changed_at_v205;
 return true;
}
function plan(input,identity,mode){
 const match=String(identity||'').match(/^(purchase|cash):(\d+)$/);
 assert(match,'取引識別子が不正です');
 const kind=match[1],index=Number(match[2]),st=structuredClone(input||{});
 const e=eligibility(st,kind,index);
 assert(e,'妻の個人費・取込正本の条件に合わない明細です');
 assert(mode!==(e.mode),'すでに選択した計上区分です');
 const previous=signature(e);
 const changed=setRecord(st,kind,e.r,mode);
 return {next:st,changed,previous,kind,index,label:String(e.r.description||
   e.r.merchant_raw||e.r.merchant_normalized||'明細'),
  amount:Math.abs(Number(e.r.original_amount??e.r.amount)||0)};
}
function apply(identity,mode){
 const preview=plan(stateNow(),identity,mode);
 const text=mode==='REFERENCE'?
   'この明細を妻の個人費40,000円の「参考のみ」に変更します。\n'+
   '家計の支出合計には加えません。購入記録と実際のカード請求は保持します。':
   'この明細を「支出計上」に戻します。\n'+
   '妻の個人費引渡し額とは別に、家計の支出合計へ加算されます。';
 if(!window.confirm?.(preview.label+' '+yen(preview.amount)+'\n'+text+'\n変更しますか？'))
  return {cancelled:true};
 const latest=plan(stateNow(),identity,mode);
 assert(latest.previous===preview.previous,'確認中に明細が変更されました。再表示してください');
 assert(typeof window.replaceTreasuryState==='function'&&
   typeof window.treasuryRecoverySnapshot==='function','保存・復旧機能が利用できません');
 window.treasuryRecoverySnapshot('妻個人費・参考記録の計上切替直前');
 assert(window.replaceTreasuryState(latest.next)!==false,'保存できませんでした');
 window.cloudSyncOnLocalSave?.();
 window.dispatchEvent?.(new CustomEvent('treasury:expenses-imported',
  {detail:{source:'WIFE_PERSONAL_REFERENCE_V205'}}));
 window.householdExpenseUnifiedV148?.render?.();
 return {changed:true,mode,amount:latest.amount};
}
window.householdWifeReferenceV205={entry,wifePurchase,reference,covered,eligibility,setRecord,plan,apply};
})();
