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
function isSameRecordedExpense(row,personal){
 if(!['cash','purchase','bank'].includes(row.kind)||
    Number(row.amount)!==value(personal))return false;
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
function presentation(st,usage,cycle=usage.basis){
 const s=summary(st,usage,cycle);
 const matched=new Set(),items=[];
 let matchedOrdinary=0,matchedConsumption=0;
 for(const [i,r] of s.rows.entries()){
   const raw=(usage.usageRows||[]).find(x=>!matched.has(x.identity)&&isSameRecordedExpense(x,r));
   if(raw){
     matched.add(raw.identity);
     matchedConsumption+=Number(raw.amount)||0;
     if(raw.spendingClass!=='SPECIAL')matchedOrdinary+=Number(raw.amount)||0;
   }
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
 return {items,matched,matchedOrdinary,matchedConsumption,
   amount:items.reduce((sum,r)=>sum+r.amount,0),summary:s};
}
window.householdPersonalLedgerV186={ensure,recordsFor,summary,presentation};
window.addEventListener?.('householdShareCloudSyncedV160',()=>{
  // An older cloud revision may have replaced local state during startup.
  // The migration is idempotent and runs only after successful sync.
  ensure(window.getTreasuryState?.());
  if($('expenses')?.classList?.contains('active'))
    window.householdExpenseUnifiedV148?.render?.();
});
})();