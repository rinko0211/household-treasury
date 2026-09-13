(() => {
  if (window.__revolvingToFullV97) return;
  window.__revolvingToFullV97 = true;

  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g, '').toUpperCase();
  const iso = d => {
    const x = new Date(d);
    return Number.isNaN(x.getTime()) ? '' : `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  };
  const cycle = () => window.householdCardCycleV81;
  const canonical = s => {
    try { return cycle()?.canonicalCard?.(s) || norm(s).replace(/カード|CARD/g,''); }
    catch { return norm(s).replace(/カード|CARD/g,''); }
  };
  const sameCard = (a,b) => {
    try { return cycle()?.sameCard?.(a,b) ?? (!!a && !!b && norm(a) === norm(b)); }
    catch { return !!a && !!b && norm(a) === norm(b); }
  };
  const addMonths = (ym,n) => {
    try { return cycle()?.addMonths?.(ym,n) || fallbackAddMonths(ym,n); }
    catch { return fallbackAddMonths(ym,n); }
  };
  const fallbackAddMonths = (ym,n) => {
    const [y,m] = String(ym).split('-').map(Number), d = new Date(y,m-1+n,1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  };
  const dateFor = (ym,day) => {
    try { return cycle()?.dateFor?.(ym,day) || fallbackDateFor(ym,day); }
    catch { return fallbackDateFor(ym,day); }
  };
  const fallbackDateFor = (ym,day) => {
    const [y,m] = String(ym).split('-').map(Number), last = new Date(y,m,0).getDate();
    return `${ym}-${String(Math.min(Math.max(1,Number(day)||1),last)).padStart(2,'0')}`;
  };

  const paymentMode = c => String(c?.paymentMode || c?.payment_mode || 'FULL').toUpperCase() === 'REVOLVING' ? 'REVOLVING' : 'FULL';
  const balanceOf = c => {
    const v = c?.revolvingBalance;
    return v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.max(0,Number(v)) : null;
  };
  const monthlyPayment = c => {
    for (const v of [c?.revolvingMonthlyPayment,c?.monthlyPaymentAmount,c?.monthlyPayment]) {
      if (v !== null && v !== '' && Number.isFinite(Number(v))) return Math.max(0,Number(v));
    }
    return 0;
  };
  const routeOf = m => String(m?.paymentRoute || m?.payment_route || 'DIRECT').toUpperCase();
  const eligible = c => c?.active !== false && paymentMode(c) === 'REVOLVING' && ['JAL','DC'].includes(canonical(c?.name)) && balanceOf(c) !== null && monthlyPayment(c) > 0 && c?.forecastAutoFullAfterPayoff !== false;
  const purchaseAmount = p => {
    const v = p?.payment_amount;
    return v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.abs(Number(v)) : Math.abs(Number(p?.original_amount)||0);
  };
  const baselineOf = c => {
    for (const v of [c?.monthlyBaselineAmount,c?.cardBaselineAmount,c?.forecastBaseline]) {
      if (v !== null && v !== '' && Number.isFinite(Number(v))) return Math.max(0,Number(v));
    }
    return 0;
  };
  const useBaseline = c => {
    const base = baselineOf(c);
    if (base <= 0) return false;
    const mode = String(c?.forecastMode || c?.forecast_mode || 'BASELINE').toUpperCase();
    return mode !== 'COMPONENTS';
  };
  const rangeFor = days => {
    const from = iso(new Date()), d = new Date(`${from}T12:00:00`);
    d.setDate(d.getDate() + Math.max(0,Number(days)||0));
    return {from,to:iso(d)};
  };
  const activeCards = st => (st.masters?.cards || []).filter(c => c?.active !== false);

  function settlementDay(st,c) {
    for (const v of [c?.settlementDay,c?.paymentDay,c?.dueDay]) {
      const n = Number(v); if (Number.isInteger(n) && n >= 1 && n <= 31) return n;
    }
    try {
      const n = Number(cycle()?.settlementDayValue?.(c));
      if (Number.isInteger(n) && n >= 1 && n <= 31) return n;
    } catch {}
    const history = (st.cardSettlements || []).filter(s => s?.due_date && sameCard(s.card,c?.name)).sort((a,b)=>String(b.due_date).localeCompare(String(a.due_date)));
    const n = history.length ? Number(String(history[0].due_date).slice(8,10)) : 0;
    return n >= 1 && n <= 31 ? n : null;
  }
  function closingDay(c) {
    try {
      const n = Number(cycle()?.closingDayValue?.(c));
      return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
    } catch { return null; }
  }
  function paymentDateForSpend(st,c,date) {
    const close = closingDay(c), pay = settlementDay(st,c);
    if (!close || !pay || !/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))) return '';
    let ym = '';
    try { ym = cycle()?.billingMonthForDate?.(date,close,1) || ''; } catch {}
    return ym ? dateFor(ym,pay) : '';
  }
  function hasActual(st,card,ym) {
    return (st.cardSettlements || []).some(s => sameCard(s.card,card) && String(s.due_date||'').slice(0,7) === ym && Number.isFinite(Number(s.amount)) && Math.abs(Number(s.amount)) > 0);
  }
  function overrideFor(st,kind,card,ym) {
    const key = `${kind}|${norm(card)}|${ym}`;
    return (st.cardCashflowOverrides || []).find(o => String(o.key||'') === key) || null;
  }

  function projectedPayoff(st,c,maxMonths=72) {
    if (!eligible(c)) return null;
    const payDay = settlementDay(st,c), monthly = monthlyPayment(c), current = iso(new Date());
    if (!payDay || !monthly) return null;
    let remaining = balanceOf(c);
    for (let i=0;i<Math.max(1,maxMonths);i++) {
      const ym = addMonths(current.slice(0,7),i), defaultDate = dateFor(ym,payDay);
      if (defaultDate < current || hasActual(st,c.name,ym)) continue;
      const o = overrideFor(st,'REVOLVING',c.name,ym), planned = o ? Math.max(0,Number(o.amount)||0) : monthly;
      if (!planned) continue;
      const before = remaining, after = Math.max(0,before-planned), paid = Math.min(before,planned);
      remaining = after;
      if (after === 0) return {card:c.name,date:o?.date||defaultDate,billing_month:ym,balance_before:before,payment:paid,manual_override:!!o};
    }
    return null;
  }

  function masterOccurs(m,ym) {
    const cad = String(m?.cadence || 'MONTHLY').toUpperCase(), month = Number(String(ym).slice(5,7));
    if (cad === 'MONTHLY') return true;
    if (cad === 'SEMI_FIXED') return (m.activeMonths || m.months || []).map(Number).includes(month);
    if (cad === 'ANNUAL') {
      if (Number(m.lastPaidYear) >= Number(String(ym).slice(0,4))) return false;
      return Number(m.dueMonth || m.paymentMonth || m.annualMonth || m.month) === month;
    }
    return false;
  }
  function masterDay(m) {
    for (const v of [m?.dueDay,m?.paymentDay,m?.day]) {
      const n = Number(v); if (Number.isInteger(n) && n >= 1 && n <= 31) return n;
    }
    return 1;
  }
  function occurrenceOverride(st,m,date) {
    return (st.masterOccurrenceOverrides || []).find(o => String(o.master_id||'') === String(m.id||'') && String(o.occurrence_date||'') === String(date)) || null;
  }
  function linkedToMaster(p,m) {
    if (String(p?.fixed_expense_master_id||'') === String(m?.id||'')) return true;
    const a = norm(p?.merchant_raw || p?.merchant_normalized || ''), b = norm(m?.name || '');
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
  }

  function transitionPlan(days=180) {
    const st = stateNow(), range = rangeFor(days), rows = [], warnings = [], payoffs = [];
    for (const c of activeCards(st).filter(eligible)) {
      const payoff = projectedPayoff(st,c);
      if (!payoff || payoff.date > range.to) continue;
      payoffs.push(payoff);
      const close = closingDay(c), settle = settlementDay(st,c);
      if (!close || !settle) {
        warnings.push({card:c.name,reason:'リボ完済後の一括予測には締め日・引落日が必要です。'});
        continue;
      }

      const scheduledByYm = new Map(), purchaseByYm = new Map();
      const firstYm = addMonths(range.from.slice(0,7),-1), lastYm = range.to.slice(0,7);
      for (const m of st.masters?.fixedExpenses || []) {
        if (m?.active === false || m?.forecastEnabled === false || routeOf(m) !== 'CARD' || !m.paymentCard || !sameCard(m.paymentCard,c.name)) continue;
        for (let ym=firstYm; ym<=lastYm; ym=addMonths(ym,1)) {
          if (!masterOccurs(m,ym)) continue;
          const spendDate = dateFor(ym,masterDay(m));
          if (spendDate < payoff.date) continue;
          const o = occurrenceOverride(st,m,spendDate);
          if (String(o?.action||'').toUpperCase() === 'SKIP') continue;
          const amount = String(o?.action||'').toUpperCase() === 'OVERRIDE' && Number.isFinite(Number(o.amount)) ? Math.abs(Number(o.amount)) : Math.abs(Number(m.amount)||0);
          if (!amount) continue;
          const payDate = paymentDateForSpend(st,c,spendDate);
          if (!payDate || payDate < range.from || payDate > range.to) continue;
          const payYm = payDate.slice(0,7), arr = scheduledByYm.get(payYm) || [];
          arr.push({master:m,spendDate,payDate,amount,name:o?.name || m.name || '予定'}); scheduledByYm.set(payYm,arr);
        }
      }

      for (const p of st.purchaseEvents || []) {
        if (!sameCard(p.card,c.name) || p.is_refinance_adjustment) continue;
        const spendDate = String(p.purchase_date||'');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(spendDate) || spendDate < payoff.date) continue;
        let payYm = /^\d{4}-\d{2}$/.test(String(p.billing_month||'')) ? String(p.billing_month) : '';
        let payDate = payYm ? dateFor(payYm,settle) : paymentDateForSpend(st,c,spendDate);
        if (!payDate || payDate < range.from || payDate > range.to) continue;
        payYm = payDate.slice(0,7); const arr = purchaseByYm.get(payYm) || [];
        arr.push(p); purchaseByYm.set(payYm,arr);
      }

      const months = new Set([...scheduledByYm.keys(),...purchaseByYm.keys()]);
      const base = baselineOf(c), baseline = useBaseline(c);
      if (baseline) {
        const firstPayDate = paymentDateForSpend(st,c,payoff.date), startYm = firstPayDate ? firstPayDate.slice(0,7) : addMonths(payoff.date.slice(0,7),1);
        for (let ym=startYm; ym<=range.to.slice(0,7); ym=addMonths(ym,1)) months.add(ym);
      }

      for (const ym of [...months].sort()) {
        if (hasActual(st,c.name,ym)) continue;
        const purchases = purchaseByYm.get(ym) || [];
        const scheduled = (scheduledByYm.get(ym) || []).filter(s => !purchases.some(p => linkedToMaster(p,s.master)));
        const known = purchases.reduce((a,p)=>a+purchaseAmount(p),0), scheduledTotal = scheduled.reduce((a,s)=>a+s.amount,0), components = known + scheduledTotal;
        const o = overrideFor(st,'ESTIMATE',c.name,ym), defaultDate = dateFor(ym,settle);
        const amount = o ? Math.max(0,Number(o.amount)||0) : baseline ? Math.max(base,components) : components;
        if (amount <= 0) continue;
        rows.push({
          id:`card-estimate:v97:${norm(c.name)}:${ym}`,
          date:o?.date||defaultDate,
          name:`${c.name} 見込請求（リボ完済後一括）`,
          amount:-amount,
          type:'CARD_ESTIMATE',source:'card_estimate_v97',generated:true,record_kind:'FORECAST_EVENT',economic_type:'TRANSFER',estimated:true,
          card:c.name,billing_month:ym,payment_model:'FULL_AFTER_REVOLVING_PAYOFF',auto_full_after_payoff_v97:true,revolving_payoff_date:payoff.date,
          known_purchase_total:known,scheduled_fixed_total:scheduledTotal,component_count:purchases.length+scheduled.length,
          components:{purchases:purchases.map(p=>({name:p.merchant_raw||p.merchant_normalized||'カード利用',amount:purchaseAmount(p),spend_date:p.purchase_date||''})),scheduled:scheduled.map(s=>({name:s.name,amount:s.amount,spend_date:s.spendDate,payment_date:s.payDate,master_id:s.master.id}))},
          baseline_amount:baseline?base:0,forecast_method:o?'MANUAL_OVERRIDE':'REVOLVING_PAYOFF_TO_FULL_V97',card_cashflow_override:!!o,card_cashflow_override_id:o?.id||null,
          closing_day:close,settlement_day:settle
        });
      }
    }
    rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.name).localeCompare(String(b.name),'ja'));
    return {rows,warnings,payoffs};
  }

  function augmentRows(input,days=180) {
    const base = Array.isArray(input) ? input : [], t = transitionPlan(days);
    const existing = new Set(base.filter(r => ['CARD_ESTIMATE','CARD_SETTLEMENT'].includes(String(r?.type||''))).map(r => `${norm(r.card||String(r.name||'').replace(/カード支払.*/,''))}|${String(r.billing_month||r.date||'').slice(0,7)}`));
    const extra = t.rows.filter(r => !existing.has(`${norm(r.card)}|${r.billing_month}`));
    return [...base,...extra].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
  }

  const previousGenerated = typeof generated === 'function' ? generated : null;
  if (previousGenerated && !window.__generatedRevolvingToFullV97) {
    window.__generatedRevolvingToFullV97 = true;
    generated = function generatedRevolvingToFullV97(days=90) { return augmentRows(previousGenerated(days),days); };
  }
  const previousPlan = window.householdCardForecastV49;
  if (typeof previousPlan === 'function' && !window.__cardPlanRevolvingToFullV97) {
    window.__cardPlanRevolvingToFullV97 = true;
    window.householdCardForecastV49 = function householdCardForecastV97(days=180) {
      const plan = structuredClone(previousPlan(days) || {rows:[],warnings:[]}), t = transitionPlan(days);
      plan.rows = augmentRows(plan.rows || [],days);
      plan.warnings = [...(plan.warnings||[]),...t.warnings];
      plan.revolvingPayoffTransitionsV97 = t.payoffs;
      return plan;
    };
  }

  window.householdRevolvingToFullV97 = {eligible,projectedPayoff,transitionPlan,augmentRows,paymentDateForSpend,baselineOf};
})();
