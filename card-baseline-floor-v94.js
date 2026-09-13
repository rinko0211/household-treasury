(() => {
  if (window.__cardBaselineFloorV94) return;
  window.__cardBaselineFloorV94 = true;

  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const sameCard = (a,b) => {
    try { return window.householdCardIdentityV51?.sameCard?.(a,b) ?? norm(a) === norm(b); }
    catch { return norm(a) === norm(b); }
  };
  const baselineOf = c => {
    for (const v of [c?.monthlyBaselineAmount,c?.cardBaselineAmount,c?.forecastBaseline]) {
      if (v !== null && v !== '' && Number.isFinite(Number(v))) return Math.max(0,Number(v));
    }
    return 0;
  };
  const paymentMode = c => String(c?.paymentMode || c?.payment_mode || 'FULL').toUpperCase() === 'REVOLVING' ? 'REVOLVING' : 'FULL';
  const forecastMode = c => String(c?.forecastMode || c?.forecast_mode || (baselineOf(c)>0?'BASELINE':'COMPONENTS')).toUpperCase() === 'BASELINE' ? 'BASELINE' : 'COMPONENTS';
  const estimateKey = (card,ym) => `ESTIMATE|${norm(card)}|${ym}`;

  function cardMaster(st,name){
    return (st.masters?.cards || []).find(c => c.active !== false && sameCard(c.name,name)) || null;
  }
  function rowMonth(r){ return String(r?.billing_month || r?.date || '').slice(0,7); }
  function isEstimate(r){
    const type=String(r?.type||'').toUpperCase(),src=String(r?.source||'').toLowerCase();
    return type === 'CARD_ESTIMATE' || src.startsWith('card_estimate');
  }
  function manualOverride(st,card,ym){
    const direct=(st.cardCashflowOverrides||[]).find(o=>String(o.key||'')===estimateKey(card,ym));
    if(direct)return direct;
    return (st.cardCashflowOverrides||[]).find(o=>String(o.billing_month||o.ym||'')===ym&&sameCard(o.card||o.card_name||'',card))||null;
  }
  function meaningfulActual(st,card,ym){
    return (st.cardSettlements||[]).find(s=>sameCard(s.card,card)&&String(s.due_date||'').slice(0,7)===ym&&Number.isFinite(Number(s.amount))&&Math.abs(Number(s.amount))>0)||null;
  }
  function knownComponents(r){
    const direct=Math.max(0,Number(r?.known_purchase_total)||0)+Math.max(0,Number(r?.scheduled_fixed_total)||0);
    if(direct>0)return direct;
    const purchases=(r?.components?.purchases||[]).reduce((a,x)=>a+Math.abs(Number(x?.amount)||0),0);
    const scheduled=(r?.components?.scheduled||[]).reduce((a,x)=>a+Math.abs(Number(x?.amount)||0),0);
    return purchases+scheduled;
  }
  function floorAmount(c,r){
    const base=baselineOf(c),existing=Math.abs(Number(r?.amount)||0),components=knownComponents(r);
    return Math.max(base,existing,components);
  }

  function normalizeRows(input){
    const st=stateNow(),out=[];
    for(const original of input||[]){
      const r={...original};
      if(!isEstimate(r)){out.push(r);continue;}
      const c=cardMaster(st,r.card||String(r.name||'').replace(/\s*見込請求.*$/,''));
      if(!c||paymentMode(c)!=='FULL'||forecastMode(c)!=='BASELINE'||baselineOf(c)<=0){out.push(r);continue;}
      const ym=rowMonth(r);
      if(!/^\d{4}-\d{2}$/.test(ym)){out.push(r);continue;}
      if(meaningfulActual(st,c.name,ym))continue;
      const override=manualOverride(st,c.name,ym);
      const amount=override?Math.max(0,Number(override.amount)||0):floorAmount(c,r);
      r.card=c.name;
      r.billing_month=ym;
      r.amount=-amount;
      if(override?.date)r.date=override.date;
      r.name=override?`${c.name} 月別補正`:`${c.name} 見込請求`;
      r.type='CARD_ESTIMATE';
      r.generated=true;
      r.baseline_amount=baselineOf(c);
      r.forecast_method=override?'MANUAL_OVERRIDE':'BASELINE_FLOOR_V94';
      r.baseline_floor_applied=!override&&amount===baselineOf(c);
      r.card_cashflow_override=!!override;
      r.card_cashflow_override_id=override?.id||null;
      r.baseline_exact_applied_v91=false;
      r.standard_forecast_applied_v92=false;
      out.push(r);
    }
    return out.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
  }

  function patchPlanning(){
    const p=window.householdPlanningV79;
    if(!p||p.__baselineFloorV94)return;
    const oldMode=p.forecastMode?.bind(p);
    p.forecastMode=c=>baselineOf(c)>0?'BASELINE':(oldMode?.(c)||'COMPONENTS');
    p.forecastAmountForCard=(c,components=0)=>{
      const comp=Math.max(0,Number(components)||0),base=baselineOf(c);
      return base>0?Math.max(base,comp):comp;
    };
    p.__baselineFloorV94=true;
  }

  function install(){
    patchPlanning();
    if(typeof generated==='function'&&!window.__generatedBaselineFloorV94){
      window.__generatedBaselineFloorV94=true;
      const previousGenerated=generated;
      generated=function generatedBaselineFloorV94(days=90){return normalizeRows(previousGenerated(days));};
    }
    if(typeof window.householdCardForecastV49==='function'&&!window.__cardPlanBaselineFloorV94){
      window.__cardPlanBaselineFloorV94=true;
      const previousPlan=window.householdCardForecastV49;
      window.householdCardForecastV49=function cardPlanBaselineFloorV94(days=180){
        const plan=structuredClone(previousPlan(days)||{rows:[],warnings:[]});
        plan.rows=normalizeRows(plan.rows);
        plan.baselineFloorVersion=94;
        return plan;
      };
    }
    window.householdCardBaselineFloorV94={normalizeRows,floorAmount,baselineOf,forecastMode,paymentMode,manualOverride,meaningfulActual};
  }

  function refresh(){
    try{window.renderMobileInteractionV70?.();}catch{}
    try{window.renderForecastV38?.();}catch{}
    try{window.renderPlanningUiV79?.();}catch{}
  }

  function loadCardMasterV95(){
    if(typeof document==='undefined')return;
    if(window.__cardMasterBaselineV95||document.querySelector('script[data-household-card-master-baseline-v95]'))return;
    const script=document.createElement('script');
    script.src='./card-master-baseline-v95.js?v=95';
    script.async=false;
    script.setAttribute('data-household-card-master-baseline-v95','1');
    document.head.appendChild(script);
  }

  install();
  loadCardMasterV95();
  setTimeout(()=>{install();refresh();loadCardMasterV95();},0);
  setTimeout(()=>{install();refresh();loadCardMasterV95();},150);
})();
