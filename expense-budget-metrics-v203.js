/* v203: monthly budget display uses actual configured budgets only. */
(()=>{
'use strict';
if(window.householdExpenseBudgetV203)return;
const number=x=>Number.isFinite(Number(x))?Number(x):0;
const money=x=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(number(x));
const validMonth=s=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(s||''));
const isFamily=s=>/家族カード|家計カード|妻.*カード|生活費|家計費|現金配分|現金手渡|妻.*現金|妻.*送金|家族.*送金|仕送り|小遣い/.test(String(s||''));
const isIdeco=s=>/IDECO|ＩＤＥＣＯ|イデコ|国民年金基金|コクミンネンキンキキン/i.test(String(s||''));
function planned(st,month){
 if(!validMonth(month))return {fixed:null,ideco:null};
 const masters=st?.masters?.fixedExpenses;
 if(!Array.isArray(masters))return {fixed:null,ideco:null};
 const seen=new Set();let fixed=0,ideco=0,fixedCount=0;
 for(const x of masters){
  if(x?.active===false||x?.forecastEnabled===false)continue;
  const cadence=String(x.cadence||'MONTHLY').toUpperCase();
  if(!['MONTHLY','SEMI_FIXED'].includes(cadence))continue;
  if(cadence==='SEMI_FIXED'){
   const enabled=(x.activeMonths||x.months||[]).map(v=>String(v).padStart(2,'0'));
   if(!enabled.includes(month.slice(5)))continue;
  }
  const name=String(x.name||''),amount=Math.abs(number(x.amount)),key=String(x.id||name);
  if(!name||!amount||seen.has(key))continue;
  seen.add(key);
  const eco=String(x.economic_type||'').toUpperCase();
  if(isIdeco(name)||eco==='INVESTMENT'){
   if(isIdeco(name))ideco+=amount;
   continue;
  }
  if(isFamily(name)||eco==='TRANSFER')continue;
  if(!['EXPENSE','DEBT_PRINCIPAL'].includes(eco))continue;
  if(eco==='EXPENSE'&&String(x.spending_class||x.expense_scope||'').toUpperCase()==='SPECIAL')continue;
  fixed+=amount;fixedCount++;
 }
 return {fixed:fixedCount?fixed:null,ideco:ideco||null};
}
function get(st,month,bucketId,spent,shareBudget){
 let budget=null,kind='';
 const x=planned(st,month);
 if(bucketId==='variable'){
  const value=Number(shareBudget);
  if(shareBudget!==null&&shareBudget!==undefined&&Number.isSafeInteger(value)&&value>0){
    budget=value;kind='月予算';
  }
 }else if(bucketId==='fixed'){budget=x.fixed;kind='月額計画';}
 else if(bucketId==='personal'){
  const b=st?.personalExpenseBudgets||{},a=number(b.wife),c=number(b.self);
  budget=a+c>0?a+c:null;kind='個人費枠';
 }else if(bucketId==='ideco'){budget=x.ideco;kind='月額拠出';}
 if(!budget||budget<1)return null;
 const ratio=Math.max(0,number(spent))*100/budget;
 return {budget,kind,spent:number(spent),ratio,over:ratio>100,
  text:kind+' '+money(budget)+' ・ '+ratio.toFixed(1)+'%'};
}
// UI-only presentation: the percentage is calculated from the same budget
// and amount as the text metrics. A missing budget never produces a bar.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>
 ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function progress(metric,label='費目'){
 if(!metric||!Number.isFinite(metric.budget)||metric.budget<=0||
    !Number.isFinite(metric.ratio)||!Number.isFinite(metric.spent))return '';
 const ratio=Math.max(0,metric.ratio),width=Math.min(100,ratio);
 const tone=ratio>=100?'over':ratio>=80?'warn':'good';
 const percentage=ratio.toFixed(1),difference=metric.budget-metric.spent;
 const category=String(metric.kind||'月予算');
 const isPlan=category==='月額計画',isContribution=category==='月額拠出';
 const restLabel=difference<0?
   (isPlan?'計画との差額':isContribution?'予定超過':'予算超過'):
   (isPlan?'計画残額':isContribution?'拠出予定残':'残り');
 return '<div class="hub-budget-indicator hub-budget-'+tone+'" data-hub-budget-kind="'+esc(category)+'">'+
    '<div class="hub-budget-meta"><span>'+esc(category)+' '+money(metric.budget)+
    '</span><strong>'+percentage+'% 使用</strong></div>'+
    '<div class="hub-budget-track" role="progressbar" aria-label="'+esc(label)+'の'+esc(category)+'使用率"'+
    ' aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+width.toFixed(1)+'"'+
    ' aria-valuetext="'+percentage+'パーセント">'+
    '<span class="hub-budget-fill" style="width:'+width.toFixed(2)+'%"></span></div>'+
    '<div class="hub-budget-remaining">'+restLabel+' '+money(Math.abs(difference))+
    (ratio>100?'（'+percentage+'%）':'')+'</div></div>';
}
window.householdExpenseBudgetV203={get,planned,progress};
})();
