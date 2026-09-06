(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const iso=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  let settingsTimer=null,mobileTimer=null,settingsObserver=null,mobileObserver=null,forecastObserver=null;

  function sameCard(a,b){
    try{if(window.householdCardIdentityV51?.sameCard)return window.householdCardIdentityV51.sameCard(a,b)}catch{}
    return !!a&&!!b&&norm(a)===norm(b);
  }
  function paymentMode(c){return String(c?.paymentMode||c?.payment_mode||'FULL').toUpperCase()==='REVOLVING'?'REVOLVING':'FULL'}
  function isRevolving(c){return c?.active!==false&&paymentMode(c)==='REVOLVING'}
  function monthlyPayment(c){for(const v of [c?.revolvingMonthlyPayment,c?.monthlyPaymentAmount,c?.monthlyPayment])if(v!==null&&v!==''&&Number.isFinite(Number(v)))return Math.max(0,Number(v));return 0}
  function balanceValue(c){const v=c?.revolvingBalance;return v!==null&&v!==''&&Number.isFinite(Number(v))?Math.max(0,Number(v)):null}
  function cardMaster(st,name){return (st.masters?.cards||[]).find(c=>c.active!==false&&sameCard(c.name,name))||null}
  function revCardFor(st,name){const c=cardMaster(st,name);return isRevolving(c)?c:null}
  function addMonths(ym,n){const[y,m]=String(ym).split('-').map(Number),d=new Date(y,m-1+n,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
  function lastDay(y,m){return new Date(y,m,0).getDate()}
  function dateFor(ym,day){const[y,m]=String(ym).split('-').map(Number);return `${ym}-${String(Math.min(Math.max(1,Number(day)||1),lastDay(y,m))).padStart(2,'0')}`}
  function settlementDay(st,c){
    for(const v of [c?.settlementDay,c?.paymentDay,c?.dueDay]){const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=31)return n}
    const history=(st.cardSettlements||[]).filter(s=>s.due_date&&sameCard(s.card,c?.name)).sort((a,b)=>String(b.due_date).localeCompare(String(a.due_date)));
    const n=history.length?Number(String(history[0].due_date).slice(8,10)):0;return n>=1&&n<=31?n:null;
  }
  function hasActual(st,card,ym){return (st.cardSettlements||[]).some(s=>sameCard(s.card,card)&&String(s.due_date||'').slice(0,7)===ym)}
  function purchaseAmount(p){const v=p?.payment_amount;return v!==null&&v!==''&&Number.isFinite(Number(v))?Math.abs(Number(v)):Math.abs(Number(p?.original_amount)||0)}
  function routeOf(m){return String(m?.paymentRoute||m?.payment_route||'DIRECT').toUpperCase()}
  function masterOccurs(m,ym){const cad=String(m?.cadence||'MONTHLY').toUpperCase(),month=Number(String(ym).slice(5,7));if(cad==='MONTHLY')return true;if(cad==='SEMI_FIXED')return (m.activeMonths||m.months||[]).map(Number).includes(month);if(cad==='ANNUAL')return Number(m.dueMonth||m.paymentMonth||m.annualMonth||m.month)===month;return false}
  function masterDay(m){return Number(m?.dueDay||m?.paymentDay||m?.day)||1}
  function occurrenceOverride(st,m,ym){const date=dateFor(ym,masterDay(m));return (st.masterOccurrenceOverrides||[]).find(o=>String(o.master_id)===String(m.id)&&String(o.occurrence_date)===date)||null}

  function usageFor(st,c,ym){
    const purchases=(st.purchaseEvents||[]).filter(p=>sameCard(p.card,c.name)&&String(p.billing_month||'')===ym&&!p.is_refinance_adjustment);
    const purchaseItems=purchases.map(p=>({name:p.merchant_raw||p.merchant_normalized||'カード利用',amount:purchaseAmount(p),id:p.purchase_id||p.id||''}));
    let scheduledTotal=0;const scheduled=[];
    for(const m of st.masters?.fixedExpenses||[]){
      if(m.active===false||m.forecastEnabled===false||routeOf(m)!=='CARD'||!m.paymentCard||!sameCard(m.paymentCard,c.name)||!masterOccurs(m,ym))continue;
      if(purchases.some(p=>String(p.fixed_expense_master_id||'')===String(m.id)))continue;
      const o=occurrenceOverride(st,m,ym);if(o?.action==='SKIP')continue;
      const amount=o?.action==='OVERRIDE'&&Number.isFinite(Number(o.amount))?Math.abs(Number(o.amount)):Math.abs(Number(m.amount)||0);if(!amount)continue;
      const name=o?.action==='OVERRIDE'&&o.name?o.name:(m.name||'固定費');scheduled.push({name,amount,id:m.id});scheduledTotal+=amount;
    }
    return {purchaseItems,known:purchaseItems.reduce((a,x)=>a+x.amount,0),scheduled,scheduledTotal};
  }

  function revolvingRows(st,days=180){
    const from=iso(new Date()),toDate=new Date(`${from}T12:00:00`);toDate.setDate(toDate.getDate()+Math.max(0,Number(days)||180));const to=iso(toDate),start=from.slice(0,7),months=Math.max(1,Math.ceil((Number(days)||180)/28)+1),rows=[],warnings=[];
    for(const c of (st.masters?.cards||[]).filter(isRevolving)){
      const pay=monthlyPayment(c),day=settlementDay(st,c);
      if(!pay){warnings.push({card:c.name,reason:'リボ毎月返済額が未設定'});continue}
      if(!day){warnings.push({card:c.name,reason:'引落日が未設定'});continue}
      for(let i=0;i<months;i++){
        const ym=addMonths(start,i),date=dateFor(ym,day);if(date<from||date>to||hasActual(st,c.name,ym))continue;
        const u=usageFor(st,c,ym),bal=balanceValue(c);
        rows.push({id:`card-revolving:${c.id}:${ym}`,date,name:`${c.name} リボ返済`,amount:-pay,type:'CARD_REVOLVING_PAYMENT',source:'card_revolving_v66',generated:true,record_kind:'FORECAST_EVENT',economic_type:'TRANSFER',spending_class:null,category:null,subcategory:null,estimated:true,card:c.name,billing_month:ym,payment_model:'REVOLVING',revolving_payment_amount:pay,revolving_balance:bal,revolving_balance_as_of:c.revolvingBalanceAsOf||null,principal_unknown:true,fee_interest_unknown:true,known_purchase_total:u.known,scheduled_fixed_total:u.scheduledTotal,usage_total:u.known+u.scheduledTotal,component_count:u.purchaseItems.length+u.scheduled.length,components:{purchases:u.purchaseItems,scheduled:u.scheduled}})
      }
    }
    return {rows,warnings};
  }
  function isEstimate(r){return String(r?.type||'')==='CARD_ESTIMATE'||String(r?.source||'')==='card_estimate_v49'}
  function adjustPlan(base,days=180){
    const st=stateNow(),p=structuredClone(base||{rows:[],warnings:[]});
    p.rows=(p.rows||[]).filter(r=>!(isEstimate(r)&&revCardFor(st,r.card)));
    const rev=revolvingRows(st,days);const ids=new Set(p.rows.map(r=>String(r.id)));p.rows.push(...rev.rows.filter(r=>!ids.has(String(r.id))));p.warnings=[...(p.warnings||[]),...rev.warnings];p.rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.name).localeCompare(String(b.name),'ja'));return p;
  }

  const previousPlan=window.householdCardForecastV49;
  if(typeof previousPlan==='function'&&!window.__revolvingPlanV66){
    window.__revolvingPlanV66=true;
    window.householdCardForecastV49=function householdCardForecastV66(days=180){return adjustPlan(previousPlan(days),days)};
  }
  if(typeof generated==='function'&&!window.__revolvingGeneratedV66){
    window.__revolvingGeneratedV66=true;const previousGenerated=generated;
    generated=function generatedRevolvingV66(days=90){
      const st=stateNow(),base=previousGenerated(days).filter(r=>!(isEstimate(r)&&revCardFor(st,r.card))),rev=revolvingRows(st,days),ids=new Set(base.map(r=>String(r.id)));return [...base,...rev.rows.filter(r=>!ids.has(String(r.id)))].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.name).localeCompare(String(b.name),'ja'));
    };
  }

  function syncAggregateBalance(st){
    st.assets=st.assets||{};const rev=(st.masters?.cards||[]).filter(isRevolving),vals=rev.map(balanceValue).filter(v=>v!==null);
    if(vals.length){st.assets.revolvingBalance=vals.reduce((a,v)=>a+v,0);st.revolvingBalanceManagedByCards=true}
    else if(st.revolvingBalanceManagedByCards)st.assets.revolvingBalance=0;
  }
  function persistCard(id,panel){
    const st=stateNow(),c=(st.masters?.cards||[]).find(x=>String(x.id)===String(id));if(!c)return;
    const mode=panel.querySelector('[data-v66-mode]')?.value||'FULL',monthlyRaw=panel.querySelector('[data-v66-monthly]')?.value??'',balanceRaw=panel.querySelector('[data-v66-balance]')?.value??'',asOf=panel.querySelector('[data-v66-asof]')?.value||'';
    const monthly=monthlyRaw===''?0:Number(monthlyRaw),balance=balanceRaw===''?null:Number(balanceRaw);
    if(mode==='REVOLVING'&&(!Number.isFinite(monthly)||monthly<=0))return alert('リボの毎月返済額を入力してください。');
    if(balance!==null&&(!Number.isFinite(balance)||balance<0))return alert('現在リボ残高を確認してください。');
    window.treasuryRecoverySnapshot?.(`カード「${c.name||''}」支払方式変更直前`);
    c.paymentMode=mode;c.payment_mode=mode;c.revolvingMonthlyPayment=Number.isFinite(monthly)?Math.max(0,monthly):0;c.revolvingBalance=balance;c.revolvingBalanceAsOf=balance!==null?(asOf||iso(new Date())):null;c.revolvingDetailMode='MANUAL_PAYMENT_ONLY';c.revolvingUpdatedAt=new Date().toISOString();c.updatedAt=new Date().toISOString();
    st.masters=st.masters||{};st.masters.updatedAt=new Date().toISOString();st.cardPaymentModelVersion=66;syncAggregateBalance(st);
    window.replaceTreasuryState?.(st);window.setTreasurySaveStatus?.('カード支払方式保存済み・同期中');window.cloudSyncOnLocalSave?.();
    setTimeout(()=>{patchSettings();window.renderCardDetailV64?.();try{render()}catch{}},0);
  }
  function togglePanel(panel){const rev=panel.querySelector('[data-v66-mode]')?.value==='REVOLVING';panel.querySelectorAll('[data-v66-rev-only]').forEach(el=>el.hidden=!rev);const note=panel.querySelector('[data-v66-mode-note]');if(note)note.textContent=rev?'Cash Flowは購入総額ではなく毎月返済額を使います。購入明細は支出として残ります。':'一括払いは利用明細＋カード固定費から見込請求を計算します。'}
  function panelHtml(c){const mode=paymentMode(c),monthly=monthlyPayment(c),bal=balanceValue(c);return `<div class="card" data-v66-card-panel="${esc(String(c.id))}" style="padding:10px;margin:6px 0 12px"><div class="form" style="grid-template-columns:repeat(3,1fr);gap:8px"><div class="field"><label>支払方式</label><select data-v66-mode><option value="FULL" ${mode==='FULL'?'selected':''}>一括</option><option value="REVOLVING" ${mode==='REVOLVING'?'selected':''}>リボ</option></select></div><div class="field" data-v66-rev-only ${mode==='REVOLVING'?'':'hidden'}><label>毎月返済額</label><input type="number" min="0" inputmode="numeric" data-v66-monthly value="${monthly||''}" placeholder="例 30000"></div><div class="field" data-v66-rev-only ${mode==='REVOLVING'?'':'hidden'}><label>現在リボ残高</label><input type="number" min="0" inputmode="numeric" data-v66-balance value="${bal===null?'':bal}" placeholder="不明なら空欄"></div><div class="field" data-v66-rev-only ${mode==='REVOLVING'?'':'hidden'}><label>残高基準日</label><input type="date" data-v66-asof value="${esc(c.revolvingBalanceAsOf||'')}"></div></div><div class="tiny" data-v66-mode-note style="margin-top:7px">${mode==='REVOLVING'?'Cash Flowは購入総額ではなく毎月返済額を使います。購入明細は支出として残ります。':'一括払いは利用明細＋カード固定費から見込請求を計算します。'}</div>${mode==='REVOLVING'?'<div class="tiny warn" style="margin-top:4px">元本・手数料の内訳はCSV等で取得できない限り推測しません。</div>':''}<div class="controls" style="margin-top:8px"><button type="button" class="btn" data-v66-save="${esc(String(c.id))}">支払方式を保存</button></div></div>`}
  function patchSettings(){
    const host=$('semanticCardRowsV48');if(!host)return;const st=stateNow();
    for(const c of st.masters?.cards||[]){if(c.active===false)continue;const save=host.querySelector(`[data-v48-card-save="${CSS.escape(String(c.id))}"]`),row=save?.closest('.row');if(!row)continue;let p=host.querySelector(`[data-v66-card-panel="${CSS.escape(String(c.id))}"]`);if(!p){const holder=document.createElement('div');holder.innerHTML=panelHtml(c);p=holder.firstElementChild;row.insertAdjacentElement('afterend',p)}togglePanel(p)}
  }

  function horizon(){return Number(document.querySelector('#mobileCashflowV60 [data-v60-h].active')?.dataset.v60H)||30}
  function cashRows(){try{return typeof forecast==='function'?(forecast(horizon()).rows||[]):[]}catch{return[]}}
  function revDetail(row){const items=[...(row.components?.purchases||[]).map(x=>({name:x.name||'カード利用',amount:x.amount,meta:'利用明細'})),...(row.components?.scheduled||[]).map(x=>({name:x.name||'固定費予定',amount:x.amount,meta:'未実績のカード固定費'}))];return `<div class="row"><span>次回リボ返済</span><b>${yen(Math.abs(Number(row.amount)||0))}</b></div><div class="row"><span>取込済み利用</span><b>${yen(row.known_purchase_total||0)}</b></div><div class="row"><span>未実績固定費</span><b>${yen(row.scheduled_fixed_total||0)}</b></div>${row.revolving_balance!==null&&row.revolving_balance!==undefined?`<div class="row"><span>現在リボ残高</span><b>${yen(row.revolving_balance)}</b></div>`:''}<div class="note" style="margin-top:7px">元本・手数料の内訳は未取得のため推測していません。返済額だけをCash Flowへ反映します。</div><div class="tiny" style="margin:8px 0 4px">利用・予定内訳 ${items.length}件</div>${items.length?items.map(x=>`<div class="row"><div><b>${esc(x.name)}</b><div class="tiny">${esc(x.meta)}</div></div><b>${yen(x.amount)}</b></div>`).join(''):'<div class="muted">利用明細はまだありません。</div>'}`}
  function patchMobile(){
    const host=$('mobileCashflowRowsV60');if(!host)return;const rows=cashRows(),dom=[...host.querySelectorAll('.v60-row')];
    dom.forEach((el,i)=>{const r=rows[i];if(String(r?.type||'')!=='CARD_REVOLVING_PAYMENT')return;let actions=el.querySelector('.v60-actions');if(!actions){actions=document.createElement('div');actions.className='v60-actions';el.appendChild(actions)}if(!actions.querySelector('[data-v66-inline-toggle]')){const b=document.createElement('button');b.type='button';b.className='btn secondary';b.dataset.v66InlineToggle='1';b.textContent=`内訳 ${Number(r.component_count)||0}件`;actions.appendChild(b)}let p=el.querySelector('.v66-inline-detail');if(!p){p=document.createElement('div');p.className='v66-inline-detail';p.hidden=true;el.appendChild(p)}p.innerHTML=revDetail(r)});
    if(!host.dataset.v66Bound){host.dataset.v66Bound='1';host.addEventListener('click',e=>{const b=e.target.closest?.('[data-v66-inline-toggle]');if(!b)return;e.preventDefault();e.stopPropagation();const p=b.closest('.v60-row')?.querySelector('.v66-inline-detail');if(p)p.hidden=!p.hidden})}
  }
  function patchForecastDetails(){
    const host=$('cardForecastStableRowsV64');if(!host)return;let plan=[];try{plan=window.householdCardForecastV49?.().rows?.slice(0,18)||[]}catch{}const cards=[...host.children];
    cards.forEach((el,i)=>{const r=plan[i];if(r?.payment_model!=='REVOLVING')return;const tiny=el.querySelector('.v64-toggle .tiny');if(tiny)tiny.textContent='リボ返済見込';const detail=el.querySelector('.v64-detail');if(detail&&!detail.querySelector('[data-v66-rev-head]')){const d=document.createElement('div');d.dataset.v66RevHead='1';d.innerHTML=`<div class="row"><span>次回リボ返済</span><b>${yen(Math.abs(Number(r.amount)||0))}</b></div>${r.revolving_balance!==null&&r.revolving_balance!==undefined?`<div class="row"><span>現在リボ残高</span><b>${yen(r.revolving_balance)}</b></div>`:''}<div class="tiny warn" style="margin:6px 0">元本・手数料内訳は未取得のため推測しません。</div>`;detail.prepend(d)}})
  }
  function queueSettings(){clearTimeout(settingsTimer);settingsTimer=setTimeout(patchSettings,50)}
  function queueMobile(){clearTimeout(mobileTimer);mobileTimer=setTimeout(()=>{patchMobile();patchForecastDetails()},70)}
  function installCss(){if($('revolvingStyleV66'))return;const s=document.createElement('style');s.id='revolvingStyleV66';s.textContent=`.v66-inline-detail{margin-top:8px;padding:8px;border:1px solid #263755;border-radius:10px}@media(max-width:760px){[data-v66-card-panel] .form{grid-template-columns:1fr!important}[data-v66-card-panel] input,[data-v66-card-panel] select{width:100%!important;max-width:100%!important}}`;document.head.appendChild(s)}

  document.addEventListener('change',e=>{const mode=e.target.closest?.('[data-v66-mode]');if(mode)togglePanel(mode.closest('[data-v66-card-panel]'))});
  document.addEventListener('click',e=>{const save=e.target.closest?.('[data-v66-save]');if(save){e.preventDefault();e.stopPropagation();return persistCard(save.dataset.v66Save,save.closest('[data-v66-card-panel]'))}if(e.target.closest?.('[data-page="settings"]'))queueSettings();if(e.target.closest?.('[data-page="cashflow"],#mobileCashflowV60 [data-v60-h]'))queueMobile()});
  window.addEventListener('focus',()=>{queueSettings();queueMobile()});

  function boot(){installCss();patchSettings();queueMobile();const sh=$('semanticCardRowsV48');if(sh){settingsObserver=new MutationObserver(queueSettings);settingsObserver.observe(sh,{childList:true,subtree:false})}const mh=$('mobileCashflowRowsV60');if(mh){mobileObserver=new MutationObserver(queueMobile);mobileObserver.observe(mh,{childList:true,subtree:false})}const fh=$('cardForecastStableRowsV64');if(fh){forecastObserver=new MutationObserver(queueMobile);forecastObserver.observe(fh,{childList:true,subtree:false})}window.renderRevolvingCardV66=()=>{patchSettings();patchMobile();patchForecastDetails()};window.householdRevolvingCardV66={adjustPlan,revolvingRows,paymentMode,monthlyPayment,balanceValue}}
  function wait(n=0){if($('semanticCardRowsV48')&&$('mobileCashflowV60'))return boot();if(n<60)setTimeout(()=>wait(n+1),100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>wait(),{once:true});else wait();
})();