(() => {
'use strict';
if(window.__pdfCorrectionManagerV146)return;
window.__pdfCorrectionManagerV146=true;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=x=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(x)||0);
const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
const getState=()=>{try{return(window.getTreasuryStateRaw||window.getTreasuryState)?.()||{}}catch{return{}}};
const filename=x=>String(x?.source_file||'').trim();
const isMdc=x=>/^MDC[_ -]?PDF/i.test(filename(x))||!!x?.pdf_card_identity||
  !!x?.mdc_import_v144||!!x?.mdc_incremental_import_v144||
  ['MUFGDCJAL','JALカード','MDCカード'].includes(norm(x?.card));
const merchant=x=>String(x?.merchant_raw||x?.merchant_normalized||'店舗不明');
const token=x=>JSON.stringify([x?.purchase_id||'',filename(x),x?.purchase_date||'',merchant(x),
  Number(x?.original_amount)||0,x?.billing_month||'',x?.pdf_card_identity||'',
  Number(x?.occurrence_index)||1,x?.card||'',x?.installment_number||'']);
const itemFile=x=>filename(x)||'元ファイル不明（旧カードデータ）';
function rows(st=getState()){
 return (st.purchaseEvents||[]).map((record,index)=>({
   record,index,file:itemFile(record),token:token(record)
 })).filter(x=>isMdc(x.record));
}
function sources(st=getState()){
 const map=new Map();
 for(const x of rows(st)){
   const g=map.get(x.file)||{file:x.file,rows:[],amount:0,last:-1};
   g.rows.push(x);g.amount+=Math.abs(Number(x.record.original_amount)||0);g.last=x.index;
   map.set(x.file,g);
 }
 return [...map.values()].sort((a,b)=>b.last-a.last);
}
function planDeletion(st,selected){
 if(!selected?.length)throw Error('削除する明細を選択してください。');
 const available=new Map(rows(st).map(x=>[x.index,x]));
 const indices=new Set(),found=[];
 for(const s of selected){
   const i=Number(s.index),row=available.get(i);
   if(!Number.isInteger(i)||!row||row.token!==s.token)
     throw Error('選択した明細が変更されました。更新して選び直してください。');
   if(indices.has(i))continue;
   indices.add(i);found.push(row);
 }
 if(!found.length)throw Error('削除対象がありません。');
 return {indices,found,count:found.length,sum:found.reduce((v,x)=>v+Math.abs(Number(x.record.original_amount)||0),0),
   files:[...new Set(found.map(x=>x.file))]};
}
function makeNext(st,plan){
 const next=structuredClone(st);
 next.purchaseEvents=(next.purchaseEvents||[]).filter((_,index)=>!plan.indices.has(index));
 // Clear the whole-file shortcut when the file has no remaining purchased rows.
 // A corrected re-import then remains possible, while other import files persist.
 const deletedFiles=new Set(plan.found.map(x=>filename(x.record)).filter(Boolean));
 const retainedFiles=new Set(next.purchaseEvents.map(filename));
 next.imports=(next.imports||[]).filter(x=>{
   const f=String(x.file||''),type=String(x.type||x.detectedType||'').toUpperCase();
   return !deletedFiles.has(f)||retainedFiles.has(f)||!/MDC|JAL|MUFG|CARD/.test(type);
 });
 return next;
}
function applyDeletion(selected){
 const before=getState(),plan=planDeletion(before,selected);
 if(typeof window.treasuryRecoverySnapshot!=='function'||typeof window.replaceTreasuryState!=='function')
   throw Error('保存・復旧機能が使えないため、削除は実行しません。');
 window.treasuryRecoverySnapshot('PDF誤読取 '+plan.count+'件の削除直前');
 const saved=window.replaceTreasuryState(makeNext(before,plan));
 if(saved===false)throw Error('家計データが更新されませんでした。');
 const current=getState();
 if((before.purchaseEvents||[]).length-plan.count!==(current.purchaseEvents||[]).length)
   throw Error('削除後の明細件数が一致しません。端末履歴を確認してください。');
 try{window.cloudSyncOnLocalSave?.()}catch{}
 window.setTreasurySaveStatus?.('PDF誤取込 '+plan.count+'件削除・端末保存済み');
 window.dispatchEvent?.(new CustomEvent('treasury:expenses-imported',{
   detail:{source:'MDC_RECORD_REMOVE_V146',months:[...new Set(plan.found.map(x=>String(x.record.purchase_date||'').slice(0,7)))]}
 }));
 return {count:plan.count,sum:plan.sum};
}
let file='',visible=new Map();
function installShortcut(){
 const page=$('expenses');if(!page||$('pdfCorrectionShortcutV146'))return;
 const div=document.createElement('div');div.id='pdfCorrectionShortcutV146';
 div.className='card';div.style.marginBottom='12px';
 div.innerHTML='<div class="title">PDFの誤取込を修正</div>'+
   '<div class="tiny" style="margin-bottom:8px">同じ明細の重複や読取間違いは、元のPDFファイル別に選んで削除できます。</div>'+
   '<button type="button" id="pdfCorrectionShortcutButtonV146" class="btn secondary">誤取込の明細を選んで削除</button>';
 page.prepend(div);
 div.querySelector('button').onclick=()=>{
   const tab=document.querySelector('nav.tabs [data-page="imports"]');
   if(tab)tab.click();
   render();
   $('mdcPdfRecordManagerV146')?.scrollIntoView?.({behavior:'smooth',block:'start'});
 };
}
function render(){
 installShortcut();
 const root=document.querySelector('#imports .grid');
 if(!root)return false;
 let box=$('mdcPdfRecordManagerV146');
 if(!box){
   box=document.createElement('div');box.id='mdcPdfRecordManagerV146';box.className='card full';
   root.prepend(box); // Keep correction above all import tools on small screens.
 }
 const groups=sources();
 if(!groups.length){
   box.innerHTML='<div class="title">PDF明細の管理・削除 v146</div><div class="tiny">MDC/JALカード明細の登録はありません。</div>';
   visible.clear();return true;
 }
 if(!groups.some(x=>x.file===file))file=groups[0].file;
 const active=groups.find(x=>x.file===file),list=[...active.rows].sort((a,b)=>String(b.record.purchase_date).localeCompare(String(a.record.purchase_date)));
 visible=new Map(list.map(x=>[x.index,x.token]));
 box.innerHTML='<div class="title">PDF明細の管理・削除 v146</div>'+
   '<div class="tiny">重複候補に出ない誤読取も削除できます。ファイルを選び、行をチェックしてください。銀行明細は削除しません。</div>'+
   '<label class="field" style="margin:10px 0">取込ファイル'+
   '<select id="pdfCorrectionFileV146" style="width:100%">'+groups.map(g=>
     '<option value="'+esc(g.file)+'"'+(g.file===file?' selected':'')+'>'+
      esc(g.file)+' · '+g.rows.length+'件（'+yen(g.amount)+'）</option>').join('')+'</select></label>'+
   '<div class="controls" style="flex-wrap:wrap;margin-bottom:10px">'+
   '<button class="btn secondary" id="pdfCorrectionSelectAllV146">全選択</button>'+
   '<button class="btn secondary" id="pdfCorrectionClearV146">解除</button>'+
   '<span id="pdfCorrectionCountV146" class="tiny">0件を選択</span></div>'+
   '<div style="max-height:350px;overflow:auto;border:1px solid var(--line);border-radius:9px;padding:5px">'+
   list.map(r=>'<label class="row" style="align-items:flex-start;gap:8px">'+
     '<input type="checkbox" data-pdf-correction-row="'+r.index+'" style="margin-top:5px;flex:none">'+
     '<span style="flex:1;min-width:0;overflow-wrap:anywhere"><b>'+esc(r.record.purchase_date)+' '+esc(merchant(r.record))+'</b>'+
     '<div class="tiny">'+esc(r.record.pdf_card_identity||r.record.card||'')+
       '・請求月 '+esc(r.record.billing_month||'不明')+'</div></span>'+
     '<b>'+yen(Math.abs(Number(r.record.original_amount)||0))+'</b></label>').join('')+
   '</div><div class="tiny" style="margin:8px 0">削除前の家計データを端末復旧履歴に保存します。削除後は月次・年間収支も再計算されます。</div>'+
   '<button id="pdfCorrectionBackupV146" class="btn secondary" type="button">削除前の全データをJSON保存</button> '+
   '<button id="pdfCorrectionDeleteV146" class="btn danger" type="button" disabled>選択した明細を削除</button>'+
   '<div id="pdfCorrectionStatusV146" class="tiny" role="status" style="margin-top:10px"></div>';
 const selected=()=>[...box.querySelectorAll('[data-pdf-correction-row]:checked')];
 const update=()=>{
   const list=selected(),total=list.reduce((n,x)=>n+Math.abs(Number(getState().purchaseEvents[Number(x.dataset.pdfCorrectionRow)]?.original_amount)||0),0);
   $('pdfCorrectionCountV146').textContent=list.length+'件・'+yen(total)+'を選択';
   $('pdfCorrectionDeleteV146').disabled=list.length===0;
 };
 $('pdfCorrectionFileV146').onchange=e=>{file=e.target.value;render()};
 box.querySelectorAll('[data-pdf-correction-row]').forEach(x=>x.onchange=update);
 $('pdfCorrectionSelectAllV146').onclick=()=>{
   box.querySelectorAll('[data-pdf-correction-row]').forEach(x=>x.checked=true);update();
 };
 $('pdfCorrectionClearV146').onclick=()=>{
   box.querySelectorAll('[data-pdf-correction-row]').forEach(x=>x.checked=false);update();
 };
 $('pdfCorrectionBackupV146').onclick=()=>{const btn=$('exportJson');if(btn)btn.click();else $('pdfCorrectionStatusV146').textContent='Settings → バックアップ書出しから保存してください。'};
 $('pdfCorrectionDeleteV146').onclick=()=>{
   const chosen=selected().map(x=>({index:Number(x.dataset.pdfCorrectionRow),token:visible.get(Number(x.dataset.pdfCorrectionRow))}));
   let plan;
   try{plan=planDeletion(getState(),chosen)}catch(e){$('pdfCorrectionStatusV146').textContent=e.message;return;}
   if(!window.confirm(plan.count+'件（合計 '+yen(plan.sum)+'）を削除します。\n取込元：'+plan.files.join('、')+
       '\n\n原PDFと照合し、不要な明細であることを確認しましたか？'))return;
   try{
     const done=applyDeletion(chosen);render();
     $('pdfCorrectionStatusV146').textContent=done.count+'件を削除しました。Settingsの端末復旧履歴から復元できます。';
   }catch(e){$('pdfCorrectionStatusV146').textContent='削除失敗：'+String(e.message||e)}
 };
 return true;
}
window.householdPdfRecordManagerV146={rows,sources,planDeletion,makeNext,applyDeletion,render};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});
else setTimeout(render,0);
document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="imports"]'))setTimeout(render,80)});
window.addEventListener('treasury:expenses-imported',()=>setTimeout(render,100));
window.addEventListener('pageshow',()=>{if($('imports')?.classList.contains('active'))render()});
})();