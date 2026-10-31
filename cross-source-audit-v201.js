/* v201: common cross-source duplicate AUDIT. Never auto-merge or delete imported evidence. */
(() => {
'use strict';
if(window.householdCrossSourceAuditV201)return;
const $=id=>document.getElementById(id);
const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
const fmt=n=>new Intl.NumberFormat('ja-JP').format(Number(n)||0)+'円';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s??'').normalize('NFKC').toUpperCase()
  .replace(/[\s　()（）［］\[\]〔〕【】・\-_／/.,，。．]/g,'');
const amount=x=>Math.abs(Number(x)||0);
const dateOk=s=>/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s||''))&&
  Number.isFinite(Date.parse(s+'T00:00:00Z'));
const days=(a,b)=>Math.round(Math.abs(Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
const counted=x=>x?.count_in_spending!==false&&x?.reconciliation_status!=='ABSORBED_DUPLICATE'&&
  x?.manually_deleted_v192!==true&&x?.reference_only_v200!==true&&
  !x?.is_refinanced&&!x?.is_refinance_adjustment&&
  String(x?.economic_type||'EXPENSE').toUpperCase()==='EXPENSE';
function cardFamily(s){
 const n=norm(s).replace(/カード$|CARD$/,'');
 if(!n)return '';
 if(/^(?:KABU&|KABUAND|カブアンド|株アンド)/.test(n))return 'KABU';
 if(/^(?:RAKUTEN|楽天)/.test(n))return 'RAKUTEN';
 if(/^(?:D|DCMX|DOCOMO)$/.test(n))return 'DCARD';
 if(/MUFG|JAL|DCJAL|三菱UFJ/.test(n))return 'MDC';
 return n;
}
function origin(r,kind){
 if(kind==='cash')return 'cash';
 if(r.mdc_import_v144||r.mdc_pdf_signature_v168||r.pdf_card_identity||
    /^MDC_PDF_/i.test(String(r.source_file||'')))return 'pdf';
 if(r.receipt_reconciliation_pending||r.source_cash_expense_id||
    /^(?:receipt:|receipt-|manual-)/i.test(String(r.purchase_id||''))||
    r.manual_entry===true)return 'receipt';
 if(r.dcard_csv_import_v140||r.kabu_csv_import_v198||r.record_kind==='CARD_STATEMENT'||
    r.record_kind==='CARD_PURCHASE'&&String(r.source_file||'').match(/(?:\.csv$|\.tsv$)/i))
   return 'statement';
 return 'purchase';
}
const rank={pdf:5,statement:4,purchase:3,receipt:2,cash:1};
function rows(st){
 const result=[];
 for(const [kind,arr] of [['purchase',st.purchaseEvents||[]],['cash',st.cashExpenses||[]]]){
  for(const [index,r] of arr.entries()){
   if(!counted(r))continue;
   const date=kind==='purchase'?r.purchase_date:r.date;
   const yen=kind==='purchase'?r.original_amount:r.purchase_total??r.amount;
   const label=kind==='purchase'?r.merchant_raw||r.merchant_normalized:r.description||r.description_raw||r.name;
   if(!dateOk(date)||!Number.isSafeInteger(Number(yen))||amount(yen)<=0||!label)continue;
   const source=String(r.source_file||r.source||'MANUAL');
   const card=kind==='purchase'?cardFamily(r.card):
     /CARD|QUICPAY|クレジット|カード|ＫＡＢＵ|KABU/i.test(String(r.payment_method||''))?
     cardFamily(r.card||r.payment_method):'';
   const type=origin(r,kind);
   const ref=kind+':'+index;
   const sig=JSON.stringify([ref,String(r.purchase_id||r.id||''),date,amount(yen),label,
      source,card,String(r.pdf_card_identity||''),String(r.occurrence_index||'')]);
   result.push({kind,index,ref,date,amount:amount(yen),label,name:norm(label),source,
      card,type,rank:rank[type],count:r.occurrence_index||null,
      physical: String(r.pdf_card_identity||r.card_last4||''),
      sig});
  }
 }
 return result;
}
function namesMatch(a,b){
 if(!a.name||!b.name)return '';
 if(a.name===b.name)return 'exact';
 // A brand prefix alone is not evidence of the same transaction.
 if(Math.min(a.name.length,b.name.length)>=6&&
    (a.name.includes(b.name)||b.name.includes(a.name)))return 'partial';
 return '';
}
function compare(a,b){
 if(a.ref===b.ref||a.amount!==b.amount)return null;
 // Two rows in one official export may be legitimate repeat purchases.
 // Manual entries may have no distinct source file; retain them for review.
 if(a.source===b.source&&a.source!=='MANUAL')return null;
 const dd=days(a.date,b.date);
 if(dd>3)return null;
 const pdfReceipt=(a.type==='pdf'&&b.type==='receipt')||(b.type==='pdf'&&a.type==='receipt');
 if(dd>0&&!pdfReceipt)return null;
 const nameMatch=namesMatch(a,b);
 if(!nameMatch)return null;
 const families=a.card&&b.card&&a.card!==b.card;
 // Different physical cards or different occurrence numbers may mean two real purchases.
 const physical=a.physical&&b.physical&&a.physical!==b.physical;
 const occurrences=a.count&&b.count&&Number(a.count)!==Number(b.count);
 if(families||physical||occurrences)return {level:'blocked',reason:'カード・実カード識別・同日利用回数が一致しません'};
 const cash=a.kind==='cash'||b.kind==='cash';
 const level=cash||dd||a.source==='MANUAL'||nameMatch==='partial'||!a.card||!b.card?'review':'high';
 return {level,reason:cash?'現金とカードの支払方法を確認してください':
   dd?'利用日が異なります。レシートとPDFを照合してください':
   nameMatch==='partial'?'店舗表記の一部だけ一致しています':
   (!a.card||!b.card)?'支払元が未特定です':
   '同一取引の可能性があります（別購入なら除外しない）'};
}
function pair(a,b,cmp){
 const keep=a.rank>b.rank?a:a.rank<b.rank?b:a.index<=b.index?a:b;
 const duplicate=keep===a?b:a;
 const key=[a.ref,b.ref].sort().join('~');
 return {key,keep,duplicate,date:keep.date,amount:keep.amount,level:cmp.level,
   reason:cmp.reason,keepSig:keep.sig,duplicateSig:duplicate.sig};
}
function scan(st=stateNow()){
 const source=rows(st),index=new Map(),found=new Map();
 for(const r of source){
  const key=r.date+'|'+r.amount;
  if(!index.has(key))index.set(key,[]);
  index.get(key).push(r);
 }
 let oversized=0;
 for(const a of source){
  const dates=[a.date];
  if(a.type==='pdf'||a.type==='receipt'){
   const base=Date.parse(a.date+'T00:00:00Z');
   for(let n=-3;n<=3;n++){
    if(!n)continue;
    dates.push(new Date(base+n*86400000).toISOString().slice(0,10));
   }
  }
  for(const day of dates){
   const candidates=index.get(day+'|'+a.amount)||[];
   if(candidates.length>40){oversized++;continue}
   for(const b of candidates){
    if(b.ref<=a.ref)continue;
    const c=compare(a,b);if(!c)continue;
    const p=pair(a,b,c);
    if(found.has(p.key))continue;
    found.set(p.key,p);
   }
  }
 }
 const prior=new Map((st.crossSourceReviewDecisionsV201||[])
   .filter(r=>r?.decision==='SEPARATE').map(r=>[String(r.key),r]));
 const all=[...found.values()].filter(p=>{
   const before=prior.get(p.key);
   return !before||before.keepSig!==p.keepSig||before.duplicateSig!==p.duplicateSig;
 });
 const order={high:0,review:1,blocked:2};
 all.sort((a,b)=>order[a.level]-order[b.level]||b.date.localeCompare(a.date)||
   b.amount-a.amount);
 return {candidates:all,high:all.filter(x=>x.level==='high').length,
   review:all.filter(x=>x.level==='review').length,
   blocked:all.filter(x=>x.level==='blocked').length,
   oversized,scanned:source.length};
}
function plan(st,choices){
 if(!Array.isArray(choices)||!choices.length||choices.length>100)
   throw Error('選択件数が不正です（1〜100件）。');
 const available=new Map(scan(st).candidates.map(p=>[p.key,p]));
 const used=new Set(),operations=[],selected=new Set();
 for(const item of choices){
  const key=String(item?.key||''),action=String(item?.action||'');
  if(!['DUPLICATE','SEPARATE'].includes(action)||selected.has(key))
   throw Error('同じ照合候補が重複選択されています。');
  selected.add(key);
  const p=available.get(key);
  if(!p||p.keepSig!==item.keepSig||p.duplicateSig!==item.duplicateSig)
   throw Error('照合対象が変更されました。再点検してください。');
  if(action==='DUPLICATE'){
   if(p.level==='blocked')throw Error('カードや利用回数が一致しないため計上除外できません。');
   if(used.has(p.keep.ref)||used.has(p.duplicate.ref))
     throw Error('1件の明細に複数候補が選ばれました。1対1で選択してください。');
   used.add(p.keep.ref);used.add(p.duplicate.ref);
  }
  operations.push({...p,action});
 }
 return {operations,amount:operations.filter(x=>x.action==='DUPLICATE')
   .reduce((s,x)=>s+x.amount,0)};
}
function apply(choices,confirmed=false){
 const original=stateNow(),proposed=plan(original,choices);
 if(!confirmed)throw Error('計上除外には確認が必要です。');
 if(typeof window.replaceTreasuryState!=='function'||
    typeof window.treasuryRecoverySnapshot!=='function')
   throw Error('復旧記録またはデータ保存機能が使えません。');
 const latest=stateNow(),verified=plan(latest,choices),next=structuredClone(latest);
 if(proposed.amount!==verified.amount||proposed.operations.length!==verified.operations.length)
   throw Error('照合中にデータが変更されました。未適用です。');
 next.crossSourceReviewDecisionsV201=Array.isArray(next.crossSourceReviewDecisionsV201)?
   next.crossSourceReviewDecisionsV201:[];
 const now=new Date().toISOString();
 for(const p of verified.operations){
  if(p.action==='SEPARATE'){
   next.crossSourceReviewDecisionsV201.push({key:p.key,keepSig:p.keepSig,duplicateSig:p.duplicateSig,decision:'SEPARATE',at:now});
   continue;
  }
  const arr=p.duplicate.kind==='cash'?next.cashExpenses:next.purchaseEvents;
  const record=arr?.[p.duplicate.index];
  const keeper=(p.keep.kind==='cash'?next.cashExpenses:next.purchaseEvents)?.[p.keep.index];
  if(!record||!keeper||!counted(record)||!counted(keeper))
    throw Error('原本状態が変わりました。未適用です。');
  record.cross_source_original_count_v201=record.count_in_spending===undefined?null:record.count_in_spending;
  record.cross_source_original_status_v201=record.reconciliation_status===undefined?null:record.reconciliation_status;
  record.count_in_spending=false;
  record.reconciliation_status='ABSORBED_DUPLICATE';
  record.cross_source_canonical_ref_v201=p.keep.ref;
  record.cross_source_canonical_id_v201=String(keeper.purchase_id||keeper.id||'');
  record.cross_source_reconciliation_v201={at:now,kind:'CONFIRMED_BY_USER',
    match_level:p.level,canonical_source_file:p.keep.source};
 }
 window.treasuryRecoverySnapshot('全形式・重複照合の適用直前');
 if(window.replaceTreasuryState(next)===false)throw Error('照合結果を保存できませんでした。');
 window.cloudSyncOnLocalSave?.();
 window.dispatchEvent?.(new CustomEvent('treasury:expenses-imported',{
    detail:{source:'CROSS_SOURCE_AUDIT_V201'}}));
 window.householdExpenseUnifiedV148?.render?.();
 return {count:verified.operations.length,excluded:verified.operations.filter(x=>x.action==='DUPLICATE').length,
   amount:verified.amount};
}
function mount(){
 const root=document.querySelector('#imports .grid');
 if(!root||$('crossSourceAuditV201'))return false;
 const el=document.createElement('div');
 el.id='crossSourceAuditV201';el.className='card full';
 el.innerHTML='<div class="title">CSV・PDF・手入力の横断重複点検</div>'+
  '<p class="tiny">銀行引落・カード請求は購入とは別の資金移動として扱います。'+
  '計上済みのカード購入、旧レシート、現金記録を横断して照合します。'+
  '一致しても自動削除・自動除外しません。同じ日に同額を2回購入した可能性は人が確認してください。</p>'+
  '<button type="button" class="btn secondary" id="crossSourceRefreshV201">現在の明細を点検</button>'+
  '<div id="crossSourceSummaryV201" class="note" role="status" style="margin:10px 0"></div>'+
  '<div id="crossSourcePairsV201" style="max-height:440px;overflow:auto"></div>'+
  '<button type="button" class="btn" id="crossSourceApplyV201" style="margin-top:9px" disabled>選択した照合結果を反映</button>';
 root.appendChild(el);
 $('crossSourceRefreshV201').onclick=render;
 $('crossSourceApplyV201').onclick=()=>{
  const selections=[...el.querySelectorAll('[data-cross-key]')].map(x=>{
   const action=x.querySelector('select')?.value||'';
   const item=currently.get(x.dataset.crossKey);
   return action&&item?{key:item.key,keepSig:item.keepSig,duplicateSig:item.duplicateSig,action}:null;
  }).filter(Boolean);
  if(!selections.length)return;
  const summary=selections.reduce((s,x)=>s+(x.action==='DUPLICATE'?(currently.get(x.key)?.amount||0):0),0);
  const message='以下の照合操作 '+selections.length+'件を適用します。'+
    '二重計上からの除外 '+fmt(summary)+'。別取引の確定は記録だけです。'+
    '\n実際に複数回買った取引や、別カードの取引を除外しないことを確認しましたか？'+
    '\n元明細と銀行記録を残し、復旧履歴を保存します。';
  if(!window.confirm?.(message))return;
  try{
   const outcome=apply(selections,true);
   render();
   $('crossSourceSummaryV201').textContent='照合を保存しました。除外 '+outcome.excluded+
     '件 '+fmt(outcome.amount)+'。クラウド同期を確認してください。';
  }catch(err){$('crossSourceSummaryV201').textContent='未適用：'+String(err.message||err)}
 };
 render();return true;
}
let currently=new Map();
function render(){
 if(!$('crossSourceAuditV201'))return;
 const results=scan();
 currently=new Map(results.candidates.map(p=>[p.key,p]));
 const summary=$('crossSourceSummaryV201'),host=$('crossSourcePairsV201');
 summary.textContent='計上済み購入 '+results.scanned+'件を照合｜一致可能性が高い '+results.high+
  '組・要確認 '+results.review+'組・カード等不一致 '+results.blocked+'組'+
  (results.oversized?'｜大量の同日同額候補は保留 '+results.oversized+'件':'')+
  '。自動計上除外 0件。';
 const view=results.candidates.slice(0,120);
 host.innerHTML=view.map(p=>{
  const keep=p.keep,dup=p.duplicate,blocked=p.level==='blocked';
  return '<div class="note" style="margin:7px 0" data-cross-key="'+esc(p.key)+'">'+
   '<div><b>'+esc(p.date)+'　'+fmt(p.amount)+'</b> ・ '+
     (p.level==='high'?'店舗・支払元一致':blocked?'照合保留':'要確認')+'</div>'+
   '<div class="tiny">残す候補：'+esc(keep.label)+'　['+esc(keep.card||keep.type)+'] '+esc(keep.source)+'</div>'+
   '<div class="tiny">重複候補：'+esc(dup.label)+'　['+esc(dup.card||dup.type)+'] '+esc(dup.source)+'</div>'+
   '<div class="tiny">'+esc(p.reason)+'</div>'+
   '<select aria-label="照合判断" style="width:100%;margin-top:5px">'+
     '<option value="">判断しない</option>'+
     (blocked?'':'<option value="DUPLICATE">同一取引と確認：重複側を計上除外</option>')+
     '<option value="SEPARATE">別取引と確認：今後この組を警告しない</option></select></div>';
 }).join('')+(results.candidates.length>view.length?
   '<p class="tiny">先頭120組のみ表示。先に確認済みの組を処理して再点検してください。</p>':'');
 host.querySelectorAll('select').forEach(x=>x.onchange=()=>{
  $('crossSourceApplyV201').disabled=![...host.querySelectorAll('select')].some(s=>s.value);
 });
 $('crossSourceApplyV201').disabled=true;
}
function attach(){
 if(!mount())return false;
 window.addEventListener?.('treasury:expenses-imported',()=>render());
 window.addEventListener?.('householdShareCloudSyncedV160',()=>render());
 if(typeof readCsv==='function'&&!readCsv.__crossAuditV201){
  const previous=readCsv;
  readCsv=async function(...args){const r=await previous(...args);render();return r};
  readCsv.__crossAuditV201=true;
 }
 return true;
}
window.householdCrossSourceAuditV201={scan,plan,apply,mount,render,cardFamily,norm,rows};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});
else attach();
window.addEventListener?.('pageshow',()=>{if(!attach())render()});
})();
