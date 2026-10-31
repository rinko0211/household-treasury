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
   if(String(x.expense_scope||'').toUpperCase()==='DEBT'||String(x.economic_type||'').toUpperCase()==='DEBT_PRINCIPAL')continue;
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
function loanReference(st,viewMonth){
 const items=[],seen=new Set();
 for(const x of st?.masters?.fixedExpenses||[]){
  const eco=String(x.economic_type||'').toUpperCase(),scope=String(x.expense_scope||'').toUpperCase();
  if(x.active===false||x.forecastEnabled===false||
     (eco!=='DEBT_PRINCIPAL'&&scope!=='DEBT'))continue;
  const cadence=String(x.cadence||'MONTHLY').toUpperCase();
  if(!['MONTHLY','SEMI_FIXED'].includes(cadence))continue;
  if(cadence==='SEMI_FIXED'&&!(x.activeMonths||x.months||[]).map(v=>String(v).padStart(2,'0')).includes(String(viewMonth||'').slice(5,7)))continue;
  const name=String(x.name||'').trim(),amount=Math.abs(n(x.amount)),key=String(x.id||name);
  if(!amount||!name||seen.has(key))continue;seen.add(key);items.push({name,amount,route:'DIRECT'});
 }
 return {items,total:items.reduce((a,x)=>a+x.amount,0)};
}
function fixedReference(st,viewMonth){return referenceFor(st,viewMonth,false)}
function seasonalReference(st,viewMonth){return referenceFor(st,viewMonth,true)}
let cycle='payday',lens='economic',month='',openBucket='',openCategory='',openSubcategory='',groups=[],annualOpen=false,reviewOpen=false;
function budgetReference(st,viewMonth){
 const fixed=fixedReference(st,viewMonth),loans=loanReference(st,viewMonth);
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
 return {living,fixed:fixed.total,loans:loans.total,ideco,investment,total:living+fixed.total+loans.total+ideco+investment};
}
function initialMonth(){
 const now=localDate(),m=now.slice(0,7);
 if(cycle==='calendar'||!engine())return m;
 const st=stateNow(),ledger=window.householdUsageLedgerV157||engine();
 // The active payroll period takes precedence over old audited cycles.
 // When periods share a boundary day, pick the period with later start.
 const periods=[engine().addMonth(m,-1),m,engine().addMonth(m,1)]
   .map(key=>{try{return ledger.period(st,key,'payday')}catch{return null}})
   .filter(p=>p&&p.start<=now&&now<=p.end)
   .sort((a,b)=>b.start.localeCompare(a.start));
 return periods[0]?.month||m;
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
function usageBuckets(usage,st,includePersonal=false){
 const privateSummary=window.householdPersonalLedgerV186?.presentation?.(st,usage);
 // Existing sources matching personal reports cannot be counted in two
 // buckets, including the variable-only family snapshot.
 const excluded=privateSummary?.matched||new Set();
 const enriched=usage.usageRows.filter(row=>!excluded.has(row.identity))
   .map(row=>rowDetails(row,st));
 const normal=enriched.filter(x=>['cash','purchase','bank'].includes(x.kind)&&x.spendingClass!=='SPECIAL');
 const groups=[
  {id:'fixed',label:'固定費・ローン',color:'#42c5d0',items:[...normal.filter(x=>x.costBucket==='FIXED'),...usage.byKind.debt]},
  {id:'variable',label:'通常費（変動費）',color:'#13c7b5',items:normal.filter(x=>x.costBucket==='VARIABLE')},
  {id:'undetermined',label:'通常費（固定・変動未確定）',color:'#a2acb9',items:normal.filter(x=>x.costBucket!=='FIXED'&&x.costBucket!=='VARIABLE')},
  {id:'special',label:'特別費',color:'#eab86d',
    items:enriched.filter(x=>['cash','purchase','bank'].includes(x.kind)&&x.spendingClass==='SPECIAL')},
  ...(includePersonal?[{id:'personal',label:'個人費',color:'#dc8bfa',
     items:privateSummary?.items||[]}]:[]),
  {id:'ideco',label:'iDeCo（固定拠出・投資）',color:'#987efd',items:usage.byKind.ideco},
  {id:'investment',label:'その他投資',color:'#67b9f4',items:usage.byKind.investment}
 ];
 return groups.map(g=>({...g,amount:g.items.reduce((a,x)=>a+n(x.amount),0)}));
}
// Sort displayed transactions by their purchase/usage date, not billing
// month, CSV import order, or amount. Keep undated provisional entries last.
function detailUsageDay(row){
 const d=String(row?.date||'').trim();
 const m=d.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[T\s])/);
 return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):'';
}
function orderDetailsByUsageDay(items){
 return [...(items||[])].sort((a,b)=>detailUsageDay(b).localeCompare(detailUsageDay(a)));
}
function subgroups(bucket,mode=lens){
 const map=new Map();
 for(const x of bucket.items){
   let key,label;
   if(x.kind==='debt'){
     const name=String(x.label||'');
     key='DEBT|'+(/プラド|PRADO/i.test(name)?'PRADO':/ラパン|LAPIN/i.test(name)?'LAPIN':/リボ/.test(name)?'REVOLVING':'OTHER');
     label=key.endsWith('PRADO')?'プラドローン返済':key.endsWith('LAPIN')?'ラパンローン返済':key.endsWith('REVOLVING')?'リボ返済':'ローン返済（元金等）';
   }else if(bucket.id==='cardSettlement'){
     key='CARD|'+x.label;label=x.label||'カード精算';
   }else if(['transfer','expense','unclassified'].includes(bucket.id)){
     key='BANK|'+x.label;label=x.label||'銀行取引';
   }else if(bucket.id==='personal'){
   key='PERSONAL|'+(x.owner||'self');label='個人費明細';
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
 for(const group of map.values())group.items=orderDetailsByUsageDay(group.items);
 return [...map.values()].sort((a,b)=>b.amount-a.amount||a.label.localeCompare(b.label,'ja'));
}
function categoryGroups(bucket,mode=lens){
 const map=new Map(),defs=semantics()?.CATEGORY_DEFS||{};
 for(const x of bucket.items){
   // Economic expenses are grouped by CATEGORY first, not by subcategory.
   // Loans/investments/bank-flow use an "内訳" category without changing
   // any of their accounting classifications or recorded amounts.
   const economicExpense=mode==='economic'&&['cash','purchase','bank'].includes(x.kind);
   const debtInFixed=mode==='economic'&&bucket.id==='fixed'&&x.kind==='debt';
   const isPersonal=bucket.id==='personal'&&x.kind==='personal';
   const key=isPersonal?(x.owner==='wife'?'PERSONAL_WIFE':'PERSONAL_SELF'):
     debtInFixed?'DEBT_PAYMENTS':economicExpense?String(x.category||'OTHER'):'TRANSACTION_DETAILS';
   const label=isPersonal?x.personalCategoryLabel:
     debtInFixed?'ローン・借入返済（消費外）':economicExpense?
     (defs[key]?.label||window.householdExpenseAnalyticsV106?.categoryLabel?.(key)||'その他'):'取引明細';
   let group=map.get(key);
   if(!group){group={key,label,amount:0,items:[],subcategories:[]};map.set(key,group)}
   group.items.push(x);
   group.amount+=Math.abs(n(x.amount));
 }
 for(const category of map.values()){
   category.items=orderDetailsByUsageDay(category.items);
   const subs=subgroups({...bucket,items:category.items},mode);
   category.subcategories=subs.map(g=>({
     ...g,
     // The category label already appears in the middle tier.
     label:g.label.startsWith(category.label+' / ')?
       g.label.slice(category.label.length+3):g.label
   }));
 }
 return [...map.values()].sort((a,b)=>b.amount-a.amount||a.label.localeCompare(b.label,'ja'));
}
function mount(){
 const page=$('expenses');if(!page||!engine())return false;
 let root=$('expenseHubV148');
 if(!root){
   root=document.createElement('div');root.id='expenseHubV148';
   const legacy=$('expenseTabRootV129');
   if(legacy)page.insertBefore(root,legacy);else page.prepend(root);
 }
 // Legacy v130 display is retired. The same canonical transactions remain
 // editable using the v108 semantic editor in the inline details below.
 const legacy=$('expenseTabRootV129');
 if(legacy)legacy.remove();
 const placeholder=$('expenseCurrentV169');if(placeholder)placeholder.remove();
 const oldWrapper=$('expenseLegacyDetailsV148');
 if(oldWrapper)oldWrapper.remove();
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
function reviewReasons(row,st){
  const [kind,idx]=String(row.identity||'').split(':');
  const i=Number(idx);
  const source=Number.isInteger(i)&&i>=0?
    (kind==='cash'?st.cashExpenses?.[i]:kind==='purchase'?st.purchaseEvents?.[i]:kind==='bank'?st.cashTransactions?.[i]:null):null;
  const reasons=[],status=String(source?.review_status||'').toUpperCase();
  if(['NEEDS_REVIEW','PENDING','OPEN','UNREVIEWED','REVIEW_REQUIRED'].includes(status))
    reasons.push('取込時の確認待ち');
  if(source?.potential_prepaid_topup===true)reasons.push('チャージ・資金移動の疑い');
  if(row.costNature==='REVIEW'||row.costBucket==='UNDETERMINED')reasons.push('固定・変動の分類未確定');
  if(row.costNature==='SPECIAL'&&row.spendingClass!=='SPECIAL')
    reasons.push('通常費・特別費の判定相違');
  return reasons.length?reasons:['分類の再確認'];
}
function detailPanel(bucket){
 groups=categoryGroups(bucket);
 if(openCategory&&!groups.some(g=>g.key===openCategory)){openCategory='';openSubcategory=''}
 const chosen=groups.find(g=>g.key===openCategory);
 if(chosen&&openSubcategory&&!chosen.subcategories.some(g=>g.key===openSubcategory))openSubcategory='';
 let markup='<div class="hub-drilldown" id="expenseHubDrilldownV148">'+
   '<div class="hub-drilldown-hint">'+bucket.items.length+'件の明細 · 中カテゴリ → 小カテゴリ → 個別明細</div>';
 if(!groups.length)markup+='<div class="hub-muted" style="padding:12px 0">この期間の明細はありません。</div>';
 for(const c of groups){
   const expanded=openCategory===c.key;
   markup+='<button type="button" class="hub-category" data-hub-category="'+esc(c.key)+'" aria-expanded="'+expanded+'">'+
     '<span class="hub-category-title">'+esc(c.label)+' <span class="hub-count">('+c.items.length+'件)</span></span>'+
     '<span class="hub-amt">'+yen(c.amount)+' <span class="hub-chevron" aria-hidden="true">'+(expanded?'⌄':'›')+'</span></span></button>';
   if(!expanded)continue;
   markup+='<div class="hub-category-body" data-hub-category-details="'+esc(c.key)+'">';
   for(const g of c.subcategories){
     const subExpanded=openSubcategory===g.key;
     markup+='<button type="button" class="hub-subcategory" data-hub-subcategory="'+esc(g.key)+'" aria-expanded="'+subExpanded+'">'+
       '<span>'+esc(g.label)+' <span class="hub-count">('+g.items.length+'件)</span></span>'+
       '<span class="hub-amt">'+yen(g.amount)+' <span class="hub-chevron" aria-hidden="true">'+(subExpanded?'⌄':'›')+'</span></span></button>';
     if(!subExpanded)continue;
     markup+='<div class="hub-group-details" data-hub-details="'+esc(g.key)+'">';
     for(const x of g.items.slice(0,150)){
       markup+='<div class="hub-detailrow"><div class="hub-merchant"><b>'+esc(x.label)+'</b>'+
         '<div class="hub-muted">'+esc(x.date||'日付未確定')+' ・ '+esc(x.source||'')+
           (x.provisional?' ・ 仮記帳':'')+(x.needsReview?' ・ 要確認':'')+'</div>'+
         (x.editKind&&x.editId?'<button type="button" class="hub-edit" data-hub-edit="'+esc(x.editKind)+'" data-hub-editid="'+esc(x.editId)+'">明細を編集</button>':'')+
         '</div><b class="hub-amt">'+yen(Math.abs(n(x.amount)))+'</b></div>';
     }
     if(g.items.length>150)markup+='<p class="hub-muted">先頭150件を表示。残りは対象期間を絞るか明細タブで確認してください。</p>';
     markup+='</div>';
   }
   markup+='</div>';
 }
 if(bucket.id==='fixed'&&lens==='economic'){
   const reference=fixedReference(stateNow(),month),loans=loanReference(stateNow(),month),seasonal=seasonalReference(stateNow(),month);
   markup+='<details class="hub-fixed-ref">'+
     '<summary>固定支払マスターの月額内訳（ローン含む・参考） '+yen(reference.total+loans.total)+'</summary>'+
     '<p class="hub-muted">内訳：固定の生活費 '+yen(reference.total)+'、ローン返済 '+yen(loans.total)+'。ローン元金は消費・購入額に加算しません。</p>'+
     (reference.items.length?reference.items.map(x=>'<div class="hub-detailrow"><span>'+esc(x.name)+
       (x.route==='CARD'?' <span class="hub-muted">（カード払い）</span>':'')+'</span><b>'+yen(x.amount)+'</b></div>').join(''):
       '<p class="hub-muted">登録された毎月固定の項目はありません。</p>')+
     (loans.items.length?'<div class="hub-muted" style="margin-top:8px">ローン返済（固定支払・非消費）</div>'+loans.items.map(x=>'<div class="hub-detailrow"><span>'+esc(x.name)+'</span><b>'+yen(x.amount)+'</b></div>').join(''):'')+
     (seasonal.items.length?'<p class="hub-muted">この月の年次・特別固定支出（通常予算から除外）</p>'+
       seasonal.items.map(x=>'<div class="hub-detailrow"><span>'+esc(x.name)+'</span><b>'+yen(x.amount)+'</b></div>').join(''):'')+'</details>';
 }
 return markup+'</div>';
}
function render(){
 if(!mount())return false;
 const priorReview=$('hubReviewV157');if(priorReview)reviewOpen=!!priorReview.open;
 if(!month)month=initialMonth();
 let st=stateNow();
 st=window.householdPersonalLedgerV186?.ensure?.(st)||st;
 const ul=window.householdUsageLedgerV157;
 if(!ul){$('expenseHubV148').innerHTML='<div class="hub-note">利用日基準の集計処理を読み込み中です。</div>';return false}
 const usage=ul.calculate(st,month,cycle);
 const bank=ul.bankFlow(st,month,cycle);
 const economic=lens==='economic',p=economic?usage:bank;
 const personal=window.householdPersonalLedgerV186?.presentation?.(st,usage);
 const all=economic?usageBuckets(usage,st,true):bank.buckets;
 // Existing matched canonical purchases already contributed to funds.
 // An owner-only personal expense adds only its unmatched portion.
 const privateAdjustment=(personal?.amount||0)-(personal?.matchedConsumption||0);
 const consumption=usage.consumption+privateAdjustment;
 const ordinary=usage.ordinary-(personal?.matchedOrdinary||0);
 const total=economic?usage.funds+privateAdjustment:bank.total;
 const income=usage.income;
 const difference=income-total,ratio=income>0?total*100/income:null;
 // When income has not been imported for the current cycle, keep the
 // category composition bar useful by using total spending as its basis.
 const chartBaseline=economic&&income<=0?total:income;
 const bars=ratioParts(all,chartBaseline);
 const root=$('expenseHubV148');
 let html='<div class="hub-card"><div class="hub-period"><div class="hub-title">月次支出サマリー</div>'+
 '<div class="hub-toolbar"><button type="button" class="hub-arrow" id="hubPrevV148" aria-label="前月">‹</button>'+
 '<input id="hubMonthV148" aria-label="対象月" class="hub-month" type="month" value="'+esc(month)+'">'+
 '<button type="button" class="hub-arrow" id="hubNextV148" aria-label="翌月">›</button></div></div>'+
 '<div class="hub-muted" style="margin:12px 0 5px">集計サイクル</div><div class="hub-toolbar">'+
 '<button type="button" class="hub-toggle" data-hub-cycle="payday" aria-pressed="'+(cycle==='payday')+'">給与サイクル</button>'+
 '<button type="button" class="hub-toggle" data-hub-cycle="calendar" aria-pressed="'+(cycle==='calendar')+'">暦月（1日〜末日）</button></div>'+
 '<div class="hub-muted" style="margin:13px 0 5px">集計の見方（初期表示は利用日基準）</div><div class="hub-toolbar">'+
 '<button type="button" class="hub-toggle" data-hub-lens="economic" aria-pressed="'+economic+'">消費・購入額（利用日ベース）</button>'+
 '<button type="button" class="hub-toggle" data-hub-lens="cash" aria-pressed="'+(!economic)+'">口座資金流出（引落日ベース）</button></div>'+
 '<p class="hub-muted" style="margin:12px 0 0">'+esc(p.start)+' 〜 '+esc(p.end)+' / '+
 (cycle==='payday'?'給与サイクル':'暦月')+
 (usage.auditCycle&&economic?' ・ 監査サイクル明示帰属を適用':'')+'</p></div>';
 html+='<div class="hub-card">'+
 '<div class="hub-muted">'+(economic?'実際に購入・使用した金額と、消費ではないローン・投資拠出を分離':'銀行口座から実際に出金された金額。消費・生活費の統計ではありません')+'</div>'+
 '<div class="hub-totals"><span>確認済み収入</span><b>'+yen(income)+'</b></div>'+
 '<div class="hub-tablehead"><span>'+ (economic?'消費・資金用途':'銀行引落・資金移動') +'</span><span>金額</span></div>';
 if(economic)html+='<div class="hub-totals"><span>通常の消費・生活費（ローンを除く）</span><b>'+yen(ordinary)+'</b></div>';
 for(const b of all){
   const expanded=openBucket===b.id;
   html+='<button type="button" class="hub-line" data-hub-bucket="'+esc(b.id)+'" aria-expanded="'+expanded+'">'+
     '<span class="hub-rowtitle"><i class="hub-dot" style="background:'+b.color+'"></i>'+esc(b.label)+'</span>'+
     '<span class="hub-amt">'+yen(b.amount)+' <span aria-hidden="true" style="color:#a3bed0">'+(expanded?'⌄':'›')+'</span></span></button>';
   if(expanded)html+=detailPanel(b);
 }
 if(economic)html+='<div class="hub-totals"><span>消費・購入額（個人費を含む）</span><b>'+yen(consumption)+'</b></div>';
 html+='<div class="hub-totals"><span>'+(economic?'支出・資金用途合計':'口座資金流出合計（消費とは別）')+'</span><b>'+yen(total)+'</b></div>'+
 '<div class="hub-totals"><span>'+(economic?'収支':'確認済み入金との差（口座移動を含む）')+'</span>'+
 '<b style="color:'+(difference<0?'#ffa9a0':'#e9fdf7')+'">'+(difference>0?'+':'')+yen(difference)+'</b></div>'+
 '<div style="margin-top:20px;display:flex;justify-content:space-between;gap:10px;align-items:end"><b>'+
 (economic?(income>0?'確認済み収入に対する資金用途':'支出構成比（収入未計上のため総支出を100%）'):
   '確認済み入金に対する口座流出（消費率ではない）')+
 '</b><span class="hub-big">'+(ratio===null?'—':ratio.toFixed(1)+'%')+'</span></div>'+
 '<div class="hub-progress" role="img" aria-label="'+(economic?'資金用途構成':'銀行資金流出構成')+'">'+bars.html+'</div>'+
 '<div class="hub-legend">'+bars.legend+'</div>';
 if(economic){
   const noDate=usage.byKind.cash.filter(x=>!x.date);
   const provisional=usage.byKind.cash.filter(x=>x.provisional&&x.date);
   const sum=x=>x.reduce((v,r)=>v+r.amount,0);
   html+='<p class="hub-muted" style="margin-top:12px">現金・商品券等 '+yen(usage.subtotals.cashExpenses)+
     '／カード利用 '+yen(usage.subtotals.purchaseEvents)+'／口座直接支出 '+yen(usage.subtotals.directBank)+'</p>';
   if(noDate.length||provisional.length)html+='<p class="hub-muted">監査サイクル帰属：日付未確定 '+
     yen(sum(noDate))+'（'+noDate.length+'件）、仮記帳 '+yen(sum(provisional))+'（'+provisional.length+'件）。購入日は確定していません。</p>';
   if(usage.unresolvedBankFee)html+='<p class="hub-muted" style="color:#ffbe6b">未解決銀行手数料 '+
     yen(usage.unresolvedBankFee)+'は取引記録を保持し、監査認定収支との差額として別表示。含めた場合の消費額は'+
     yen(usage.consumption+usage.unresolvedBankFee)+'です。</p>';
   html+='<p class="hub-muted">カード引落は購入日ベースの支出に加算しません。元金返済とiDeCoは消費には含まず資金用途にのみ含めます。</p>';
 }else{
   html+='<p class="hub-muted" style="margin-top:12px">ATM出金・口座間送金・カード引落は、銀行残高管理用に表示しています。上の金額は消費・生活費に加算しません。</p>';
 }
 html+='</div>';
 if(economic){
   html+='<details class="hub-note" id="hubReviewV157"'+(reviewOpen?' open':'')+'><summary style="cursor:pointer;font-weight:700">'+
     '要確認：'+usage.reviewCount+'件（支出への追加加算なし）</summary>'+
     '<p class="hub-muted">これらは支出に計上済みであり、別途加算しません。理由を確認し、下の「この明細を確認・編集」から確定してください。保存後も残る場合は固定・変動の個別指定やチャージ判定をご確認ください。</p>'+
     orderDetailsByUsageDay(usage.flags).slice(0,100).map(r=>{
       const detail=rowDetails(r,st),reasons=reviewReasons(r,st);
       return '<div class="hub-review-item" data-hub-review-item="1">'+
         '<div class="hub-detailrow"><div class="hub-merchant">'+
         '<b>'+esc(r.label)+'</b>'+
         '<div class="hub-muted">'+esc(r.date||'日付未確定')+' ・ '+esc(r.source||'')+
         ' ・ '+esc(r.spendingClass==='SPECIAL'?'特別費':'通常費')+'</div>'+
         '<div class="hub-review-reason">'+reasons.map(reason=>'<span>'+esc(reason)+'</span>').join('')+'</div>'+
         (detail.editKind&&detail.editId?
           '<button type="button" class="hub-edit" data-hub-edit="'+esc(detail.editKind)+
             '" data-hub-editid="'+esc(detail.editId)+'">この明細を確認・編集</button>':
           '<span class="hub-muted">この明細の編集元を特定できませんでした</span>')+
         '</div><b class="hub-amt">'+yen(r.amount)+'</b></div></div>';
     }).join('')+'</details>';
 }
 const budget=budgetReference(st,month);
 html+='<details class="hub-card" id="hubBudgetV151"><summary style="cursor:pointer;font-size:16px;font-weight:750">'+
   '毎月の基本予算（参考）'+yen(budget.total)+'</summary>'+
   '<p class="hub-muted">マスターに登録された計画値です。実際の消費・資金用途へ加算しません。</p>'+
   [['通常生活費（家族カード・現金等）',budget.living],['固定費・ローン',budget.fixed+budget.loans],
    ['iDeCo',budget.ideco],['その他積立',budget.investment]].map(x=>
     '<div class="hub-totals"><span>'+x[0]+'</span><b>'+yen(x[1])+'</b></div>').join('')+
   '<details class="hub-fixed-ref"><summary style="cursor:pointer">固定支払マスター（ローン含む）の内訳（参考）</summary>'+
     fixedReference(st,month).items.concat(loanReference(st,month).items).map(x=>'<div class="hub-detailrow"><span>'+esc(x.name)+(x.route==='CARD'?'（カード払い）':'')+'</span><b>'+yen(x.amount)+'</b></div>').join('')+
   '</details></details>';
 const annual=engine().annual(st,Number(month.slice(0,4)),cycle,localDate(),{
   cardEstimates:cardEstimates(),revolvingEstimates:revolvingEstimates()
 });
 html+='<details class="hub-card" id="hubAnnualV148"'+(annualOpen?' open':'')+'>'+
   '<summary style="cursor:pointer;font-weight:750">年間の収支を見る（'+esc(annual.year)+'年）</summary>'+
   '<p class="hub-muted">年間欄は銀行の資金流出基準です。月次の購入日基準と混ぜて加算しないでください。</p>'+
   [['年間実入金',annual.incomeActual],['年間口座等流出',annual.outActual],
    ['年間の利用日基準消費（旧台帳）',annual.spentActual]]
    .map(x=>'<div class="hub-totals"><span>'+x[0]+'</span><b>'+yen(x[1])+'</b></div>').join('')+
 '</details>';
 root.innerHTML=html;
 bind(root);
 return true;
}
function bind(root){
 const annually=$('hubAnnualV148');if(annually)annually.addEventListener('toggle',()=>{annualOpen=annually.open});
 const review=$('hubReviewV157');if(review)review.addEventListener('toggle',()=>{reviewOpen=review.open});
 root.querySelectorAll('[data-hub-cycle]').forEach(btn=>btn.addEventListener('click',()=>{
   if(cycle===btn.dataset.hubCycle)return;
   cycle=btn.dataset.hubCycle;openBucket='';openCategory='';openSubcategory='';render();
 }));
 root.querySelectorAll('[data-hub-lens]').forEach(btn=>btn.addEventListener('click',()=>{
   if(lens===btn.dataset.hubLens)return;
   lens=btn.dataset.hubLens;openBucket='';openCategory='';openSubcategory='';render();
 }));
 const date=$('hubMonthV148');
 date?.addEventListener('change',()=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(date.value)){
   month=date.value;openBucket='';openCategory='';openSubcategory='';render();
 }});
 $('hubPrevV148')?.addEventListener('click',()=>{month=engine().addMonth(month,-1);openBucket='';openCategory='';openSubcategory='';render()});
 $('hubNextV148')?.addEventListener('click',()=>{month=engine().addMonth(month,1);openBucket='';openCategory='';openSubcategory='';render()});
 root.querySelectorAll('[data-hub-bucket]').forEach(btn=>btn.addEventListener('click',()=>{
   const k=btn.dataset.hubBucket;openBucket=openBucket===k?'':k;openCategory='';openSubcategory='';render();
 }));
 root.querySelectorAll('[data-hub-category]').forEach(btn=>btn.addEventListener('click',()=>{
   const k=btn.dataset.hubCategory;openCategory=openCategory===k?'':k;openSubcategory='';render();
 }));
 root.querySelectorAll('[data-hub-subcategory]').forEach(btn=>btn.addEventListener('click',()=>{
   const k=btn.dataset.hubSubcategory;openSubcategory=openSubcategory===k?'':k;render();
 }));
 root.querySelectorAll('[data-hub-edit]').forEach(btn=>btn.addEventListener('click',()=>{
   if(typeof window.openSemanticTransactionEditorV108==='function')
     window.openSemanticTransactionEditorV108(btn.dataset.hubEdit,btn.dataset.hubEditid);
   else window.alert?.('明細編集機能の読み込みが完了していません。再読み込みしてください。');
 }));
}
// Keep the edited row's surrounding disclosure and position stable even
// though saving replaces the expense hub's DOM. Capture the NEXT visible edit
// before the row is regrouped (e.g. variable -> fixed).
function captureEditContext(kind,id){
 const root=$('expenseHubV148'),page=$('expenses');
 if(!root||!page?.classList?.contains('active'))return null;
 const all=[...root.querySelectorAll('[data-hub-edit]')];
 const index=all.findIndex(el=>el.dataset.hubEdit===String(kind)&&el.dataset.hubEditid===String(id));
 const next=index>=0&&index+1<all.length?all[index+1]:null;
 const anchor=root.querySelector?.('[data-hub-bucket][aria-expanded="true"]');
 const rect=anchor?.getBoundingClientRect?.();
 const scrollY=Number(window.scrollY??window.pageYOffset);
 return {
   next:next?{kind:String(next.dataset.hubEdit),id:String(next.dataset.hubEditid)}:null,
   scrollY:Number.isFinite(scrollY)?scrollY:null,
   anchorBucket:anchor?.dataset.hubBucket||'',
   anchorTop:Number.isFinite(rect?.top)?rect.top:null,
   cycle,lens,month,openBucket,openCategory,openSubcategory
 };
}
function restoreEditContext(context){
 if(!context||!$('expenses')?.classList?.contains('active'))return;
 // Selection state is intentionally not reset by render(). If the selected
 // category was emptied by reclassification, render can collapse only it.
 const root=$('expenseHubV148');
 const anchor=[...root?.querySelectorAll('[data-hub-bucket]')||[]]
    .find(el=>el.dataset.hubBucket===context.anchorBucket);
 const rect=anchor?.getBoundingClientRect?.();
 if(Number.isFinite(context.anchorTop)&&Number.isFinite(rect?.top)&&typeof window.scrollBy==='function')
   window.scrollBy(0,rect.top-context.anchorTop);
 else if(context.scrollY!==null&&Number.isFinite(context.scrollY)&&typeof window.scrollTo==='function')
   window.scrollTo(0,context.scrollY);
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
window.householdExpenseUnifiedV148={mount,render,calculate,usageBuckets,subgroups,categoryGroups,orderDetailsByUsageDay,rowDetails,fixedReference,seasonalReference,budgetReference,masterNature,loanReference,captureEditContext,restoreEditContext,getSelection:()=>({cycle,lens,month,openBucket,openCategory,openSubcategory})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();