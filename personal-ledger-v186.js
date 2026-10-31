(() => {
'use strict';
if(window.householdPersonalLedgerV186)return;
const $=id=>document.getElementById(id);
const fmt=x=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(x)||0);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const current=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const value=r=>Math.abs(Number(r?.amount??r?.original_amount??0)||0);
const sameWelfare=r=>{
  const date=r?.purchase_date||r?.date;
  const name=r?.description||r?.description_raw||r?.merchant_raw||'';
  return date==='2026-10-30'&&value(r)===5600&&/厚生費/.test(String(name));
};
const samePersonal=(r,owner,amount,label)=>r?.owner===owner&&
  r?.cycle_start==='2026-10-16'&&value(r)===amount&&
  (owner==='wife'||(r?.date==='2026-10-30'&&/飲み会/.test(String(r?.description||label))));
function ensure(input){
  if(!input||input.privatePersonalSeedV186===true||typeof window.replaceTreasuryState!=='function')return input;
  const sync=window.householdShareSyncContext?.();
  // Never mutate a still-loading encrypted cloud state; it can cause an
  // artificial sync conflict. Defer migration until the remote revision is ready.
  if(sync?.token&&!sync.ready)return input;
  const st=structuredClone(input);
  st.personalExpenses=Array.isArray(st.personalExpenses)?st.personalExpenses:[];
  st.personalExpenseBudgets={...st.personalExpenseBudgets,wife:40000,self:20000};
  if(!st.personalExpenses.some(r=>samePersonal(r,'wife',40000,''))){
    st.personalExpenses.push({
      id:'personal-wife-allowance-20261016',owner:'wife',amount:40000,
      description:'妻に渡した個人費（全額使用済み）',
      cycle_start:'2026-10-16',cycle_end:'2026-11-17',date:'',
      date_status:'日付未申告',fully_consumed:true,source:'CHAT_REPORTED'
    });
  }
  if(!st.personalExpenses.some(r=>samePersonal(r,'self',6000,'飲み会'))){
    st.personalExpenses.push({
      id:'personal-self-drinks-20261030',owner:'self',amount:6000,
      description:'飲み会',date:'2026-10-30',
      cycle_start:'2026-10-16',cycle_end:'2026-11-17',source:'CHAT_REPORTED'
    });
  }
  let found=false;
  for(const key of ['cashExpenses','purchaseEvents','cashTransactions']){
    for(const row of st[key]||[]){
      if(!sameWelfare(row))continue;
      // Existing source is authoritative. Reclassify it, never add a clone.
      row.cost_nature='VARIABLE';
      row.spending_class='NORMAL';
      found=true;
    }
  }
  if(!found){
    st.cashExpenses=Array.isArray(st.cashExpenses)?st.cashExpenses:[];
    st.cashExpenses.push({
      id:'reported-welfare-5600-20261030',date:'2026-10-30',
      description:'厚生費',amount:5600,category:'OTHER',subcategory:'OTHER',
      economic_type:'EXPENSE',spending_class:'NORMAL',cost_nature:'VARIABLE',
      payment_method:'支払方法未申告',source_file:'CHAT_REPORTED_20261030',
      manual_reconciliation_pending:true,count_in_spending:true
    });
  }
  st.privatePersonalSeedV186=true;
  try {
    const changed=window.replaceTreasuryState(st);
    if(changed)window.cloudSyncOnLocalSave?.();
    return window.getTreasuryState?.()||st;
  } catch(e) {
    window.setTreasurySaveStatus?.('個人費の保存に失敗しました');
    return input;
  }
}
function recordsFor(st,p,cycle){
 const records=Array.isArray(st.personalExpenses)?st.personalExpenses:[];
 return records.filter(r=>{
  if(r.count_in_spending===false||r.manually_deleted_v192===true)return false;
   if(cycle==='payday'&&r.cycle_start)return r.cycle_start===p.start;
   // For undated handovers, anchor only the accounting month, not the
   // actual transaction date. Never invent the handover day.
   const accountingDate=validDate(r.date)?r.date:r.cycle_start;
   return validDate(accountingDate)&&accountingDate>=p.start&&accountingDate<=p.end;
 });
}
function summary(st,p,cycle){
 const b=st.personalExpenseBudgets||{};
 const wifeBudget=Math.max(0,Number(b.wife??40000)||0);
 const selfBudget=Math.max(0,Number(b.self??20000)||0);
 const rows=recordsFor(st,p,cycle);
 const spent=owner=>rows.filter(r=>r.owner===owner).reduce((s,r)=>s+value(r),0);
 return {wifeBudget,selfBudget,wifeSpent:spent('wife'),selfSpent:spent('self'),rows};
}
const normText=s=>String(s||'').normalize('NFKC').replace(/[\s　・()（）\-/]/g,'').toUpperCase();
function isSameRecordedExpense(row,personal,st){
 if(!['cash','purchase','bank'].includes(row.kind)||
    Number(row.amount)!==value(personal))return false;
 const tagged=classifiedPersonalSource(st||{},row);
 const owner=String(tagged?.personal_owner_v193||'').toLowerCase();
 if(['wife','self'].includes(owner)&&owner!==personal.owner)return false;
 const label=normText(row.label),requested=normText(personal.description);
 if(!label)return false;
 if(personal.owner==='wife'){
   // A bank transfer to the wife is not itself a second purchase.
   return /妻/.test(label)&&/個人費|小遣い|お小遣い|手渡/.test(label);
 }
 if(personal.date!==row.date)return false;
 return label===requested||(requested.length>=3&&label.includes(requested))||
   (label.length>=3&&requested.includes(label));
}
function classifiedPersonalSource(st,row){
 const [kind,index]=String(row.identity||'').split(':');
 if(!['cash','purchase','bank'].includes(kind)||!/^\d+$/.test(index))return null;
 const source=kind==='cash'?st.cashExpenses?.[Number(index)]:
   kind==='purchase'?st.purchaseEvents?.[Number(index)]:
   st.cashTransactions?.[Number(index)];
 if(!source)return null;
 const assigned=String(source.expense_bucket_v193||'').toUpperCase();
 const category=String(source.category||'').toUpperCase();
 if(assigned!=='PERSONAL'&&
    (['FIXED','VARIABLE','SPECIAL'].includes(assigned)||category!=='PERSONAL'))return null;
 return source;
}
function presentation(st,usage,cycle=usage.basis){
 const s=summary(st,usage,cycle);
 const matched=new Set(),items=[];
 let matchedOrdinary=0,matchedConsumption=0;
 const entries=s.rows.map((r,i)=>({r,i}));
 // Preserve original first-unmatched-in-source-order semantics while avoiding
 // a full usage-row scan for every personal expense. The index is per call.
 const candidatesByAmount=new Map();
 for(const row of usage.usageRows||[]){
   if(!['cash','purchase','bank'].includes(row.kind))continue;
   const amount=Number(row.amount);
   if(!candidatesByAmount.has(amount))candidatesByAmount.set(amount,[]);
   candidatesByAmount.get(amount).push(row);
 }
 for(const {r} of entries){
   const raw=(candidatesByAmount.get(value(r))||[]).find(x=>
     !matched.has(x.identity)&&isSameRecordedExpense(x,r,st));
   if(raw){
     matched.add(raw.identity);
     matchedConsumption+=Number(raw.amount)||0;
     if(raw.spendingClass!=='SPECIAL')matchedOrdinary+=Number(raw.amount)||0;
   }
 }
 const allocated={wife:0,self:0,unassigned:0};
 for(const row of usage.usageRows||[]){
   if(matched.has(row.identity))continue;
   const source=classifiedPersonalSource(st,row);
   if(!source)continue;
   const owner=String(source.personal_owner_v193||'').toLowerCase();
   allocated[owner==='wife'||owner==='self'?owner:'unassigned']+=Number(row.amount)||0;
 }
 s.wifeSpent+=allocated.wife;
 s.selfSpent+=allocated.self;
 s.unassignedSpent=allocated.unassigned;
 for(const receipt of st.purchaseEvents||[]){
   if(receipt?.reference_only_v200!==true||receipt.count_in_spending!==false||
      receipt.personal_owner_v193!=='wife')continue;
   const day=receipt.purchase_date;
   if(!validDate(day)||day<usage.start||day>usage.end)continue;
   const val=value(receipt);
   if(!val)continue;
   items.push({
     kind:'personal_reference',identity:'reference:'+(receipt.purchase_id||day),
     date:day,amount:0,referenceAmount:val,
     label:String(receipt.merchant_raw||'個人費内訳')+'（参考 '+fmt(val)+'・追加計上なし）',
     owner:'wife',source:'妻の個人費40,000円の内訳・参考',
     personalCategoryLabel:'妻（予算 '+fmt(s.wifeBudget)+'・使用 '+fmt(s.wifeSpent)+'）',
     provisional:false,needsReview:false
   });
 }
 for(const {r,i} of entries){
   const owner=r.owner==='wife'?'wife':'self';
   const budget=owner==='wife'?s.wifeBudget:s.selfBudget;
   const spent=owner==='wife'?s.wifeSpent:s.selfSpent;
   items.push({
     kind:'personal',identity:'personal:'+(r.id||i),date:r.date||'',
     amount:value(r),label:String(r.description||'個人費'),
     owner,source:owner==='wife'?'妻・消費済み':'本人・個人費',
     personalCategoryLabel:owner==='wife'?
       '妻（渡した分・消費済み）':
       '本人（予算 '+fmt(budget)+'・残 '+fmt(budget-spent)+'）',
     personalBudget:budget,personalSpent:spent,
     provisional:false,needsReview:false
   });
 }
 return {items,matched,matchedOrdinary,matchedConsumption,allocated,
   amount:items.reduce((sum,r)=>sum+r.amount,0),summary:s};
}
window.householdPersonalLedgerV186={ensure,recordsFor,summary,presentation,classifiedPersonalSource};
window.addEventListener?.('householdShareCloudSyncedV160',()=>{
  // An older cloud revision may have replaced local state during startup.
  // The migration is idempotent and runs only after successful sync.
  ensure(window.getTreasuryState?.());
  if($('expenses')?.classList?.contains('active'))
    window.householdExpenseUnifiedV148?.render?.();
});
})();