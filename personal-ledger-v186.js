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
    if(r.cycle_start&&cycle==='payday')return r.cycle_start===p.start;
    return validDate(r.date)&&r.date>=p.start&&r.date<=p.end;
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
function html(st,usage,cycle,lens){
  if(lens!=='economic')return '';
  const s=summary(st,usage,cycle),remaining=s.selfBudget-s.selfSpent;
  const personRows=s.rows.filter(r=>r.owner==='self').sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  return '<div class="hub-card" id="hubPersonalV186">'+
    '<div class="hub-title">個人費（本人の支出管理専用）</div>'+
    '<p class="hub-muted">この欄は妻の共有画面には表示・送信しません。既存の家計消費・カード引落とは別建てで、二重計上を防ぎます。</p>'+
    '<div class="hub-totals"><span>個人費予算（妻＋本人）</span><b>'+fmt(s.wifeBudget+s.selfBudget)+'</b></div>'+
    '<div class="hub-totals"><span>個人費使用済み合計</span><b>'+fmt(s.wifeSpent+s.selfSpent)+'</b></div>'+
    '<div class="hub-totals"><span>妻：渡した個人費（消費済み）</span><b>'+fmt(s.wifeSpent)+' / '+fmt(s.wifeBudget)+'</b></div>'+
    '<div class="hub-totals"><span>本人：使用済み</span><b>'+fmt(s.selfSpent)+' / '+fmt(s.selfBudget)+'</b></div>'+
    '<div class="hub-totals"><span>本人：残額</span><b>'+fmt(remaining)+'</b></div>'+
    '<div style="margin:12px 0 5px;font-weight:700">本人の個人費明細</div>'+
    (personRows.length?personRows.map(r=>
      '<div class="hub-detailrow"><span>'+esc(r.date||'日付未申告')+' '+esc(r.description||'個人費')+'</span>'+
      '<b>'+fmt(value(r))+'</b> <button class="btn secondary" type="button" data-private-delete="'+esc(r.id)+'">削除</button></div>'
    ).join(''):'<p class="hub-muted">まだ記録がありません。</p>')+
    '<div class="hub-private-form-v186" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">'+
    '<label class="field">日付<input type="date" id="hubPersonalDateV186" value="'+esc(current())+'"></label>'+
    '<label class="field">金額（円）<input type="number" min="1" step="1" id="hubPersonalAmountV186" placeholder="例：1000"></label>'+
    '<label class="field" style="grid-column:1 / -1">内容<input type="text" id="hubPersonalDescV186" placeholder="例：飲み会"></label>'+
    '<button type="button" class="btn" id="hubPersonalAddV186" style="grid-column:1 / -1">本人の個人費を記録</button>'+
    '</div>'+
    (cycle==='calendar'?'<p class="hub-muted">妻への受渡日は未申告のため、暦月ではなく給与サイクルで管理します。</p>':'')+
    '</div>';
}
function persist(next){
  try{
    const changed=window.replaceTreasuryState(next);
    if(changed)window.cloudSyncOnLocalSave?.();
    window.householdExpenseUnifiedV148?.render();
    return !!changed;
  }catch(e){
    window.alert?.('保存できませんでした。端末容量と同期状態を確認してください。');
    return false;
  }
}
function bind(){
  const btn=$('hubPersonalAddV186');
  btn?.addEventListener('click',()=>{
    const date=$('hubPersonalDateV186')?.value||'',amount=Number($('hubPersonalAmountV186')?.value);
    const description=String($('hubPersonalDescV186')?.value||'').trim();
    const selected=window.householdExpenseUnifiedV148?.getSelection?.()||{};
    if(!validDate(date)||!Number.isSafeInteger(amount)||amount<=0||!description){window.alert?.('日付・内容・金額を正しく入力してください。');return}
    const st=window.getTreasuryState?.();if(!st)return;
    const p=window.householdUsageLedgerV157?.period?.(st,selected.month,selected.cycle);
    if(!p||date<p.start||date>p.end){window.alert?.('選択中の支出期間に含まれる日付を指定してください。');return}
    const next=structuredClone(st);
    next.personalExpenses=Array.isArray(next.personalExpenses)?next.personalExpenses:[];
    const id='personal-self-'+(globalThis.crypto?.randomUUID?.()||String(Date.now()));
    next.personalExpenses.push({id,owner:'self',amount,description,date,cycle_start:selected.cycle==='payday'?p.start:'',
      source:'MANUAL_PERSONAL',created_at:new Date().toISOString()});
    persist(next);
  });
  document.querySelectorAll('[data-private-delete]').forEach(btn=>btn.addEventListener('click',()=>{
    if(!window.confirm?.('この個人費の明細を削除しますか？'))return;
    const st=window.getTreasuryState?.();if(!st)return;
    const next=structuredClone(st);
    next.personalExpenses=(next.personalExpenses||[]).filter(r=>r.id!==btn.dataset.privateDelete);
    persist(next);
  }));
}
window.householdPersonalLedgerV186={ensure,recordsFor,summary,html,bind};
window.addEventListener?.('householdShareCloudSyncedV160',()=>{
  // An older cloud revision may have replaced local state during startup.
  // The migration is idempotent and runs only after successful sync.
  ensure(window.getTreasuryState?.());
  if($('expenses')?.classList?.contains('active'))
    window.householdExpenseUnifiedV148?.render?.();
});
})();