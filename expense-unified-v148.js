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
const nature=()=>window.householdExpenseNatureV152;
const localDate=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const labelByKind={living:'生活費',fixed:'固定費',cash:'現金支出',special:'特別費',debt:'ローン・リボ返済',card:'カード引落',investment:'NISA・iDeCoなど',cardPurchase:'カード利用'};
const tones={living:'#13c7b5',fixed:'#ff9f35',ideco:'#987efd',investment:'#67b9f4',special:'#eab86d',consumption:'#13c7b5'};
const isIdecoText=s=>/IDECO|ＩＤＥＣＯ|イデコ|国民年金基金連合会|コクミンネンキンキキン/.test(String(s||'').normalize('NFKC').toUpperCase());
const isFamilyAllocation=s=>/家族カード|家計カード|妻.*カード|生活費|家計費|現金配分|現金手渡|妻.*現金|妻.*送金|家族.*送金|仕送り|小遣い/.test(String(s||''));
const isSpecialAllocation=r=>r.kind==='special'||String(r.scope||'').toUpperCase()==='SPECIAL';
function masterNature(master){
 const approved=nature()?.masterNature(master);
 if(approved?.nature==='FIXED')return 'FIXED';
 return nature()?.classify({source:master,category:master.category,subcategory:master.subcategory,
   kind:'masterReference',label:String(master.name||''),semantic:semantics()})?.nature||'REVIEW';
}
function referenceFor(st,viewMonth,seasonal){
 const result=[],keys=new Set(),mm=String(viewMonth||'').slice(5,7);
 for(const x of st?.masters?.fixedExpenses||[]){
   if(x?.active===false||x?.forecastEnabled===false)continue;
   const name=String(x.name||'').trim(),amount=Math.abs(n(x.amount));
   if(!name||!amount||isFamilyAllocation(name)||isIdecoText(name)||/NISA|証券|投資|積立/.test(name))continue;
   if(masterNature(x)!=='FIXED')continue;
   const mode=String(x.cadence||'MONTHLY').toUpperCase();
   const isSeasonal=mode==='ANNUAL'||/ボーナス|賞与|SUMMER|WINTER|夏|冬/.test(name);
   if(isSeasonal!==seasonal)continue;
   if(/洗濯機|電動自転車|タイヤ購入|引越|冷蔵庫/.test(name))continue;
   if(mode==='SEMI_FIXED'&&!(x.activeMonths||x.months||[]).map(v=>String(v).padStart(2,'0')).includes(mm))continue;
   // A bonus repayment with a legacy MONTHLY cadence must not repeat monthly.
   // Show it only if the master explicitly identifies the payment month.
   if(isSeasonal&&mode==='MONTHLY'){
     const due=n(x.dueMonth||x.paymentMonth||x.annualMonth);
     if(!due||String(due).padStart(2,'0')!==mm)continue;
   }
   if(mode==='ANNUAL'){
     const due=n(x.dueMonth||x.paymentMonth||x.annualMonth||x.month);
     if(!due||String(due).padStart(2,'0')!==mm)continue;
   }else if(!['MONTHLY','SEMI_FIXED'].includes(mode))continue;
   const key=String(x.id||name);if(keys.has(key))continue;keys.add(key);
   result.push({name,amount,route:String(x.paymentRoute||x.payment_route||'DIRECT').toUpperCase()});
 }
 return {items:result,total:result.reduce((sum,x)=>sum+x.amount,0)};
}
function fixedReference(st,viewMonth){return referenceFor(st,viewMonth,false)}
function seasonalReference(st,viewMonth){return referenceFor(st,viewMonth,true)}
let cycle='payday',lens='cash',month='',openBucket='',openCategory='',groups=[],annualOpen=false;
function budgetReference(st,viewMonth){
 const fixed=fixedReference(st,viewMonth);
 let living=0,ideco=0,investment=0;
 const ids=new Set();
 for(const x of st?.masters?.fixedExpenses||[]){
   if(x.active===false||x.forecastEnabled===false)continue;
   const name=String(x.name||''),monthNo=String(viewMonth||'').slice(5,7);
   const amount=Math.abs(n(x.amount)),mode=String(x.cadence||'MONTHLY').toUpperCase();
   if(!amount||!name||!['MONTHLY','SEMI_FIXED'].includes(mode))continue;
   if(mode==='SEMI_FIXED'&&!(x.activeMonths||x.months||[]).map(v=>String(v).padStart(2,'0')).includes(monthNo))continue;
   const key=String(x.id||name);if(ids.has(key))continue;ids.add(key);
   if(isFamilyAllocation(name))living+=amount;
   else if(isIdecoText(name))ideco+=amount;
   else if(/NISA|証券|投資|積立/.test(name))investment+=amount;
 }
 return {living,fixed:fixed.total,ideco,investment,total:living+fixed.total+ideco+investment};
}
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
 const sem=semantics();
 const category=sem?.normalizeCategoryValue?.(source?.category)||
   sem?.inferCategory?.(row.label,source?.category)||'OTHER';
 const subcategory=sem?.inferSubcategory?.(category,row.label,source?.subcategory)||'OTHER';
 const rule=window.householdExpenseNatureV152?.classify({
   category,subcategory,source,kind:row.kind,label:row.label,semantic:sem
 })||{nature:'REVIEW',key:''};
 return {...row,category,subcategory,costNature:rule.nature,
   costNatureKey:rule.key,costNatureReason:rule.reason,editKind,editId};
}
function buckets(st,v,mode=lens){
 const actual=(mode==='cash'?(v.rows||[]).filter(r=>r.status==='confirmed'&&r.amount<0):(v.economicRows||[]))
   .map(x=>rowDetails(x,st));
 const expense=actual.filter(r=>!['investment','debt','card'].includes(r.kind));
 const specs=[
  {id:'fixed',label:'通常費（固定費・ローン）',color:'#ff9f35',
   rows:[...expense.filter(r=>r.costNature==='FIXED'),...(mode==='cash'?actual.filter(r=>r.kind==='debt'):[])]},
  {id:'variable',label:'通常費（変動費）',color:'#13c7b5',rows:expense.filter(r=>r.costNature==='VARIABLE')},
  {id:'special',label:'特別費',color:'#eab86d',rows:expense.filter(r=>r.costNature==='SPECIAL')},
  {id:'review',label:'要確認（明細ごとに判断）',color:'#b4a1a1',rows:expense.filter(r=>r.costNature==='REVIEW')}
 ];
 if(mode==='cash')specs.splice(3,0,
   {id:'cardUnallocated',label:'カード引落（用途未配分）',color:'#5899b3',rows:actual.filter(r=>r.kind==='card')},
   {id:'ideco',label:'iDeCo（固定拠出）',color:'#987efd',
      rows:actual.filter(r=>r.kind==='investment'&&isIdecoText(r.label))},
   {id:'investment',label:'その他の投資・積立',color:'#67b9f4',
      rows:actual.filter(r=>r.kind==='investment'&&!isIdecoText(r.label))}
 );
 return specs.map(b=>({id:b.id,label:b.label,color:b.color,items:b.rows,
    amount:b.rows.reduce((sum,x)=>sum+Math.abs(n(x.amount)),0)}));
}
function subgroups(bucket,mode=lens){
 const map=new Map();
 for(const x of bucket.items){
   let key,label;
   if(x.kind==='debt'){
     const name=String(x.label||'');
     key='DEBT|'+(/プラド|PRADO/i.test(name)?'PRADO':/ラパン|LAPIN/i.test(name)?'LAPIN':/リボ/.test(name)?'REVOLVING':'OTHER');
     label=key.endsWith('PRADO')?'プラドローン返済':key.endsWith('LAPIN')?'ラパンローン返済':key.endsWith('REVOLVING')?'リボ返済':'ローン返済（元金等）';
   }else if(bucket.id==='cardUnallocated'){
     key='CARD|'+x.source;label=x.source||'カード引落';
   }else if(bucket.id==='ideco'){
     key='INVESTMENT|IDECO';label='iDeCo';
   }else if(bucket.id==='investment'){
     key='INVESTMENT|OTHER';label='NISA・証券積立等';
   }else{
     const defs=semantics()?.CATEGORY_DEFS||{};
     const categoryName=defs[x.category]?.label||
       window.householdExpenseAnalyticsV106?.categoryLabel?.(x.category)||'その他';
     const subLabel=window.householdExpenseNatureV152?.subcategoryLabels?.[x.category+'.'+x.subcategory]||
       x.subcategory||'その他';
     key=x.costNatureKey||x.category+'.'+x.subcategory;
     label=categoryName+' / '+subLabel;
     if(bucket.id==='review')label+='（個別判断）';
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
 if(bucket.id==='fixed'&&lens==='cash'){
   const reference=fixedReference(stateNow(),month),seasonal=seasonalReference(stateNow(),month);
   markup+='<details class="hub-fixed-ref" style="margin:12px 0;padding:12px;border:1px solid #536070;border-radius:12px">'+
     '<summary style="cursor:pointer;font-weight:700">固定費マスターの月額内訳（参考）'+yen(reference.total)+'</summary>'+
     '<p class="hub-muted">設定済みの固定費・通常ローンの月額予算です。上の実際の資金流出には加算していません。カード払い分も予算の参考表示のみです。</p>'+
     (reference.items.length?reference.items.map(x=>'<div class="hub-detailrow"><span>'+esc(x.name)+
       (x.route==='CARD'?' <span class="hub-muted">（カード払い）</span>':'')+'</span><b>'+yen(x.amount)+'</b></div>').join(''):
       '<p class="hub-muted">毎月固定のマスター登録はありません。</p>')+
     (seasonal.items.length?'<p class="hub-muted">この月のボーナス・年次固定返済（通常月の基準予算から除外）</p>'+
       seasonal.items.map(x=>'<div class="hub-detailrow"><span>'+esc(x.name)+'</span><b>'+yen(x.amount)+'</b></div>').join(''):'')+'</details>';
 }
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
 let html='<div class="hub-card"><div class="hub-period"><div class="hub-title">月次支出サマリー <small style="color:#72dbc6;font-size:11px">v152</small></div>'+
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
   '<p class="hub-muted" style="margin:14px 0 3px">'+(lens==='cash'?'通常生活費・固定費・積立に分けた実際の資金流出':'通常生活費と特別費の利用日基準の消費')+'。各行をタップして内訳を確認できます。</p>'+
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
 const budget=budgetReference(st,month);
 if(lens==='cash'){
   html+='<details class="hub-card" id="hubBudgetV151"><summary style="cursor:pointer;font-size:16px;font-weight:750">'+
     '毎月の基本予算（マスターから・参考）'+yen(budget.total)+'</summary>'+
     '<p class="hub-muted" style="margin:10px 0">登録済みの毎月予算です。家族カード・現金配分は通常生活費としてまとめます。実際に使用した金額ではなく、上の把握済み支出には加算しません。</p>'+
     [['通常生活費（家族カード・現金等）',budget.living],['固定費・通常ローン',budget.fixed],
      ['iDeCo',budget.ideco],['その他の積立',budget.investment]]
       .map(x=>'<div class="hub-totals" style="font-size:13px"><span>'+x[0]+'</span><b>'+yen(x[1])+'</b></div>').join('')+
     (budget.total===0?'<p class="hub-muted">月額マスターの登録額がないため、実績から予算を推測していません。</p>':'')+
     '<p class="hub-muted">固定費の各項目は上の「固定費・通常ローン」をタップして表示される参考欄で確認できます。</p></details>';
 }

 const special=(v.economicRows||[]).filter(x=>rowDetails(x,st).scope==='SPECIAL').reduce((s,x)=>s+n(x.amount),0);
 html+='<div class="hub-note"><b>ⓘ 今月の支出について</b><div>'+
   (special?'特別費 '+yen(special)+' を含みます。一時的な出費を通常の毎月の生活費と混同しないでください。':'生活費と特別費は利用明細の内訳から確認できます。')+
   '</div><div style="margin-top:8px">'+
   (settingOnly?'給与入金が未照合です。設定手取りとの比較であり、銀行残高の確定値ではありません。':
    'この差額は期間中の収支の比較値で、銀行残高ではありません。')+'</div>'+
   v.quality.slice(0,3).map(q=>'<div style="margin-top:7px">'+esc(q)+'</div>').join('')+'</div>';
 const annual=engine().annual(st,Number(month.slice(0,4)),cycle,localDate(),{
   cardEstimates:cardEstimates(),revolvingEstimates:revolvingEstimates()
 });
 const annualDebt=annual.groups.find(g=>g.kind==='debt')?.actual||0;
 const annualInvestment=annual.groups.find(g=>g.kind==='investment')?.actual||0;
 html+='<details class="hub-card" id="hubAnnualV148"'+(annualOpen?' open':'')+'>'+
   '<summary style="cursor:pointer;font-weight:750;font-size:16px">年間の収支を見る（'+esc(annual.year)+'年）</summary>'+
   '<div class="hub-muted" style="margin:10px 0">同じ'+(cycle==='payday'?'給与サイクル':'暦月')+'の12期間で集計。実績と未照合の予定を分けて表示します。</div>'+
   [['年間の給与実入金',annual.salaryActual],['年間の賞与実入金',annual.bonusActual],
    ['年間の実入金合計',annual.incomeActual],['年間の資金流出',annual.outActual],
    ['うちローン・リボ返済',annualDebt],['うち投資積立',annualInvestment],
    ['年間の消費・購入額',annual.spentActual],['年間の差額（実績のみ）',annual.remainderActual],
    ['未照合の支払予定',annual.outPending],['未入金の予定',annual.incomePending]]
     .map(x=>'<div class="hub-totals" style="font-size:13px"><span>'+x[0]+'</span><b>'+yen(x[1])+'</b></div>').join('')+
   '<p class="hub-muted">銀行明細のない期間：'+annual.missingBankPeriods+
   '。予定は実績残高に足しません。給与サイクルの12月分は翌年1月の次回給与日前日まで含みます。</p></details>';
 root.innerHTML=html;
 bind(root);
 return true;
}
function bind(root){
 const annually=$('hubAnnualV148');if(annually)annually.addEventListener('toggle',()=>{annualOpen=annually.open});
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
window.householdExpenseUnifiedV148={mount,render,calculate,buckets,subgroups,rowDetails,fixedReference,seasonalReference,budgetReference,masterNature,getSelection:()=>({cycle,lens,month,openBucket,openCategory})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();