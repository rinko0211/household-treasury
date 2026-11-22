/* v229 — Post-import review uses the canonical 支出 editor; no second form. */
(()=>{
'use strict';
if(window.householdImportPostEditV229)return;
const STORAGE_KEY='householdPostImportReviewV229';
const MAX_ITEMS=400;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&#39;'}[c]));
const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
const key=(kind,id)=>kind+'\u0000'+id;
const raw=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
const sourceRows=(st,kind)=>kind==='purchase'?st.purchaseEvents||[]:
  kind==='cash_expense'?st.cashExpenses||[]:st.cashTransactions||[];
const rowId=(kind,row,i)=>String(kind==='purchase'?row.purchase_id||'purchase:'+i:
  kind==='cash_expense'?row.id||'cash-expense:'+i:row.id||'cash:'+i);
function snapshot(st=raw()){
 const entries=new Map();
 for(const kind of ['purchase','cash_expense','cash']){
  sourceRows(st,kind).forEach((row,i)=>{
   const id=rowId(kind,row,i);
   entries.set(key(kind,id),{kind,id,signature:JSON.stringify(row)});
  });
 }
 return entries;
}
function difference(before,after){
 const added=[];
 for(const [k,item] of after){
  const previous=before.get(k);
  if(!previous||previous.signature!==item.signature)added.push({kind:item.kind,id:item.id});
 }
 return added;
}
let items=[],host=null,current=null;
function persistReview(){
 try{window.localStorage?.setItem(STORAGE_KEY,JSON.stringify(items.slice(-MAX_ITEMS)))}catch{}
}
function loadReview(){
 try{
  const value=JSON.parse(window.localStorage?.getItem(STORAGE_KEY)||'[]');
  if(Array.isArray(value))items=value.filter(x=>
   x&&['purchase','cash_expense','cash'].includes(x.kind)&&typeof x.id==='string'&&
   x.id.length<=200).slice(-MAX_ITEMS).map(x=>({kind:x.kind,id:x.id,reviewed:x.reviewed===true}));
 }catch{items=[]}
}
function lookup(item,st=raw()){
 if(!item)return null;
 return sourceRows(st,item.kind).find((row,i)=>rowId(item.kind,row,i)===String(item.id))||null;
}
function itemName(item,row){
 return item.kind==='purchase'?row.merchant_raw||row.merchant_normalized||'カード利用':
  item.kind==='cash_expense'?row.description||'支出':row.description_raw||row.description||'銀行明細';
}
function itemDate(item,row){return item.kind==='purchase'?row.purchase_date:row.date}
function itemAmount(item,row){return Math.abs(Number(item.kind==='purchase'?row.original_amount:row.amount)||0)}
function label(item,row){
 if(!row)return '別の支払方法に変更済み／元明細なし';
 const spend=row.spending_class==='SPECIAL'?'特別費':'通常費';
 const nature=String(row.expense_bucket_v193||row.cost_nature||'AUTO');
 const n={PERSONAL:'個人費',FIXED:'固定費',VARIABLE:'変動費',REVIEW:'要確認',AUTO:'自動判定'}[nature]||'自動判定';
 const owner=nature==='PERSONAL'?row.personal_owner_v193==='wife'?'（妻）':row.personal_owner_v193==='self'?'（本人）':'（対象未設定）':'';
 return spend+' / '+n+owner;
}
function nextFor(kind,id){
 const index=items.findIndex(x=>x.kind===String(kind)&&x.id===String(id));
 for(let i=index+1;i<items.length;i++)if(!items[i].reviewed&&lookup(items[i]))
  return {kind:items[i].kind,id:items[i].id};
 return null;
}
function mount(){
 if(host?.isConnected)return host;
 const grid=document.querySelector('#imports .grid');
 if(!grid)return null;
 host=$('postImportReviewV229');
 if(host)return host;
 host=document.createElement('section');
 host.id='postImportReviewV229';
 host.className='card full';
 host.style.cssText='margin-top:4px;overflow-wrap:anywhere';
 host.innerHTML='<div class="title" style="margin-bottom:6px">取込直後の明細を確認・編集</div>'+
  '<p class="tiny" id="postImportReviewStatusV229" role="status" aria-live="polite"></p>'+
  '<p class="tiny">下の明細を選ぶと、支出ページと全く同じ編集フォームが開きます。'+
  '通常／特別・固定／変動／個人費・妻／本人・カテゴリ・サブカテゴリ・支払カードまで設定して保存できます。'+
  '未編集の明細も既に登録済みです。</p>'+
  '<div id="postImportReviewListV229" style="max-height:260px;overflow:auto;margin-top:9px"></div>'+
  '<div id="postImportInlineEditorV229" style="margin-top:12px"></div>'+
  '<div class="controls" style="margin-top:9px"><button type="button" class="btn secondary" data-postimport-hide>この一覧を閉じる</button></div>';
 const importCard=$('importResults')?.closest('.card');
 if(importCard?.parentElement===grid)importCard.after(host);else grid.insertBefore(host,grid.firstChild);
 host.addEventListener('click',event=>{
  const btn=event.target.closest?.('[data-postimport-kind]');
  if(btn){open(btn.dataset.postimportKind,btn.dataset.postimportId);return}
  if(event.target.closest?.('[data-postimport-hide]')){
   const editor=$('transactionEditorV108');
   if(editor?._editContext?.source==='imports'&&editor.style.display!=='none')
     editor.querySelector('[data-v108-tx-close]')?.click();
   host.hidden=true;
  }
 });
 host.hidden=!items.length;
 renderList();
 return host;
}
function renderList(){
 if(!mountNoRecursion())return;
 const list=$('postImportReviewListV229'),status=$('postImportReviewStatusV229');
 if(!list||!status)return;
 const st=raw();
 const pending=items.filter(x=>!x.reviewed&&lookup(x,st)).length;
 status.textContent=items.length?('最近取り込んだ明細 '+items.length+'件 ・ 編集済み '+(items.length-pending)+'件 ・ 未確認 '+pending+'件'):
  '取込後、新規または更新された明細がここに表示されます。';
 list.innerHTML=items.map((item,i)=>{
  const row=lookup(item,st),id=key(item.kind,item.id),selected=current===id;
  return '<button type="button" class="btn secondary" data-postimport-kind="'+esc(item.kind)+
   '" data-postimport-id="'+esc(item.id)+'" style="display:flex;width:100%;gap:8px;align-items:center;'+
   'justify-content:space-between;text-align:left;margin-top:6px;white-space:normal;'+
   (selected?'border-color:var(--accent);':'')+'">'+
   '<span style="min-width:0"><b>'+esc(row?itemName(item,row):'支払方法を変更した明細')+'</b>'+
   '<span class="tiny" style="display:block">'+esc(row?String(itemDate(item,row)||'')+' ・ '+label(item,row):
     '支払方法変更済み')+'</span></span>'+
   '<span style="flex-shrink:0;text-align:right"><b>'+ (row?yen(itemAmount(item,row)):'—')+
   '</b><span class="tiny" style="display:block">'+(item.reviewed?'編集済み':'編集する')+'</span></span></button>';
 }).join('');
}
function mountNoRecursion(){return host?.isConnected?host:null}
function open(kind,id){
 const item=items.find(x=>x.kind===kind&&x.id===id),node=$('postImportInlineEditorV229');
 if(!item||!lookup(item)||!node)return;
 const fn=window.openSemanticTransactionEditorV108;
 if(typeof fn!=='function'){const status=$('postImportReviewStatusV229');if(status)status.textContent='編集フォームを読み込めません。再読み込みしてください。';return}
 current=key(kind,id);
 renderList();
 fn(kind,id,{inlineHost:node});
}
function receive(records,autoOpen=true){
 if(!Array.isArray(records)||!records.length)return;
 let appended=0,first=null;
 for(const ref of records){
  const kind=String(ref?.kind||''),id=String(ref?.id||'');
  if(!['purchase','cash_expense','cash'].includes(kind)||!id||id.length>200)continue;
  if(!lookup({kind,id}))continue;
  if(items.some(x=>x.kind===kind&&x.id===id))continue;
  items.push({kind,id,reviewed:false});appended++;if(!first)first={kind,id};
 }
 if(!appended)return;
 if(items.length>MAX_ITEMS)items=items.slice(-MAX_ITEMS);
 persistReview();
 mount();host.hidden=false;renderList();
 if(autoOpen&&first){
  open(first.kind,first.id);
  if($('imports')?.classList?.contains('active'))
   host.scrollIntoView?.({block:'start',behavior:'auto'});
 }
}
function install(){
 if(typeof importOne!=='function')return false;
 if(importOne.__postImportReviewV229)return true;
 const previous=importOne;
 importOne=async function(file){
  const before=snapshot();
  const result=await previous(file);
  if(!result?.skipped&&!result?.cancelled)receive(difference(before,snapshot()));
  return result;
 };
 importOne.__postImportReviewV229=true;
 return true;
}
window.householdImportPostEditV229={snapshot,difference,nextFor,receive,mount,open,install};
loadReview();
window.addEventListener?.('treasury:expenses-imported',event=>{
 const refs=event?.detail?.records;
 if(refs?.length)receive(refs);
});
window.addEventListener?.('treasury:import-review-saved',event=>{
 const kind=String(event?.detail?.kind||''),id=String(event?.detail?.id||'');
 const item=items.find(x=>x.kind===kind&&x.id===id);
 if(!item)return;
 item.reviewed=true;persistReview();renderList();
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{mount();install()},{once:true});
else {mount();install()}
if(!install())window.setTimeout?.(install,0);
})();
