(() => {
  if (window.__planningModelV79) return;
  window.__planningModelV79 = true;

  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const iso=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  const sameCard=(a,b)=>{try{return window.householdCardIdentityV51?.sameCard?.(a,b)??norm(a)===norm(b)}catch{return norm(a)===norm(b)}};
  const paymentMode=c=>String(c?.paymentMode||c?.payment_mode||'FULL').toUpperCase()==='REVOLVING'?'REVOLVING':'FULL';
  const baselineOf=c=>{for(const v of [c?.monthlyBaselineAmount,c?.cardBaselineAmount,c?.forecastBaseline])if(v!==null&&v!==''&&Number.isFinite(Number(v)))return Math.max(0,Number(v));return 0};
  const forecastMode=c=>String(c?.forecastMode||c?.forecast_mode||(baselineOf(c)>0?'BASELINE':'COMPONENTS')).toUpperCase()==='BASELINE'?'BASELINE':'COMPONENTS';
  const addMonths=(ym,n)=>{const[y,m]=String(ym).split('-').map(Number),d=new Date(y,m-1+n,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const lastDay=(y,m)=>new Date(y,m,0).getDate();
  const dateFor=(ym,day)=>{const[y,m]=String(ym).split('-').map(Number);return `${ym}-${String(Math.min(Math.max(1,Number(day)||1),lastDay(y,m))).padStart(2,'0')}`};
  const settlementDay=(st,c)=>{for(const v of [c?.settlementDay,c?.paymentDay,c?.dueDay]){const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=31)return n}const h=(st.cardSettlements||[]).filter(s=>s.due_date&&sameCard(s.card,c?.name)).sort((a,b)=>String(b.due_date).localeCompare(String(a.due_date)));return h.length?Number(String(h[0].due_date).slice(8,10))||null:null};
  const hasActual=(st,card,ym)=>(st.cardSettlements||[]).some(s=>sameCard(s.card,card)&&String(s.due_date||'').slice(0,7)===ym);
  const estimateKey=(card,ym)=>`ESTIMATE|${norm(card)}|${ym}`;
  const manualOverride=(st,card,ym)=>(st.cardCashflowOverrides||[]).find(o=>String(o.key||'')===estimateKey(card,ym))||null;
  const cardMaster=(st,name)=>(st.masters?.cards||[]).find(c=>c.active!==false&&sameCard(c.name,name))||null;

  function enhanceCardRows(input,days=180){
    const st=stateNow(),from=iso(new Date()),rows=(input||[]).map(r=>({...r}));
    const existing=new Set();
    for(const r of rows){
      if(String(r.type||'')!=='CARD_ESTIMATE')continue;
      existing.add(`${norm(r.card)}|${r.billing_month}`);
      if(r.card_cashflow_override)continue;
      const c=cardMaster(st,r.card);if(!c||paymentMode(c)!=='FULL'||forecastMode(c)!=='BASELINE')continue;
      const base=baselineOf(c);if(!base)continue;
      const components=Math.max(0,Number(r.known_purchase_total)||0)+Math.max(0,Number(r.scheduled_fixed_total)||0),total=Math.max(base,components);
      r.amount=-total;r.baseline_amount=base;r.forecast_method='BASELINE_FLOOR';r.baseline_floor_applied=total===base;
    }
    const horizon=Math.max(1,Number(days)||180),months=Math.max(1,Math.ceil(horizon/28)+1),start=from.slice(0,7),toD=new Date(`${from}T12:00:00`);toD.setDate(toD.getDate()+horizon);const to=iso(toD);
    for(const c of st.masters?.cards||[]){
      const base=baselineOf(c);if(c.active===false||paymentMode(c)!=='FULL'||forecastMode(c)!=='BASELINE'||!base)continue;
      const day=settlementDay(st,c);if(!day)continue;
      for(let i=0;i<months;i++){
        const ym=addMonths(start,i),key=`${norm(c.name)}|${ym}`;if(existing.has(key)||hasActual(st,c.name,ym))continue;
        const date=dateFor(ym,day);if(date<from||date>to)continue;
        const o=manualOverride(st,c.name,ym),amount=o?Math.max(0,Number(o.amount)||0):base;
        rows.push({id:`card-estimate:baseline:${norm(c.name)}:${ym}`,date:o?.date||date,name:`${c.name} 見込請求`,amount:-amount,type:'CARD_ESTIMATE',source:'card_estimate_v79',generated:true,record_kind:'FORECAST_EVENT',economic_type:'TRANSFER',estimated:true,card:c.name,billing_month:ym,known_purchase_total:0,scheduled_fixed_total:0,component_count:0,components:{purchases:[],scheduled:[]},baseline_amount:base,forecast_method:'BASELINE_FLOOR',baseline_floor_applied:!o,card_cashflow_override:!!o,card_cashflow_override_id:o?.id||null});
        existing.add(key);
      }
    }
    return rows.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
  }

  function ensureSalaryRows(input,days=90){
    const st=stateNow(),salary=Math.max(0,Number(st.settings?.salary)||0);if(!salary)return input||[];
    const day=Math.min(31,Math.max(1,Number(st.settings?.salaryDay)||18)),rows=[...(input||[])],from=iso(new Date()),toD=new Date(`${from}T12:00:00`);toD.setDate(toD.getDate()+Math.max(0,Number(days)||90));const to=iso(toD),start=from.slice(0,7),months=Math.max(1,Math.ceil((Number(days)||90)/28)+1);
    for(let i=0;i<months;i++){
      const ym=addMonths(start,i),date=dateFor(ym,day);if(date<from||date>to)continue;
      const exists=rows.some(e=>String(e.date||'').slice(0,7)===ym&&Number(e.amount)>0&&Math.abs(Number(e.amount)-salary)<=1&&(String(e.source||'')==='settings_salary'||String(e.type||'').toUpperCase()==='SALARY'||/給与|SALARY/i.test(String(e.name||''))));
      if(!exists)rows.push({id:`salary:v79:${ym}`,date,name:'給与',amount:salary,type:'SALARY',future_kind:'INCOME',economic_type:'INCOME',generated:true,source:'settings_salary_v79'});
    }
    return rows.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
  }

  function dueMonthOf(item){for(const v of [item?.dueMonth,item?.paymentMonth,item?.annualMonth,item?.month]){const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=12)return n}return null}
  function reservedOf(item){for(const v of [item?.reservedAmount,item?.reserved_amount,item?.reserveAmount])if(v!==null&&v!==''&&Number.isFinite(Number(v)))return Math.max(0,Number(v));return 0}
  function bonusList(item){const out=[];if(Array.isArray(item?.bonusAllocations))for(const b of item.bonusAllocations){const month=Number(b?.month),amount=Number(b?.amount);if(month>=1&&month<=12&&amount>0)out.push({month,amount})}return out}
  function annualPlan(item,now=new Date()){
    const amount=Math.max(0,Number(item?.amount)||0),reserved=Math.min(amount,reservedOf(item)),shortage=Math.max(0,amount-reserved),dm=dueMonthOf(item);if(!dm)return{valid:false,amount,reserved,shortage,reason:'支払月未設定',months:[],schedule:[],regular:0,bonusTotal:0,remaining:shortage};
    const y=now.getFullYear(),m=now.getMonth()+1,targetYear=dm<m?y+1:y,start=`${y}-${String(m).padStart(2,'0')}`,target=`${targetYear}-${String(dm).padStart(2,'0')}`,months=[];for(let ym=start;ym<target;ym=addMonths(ym,1))months.push(ym);
    const bonuses=bonusList(item),bonusByYm={};let bonusTotal=0;for(const ym of months){const mm=Number(ym.slice(5,7));for(const b of bonuses)if(b.month===mm){bonusByYm[ym]=(bonusByYm[ym]||0)+b.amount;bonusTotal+=b.amount}}
    bonusTotal=Math.min(shortage,bonusTotal);const custom=Number(item?.monthlyReserveAmount),isCustom=String(item?.reserveMode||'AUTO').toUpperCase()==='CUSTOM'&&Number.isFinite(custom)&&custom>=0,regular=isCustom?custom:Math.ceil(Math.max(0,shortage-bonusTotal)/Math.max(1,months.length));
    let remaining=shortage;const schedule=[];for(const ym of months){const bonus=Math.min(remaining,bonusByYm[ym]||0);remaining-=bonus;const monthly=Math.min(remaining,regular);remaining-=monthly;schedule.push({ym,monthly,bonus,total:monthly+bonus,remaining})}
    return{valid:true,amount,reserved,shortage,dueMonth:dm,targetYear,targetYm:target,months,schedule,regular,bonusTotal,remaining,mode:isCustom?'CUSTOM':'AUTO',bonuses};
  }

  const prevPlan=window.householdCardForecastV49;
  if(typeof prevPlan==='function'&&!window.__planningPlanV79){window.__planningPlanV79=true;window.householdCardForecastV49=function(days=180){const p=structuredClone(prevPlan(days)||{rows:[],warnings:[]});p.rows=enhanceCardRows(p.rows,days);return p}}
  if(typeof generated==='function'&&!window.__planningGeneratedV79){window.__planningGeneratedV79=true;const prevGenerated=generated;generated=function generatedPlanningV79(days=90){return ensureSalaryRows(enhanceCardRows(prevGenerated(days),days),days)}}

  window.householdPlanningV79={baselineOf,forecastMode,paymentMode,enhanceCardRows,ensureSalaryRows,annualPlan,dueMonthOf,reservedOf,bonusList,sameCard};
})();
