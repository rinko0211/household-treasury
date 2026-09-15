(() => {
  if (window.__revolvingActualPayoffV98) return;
  window.__revolvingActualPayoffV98 = true;

  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g, '').toUpperCase();
  const iso = d => {
    const x = new Date(d);
    return Number.isNaN(x.getTime()) ? '' : `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  };
  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  const cycle = () => window.householdCardCycleV81;
  const canonical = s => {
    try { return cycle()?.canonicalCard?.(s) || norm(s).replace(/カード|CARD/g, ''); }
    catch { return norm(s).replace(/カード|CARD/g, ''); }
  };
  const sameCard = (a,b) => {
    try { return cycle()?.sameCard?.(a,b) ?? (!!a && !!b && norm(a) === norm(b)); }
    catch { return !!a && !!b && norm(a) === norm(b); }
  };
  const paymentMode = c => String(c?.paymentMode || c?.payment_mode || 'FULL').toUpperCase() === 'REVOLVING' ? 'REVOLVING' : 'FULL';
  const balanceOf = c => {
    const v = c?.revolvingBalance;
    return v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : null;
  };
  const monthlyPayment = c => {
    for (const v of [c?.revolvingMonthlyPayment,c?.monthlyPaymentAmount,c?.monthlyPayment]) {
      if (v !== null && v !== '' && Number.isFinite(Number(v))) return Math.max(0,Number(v));
    }
    return 0;
  };
  const activeRevolvingCards = st => (st.masters?.cards || []).filter(c => c?.active !== false && paymentMode(c) === 'REVOLVING');
  const isTargetCard = c => ['JAL','DC'].includes(canonical(c?.name));
  const txAmount = t => Math.abs(Math.min(0, Number(t?.amount) || 0));
  const txText = t => norm([t?.source,t?.description_raw,t?.description,t?.merchant,t?.counterparty,t?.memo].filter(Boolean).join(' '));
  const explicitCardName = t => t?.card || t?.card_name || t?.paymentCard || t?.payment_card || t?.linked_card || '';
  const issuerHint = t => /(NICOS|ニコス|MUFG|三菱UFJ|JAL|DC)/.test(txText(t));
  const debtSemantic = t => /^(CARD_SETTLEMENT|DEBT_PRINCIPAL|DEBT_PAYMENT)$/.test(String(t?.cashflow_type || t?.economic_type || '').toUpperCase());
  const balanceAsOf = c => {
    for (const v of [c?.revolvingBalanceAsOf,c?.revolving_balance_as_of,c?.revolvingBalanceDate,c?.balanceAsOf,c?.balanceDate]) if (validDate(v)) return String(v);
    return '';
  };

  function candidateForTransaction(st,t) {
    const amount = txAmount(t), date = String(t?.date || '');
    if (!amount || !validDate(date) || t?.revolving_payoff_reconciled_v98) return null;
    let cards = activeRevolvingCards(st).filter(c => isTargetCard(c) && balanceOf(c) > 0 && (!balanceAsOf(c) || date >= balanceAsOf(c)));
    if (!cards.length) return null;

    const explicit = explicitCardName(t);
    if (explicit) {
      const exact = cards.filter(c => sameCard(c.name, explicit));
      if (exact.length === 1) {
        const bal = balanceOf(exact[0]);
        const ratio = amount / bal;
        if (ratio >= 0.92 && ratio <= 1.08) return exact[0];
      }
    }

    if (!issuerHint(t) && !debtSemantic(t)) return null;
    const ranked = cards.map(c => {
      const bal = balanceOf(c), rel = Math.abs(amount - bal) / Math.max(1, bal);
      return {c,bal,rel};
    }).filter(x => x.rel <= 0.08).sort((a,b) => a.rel - b.rel);
    if (!ranked.length) return null;
    if (ranked.length === 1) return ranked[0].c;
    if (ranked[0].rel + 0.03 <= ranked[1].rel) return ranked[0].c;
    return null;
  }

  function refreshAggregateBalance(st) {
    st.assets = st.assets || {};
    const values = activeRevolvingCards(st).map(balanceOf).filter(v => v !== null);
    st.assets.revolvingBalance = values.reduce((a,v) => a + v, 0);
    st.revolvingBalanceManagedByCards = true;
  }

  function reconcileActualPayoffs({persist=true,refresh=true}={}) {
    const st = stateNow();
    st.masters = st.masters || {};
    st.masters.cards = Array.isArray(st.masters.cards) ? st.masters.cards : [];
    st.cashTransactions = Array.isArray(st.cashTransactions) ? st.cashTransactions : [];
    let changed = false, matched = 0;

    for (const c of activeRevolvingCards(st).filter(isTargetCard)) {
      const bal = balanceOf(c), asOf = balanceAsOf(c);
      if (bal === 0 && asOf && !validDate(c.revolvingPaidOffAt)) {
        c.revolvingPaidOffAt = asOf;
        c.revolvingPayoffSourceV98 = 'ZERO_BALANCE_AS_OF';
        c.forecastAutoFullAfterPayoff = true;
        c.updatedAt = new Date().toISOString();
        changed = true;
      }
    }

    const txs = [...st.cashTransactions].filter(t => Number(t?.amount) < 0 && validDate(t?.date)).sort((a,b) => String(b.date).localeCompare(String(a.date)));
    for (const t of txs) {
      const card = candidateForTransaction(st,t);
      if (!card) continue;
      const amount = txAmount(t), date = String(t.date);
      card.revolvingBalance = 0;
      card.revolvingBalanceAsOf = date;
      card.revolvingPaidOffAt = date;
      card.revolvingPaidOffAmount = amount;
      card.revolvingPaidOffTransactionId = t.id || t.bank_transaction_id || null;
      card.revolvingPayoffSourceV98 = 'BANK_ACTUAL_MATCH';
      card.forecastAutoFullAfterPayoff = true;
      card.updatedAt = new Date().toISOString();
      t.revolving_payoff_reconciled_v98 = true;
      t.revolving_payoff_card = card.name;
      t.revolving_payoff_amount = amount;
      matched += 1;
      changed = true;
    }

    if (changed) {
      refreshAggregateBalance(st);
      st.masters.updatedAt = new Date().toISOString();
      st.revolvingActualPayoffVersion = 98;
      if (persist) {
        window.treasuryRecoverySnapshot?.('リボ実返済v98自動消込直前');
        window.replaceTreasuryState?.(st);
        window.setTreasurySaveStatus?.(matched ? '実返済を検出・リボ完済反映済み・同期中' : 'リボ残高0を完済として反映済み・同期中');
        window.cloudSyncOnLocalSave?.();
      }
      if (refresh) setTimeout(redraw,0);
    }
    return {changed,matched};
  }

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
  const baselineOf = c => {
    for (const v of [c?.monthlyBaselineAmount,c?.cardBaselineAmount,c?.forecastBaseline]) {
      if (v !== null && v !== '' && Number.isFinite(Number(v))) return Math.max(0,Number(v));
    }
    return 0;
  };
  const useBaseline = c => baselineOf(c) > 0 && String(c?.forecastMode || c?.forecast_mode || 'BASELINE').toUpperCase() !== 'COMPONENTS';
  const routeOf = m => String(m?.paymentRoute || m?.payment_route || 'DIRECT').toUpperCase();
  const purchaseAmount = p => {
    const v = p?.payment_amount;
    return v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.abs(Number(v)) : Math.abs(Number(p?.original_amount)||0);
  };
  function settlementDay(st,c) {
    for (const v of [c?.settlementDay,c?.paymentDay,c?.dueDay]) { const n=Number(v); if (Number.isInteger(n)&&n>=1&&n<=31) return n; }
    try { const n=Number(cycle()?.settlementDayValue?.(c)); if (Number.isInteger(n)&&n>=1&&n<=31) return n; } catch {}
    return null;
  }
  function closingDay(c) {
    for (const v of [c?.closingDay,c?.statementClosingDay,c?.cutoffDay]) { const n=Number(v); if (Number.isInteger(n)&&n>=1&&n<=31) return n; }
    try { const n=Number(cycle()?.closingDayValue?.(c)); return Number.isInteger(n)&&n>=1&&n<=31?n:null; } catch { return null; }
  }
  function paymentDateForSpend(st,c,date) {
    const close=closingDay(c),pay=settlementDay(st,c);
    if (!close || !pay || !validDate(date)) return '';
    let ym='';
    try { ym=cycle()?.billingMonthForDate?.(date,close,1)||''; } catch {}
    return ym?dateFor(ym,pay):'';
  }
  function hasActual(st,card,ym) {
    return (st.cardSettlements||[]).some(s=>sameCard(s.card,card)&&String(s.due_date||'').slice(0,7)===ym&&Number.isFinite(Number(s.amount))&&Math.abs(Number(s.amount))>0);
  }
  function overrideFor(st,card,ym) {
    const key=`ESTIMATE|${norm(card)}|${ym}`;
    return (st.cardCashflowOverrides||[]).find(o=>String(o.key||'')===key)||null;
  }
  function masterOccurs(m,ym) {
    const cad=String(m?.cadence||'MONTHLY').toUpperCase(),month=Number(String(ym).slice(5,7));
    if (cad==='MONTHLY') return true;
    if (cad==='SEMI_FIXED') return (m.activeMonths||m.months||[]).map(Number).includes(month);
    if (cad==='ANNUAL') {
      if (Number(m.lastPaidYear)>=Number(String(ym).slice(0,4))) return false;
      return Number(m.dueMonth||m.paymentMonth||m.annualMonth||m.month)===month;
    }
    return false;
  }
  function masterDay(m) {
    for (const v of [m?.dueDay,m?.paymentDay,m?.day]) { const n=Number(v); if (Number.isInteger(n)&&n>=1&&n<=31) return n; }
    return 1;
  }
  function occurrenceOverride(st,m,date) {
    return (st.masterOccurrenceOverrides||[]).find(o=>String(o.master_id||'')===String(m.id||'')&&String(o.occurrence_date||'')===String(date))||null;
  }
  function linkedToMaster(p,m) {
    if (String(p?.fixed_expense_master_id||'')===String(m?.id||'')) return true;
    const a=norm(p?.merchant_raw||p?.merchant_normalized||''),b=norm(m?.name||'');
    return !!a&&!!b&&(a===b||a.includes(b)||b.includes(a));
  }
  function rangeFor(days) {
    const from=iso(new Date()),d=new Date(`${from}T12:00:00`); d.setDate(d.getDate()+Math.max(0,Number(days)||0)); return {from,to:iso(d)};
  }

  function fullRowsForPaidCard(st,c,days=180) {
    const payoffDate=String(c?.revolvingPaidOffAt||'');
    if (!validDate(payoffDate) || balanceOf(c)!==0 || !isTargetCard(c)) return [];
    const range=rangeFor(days),close=closingDay(c),settle=settlementDay(st,c);
    if (!close || !settle) return [];
    const scheduledByYm=new Map(),purchaseByYm=new Map();
    const firstYm=addMonths(range.from.slice(0,7),-1),lastYm=range.to.slice(0,7);

    for (const m of st.masters?.fixedExpenses||[]) {
      if (m?.active===false || m?.forecastEnabled===false || routeOf(m)!=='CARD' || !m.paymentCard || !sameCard(m.paymentCard,c.name)) continue;
      for (let ym=firstYm;ym<=lastYm;ym=addMonths(ym,1)) {
        if (!masterOccurs(m,ym)) continue;
        const spendDate=dateFor(ym,masterDay(m));
        if (spendDate<payoffDate) continue;
        const o=occurrenceOverride(st,m,spendDate);
        if (String(o?.action||'').toUpperCase()==='SKIP') continue;
        const amount=String(o?.action||'').toUpperCase()==='OVERRIDE'&&Number.isFinite(Number(o.amount))?Math.abs(Number(o.amount)):Math.abs(Number(m.amount)||0);
        if (!amount) continue;
        const payDate=paymentDateForSpend(st,c,spendDate);
        if (!payDate || payDate<range.from || payDate>range.to) continue;
        const payYm=payDate.slice(0,7),arr=scheduledByYm.get(payYm)||[];
        arr.push({master:m,spendDate,payDate,amount,name:o?.name||m.name||'予定'}); scheduledByYm.set(payYm,arr);
      }
    }

    for (const p of st.purchaseEvents||[]) {
      if (!sameCard(p.card,c.name) || p.is_refinance_adjustment) continue;
      const spendDate=String(p.purchase_date||'');
      if (!validDate(spendDate) || spendDate<payoffDate) continue;
      let payYm=/^\d{4}-\d{2}$/.test(String(p.billing_month||''))?String(p.billing_month):'';
      const payDate=payYm?dateFor(payYm,settle):paymentDateForSpend(st,c,spendDate);
      if (!payDate || payDate<range.from || payDate>range.to) continue;
      payYm=payDate.slice(0,7); const arr=purchaseByYm.get(payYm)||[]; arr.push(p); purchaseByYm.set(payYm,arr);
    }

    const months=new Set([...scheduledByYm.keys(),...purchaseByYm.keys()]);
    const base=baselineOf(c),baseline=useBaseline(c);
    if (baseline) {
      const firstPayDate=paymentDateForSpend(st,c,payoffDate),startYm=firstPayDate?firstPayDate.slice(0,7):addMonths(payoffDate.slice(0,7),1);
      for (let ym=startYm;ym<=range.to.slice(0,7);ym=addMonths(ym,1)) months.add(ym);
    }

    const rows=[];
    for (const ym of [...months].sort()) {
      if (hasActual(st,c.name,ym)) continue;
      const purchases=purchaseByYm.get(ym)||[];
      const scheduled=(scheduledByYm.get(ym)||[]).filter(s=>!purchases.some(p=>linkedToMaster(p,s.master)));
      const known=purchases.reduce((a,p)=>a+purchaseAmount(p),0),scheduledTotal=scheduled.reduce((a,s)=>a+s.amount,0),components=known+scheduledTotal;
      const o=overrideFor(st,c.name,ym),defaultDate=dateFor(ym,settle);
      const amount=o?Math.max(0,Number(o.amount)||0):baseline?Math.max(base,components):components;
      if (amount<=0) continue;
      rows.push({
        id:`card-estimate:v98:${norm(c.name)}:${ym}`,date:o?.date||defaultDate,name:`${c.name} 見込請求（完済後一括）`,amount:-amount,
        type:'CARD_ESTIMATE',source:'card_estimate_v98',generated:true,record_kind:'FORECAST_EVENT',economic_type:'TRANSFER',estimated:true,
        card:c.name,billing_month:ym,payment_model:'FULL_AFTER_ACTUAL_PAYOFF',auto_full_after_payoff_v98:true,revolving_payoff_date:payoffDate,
        known_purchase_total:known,scheduled_fixed_total:scheduledTotal,component_count:purchases.length+scheduled.length,
        components:{purchases:purchases.map(p=>({name:p.merchant_raw||p.merchant_normalized||'カード利用',amount:purchaseAmount(p),spend_date:p.purchase_date||''})),scheduled:scheduled.map(s=>({name:s.name,amount:s.amount,spend_date:s.spendDate,payment_date:s.payDate,master_id:s.master.id}))},
        baseline_amount:baseline?base:0,forecast_method:o?'MANUAL_OVERRIDE':'ACTUAL_PAYOFF_TO_FULL_V98',card_cashflow_override:!!o,card_cashflow_override_id:o?.id||null,
        closing_day:close,settlement_day:settle
      });
    }
    return rows;
  }

  function replaceRows(input,days=180) {
    const st=stateNow(),paid=activeRevolvingCards(st).filter(c=>isTargetCard(c)&&balanceOf(c)===0&&validDate(c.revolvingPaidOffAt));
    if (!paid.length) return Array.isArray(input)?input:[];
    const base=(Array.isArray(input)?input:[]).filter(r=>{
      const card=r?.card||String(r?.name||'').replace(/\s*(リボ返済|見込請求).*$/,'');
      const c=paid.find(x=>sameCard(x.name,card));
      if (!c) return true;
      const type=String(r?.type||''),src=String(r?.source||'');
      if (type==='CARD_REVOLVING_PAYMENT'||src==='card_revolving_v66') return false;
      if (type==='CARD_ESTIMATE'||src.startsWith('card_estimate')) return false;
      return true;
    });
    const extra=paid.flatMap(c=>fullRowsForPaidCard(st,c,days));
    return [...base,...extra].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
  }

  function redraw() {
    try { if (typeof render==='function') render(); } catch {}
    try { window.renderMobileInteractionV70?.(); } catch {}
    try { window.renderForecastV38?.(); } catch {}
    try { window.renderPlanningUiV79?.(); } catch {}
  }

  function installWrappers() {
    if (typeof generated==='function'&&!window.__generatedActualPayoffV98) {
      window.__generatedActualPayoffV98=true;
      const previousGenerated=generated;
      generated=function generatedActualPayoffV98(days=90){return replaceRows(previousGenerated(days),days);};
    }
    if (typeof window.householdCardForecastV49==='function'&&!window.__cardPlanActualPayoffV98) {
      window.__cardPlanActualPayoffV98=true;
      const previousPlan=window.householdCardForecastV49;
      window.householdCardForecastV49=function householdCardForecastV98(days=180){
        const plan=structuredClone(previousPlan(days)||{rows:[],warnings:[]});
        plan.rows=replaceRows(plan.rows||[],days);
        plan.revolvingActualPayoffVersion=98;
        return plan;
      };
    }
  }

  function wrapImport() {
    if (typeof importOne!=='function'||window.__importActualPayoffV98) return;
    window.__importActualPayoffV98=true;
    const previousImportOne=importOne;
    importOne=async function importOneActualPayoffV98(file){
      const result=await previousImportOne(file);
      reconcileActualPayoffs();
      installWrappers();
      redraw();
      return result;
    };
  }

  let booted=false;
  function boot() {
    if (booted) return;
    booted=true;
    reconcileActualPayoffs();
    installWrappers();
    wrapImport();
    redraw();
  }

  window.householdRevolvingActualPayoffV98={candidateForTransaction,reconcileActualPayoffs,fullRowsForPaidCard,replaceRows,balanceOf};
  if (document.readyState==='complete') setTimeout(boot,0);
  else window.addEventListener('load',boot,{once:true});
})();