(() => {
  if (window.__cardEventConsistencyV86) return;
  window.__cardEventConsistencyV86 = true;

  const $ = id => document.getElementById(id);
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const yen = n => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const sameCard = (a,b) => {
    try { return window.householdCardIdentityV51?.sameCard?.(a,b) ?? norm(a) === norm(b); }
    catch { return norm(a) === norm(b); }
  };

  let meta = null;
  let row = null;

  function kindOf(r){
    const t=String(r?.type||''),src=String(r?.source||'');
    if(t==='CARD_REVOLVING_PAYMENT'||src==='card_revolving_v66')return'REVOLVING';
    if(t==='CARD_ESTIMATE'||src==='card_estimate_v49')return'ESTIMATE';
    if(t==='CARD_SETTLEMENT'||src==='card_settlement')return'ACTUAL';
    return'';
  }
  function metaOf(r){
    const kind=kindOf(r); if(!kind)return null;
    return {kind,card:r.card||String(r.name||'').replace(/カード支払.*/,''),ym:r.billing_month||String(r.date||'').slice(0,7)};
  }
  function cardMaster(st,name){return (st.masters?.cards||[]).find(c=>c.active!==false&&sameCard(c.name,name))||null}
  function sourceRow(m){
    try {
      const rows=window.householdCardForecastV49?.(240)?.rows||[];
      return rows.find(r=>{const q=metaOf(r);return q&&q.kind===m.kind&&sameCard(q.card,m.card)&&q.ym===m.ym})||null;
    } catch { return null; }
  }
  function scheduledTotal(r){
    if(Number.isFinite(Number(r?.scheduled_fixed_total))) return Math.abs(Number(r.scheduled_fixed_total));
    return (r?.components?.scheduled||[]).reduce((a,x)=>a+Math.abs(Number(x?.amount)||0),0);
  }
  function baselineFor(c,m){
    if(m?.kind!=='ESTIMATE')return 0;
    if(String(c?.paymentMode||c?.payment_mode||'FULL').toUpperCase()==='REVOLVING')return 0;
    if(String(c?.forecastMode||c?.forecast_mode||'').toUpperCase()!=='BASELINE')return 0;
    return Math.max(0,Number(c?.monthlyBaselineAmount)||0);
  }
  function isDCard(c){
    try { return window.householdPlanningV79?.canonicalCard?.(c?.name)==='D_CARD' || window.householdCardCycleV81?.canonicalCard?.(c?.name)==='D_CARD'; }
    catch { const n=norm(c?.name).replace(/カード|CARD/g,''); return n==='D'||/DOCOMO|DCMX/.test(norm(c?.name)); }
  }
  function forecastTotal(c,usage,baseline){
    const authoritative=window.householdPlanningV79?.forecastAmountForCard;
    if(typeof authoritative==='function')return authoritative(c,usage);
    if(isDCard(c)&&baseline>0)return baseline;
    return Math.max(usage,baseline);
  }
  function revBalance(c){
    const v=c?.revolvingBalance;
    return v!==null&&v!==''&&Number.isFinite(Number(v))?Math.max(0,Number(v)):null;
  }

  function ensureSummary(){
    const modal=$('cardCashflowEditV75'); if(!modal)return null;
    let box=$('v86CardSummary'); if(box)return box;
    box=document.createElement('div');
    box.id='v86CardSummary';
    box.className='card';
    box.style.cssText='padding:10px;margin:12px 0;background:rgba(127,127,127,.04)';
    box.innerHTML=`
      <div class="title" style="font-size:15px">現在の合計・整合性</div>
      <div class="row"><span>利用明細合計</span><b id="v86PurchaseTotal">—</b></div>
      <div class="row"><span>未計上のカード固定費</span><b id="v86ScheduledTotal">—</b></div>
      <div class="row" id="v86BaselineRow"><span>月額標準額</span><b id="v86BaselineTotal">—</b></div>
      <div class="row"><span><b>現在の合計</b></span><b id="v86CurrentTotal">—</b></div>
      <label id="v86AutoWrap" style="display:flex;align-items:center;gap:7px;margin-top:8px"><input type="checkbox" id="v86AutoTotal" checked> 予測ルールから支払額を自動反映</label>
      <div id="v86RevolvingBlock" hidden style="margin-top:9px;border-top:1px solid var(--border,#d8dee8);padding-top:8px">
        <div class="row"><span>現在リボ残高</span><b id="v86RevBalance">—</b></div>
        <div class="row"><span>今月利用合計</span><b id="v86RevUsage">—</b></div>
        <div class="row"><span>今月返済額</span><b id="v86RevPayment">—</b></div>
        <div class="row"><span>返済後残高の単純試算</span><b id="v86RevAfter">—</b></div>
        <div class="tiny warn">単純試算は「現在残高＋今月利用−返済額」。手数料・利息は含めないため、実残高の確定値にはしません。</div>
      </div>`;
    const purchaseDetails=$('v75PurchaseDetails');
    const purchaseTitle=[...modal.querySelectorAll('.title')].find(x=>x.textContent.includes('利用明細'));
    if(purchaseDetails) purchaseDetails.insertAdjacentElement('beforebegin',box);
    else if(purchaseTitle) purchaseTitle.insertAdjacentElement('beforebegin',box);
    else modal.querySelector('.card[style*="position:fixed"]')?.appendChild(box);
    box.querySelector('#v86AutoTotal')?.addEventListener('change',()=>refresh(true));
    modal.addEventListener('input',e=>{
      if(e.target.matches?.('[data-v75-pamount]')) refresh(true);
      if(e.target.id==='v75CardAmount' && e.isTrusted && meta?.kind==='ESTIMATE'){
        const auto=$('v86AutoTotal'); if(auto)auto.checked=false;
        refresh(false);
      }
    });
    return box;
  }

  function purchaseTotalFromDom(){
    return [...document.querySelectorAll('#v75PurchaseRows [data-v75-pamount]')].reduce((a,input)=>{
      const n=Number(input.value); return a+(Number.isFinite(n)?Math.abs(n):0);
    },0);
  }

  function refresh(syncAmount){
    if(!meta)return;
    const st=stateNow(),c=cardMaster(st,meta.card),purchases=purchaseTotalFromDom(),scheduled=scheduledTotal(row),baseline=baselineFor(c,meta);
    const usage=purchases+scheduled;
    const computed=meta.kind==='ESTIMATE'?forecastTotal(c,usage,baseline):usage;
    if($('v86PurchaseTotal'))$('v86PurchaseTotal').textContent=yen(purchases);
    if($('v86ScheduledTotal'))$('v86ScheduledTotal').textContent=yen(scheduled);
    if($('v86BaselineTotal'))$('v86BaselineTotal').textContent=baseline?yen(baseline):'—';
    if($('v86BaselineRow'))$('v86BaselineRow').hidden=meta.kind!=='ESTIMATE'||!baseline;
    if($('v86CurrentTotal'))$('v86CurrentTotal').textContent=yen(computed);

    const autoWrap=$('v86AutoWrap'),auto=$('v86AutoTotal'),amount=$('v75CardAmount');
    if(autoWrap)autoWrap.hidden=meta.kind!=='ESTIMATE';
    if(meta.kind==='ESTIMATE'&&syncAmount&&auto?.checked&&amount) amount.value=String(Math.round(computed));

    const rev=$('v86RevolvingBlock');
    if(rev)rev.hidden=meta.kind!=='REVOLVING';
    if(meta.kind==='REVOLVING'){
      const bal=revBalance(c),payment=Math.abs(Number(amount?.value)||0),after=bal===null?null:Math.max(0,bal+usage-payment);
      if($('v86RevBalance'))$('v86RevBalance').textContent=bal===null?'未設定':yen(bal);
      if($('v86RevUsage'))$('v86RevUsage').textContent=yen(usage);
      if($('v86RevPayment'))$('v86RevPayment').textContent=yen(payment);
      if($('v86RevAfter'))$('v86RevAfter').textContent=after===null?'—':yen(after);
    }
  }

  function openFromButton(b){
    meta={kind:String(b.dataset.v75Kind||''),card:String(b.dataset.v75Card||''),ym:String(b.dataset.v75Ym||'')};
    row=sourceRow(meta);
    setTimeout(()=>{
      const box=ensureSummary(); if(!box)return;
      const auto=$('v86AutoTotal'); if(auto)auto.checked=meta.kind==='ESTIMATE';
      refresh(true);
    },0);
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-v75-card-edit]');
    if(b) openFromButton(b);
  },true);
})();
