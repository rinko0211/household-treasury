/* One extensible entrypoint for exact-match correction JSONs.
   Future repair formats register themselves without creating more file pickers. */
(() => {
'use strict';
if(window.householdUnifiedRepairDeskV161)return;
const $=id=>document.getElementById(id);
const map=new Map();
const MAX_SIZE=500000;
const yen=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(v)||0);
const state=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};

function register(def){
 if(!def||typeof def.format!=='string'||!def.format||
    typeof def.preview!=='function'||typeof def.apply!=='function'||typeof def.label!=='string')
   throw Error('修正処理の登録情報が不正です');
 if(map.has(def.format))throw Error('同じ修正形式が重複登録されています');
 map.set(def.format,Object.freeze(def));
}
function inspect(patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))
   throw Error('修正JSONの構造が不正です');
 const spec=map.get(String(patch.format||''));
 if(!spec)throw Error('未対応の修正形式です。通常のCSV・バックアップJSONはこの窓口では扱えません');
 const detail=spec.preview(patch);
 if(!detail||!Number.isSafeInteger(detail.count)||detail.count<0)
   throw Error('修正件数の検証に失敗しました');
 if(detail.amount!==undefined&&(!Number.isSafeInteger(detail.amount)||detail.amount<0))
   throw Error('修正金額の検証に失敗しました');
 return {spec,detail};
}
function applyValidated(patch,confirmFn=window.confirm.bind(window)){
 const {spec,detail}=inspect(patch);
 if(!detail.count)return {format:spec.format,count:0,alreadyApplied:true,label:spec.label};
 const amount=detail.amount===undefined?'':(' / '+yen(detail.amount));
 const warning='「'+spec.label+'」の厳密照合が通りました。'+detail.count+'件'+amount+
   'を修正します。\n適用直前に復旧履歴を記録します。銀行・資産の元データを確認して続けますか？';
 if(!confirmFn(warning))return {format:spec.format,count:0,cancelled:true,label:spec.label};
 const result=spec.apply(patch);
 return {format:spec.format,count:detail.count,result,label:spec.label};
}
function mount(){
 const root=document.querySelector('#imports .grid');if(!root)return false;
 // Old panels may exist in a stale PWA session, but all new loads use one desk.
 for(const id of ['paymentRepairV159','verifiedCorrectionV149','cycleAuditImportV153']){
   $(id)?.remove();
 }
 if($('unifiedRepairImportV161'))return true;
 const card=document.createElement('div');card.id='unifiedRepairImportV161';card.className='card full';
 card.innerHTML='<div class="title">明細の修正（共通窓口）</div>'+
   '<p class="tiny">過去・今後の修正ファイルを同じ場所から読み込みます。修正形式は自動判定。元の取引と厳密照合し、適用前に復旧履歴を保存します。銀行・カードの通常CSV、バックアップの読込とは別です。</p>'+
   '<div class="controls"><button type="button" class="btn secondary" id="unifiedRepairChooseV161">修正ファイルを読み込む（JSON）</button></div>'+
   '<input id="unifiedRepairFileV161" type="file" accept=".json,application/json" style="display:none">'+
   '<div class="tiny" id="unifiedRepairStatusV161" role="status" aria-live="polite" style="margin-top:10px"></div>';
 root.prepend(card);
 const input=$('unifiedRepairFileV161'),btn=$('unifiedRepairChooseV161'),status=$('unifiedRepairStatusV161');
 btn.onclick=()=>input.click();
 input.onchange=async()=>{
   if(!input.files?.length)return;
   btn.disabled=true;status.textContent='修正ファイルを確認しています…';
   try{
     const file=input.files[0];
     if(file.size>MAX_SIZE)throw Error('修正JSONのサイズが上限（500KB）を超えています');
     const patch=JSON.parse(await file.text());
     const result=applyValidated(patch);
     status.textContent=result.alreadyApplied?'適用済みの修正です。追加変更はありません。':
       result.cancelled?'キャンセルしました。明細は変更していません。':
       result.label+'：'+result.count+'件を修正しました。Settingsでクラウド同期状況を確認してください。';
     if(!result.alreadyApplied&&!result.cancelled)window.householdExpenseUnifiedV148?.render?.();
   }catch(err){status.textContent='未適用：'+String(err?.message||err)}
   finally{btn.disabled=false;input.value=''}
 };
 return true;
}
register({
 format:'HOUSEHOLD_TREASURY_PAYMENT_RECLASS_V159',
 label:'購入時の支払方法の修正',
 preview:patch=>{
   const e=window.householdPaymentReclassV159;
   if(!e)throw Error('支払方法修正エンジンを読み込めません');
   const p=e.plan(state(),patch);
   return {count:p.changed,amount:p.total};
 },
 apply:patch=>window.householdPaymentReclassV159.apply(patch)
});
register({
 format:'household-treasury-jaldc-duplicate-correction-v1',
 label:'カード重複の修正',
 preview:patch=>{
   const e=window.householdVerifiedCorrectionPatchV149;
   if(!e)throw Error('カード重複の照合エンジンを読み込めません');
   const p=e.plan(state(),patch);
   return {count:p.removed,amount:p.removedAmount};
 },
 apply:patch=>window.householdVerifiedCorrectionPatchV149.apply(patch)
});
register({
 format:'household-treasury-cycle-reconciliation-v153',
 label:'原本照合・期間集計の差分修正',
 preview:patch=>{
   const e=window.householdCycleAuditV153;
   if(!e)throw Error('監査差分の照合エンジンを読み込めません');
   const p=e.planPatch(state(),patch);
   return {count:p.changed.length};
 },
 apply:patch=>window.householdCycleAuditV153.applyPatch(patch)
});
window.householdUnifiedRepairDeskV161={register,inspect,applyValidated,mount,formats:()=>[...map.keys()]};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
window.addEventListener('pageshow',mount);
})();
