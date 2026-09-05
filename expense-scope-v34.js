(() => {
  const VALID=new Set(['NORMAL','SPECIAL','INVESTMENT','DEBT','TRANSFER']);
  const $=id=>document.getElementById(id);
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　]+/g,'').toUpperCase();
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  let observer=null,renderTimer=null,normalizing=false;

  function legacyScope(v){
    const x=String(v||'').toUpperCase();
    if(x==='ORDINARY'||x==='NORMAL')return'NORMAL';
    if(VALID.has(x))return x;
    return'';
  }
  function specialCategory(c){return new Set(['TRAVEL','MOVING_FURNITURE','CAR_MAINTENANCE','KINDERGARTEN','MEDICAL_LARGE','LARGE_PURCHASE','WEDDING_FUNERAL']).has(String(c||'').toUpperCase())}
  function derivePurchase(p){
    if(VALID.has(String(p?.expense_scope||'').toUpperCase()))return String(p.expense_scope).toUpperCase();
    const c=String(p?.category||'').toUpperCase();
    if(c==='INVESTMENT_CONTRIBUTION')return'INVESTMENT';
    if(specialCategory(c))return'SPECIAL';
    return legacyScope(p?.ordinary_or_special)||'NORMAL';
  }
  function deriveCash(t){
    if(VALID.has(String(t?.expense_scope||'').toUpperCase()))return String(t.expense_scope).toUpperCase();
    const c=String(t?.cashflow_type||t?.category||'').toUpperCase(),d=norm(t?.description_raw||t?.description);
    if(t?.is_transfer||['INTERNAL_TRANSFER','CARD_SETTLEMENT','CASH_WITHDRAWAL_UNCLASSIFIED'].includes(c))return'TRANSFER';
    if((c==='UNKNOWN'||!c)&&/(振込|振替|ﾌﾘｺﾐ|ﾌﾘｶｴ)/i.test(d))return'TRANSFER';
    if(c.startsWith('INVESTMENT_'))return'INVESTMENT';
    if(c.startsWith('DEBT_'))return'DEBT';
    if(specialCategory(c))return'SPECIAL';
    return legacyScope(t?.ordinary_or_special)||'NORMAL';
  }
  function deriveRule(r){
    if(VALID.has(String(r?.expense_scope||'').toUpperCase()))return String(r.expense_scope).toUpperCase();
    const t=String(r?.type||'').toUpperCase();
    if(t.includes('INVEST'))return'INVESTMENT';if(t.includes('DEBT')||t.includes('LOAN'))return'DEBT';if(t.includes('TRANSFER'))return'TRANSFER';
    return legacyScope(r?.ordinary_or_special)||'NORMAL';
  }
  function deriveEvent(e){
    if(VALID.has(String(e?.expense_scope||'').toUpperCase()))return String(e.expense_scope).toUpperCase();
    const t=String(e?.type||'').toUpperCase();
    if(t==='CARD_SETTLEMENT'||t.includes('TRANSFER'))return'TRANSFER';if(t.includes('INVEST'))return'INVESTMENT';if(t.includes('DEBT')||t.includes('LOAN'))return'DEBT';
    return legacyScope(e?.ordinary_or_special)||'NORMAL';
  }
  function applyScopes(st){
    let changed=false;
    const set=(obj,scope,reason)=>{if(!obj)return;if(obj.expense_scope!==scope){obj.expense_scope=scope;changed=true}if(!obj.expense_scope_source){obj.expense_scope_source='phase3-v34';changed=true}if(reason&&!obj.expense_scope_reason){obj.expense_scope_reason=reason;changed=true}};
    for(const p of st.purchaseEvents||[])set(p,derivePurchase(p),specialCategory(p.category)?'カテゴリ定義によりSPECIAL':'既存分類から移行');
    for(const t of st.cashTransactions||[]){const s=deriveCash(t);let reason='既存分類から移行';const c=String(t.cashflow_type||t.category||'').toUpperCase();if(c==='CARD_SETTLEMENT')reason='カード利用と二重計上しない銀行引落';else if(c==='CASH_WITHDRAWAL_UNCLASSIFIED')reason='ATM出金は現金財布への資金移動';else if(t.is_transfer)reason='内部資金移動';else if((c==='UNKNOWN'||!c)&&/(振込|振替|ﾌﾘｺﾐ|ﾌﾘｶｴ)/i.test(norm(t.description_raw||t.description)))reason='用途不明の振込は消費と断定せずTRANSFER';set(t,s,reason)}
    for(const r of st.rules||[])set(r,deriveRule(r),'固定費ルールから移行');
    for(const e of st.events||[])set(e,deriveEvent(e),'予定イベントから移行');
    for(const s of st.cardSettlements||[])set(s,'TRANSFER','カード利用と銀行引落の二重計上防止');
    for(const i of st.investmentEvents||[])set(i,'INVESTMENT','投資取引');
    if(st.expenseScopeVersion!==1){st.expenseScopeVersion=1;changed=true}
    return changed;
  }
  function persistScopes(){
    if(normalizing)return false;
    const st=stateNow();if(!applyScopes(st))return false;
    normalizing=true;
    try{window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();return true}finally{setTimeout(()=>normalizing=false,0)}
  }

  function monthTotals(){
    const st=stateNow(),m=new Date().toISOString().slice(0,7),out={normal:0,special:0,investment:0,debt:0,transfer:0};
    const add=(scope,amount)=>{const a=Math.abs(Number(amount)||0);if(!a)return;if(scope==='SPECIAL')out.special+=a;else if(scope==='INVESTMENT')out.investment+=a;else if(scope==='DEBT')out.debt+=a;else if(scope==='TRANSFER')out.transfer+=a;else out.normal+=a};
    for(const p of st.purchaseEvents||[])if(String(p.purchase_date||'').startsWith(m))add(derivePurchase(p),p.original_amount);
    for(const t of st.cashTransactions||[])if(String(t.date||'').startsWith(m)&&Number(t.amount)<0)add(deriveCash(t),t.amount);
    return out;
  }
  if(typeof monthEconomicTotals==='function'){
    monthEconomicTotals=function monthEconomicTotalsV34(){const x=monthTotals();return{ordinary:x.normal,special:x.special,investment:x.investment,debt:x.debt,transfer:x.transfer}}
  }

  function recentRows(st){
    const rows=[];
    (st.purchaseEvents||[]).forEach((p,index)=>rows.push({kind:'purchase',index,date:p.purchase_date||'',name:p.merchant_raw||p.merchant_normalized||'カード利用',amount:-Math.abs(Number(p.original_amount)||0),scope:derivePurchase(p),category:p.category||'',confidence:Number(p.confidence??1),source:p.card||'card',manual:p.expense_scope_source==='manual'}));
    (st.cashTransactions||[]).forEach((t,index)=>{if(Number(t.amount)>=0)return;rows.push({kind:'cash',index,date:t.date||'',name:t.description_raw||t.description||'銀行出金',amount:Number(t.amount)||0,scope:deriveCash(t),category:t.cashflow_type||t.category||'',confidence:Number(t.confidence??1),source:t.source||'bank',manual:t.expense_scope_source==='manual'})});
    return rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,60);
  }
  function ensureUi(){
    if($('expenseScopeCardV34'))return true;
    const grid=document.querySelector('#imports .grid');if(!grid)return false;
    const card=document.createElement('div');card.id='expenseScopeCardV34';card.className='card full';
    card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><div class="title" style="margin-bottom:3px">支出区分 <span class="tag">Phase 3</span></div><div class="tiny">NORMAL / SPECIAL / INVESTMENT / DEBT / TRANSFER を正式区分として使用します。変更は端末保存＋同期されます。</div></div><button class="btn secondary" id="refreshExpenseScopeV34">再読込</button></div><div id="expenseScopeSummaryV34" class="form" style="margin-top:12px"></div><div id="expenseScopeRowsV34" style="margin-top:12px"></div>`;
    const link=$('autoLinkAuditCardV33');if(link&&link.parentElement===grid)link.after(card);else grid.appendChild(card);
    $('refreshExpenseScopeV34').onclick=()=>{persistScopes();renderScope()};
    card.addEventListener('change',e=>{const sel=e.target.closest?.('select[data-scope-kind]');if(!sel)return;const st=stateNow(),arr=sel.dataset.scopeKind==='purchase'?st.purchaseEvents:st.cashTransactions,idx=Number(sel.dataset.scopeIndex),obj=arr?.[idx];if(!obj)return;obj.expense_scope=sel.value;obj.expense_scope_source='manual';obj.expense_scope_reason='ユーザー手動変更';window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();setTimeout(renderScope,0)});
    return true;
  }
  function renderScope(){
    if(!ensureUi())return;
    const st=stateNow();applyScopes(st);
    const totals={NORMAL:0,SPECIAL:0,INVESTMENT:0,DEBT:0,TRANSFER:0};
    for(const r of recentRows(st))totals[r.scope]=(totals[r.scope]||0)+Math.abs(r.amount);
    $('expenseScopeSummaryV34').innerHTML=Object.entries(totals).map(([k,v])=>`<div><span class="muted">${k}</span><b style="display:block;font-size:19px;margin-top:5px">${yen(v)}</b></div>`).join('');
    const rows=recentRows(st);
    $('expenseScopeRowsV34').innerHTML=`<div class="tiny" style="margin-bottom:8px">最近${rows.length}件。低信頼の振込は消費と断定せず、まずTRANSFERとして確認できます。</div>`+rows.map(r=>`<div class="row" style="align-items:center;gap:10px"><div style="min-width:0;flex:1"><b>${esc(r.name)}</b><div class="tiny">${esc(r.date)} · ${esc(r.source)} · ${esc(r.category||'UNKNOWN')} · confidence ${r.confidence.toFixed(2)}${r.manual?' · 手動':''}</div></div><b class="amt bad">${yen(r.amount)}</b><select data-scope-kind="${r.kind}" data-scope-index="${r.index}">${['NORMAL','SPECIAL','INVESTMENT','DEBT','TRANSFER'].map(x=>`<option value="${x}"${x===r.scope?' selected':''}>${x}</option>`).join('')}</select></div>`).join('');
  }
  function queue(){clearTimeout(renderTimer);renderTimer=setTimeout(()=>{persistScopes();renderScope()},80)}
  function boot(){persistScopes();ensureUi();renderScope();document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="imports"]'))setTimeout(renderScope,0)});const target=$('importResults');if(target){observer=new MutationObserver(queue);observer.observe(target,{childList:true,subtree:true})}window.addEventListener('focus',queue);window.renderExpenseScopeV34=renderScope}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();