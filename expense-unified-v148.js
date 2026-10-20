(() => {
'use strict';
if(window.__expenseUnifiedV148)return;
window.__expenseUnifiedV148=true;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(v)||0);
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const stateNow=()=>{try{return (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{}}catch{return {}}};
const engine=()=>window.treasuryLedgerV145;
const semantics=()=>window.householdSemanticV47;
const localDate=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const labelByKind={living:'生活費',fixed:'固定費',cash:'現金支出',special:'特別費',debt:'ローン・リボ返済',card:'カード引落',investment:'NISA・iDeCoなど',cardPurchase:'カード利用'};
const tones={direct:'#13c7b5',card:'#67b9f4',debt:'#ff9f35',investment:'#987efd',consumption:'#13c7b5'};
let cycle='payday',lens='cash',month='',openBucket='',openCategory='',groups=[];
function initialMonth(){
 const now=localDate(),m=now.slice(0,7);
 return cycle==='calendar'||!engine()?m:(now<engine().payday(stateNow(),m)?engine().addMonth(m,-1):m);
}
function cardEstimates(){
 try{const r=window.householdCardCycleV81?.buildPlan?.(460);return Array.isArray(r?.rows)?r.rows:[]}catch{return []}
}
function revolvingEstimates(){
 try{if(typeof generated==='function')return (generated(460)||[]).filter(x=>x.type==='CARD_REVOLVING_PAYMENT'&&n(x.amount)<0)}catch{}
 return [];
}
function calculate(st,m=month,b=cycle,ref=localDate()){
 if(!engine())throw Error('月次集計エンジンを読み込めません。');
 return engine().calculate(st,m,b,ref,{cardEstimates:cardEstimates(),revolvingEstimates:revolvingEstimates()});
}
function rowDetails(row,st){
 const [kind,sIndex]=String(row.identity||'').split(':'),i=Number(sIndex);
 let source=null,editKind='',editId='';
 if(Number.isSafeInteger(i)&&i>=0){
  if(kind==='purchase'){source=st.purchaseEvents?.[i];editKind='purchase';editId=String(source?.purchase_id||'purchase:'+i)}
  if(kind==='bank'){source=st.cashTransactions?.[i];editKind='cash';editId=String(source?.id||'cash:'+i)}
  if(kind==='cash'){source=st.cashExpenses?.[i];editKind='cash_expense';editId=String(source?.id||'cash-expense:'+i)}
 }
 const cat=semantics()?.normalizeCategoryValue?.(source?.category)||
   semantics()?.inferCategory?.(row.label,source?.category)||'OTHER';
 const special=row.kind==='special'||String(source?.spending_class||source?.expense_scope||source?.ordinary_or_special||'').toUpperCase()==='SPECIAL';
 return {...row,category:cat,scope:special?'SPECIAL':'NORMAL',editKind,editId};
}
function buckets(st,v,mode=lens){
 const actual=(v.rows||[]).filter(r=>r.status==='confirmed'&&r.amount<0);
 const specs=mode==='cash'?[
  {id:'direct',label:'銀行・現金の直接支出',color:tones.direct,
   rows:actual.filter(r=>['living','fixed','cash','special'].includes(r.kind))},
  {id:'card',label:'カード引落',color:tones.card,rows:actual.filter(r=>r.kind==='card')},
  {id:'debt',label:'ローン・リボ返済',color:tones.debt,rows:actual.filter(r=>r.kind==='debt')},
  {id:'investment',label:'NISA・iDeCo等への積立',color:tones.investment,rows:actual.filter(r=>r.kind==='investment')}
 ]:[{id:'consumption',label:'消費・購入額',color:tones.consumption,rows:v.economicRows||[]}];
 return specs.map(b=>{
   const items=b.rows.map(x=>rowDetails(x,st));
   return {id:b.id,label:b.label,color:b.color,items,amount:items.reduce((s,x)=>s+Math.abs(n(x.amount)),0)};
 });
}
function subgroups(bucket,mode=lens){
 const map=new Map();
 for(const x of bucket.items){
   let key,label;
   if(mode==='economic'||bucket.id==='direct'){
     key=x.scope+'|'+x.category;
     label=(x.scope==='SPECIAL'?'特別費 / ':'')+
       (semantics()?.CATEGORY_DEFS?.[x.category]?.label||window.householdExpenseAnalyticsV106?.categoryLabel?.(x.category)||'その他');
   }else if(bucket.id==='debt'){
     key=/リボ/.test(x.label)?'debt|revolving':'debt|loan';label=key==='debt|revolving'?'リボ返済':'各種ローン返済';
   }else if(bucket.id==='investment'){
     key=/IDECO|iDeCo|イデコ/i.test(x.label)?'investment|ideco':'investment|other';
     label=key==='investment|ideco'?'iDeCo':'NISA・証券積立等';
   }else{
     key='card|'+x.source;label=x.source||'カード';
   }
   let group=map.get(key);
   if(!group){group={key,label,amount:0,items:[]};map.set(key,group)}
   group.items.push(x);group.amount+=Math.abs(n(x.amount));
 }
 return [...map.values()].sort((a,b)=>b.amount-a.amount||a.label.localeCompare(b.label,'ja'));
}
function mount(){
 const page=$('expenses'),legacy=$('expenseTabRootV129');if(!page||!legacy||!engine())return false;
 if(!$('expenseHubV148')){const root=document.createElement('div');root.id='expenseHubV148';page.insertBefore(root,legacy)}
 if(!$('expenseLegacyDetailsV148')){
   const box=document.createElement('details');box.id='expenseLegacyDetailsV148';
   const head=document.createElement('summary');head.textContent='支出明細の一覧・編集を開く（従来の支出機能）';
   box.appendChild(head);
   page.replaceChild(box,legacy);box.appendChild(legacy);
 }
 return true;
}
function ratioParts(list,baseline){
 let remain=Math.max(0,baseline);
 let html='',legend='';
 for(const b of list){
   let used=Math.min(remain,b.amount);remain-=used;
   if(baseline>0&&used>0)html+='<span style="width:'+(used*100/baseline).toFixed(3)+'%;background:'+b.color+'"></span>';
   if(b.amount>0)legend+='<span><i class="hub-dot" style="background:'+b.color+'"></i>'+
     esc(b.label)+' '+(baseline>0?(b.amount*100/baseline).toFixed(1)+'%':'—')+'</span>';
 }
 if(baseline>0&&remain>0)legend+='<span><i class="hub-dot" style="background:#c8d4e1"></i>残額 '+(remain*100/baseline).toFixed(1)+'%</span>';
 return {html,legend};
}
function detailPanel(bucket){
 groups=subgroups(bucket);
 if(openCategory&&!groups.some(g=>g.key===openCategory))openCategory='';
 const chosen=groups.find(g=>g.key===openCategory);
 let markup='<div class="hub-card" id="expenseHubDrilldownV148">'+
   '<div class="hub-title" style="font-size:17px">'+esc(bucket.label)+' の内訳</div>'+
   '<div class="hub-muted">'+bucket.items.length+'件 / '+yen(bucket.amount)+'。カテゴリを選ぶと個別明細が開きます。</div>';
 if(!groups.length)markup+='<div class="hub-muted" style="padding:12px 0">この期間の明細はありません。</div>';
 for(const g of groups)markup+='<button type="button" class="hub-group" data-hub-group="'+esc(g.key)+'" aria-expanded="'+(openCategory===g.key)+'">'+
   '<span>'+esc(g.label)+' <span class="hub-muted">('+g.items.length+'件)</span></span>'+
   '<b>'+yen(g.amount)+' ›</b></button>';
 if(chosen){
   markup+='<div style="border-top:1px solid #3c4b5a;margin-top:12px;padding-top:10px"><b>'+esc(chosen.label)+'</b>';
   for(const x of chosen.items.slice(0,150)){
     markup+='<div class="hub-detailrow"><div style="min-width:0;overflow-wrap:anywhere"><b>'+esc(x.label)+'</b>'+
       '<div class="hub-muted">'+esc(x.date)+' ・ '+esc(x.source||'')+'</div>'+
       (x.editKind&&x.editId?'<button type="button" class="hub-edit" data-hub-edit="'+esc(x.editKind)+'" data-hub-editid="'+esc(x.editId)+'">明細を編集</button>':'')+
       '</div><b class="hub-amt">'+yen(Math.abs(n(x.amount)))+'</b></div>';
   }
   if(chosen.items.length>150)markup+='<p class="hub-muted">先頭150件を表示。残りは下の一覧から確認してください。</p>';
   markup+='</div>';
 }
 return markup+'</div>';
}
function render(){
 if(!mount())return false;
 if(!month)month=initialMonth();
 const st=stateNow(),v=calculate(st),all=buckets(st,v),root=$('expenseHubV148');
 const total=all.reduce((sum,b)=>sum+b.amount,0);
 const target=lens==='cash'?v.outActual:v.spentActual;
 const benchmark=v.incomeActual>0?v.incomeActual:Math.max(0,n(st.settings?.salary));
 const settingOnly=v.incomeActual===0&&benchmark>0;
 const difference=benchmark-total,ratio=benchmark>0?total*100/benchmark:null;
 const p=ratioParts(all,benchmark);
 let html='<div class="hub-card"><div class="hub-period"><div class="hub-title">月次支出サマリー <small style="color:#72dbc6;font-size:11px">v148</small></div>'+
   '<div class="hub-toolbar"><button type="button" class="hub-arrow" id="hubPrevV148" aria-label="前月">‹</button>'+
   '<input id="hubMonthV148" aria-label="対象月" class="hub-month" type="month" value="'+esc(month)+'">'+
   '<button type="button" class="hub-arrow" id="hubNextV148" aria-label="翌月">›</button></div></div>'+
   '<div class="hub-muted" style="margin:12px 0 5px">集計サイクル</div><div class="hub-toolbar">'+
   '<button type="button" class="hub-toggle" data-hub-cycle="payday" aria-pressed="'+(cycle==='payday')+'">給与サイクル</button>'+
   '<button type="button" class="hub-toggle" data-hub-cycle="calendar" aria-pressed="'+(cycle==='calendar')+'">暦月（1日〜末日）</button></div>'+
   '<div class="hub-muted" style="margin:13px 0 5px">集計の見方</div><div class="hub-toolbar">'+
   '<button type="button" class="hub-toggle" data-hub-lens="cash" aria-pressed="'+(lens==='cash')+'">資金流出（返済・投資含む）</button>'+
   '<button type="button" class="hub-toggle" data-hub-lens="economic" aria-pressed="'+(lens==='economic')+'">消費・購入額</button></div>'+
   '<p class="hub-muted" style="margin:12px 0 0">'+esc(v.start)+' 〜 '+esc(v.end)+' / '+(cycle==='payday'?'給与日基準':'暦月')+'</p></div>';
 html+='<div class="hub-card"><div class="hub-muted">'+
    (settingOnly?'設定手取りを比較基準として表示（入金未照合）':'銀行等で確認できた入金との比較')+'</div>'+
   '<div class="hub-totals"><span>比較基準'+(settingOnly?'（設定値）':'（確認済み入金）')+'</span><b>'+yen(benchmark)+'</b></div>'+
   '<p class="hub-muted" style="margin:14px 0 3px">'+(lens==='cash'?'給与から出たお金の内訳':'何に使ったか（利用日基準）')+'。各行をタップして内訳を確認できます。</p>'+
   '<div class="hub-tablehead"><span>区分</span><span>金額</span></div>';
 for(const b of all)html+='<button type="button" class="hub-line" data-hub-bucket="'+b.id+'" aria-expanded="'+(openBucket===b.id)+'">'+
   '<span class="hub-rowtitle"><i class="hub-dot" style="background:'+b.color+'"></i>'+esc(b.label)+'</span>'+
   '<span class="hub-amt">'+yen(b.amount)+' <span style="color:#a3bed0">›</span></span></button>';
 html+='<div class="hub-totals"><span>把握済み合計</span><b>'+yen(total)+'</b></div>'+
   '<div class="hub-totals"><span>比較基準との差額</span><b style="color:'+(difference<0?'#ffa9a0':'#e9fdf7')+'">'+yen(difference)+'</b></div>'+
   '<div style="margin-top:20px;display:flex;justify-content:space-between;gap:10px;align-items:end">'+
   '<b>手取りに対する把握済み'+(lens==='cash'?'流出':'消費')+'</b>'+
   '<span class="hub-big">'+(ratio===null?'—':ratio.toFixed(1)+'%')+'</span></div>'+
   '<div class="hub-progress" role="img" aria-label="支出割合">'+p.html+'</div>'+
   '<div class="hub-legend">'+p.legend+'</div>'+
   (ratio!==null&&ratio>100?'<p class="hub-muted" style="color:#ffada2">比較基準を超えています。</p>':'')+
   (Math.abs(target-total)>1?'<p class="hub-muted" style="color:#ffa9a0">明細照合に差があります：'+yen(target-total)+'</p>':'')+
   (v.outPending?'<p class="hub-muted">未照合・今後の支払予定 '+yen(v.outPending)+' は実績合計に含めていません。</p>':'')+
   '<p class="hub-muted" style="margin-top:10px">'+(lens==='cash'?'カード購入は引落日に資金流出として計上。利用日基準の内訳は「消費・購入額」で確認できます。':
    'カード利用を購入日に計上。カード引落やローン元金、投資積立を消費に重ねません。')+'</p></div>';
 const selected=all.find(b=>b.id===openBucket);
 if(selected)html+=detailPanel(selected);
 const special=(v.economicRows||[]).filter(x=>rowDetails(x,st).scope==='SPECIAL').reduce((s,x)=>s+n(x.amount),0);
 html+='<div class="hub-note"><b>ⓘ 今月の支出について</b><div>'+
   (special?'特別費 '+yen(special)+' を含みます。一時的な出費を通常の毎月の生活費と混同しないでください。':'生活費と特別費は利用明細の内訳から確認できます。')+
   '</div><div style="margin-top:8px">'+
   (settingOnly?'給与入金が未照合です。設定手取りとの比較であり、銀行残高の確定値ではありません。':
    'この差額は期間中の収支の比較値で、銀行残高ではありません。')+'</div>'+
   v.quality.slice(0,3).map(q=>'<div style="margin-top:7px">'+esc(q)+'</div>').join('')+'</div>';
 root.innerHTML=html;
 bind(root);
 return true;
}
function bind(root){
 root.querySelectorAll('[data-hub-cycle]').forEach(btn=>btn.addEventListener('click',()=>{
   if(cycle===btn.dataset.hubCycle)return;
   cycle=btn.dataset.hubCycle;openBucket='';openCategory='';render();
 }));
 root.querySelectorAll('[data-hub-lens]').forEach(btn=>btn.addEventListener('click',()=>{
   if(lens===btn.dataset.hubLens)return;
   lens=btn.dataset.hubLens;openBucket='';openCategory='';render();
 }));
 const date=$('hubMonthV148');
 date?.addEventListener('change',()=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(date.value)){
   month=date.value;openBucket='';openCategory='';render();
 }});
 $('hubPrevV148')?.addEventListener('click',()=>{month=engine().addMonth(month,-1);openBucket='';openCategory='';render()});
 $('hubNextV148')?.addEventListener('click',()=>{month=engine().addMonth(month,1);openBucket='';openCategory='';render()});
 root.querySelectorAll('[data-hub-bucket]').forEach(btn=>btn.addEventListener('click',()=>{
   const k=btn.dataset.hubBucket;openBucket=openBucket===k?'':k;openCategory='';render();
   if(openBucket)$('expenseHubDrilldownV148')?.scrollIntoView?.({block:'nearest'});
 }));
 root.querySelectorAll('[data-hub-group]').forEach(btn=>btn.addEventListener('click',()=>{
   const k=btn.dataset.hubGroup;openCategory=openCategory===k?'':k;render();
   if(openCategory)$('expenseHubDrilldownV148')?.scrollIntoView?.({block:'nearest'});
 }));
 root.querySelectorAll('[data-hub-edit]').forEach(btn=>btn.addEventListener('click',()=>{
   if(typeof window.openSemanticTransactionEditorV108==='function')
     window.openSemanticTransactionEditorV108(btn.dataset.hubEdit,btn.dataset.hubEditid);
   else $('expenseLegacyDetailsV148').open=true;
 }));
}
function boot(){
 if(!engine()){setTimeout(boot,90);return}
 if(!month)month=initialMonth();
 mount();
 window.addEventListener('treasury:pagechange',e=>{if(e?.detail?.page==='expenses')render()});
 window.addEventListener('treasury:expenses-imported',()=>{if($('expenses')?.classList.contains('active'))render()});
 window.addEventListener('pageshow',()=>{if($('expenses')?.classList.contains('active'))render()});
 window.addEventListener('focus',()=>{if($('expenses')?.classList.contains('active'))render()});
 if($('expenses')?.classList.contains('active'))render();
}
window.householdExpenseUnifiedV148={mount,render,calculate,buckets,subgroups,rowDetails,getSelection:()=>({cycle,lens,month,openBucket,openCategory})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();