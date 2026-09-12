(function(root){
  'use strict';
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const addMonths=(ym,n)=>{const [y,m]=String(ym).split('-').map(Number),d=new Date(y,m-1+n,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const lastDay=(y,m)=>new Date(y,m,0).getDate();
  const dateFor=(ym,day)=>{const [y,m]=String(ym).split('-').map(Number);return `${ym}-${String(Math.min(Math.max(1,Number(day)||1),lastDay(y,m))).padStart(2,'0')}`};
  const isoDate=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};

  function canonicalCard(s){
    const raw=norm(s),n=raw.replace(/カード|CARD/g,'');if(!n)return'';
    if((n.includes('MUFG')&&n.includes('DC')&&n.includes('JAL'))||n==='MUFGDCJAL')return'AMBIG_MUFG_DC_JAL';
    if(/RAKUTEN|楽天/.test(raw))return'RAKUTEN';
    if(/KABU&|KABUAND|カブアンド/.test(raw))return'KABU&';
    if(/JAL/.test(raw))return'JAL';
    if(n==='D'||/DOCOMO|DCMX/.test(raw))return'D_CARD';
    if(/MUFG|三菱UFJ|ミツビシUFJ/.test(raw))return'MUFG';
    if(n==='DC'||/^DC/.test(n))return'DC';
    if(/JCB|ジェーシービー|シ゛エーシーヒ゛ー/.test(raw))return'JCB';
    return n;
  }
  function sameCard(a,b){const x=canonicalCard(a),y=canonicalCard(b);return !!x&&!!y&&x===y}
  function closingDayValue(card){
    for(const v of [card?.closingDay,card?.statementClosingDay,card?.cutoffDay]){const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=31)return n}
    return canonicalCard(card?.name)==='JAL'?15:null;
  }
  function settlementDayValue(card){
    for(const v of [card?.settlementDay,card?.paymentDay,card?.dueDay]){const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=31)return n}
    return canonicalCard(card?.name)==='JAL'?10:null;
  }
  function billingMonthForDate(date,closingDay,lagMonths=1){
    const s=String(date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return'';const ym=s.slice(0,7),day=Number(s.slice(8,10)),cut=Number(closingDay);
    if(!Number.isInteger(cut)||cut<1||cut>31)return ym;
    const closeYm=day<=cut?ym:addMonths(ym,1);return addMonths(closeYm,Math.max(0,Number(lagMonths)||0));
  }
  function paymentDateForSpend(card,date){const ym=billingMonthForDate(date,closingDayValue(card),1),day=settlementDayValue(card);return ym&&day?dateFor(ym,day):''}

  const pure={canonicalCard,sameCard,closingDayValue,settlementDayValue,billingMonthForDate,paymentDateForSpend,addMonths,dateFor};
  if(typeof module!=='undefined'&&module.exports)module.exports=pure;
  if(!root)return;
  if(root.__cardCycleV81)return;root.__cardCycleV81=true;

  const stateNow=()=> (root.getTreasuryStateRaw||root.getTreasuryState)?.()||{};
  const paymentMode=c=>String(c?.paymentMode||c?.payment_mode||'FULL').toUpperCase()==='REVOLVING'?'REVOLVING':'FULL';
  const routeOf=m=>String(m?.paymentRoute||m?.payment_route||'DIRECT').toUpperCase();
  const baselineOf=c=>root.householdPlanningV79?.baselineOf?.(c)||0;
  const forecastMode=c=>root.householdPlanningV79?.forecastMode?.(c)||'COMPONENTS';
  const forecastAmountForCard=(c,components)=>root.householdPlanningV79?.forecastAmountForCard?.(c,components)??Math.max(baselineOf(c),Math.max(0,Number(components)||0));
  const estimateKey=(card,ym)=>`ESTIMATE|${norm(card)}|${ym}`;

  function activeCards(st){return (st.masters?.cards||[]).filter(c=>c.active!==false)}
  function familyCandidates(st){return activeCards(st).filter(c=>['JAL','MUFG','DC'].includes(canonicalCard(c.name)))}
  function resolveCardName(st,raw){
    const c=canonicalCard(raw);if(!c)return String(raw||'');
    if(c==='AMBIG_MUFG_DC_JAL'){const a=familyCandidates(st);return a.length===1?a[0].name:String(raw||'')}
    const exact=activeCards(st).filter(x=>canonicalCard(x.name)===c);return exact.length===1?exact[0].name:String(raw||'');
  }
  function cardMatches(st,raw,target){const r=resolveCardName(st,raw);return sameCard(r,target)||String(r)===String(target)}
  function manualOverride(st,card,ym){return (st.cardCashflowOverrides||[]).find(o=>String(o.key||'')===estimateKey(card,ym))||null}
  function meaningfulActual(st,card,ym){return (st.cardSettlements||[]).find(s=>cardMatches(st,s.card,card)&&String(s.due_date||'').slice(0,7)===ym&&Number.isFinite(Number(s.amount))&&Math.abs(Number(s.amount))>0)||null}
  function purchaseAmount(p){const v=p?.payment_amount;return v!==null&&v!==''&&Number.isFinite(Number(v))?Math.abs(Number(v)):Math.abs(Number(p?.original_amount)||0)}
  function masterDay(m){for(const v of [m?.dueDay,m?.paymentDay,m?.day]){const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=31)return n}return 1}
  function masterOccurs(m,ym){
    const cad=String(m?.cadence||'MONTHLY').toUpperCase(),month=Number(String(ym).slice(5,7));
    if(cad==='MONTHLY')return true;
    if(cad==='SEMI_FIXED')return (m.activeMonths||m.months||[]).map(Number).includes(month);
    if(cad==='ANNUAL'){if(Number(m.lastPaidYear)>=Number(String(ym).slice(0,4)))return false;return Number(m.dueMonth||m.paymentMonth||m.annualMonth||m.month)===month}
    return false;
  }
  function linkedToMaster(p,m){if(String(p?.fixed_expense_master_id||'')===String(m?.id||''))return true;const a=norm(p?.merchant_raw||p?.merchant_normalized||''),b=norm(m?.name||'');return !!a&&!!b&&(a===b||a.includes(b)||b.includes(a))}
  function rangeFor(days){const from=isoDate(new Date()),d=new Date(`${from}T12:00:00`);d.setDate(d.getDate()+Math.max(0,Number(days)||0));return{from,to:isoDate(d)}}

  function scheduledForCard(st,card,range){
    const byYm=new Map(),firstYm=addMonths(range.from.slice(0,7),-1),lastYm=range.to.slice(0,7);
    for(const m of st.masters?.fixedExpenses||[]){
      if(m.active===false||m.forecastEnabled===false||routeOf(m)!=='CARD'||!m.paymentCard||!cardMatches(st,m.paymentCard,card.name))continue;
      for(let ym=firstYm;ym<=lastYm;ym=addMonths(ym,1)){
        if(!masterOccurs(m,ym))continue;const spendDate=dateFor(ym,masterDay(m)),payDate=paymentDateForSpend(card,spendDate);if(!payDate||payDate<range.from||payDate>range.to)continue;
        const payYm=payDate.slice(0,7),arr=byYm.get(payYm)||[];arr.push({master:m,spendDate,payDate,amount:Math.abs(Number(m.amount)||0)});byYm.set(payYm,arr);
      }
    }
    return byYm;
  }
  function knownForCard(st,card,ym){return (st.purchaseEvents||[]).filter(p=>cardMatches(st,p.card,card.name)&&String(p.billing_month||'')===ym&&!p.is_refinance_adjustment)}

  function buildPlan(days=180){
    const st=stateNow(),range=rangeFor(days),rows=[],warnings=[];
    for(const card of activeCards(st)){
      if(paymentMode(card)!=='FULL')continue;const settleDay=settlementDayValue(card);if(!settleDay){warnings.push({card:card.name,reason:'引落日未設定'});continue}
      const scheduled=scheduledForCard(st,card,range),months=new Set([...scheduled.keys()]);
      for(const p of st.purchaseEvents||[]){if(cardMatches(st,p.card,card.name)&&/^\d{4}-\d{2}$/.test(String(p.billing_month||'')))months.add(String(p.billing_month))}
      const base=baselineOf(card),useBaseline=forecastMode(card)==='BASELINE'&&base>0;
      if(useBaseline)for(let ym=range.from.slice(0,7);ym<=range.to.slice(0,7);ym=addMonths(ym,1))months.add(ym);
      for(const ym of [...months].sort()){
        const defaultDate=dateFor(ym,settleDay);if(defaultDate<range.from||defaultDate>range.to)continue;if(meaningfulActual(st,card.name,ym))continue;
        const purchases=knownForCard(st,card,ym),known=purchases.reduce((a,p)=>a+purchaseAmount(p),0),sched=(scheduled.get(ym)||[]).filter(s=>!purchases.some(p=>linkedToMaster(p,s.master))),scheduledTotal=sched.reduce((a,s)=>a+s.amount,0),components=known+scheduledTotal,o=manualOverride(st,card.name,ym),exactD=useBaseline&&canonicalCard(card.name)==='D_CARD';
        let amount=o?Math.max(0,Number(o.amount)||0):useBaseline?forecastAmountForCard(card,components):components;if(amount<=0)continue;
        rows.push({id:`card-estimate:v81:${norm(card.name)}:${ym}`,date:o?.date||defaultDate,name:`${card.name} 見込請求`,amount:-amount,type:'CARD_ESTIMATE',source:'card_estimate_v81',generated:true,record_kind:'FORECAST_EVENT',economic_type:'TRANSFER',estimated:true,card:card.name,billing_month:ym,known_purchase_total:known,scheduled_fixed_total:scheduledTotal,component_count:purchases.length+sched.length,components:{purchases:purchases.map(p=>({name:p.merchant_raw||'カード利用',amount:purchaseAmount(p)})),scheduled:sched.map(s=>({name:s.master.name||'予定',amount:s.amount,spend_date:s.spendDate,payment_date:s.payDate,master_id:s.master.id}))},baseline_amount:useBaseline?base:0,forecast_method:o?'MANUAL_OVERRIDE':exactD?'D_CARD_STANDARD_EXACT_V91':useBaseline?'BASELINE_CYCLE_V81':'COMPONENTS_CYCLE_V81',baseline_floor_applied:useBaseline&&!o&&!exactD&&amount===base,baseline_exact_applied_v91:exactD&&!o,card_cashflow_override:!!o,card_cashflow_override_id:o?.id||null,closing_day:closingDayValue(card),settlement_day:settleDay});
      }
    }
    rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.name).localeCompare(String(b.name),'ja'));return{rows,warnings};
  }

  function baselinePreview(count=6){
    const st=stateNow(),start=isoDate(new Date()).slice(0,7),months=Array.from({length:Math.max(1,count)},(_,i)=>addMonths(start,i)),out=[];
    for(const c of activeCards(st).filter(c=>paymentMode(c)==='FULL'&&forecastMode(c)==='BASELINE'&&baselineOf(c)>0)){
      const series=months.map(ym=>{const actual=meaningfulActual(st,c.name,ym),o=manualOverride(st,c.name,ym),base=baselineOf(c);return{ym,date:dateFor(ym,settlementDayValue(c)||1),amount:actual?Math.abs(Number(actual.amount)||0):o?Math.max(0,Number(o.amount)||0):base,source:actual?'ACTUAL':o?'OVERRIDE':'BASELINE'}});
      out.push({card:c.name,baseline:baselineOf(c),settlementDay:settlementDayValue(c),closingDay:closingDayValue(c),months:series});
    }return out;
  }

  function migrate(){
    const st=stateNow();st.masters=st.masters||{};st.masters.cards=Array.isArray(st.masters.cards)?st.masters.cards:[];st.masters.fixedExpenses=Array.isArray(st.masters.fixedExpenses)?st.masters.fixedExpenses:[];let changed=false;
    const jal=activeCards(st).filter(c=>canonicalCard(c.name)==='JAL');
    for(const c of jal){if(!closingDayValue({...c,name:''})){c.closingDay=15;c.statementClosingDay=15;changed=true}if(!settlementDayValue({...c,name:''})){c.settlementDay=10;changed=true}}
    for(const m of st.masters.fixedExpenses){
      if(routeOf(m)!=='CARD'||!m.paymentCard)continue;const resolved=resolveCardName(st,m.paymentCard);if(resolved&&resolved!==m.paymentCard&&canonicalCard(m.paymentCard)==='AMBIG_MUFG_DC_JAL'){m.paymentCard=resolved;changed=true}
      if(String(m.cadence||'').toUpperCase()==='ANNUAL'&&/ふるさと納税|FURUSATO/i.test(String(m.name||''))&&canonicalCard(m.paymentCard)==='D_CARD'&&jal.length===1){m.paymentCard=jal[0].name;changed=true}
    }
    if(changed){st.masters.updatedAt=new Date().toISOString();root.treasuryRecoverySnapshot?.('カード締め日・支払カードv81補正直前');root.replaceTreasuryState?.(st);root.setTreasurySaveStatus?.('カード締め日・支払カード補正済み・同期中');root.cloudSyncOnLocalSave?.()}
  }

  const oldIdentity=root.householdCardIdentityV51||{};root.householdCardIdentityV51={...oldIdentity,canonicalCard,sameCard,resolveCardName:(s)=>resolveCardName(stateNow(),s)};
  if(typeof generated==='function'&&!root.__generatedCardCycleV81){root.__generatedCardCycleV81=true;const old=generated;generated=function generatedCardCycleV81(days=90){const base=(old(days)||[]).filter(r=>String(r.type||'')!=='CARD_ESTIMATE'),p=buildPlan(days);return [...base,...p.rows].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''),'ja'))}}
  root.householdCardForecastV49=(days=180)=>buildPlan(days);
  if(root.householdPlanningV80)root.householdPlanningV80.baselinePreview=baselinePreview;
  root.householdCardCycleV81={...pure,resolveCardName:(s)=>resolveCardName(stateNow(),s),buildPlan,baselinePreview,migrate};
  setTimeout(migrate,0);
})(typeof window!=='undefined'?window:null);
