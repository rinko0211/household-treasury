(() => {
'use strict';
if(window.__householdVerifiedCorrectionPatchV149)return;
window.__householdVerifiedCorrectionPatchV149=true;
const $=id=>document.getElementById(id);
const fmt='household-treasury-jaldc-duplicate-correction-v1';
const st=()=>{try{return(window.getTreasuryStateRaw||window.getTreasuryState)?.()||{}}catch{return{}}};
const clone=v=>JSON.parse(JSON.stringify(v));
const norm=v=>String(v??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
const n=v=>Number(v);
const money=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(v);
function plan(state,patch){
 if(!patch||patch.format!==fmt||!Array.isArray(patch.removals))
   throw Error('修正ファイルの形式が違います。通常のバックアップJSONではありません。');
 const spec=patch.removals;
 if(!spec.length||spec.length>200||n(patch.expectedRemovedCount)!==spec.length)
   throw Error('修正対象の件数に矛盾があります。');
 const expected=spec.reduce((a,p)=>a+n(p.original_amount),0);
 if(!Number.isSafeInteger(expected)||expected!==n(patch.expectedRemovedAmount))
   throw Error('修正金額の検算に失敗しました。');
 const originals=Array.isArray(state.purchaseEvents)?state.purchaseEvents:[];
 const map=new Map();
 for(const [idx,r] of originals.entries()){
   const id=String(r?.purchase_id||'');if(!id)continue;
   const list=map.get(id)||[];list.push({r,idx});map.set(id,list);
 }
 const toDelete=[],pairs=[],processed=new Set(),replaced=new Set();
 for(const p of spec){
   const oldId=String(p.purchase_id||''),newId=String(p.replacement_purchase_id||'');
   if(!oldId||!newId||oldId===newId||processed.has(oldId)||replaced.has(newId))
     throw Error('修正ファイルのIDが重複・欠落しています。');
   processed.add(oldId);replaced.add(newId);
   const newer=map.get(newId)||[];
   if(newer.length!==1)throw Error('修正後に残すべき元明細が確認できません（'+newId+'）。削除しません。');
   const record=newer[0].r;
   const check=(r,original)=>{
     return r.card===p.card&&
       String(r.purchase_date||'')===String(p.purchase_date)&&
       String(r.billing_month||'')===String(p.billing_month)&&
       n(r.original_amount)===n(p.original_amount)&&
       n(r.occurrence_index||1)===n(p.occurrence_index||1)&&
       norm(r.merchant_raw||r.merchant_normalized)===norm(p.merchant_raw);
   };
   if(!check(record,p)||String(record.source_file||'')===String(p.source_file||'')||
       String(record.purchase_date||'')!==String(p.purchase_date||''))
     throw Error('残す側の明細が照合ファイルと一致しません（'+newId+'）。削除しません。');
   const older=map.get(oldId)||[];
   if(older.length>1)throw Error('削除対象IDが複数存在します。手動確認が必要です。');
   if(older.length){
     const r=older[0].r;
     if(!check(r,p)||String(r.source_file||'')!==String(p.source_file||'')||
       String(r.pdf_card_identity||'')!==String(p.pdf_card_identity||''))
       throw Error('削除候補が照合ファイルと一致しません（'+oldId+'）。削除しません。');
     toDelete.push({...older[0],expectedAmount:n(p.original_amount)});
   }
   pairs.push({oldId,newId,needsDeletion:!!older.length});
 }
 return {
   rows:toDelete,indices:new Set(toDelete.map(x=>x.idx)),pairs,
   removed:toDelete.length,removedAmount:toDelete.reduce((a,x)=>a+x.expectedAmount,0),
   alreadyResolved:spec.length-toDelete.length,expectedTotal:spec.length
 };
}
function apply(patch){
 if(typeof window.replaceTreasuryState!=='function'||typeof window.treasuryRecoverySnapshot!=='function')
   throw Error('保存・復旧処理が利用できません。再読み込みしてください。');
 const before=st(),p=plan(before,patch);
 if(!p.removed)return {...p,saved:false};
 window.treasuryRecoverySnapshot('原本照合済みカード明細の重複 '+p.removed+'件の修正直前');
 const next=clone(before);
 next.purchaseEvents=next.purchaseEvents.filter((_,i)=>!p.indices.has(i));
 if(window.replaceTreasuryState(next)===false)
   throw Error('端末への保存が受け付けられませんでした。');
 const after=st();
 if((after.purchaseEvents||[]).length!==(before.purchaseEvents||[]).length-p.removed)
   throw Error('保存後の明細件数が不一致です。端末復旧履歴を確認してください。');
 // Do not delete source import digests, settlement data, or any bank transaction.
 try{
   const promise=window.cloudSyncOnLocalSave?.();
   if(promise&&typeof promise.catch==='function')promise.catch(()=>{});
 }catch{}
 window.dispatchEvent?.(new CustomEvent('treasury:expenses-imported',{
   detail:{source:'VERIFIED_CORRECTION_V149'}
 }));
 window.setTreasurySaveStatus?.('原本照合済み重複 '+p.removed+'件を端末修正済み');
 return {...p,saved:true};
}
function mount(){
 const page=document.querySelector('#imports .grid');if(!page||$('verifiedCorrectionV149'))return false;
 const card=document.createElement('div');card.className='card full';card.id='verifiedCorrectionV149';
 card.innerHTML='<div class="title">原本照合済み明細の修正</div>'+
   '<div class="tiny" style="margin-bottom:10px">ChatGPTで原本と照合した修正ファイルのみ適用します。対象行・残す行の双方が一致したときだけ重複を削除します。通常の家計バックアップの「読込」とは異なります。</div>'+
   '<button class="btn secondary" type="button" id="verifiedCorrectionChooseV149">照合済み修正JSONを選ぶ</button>'+
   '<input type="file" id="verifiedCorrectionInputV149" accept=".json,application/json" style="display:none">'+
   '<div id="verifiedCorrectionStatusV149" class="tiny" role="status" style="margin-top:8px"></div>';
 page.prepend(card);
 const input=$('verifiedCorrectionInputV149'),status=$('verifiedCorrectionStatusV149');
 $('verifiedCorrectionChooseV149').onclick=()=>input.click();
 input.onchange=async()=>{
  try{
   const f=input.files?.[0];if(!f)return;
   if(f.size>250000)throw Error('修正ファイルが大きすぎます。');
   const p=JSON.parse(await f.text());
   const preview=plan(st(),p);
   if(!preview.removed){status.textContent='対象の重複はすでに整理されています。追加削除はありません。';return}
   if(!window.confirm('原本照合済みの '+preview.removed+'件（'+money(preview.removedAmount)+
     '）を削除します。\n各明細と正しい残存明細の両方を厳密に確認し、削除前に復旧履歴を記録します。\n続けますか？'))return;
   const result=apply(p);
   status.textContent=result.removed+'件、'+money(result.removedAmount)+
      'の重複を端末から削除しました。クラウド同期の結果はSettingsで確認してください。';
  }catch(e){status.textContent='未適用：'+String(e.message||e)}
  finally{input.value=''}
 };
 return true;
}
window.householdVerifiedCorrectionPatchV149={plan,apply,mount};
// v161: no version-specific Import panel; registered through the unified repair desk.
})();