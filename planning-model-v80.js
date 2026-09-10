(() => {
  if (window.__planningModelV80) return;
  window.__planningModelV80 = true;

  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const iso=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  const sameCard=(a,b)=>{try{return window.householdCardIdentityV51?.sameCard?.(a,b)??norm(a)===norm(b)}catch{return norm(a)===norm(b)}};
  const addMonths=(ym,n)=>{const [y,m]=String(ym).split('-').map(Number),d=new Date(y,m-1+n,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const lastDay=(y,m)=>new Date(y,m,0).getDate();
  const dateFor=(ym,day)=>{const [y,m]=String(ym).split('-').map(Number);return `${ym}-${String(Math.min(Math.max(1,Number(day)||1),lastDay(y,m))).padStart(2,'0')}`};
  const baselineOf=c=>window.householdPlanningV79?.baselineOf?.(c)||0;
  const forecastMode=c=>window.householdPlanningV79?.forecastMode?.(c)||'COMPONENTS';
  const paymentMode=c=>window.householdPlanningV79?.paymentMode?.(c)||'FULL';
  const cardMaster=(st,name)=>(st.masters?.cards||[]).find(c=>c.active!==false&&sameCard(c.name,name))||null;
  const estimateKey=(card,ym)=>`ESTIMATE|${norm(card)}|${ym}`;
  const manualOverride=(st,card,ym)=>(st.cardCashflowOverrides||[]).find(o=>String(o.key||'')===estimateKey(card,ym))||null;

  function settlementDay(st,c){
    for(const v of [c?.settlementDay,c?.paymentDay,c?.dueDay]){const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=31)return n}
    const history=(st.cardSettlements||[]).filter(s=>s.due_date&&sameCard(s.card,c?.name)&&Math.abs(Number(s.amount)||0)>0).sort((a,b)=>String(b.due_date).localeCompare(String(a.due_date)));
    return history.length?Number(String(history[0].due_date).slice(8,10))||null:null;
  }
  function meaningfulActual(st,card,ym){
    return (st.cardSettlements||[]).find(s=>sameCard(s.card,card)&&String(s.due_date||'').slice(0,7)===ym&&Number.isFinite(Number(s.amount))&&Math.abs(Number(s.amount))>0)||null;
  }
  function monthlyBaselineCards(st){
    return (st.masters?.cards||[]).filter(c=>c.active!==false&&paymentMode(c)==='FULL'&&forecastMode(c)==='BASELINE'&&baselineOf(c)>0);
  }
  function coveredMonths(days){
    const from=iso(new Date()),toD=new Date(`${from}T12:00:00`);toD.setDate(toD.getDate()+Math.max(0,Number(days)||0));const to=iso(toD),out=[];for(let ym=from.slice(0,7);ym<=to.slice(0,7);ym=addMonths(ym,1))out.push(ym);return{from,to,months:out};
  }

  function stabilizeBaselineRows(input,days=180){
    const st=stateNow(),range=coveredMonths(days),rows=(input||[]).map(r=>({...r})),byKey=new Map();
    for(const r of rows){
      if(String(r.type||'')!=='CARD_ESTIMATE')continue;
      const key=`${norm(r.card)}|${String(r.billing_month||String(r.date||'').slice(0,7))}`;if(!byKey.has(key))byKey.set(key,r);
      const c=cardMaster(st,r.card);if(!c||paymentMode(c)!=='FULL'||forecastMode(c)!=='BASELINE')continue;
      const base=baselineOf(c);if(!base||r.card_cashflow_override)continue;
      const components=Math.max(0,Number(r.known_purchase_total)||0)+Math.max(0,Number(r.scheduled_fixed_total)||0),total=Math.max(base,components);
      r.amount=-total;r.baseline_amount=base;r.forecast_method='BASELINE_FLOOR_V80';r.baseline_floor_applied=total===base;
    }
    for(const c of monthlyBaselineCards(st)){
      const day=settlementDay(st,c);if(!day)continue;
      for(const ym of range.months){
        const date=dateFor(ym,day);if(date<range.from||date>range.to)continue;
        if(meaningfulActual(st,c.name,ym))continue;
        const key=`${norm(c.name)}|${ym}`,existing=byKey.get(key),o=manualOverride(st,c.name,ym),base=baselineOf(c);
        if(existing){
          if(o&&!existing.card_cashflow_override){existing.amount=-Math.max(0,Number(o.amount)||0);existing.date=o.date||existing.date;existing.card_cashflow_override=true;existing.card_cashflow_override_id=o.id||null}
          continue;
        }
        const amount=o?Math.max(0,Number(o.amount)||0):base;
        const row={id:`card-estimate:baseline-v80:${norm(c.name)}:${ym}`,date:o?.date||date,name:`${c.name} 見込請求`,amount:-amount,type:'CARD_ESTIMATE',source:'card_estimate_v80',generated:true,record_kind:'FORECAST_EVENT',economic_type:'TRANSFER',estimated:true,card:c.name,billing_month:ym,known_purchase_total:0,scheduled_fixed_total:0,component_count:0,components:{purchases:[],scheduled:[]},baseline_amount:base,forecast_method:'BASELINE_FLOOR_V80',baseline_floor_applied:!o,card_cashflow_override:!!o,card_cashflow_override_id:o?.id||null};
        rows.push(row);byKey.set(key,row);
      }
    }
    return rows.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
  }

  function baselinePreview(monthCount=6){
    const st=stateNow(),start=iso(new Date()).slice(0,7),months=Array.from({length:Math.max(1,monthCount)},(_,i)=>addMonths(start,i)),out=[];
    for(const c of monthlyBaselineCards(st)){
      const day=settlementDay(st,c),base=baselineOf(c),series=[];
      for(const ym of months){
        const actual=meaningfulActual(st,c.name,ym),override=manualOverride(st,c.name,ym),date=day?dateFor(ym,day):null;
        series.push({ym,date,amount:actual?Math.abs(Number(actual.amount)||0):override?Math.max(0,Number(override.amount)||0):base,source:actual?'ACTUAL':override?'OVERRIDE':'BASELINE'});
      }
      out.push({card:c.name,baseline:base,settlementDay:day,months:series});
    }
    return out;
  }

  const prevCardPlan=window.householdCardForecastV49;
  if(typeof prevCardPlan==='function'&&!window.__planningCardPlanV80){window.__planningCardPlanV80=true;window.householdCardForecastV49=function(days=180){const p=structuredClone(prevCardPlan(days)||{rows:[],warnings:[]});p.rows=stabilizeBaselineRows(p.rows,Math.max(180,Number(days)||180));return p}}
  if(typeof generated==='function'&&!window.__planningGeneratedV80){window.__planningGeneratedV80=true;const prevGenerated=generated;generated=function generatedPlanningV80(days=90){return stabilizeBaselineRows(prevGenerated(days),days)}}

  window.householdPlanningV80={stabilizeBaselineRows,baselinePreview,meaningfulActual,settlementDay,coveredMonths};
})();
