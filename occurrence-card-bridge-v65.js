(() => {
  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const escDate = (ym, day) => {
    const [y,m] = String(ym || '').split('-').map(Number);
    if (!y || !m) return '';
    const last = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2,'0')}-${String(Math.min(Math.max(1, Number(day) || 1), last)).padStart(2,'0')}`;
  };
  const masterDay = m => Number(m?.dueDay || m?.paymentDay || m?.day) || 1;
  const findOverride = (st, masterId, date) => (st.masterOccurrenceOverrides || []).find(o => String(o.master_id) === String(masterId) && String(o.occurrence_date) === String(date)) || null;

  function applyToCardEstimate(row, st) {
    if (String(row?.type || '') !== 'CARD_ESTIMATE' && String(row?.source || '') !== 'card_estimate_v49') return row;
    const ym = String(row.billing_month || String(row.date || '').slice(0,7));
    const purchases = Array.isArray(row.components?.purchases) ? row.components.purchases : [];
    const scheduled = Array.isArray(row.components?.scheduled) ? row.components.scheduled : [];
    const nextScheduled = [];
    let scheduledTotal = 0;

    for (const x of scheduled) {
      const master = (st.masters?.fixedExpenses || []).find(m => String(m.id) === String(x.id));
      if (!master) { nextScheduled.push(x); scheduledTotal += Math.abs(Number(x.amount) || 0); continue; }
      const originalDate = escDate(ym, masterDay(master));
      const o = findOverride(st, master.id, originalDate);
      if (o?.action === 'SKIP') continue;
      const amount = o?.action === 'OVERRIDE' && Number.isFinite(Number(o.amount)) ? Math.abs(Number(o.amount)) : Math.abs(Number(x.amount) || 0);
      const name = o?.action === 'OVERRIDE' && o.name ? o.name : x.name;
      nextScheduled.push({...x, name, amount, occurrence_original_date: originalDate, occurrence_overridden: !!o});
      scheduledTotal += amount;
    }

    const known = Math.abs(Number(row.known_purchase_total) || 0);
    const total = known + scheduledTotal;
    return {
      ...row,
      amount: -total,
      total,
      scheduled_fixed_total: scheduledTotal,
      component_count: purchases.length + nextScheduled.length,
      components: {...(row.components || {}), purchases, scheduled: nextScheduled}
    };
  }

  function adjustPlan(plan) {
    const st = stateNow();
    const out = structuredClone(plan || {rows:[],warnings:[]});
    out.rows = (out.rows || []).map(r => applyToCardEstimate(r, st)).filter(r => Math.abs(Number(r.amount) || 0) > 0);
    return out;
  }

  if (typeof window.householdCardForecastV49 === 'function' && !window.__occurrenceCardPlanV65) {
    window.__occurrenceCardPlanV65 = true;
    const prevPlan = window.householdCardForecastV49;
    window.householdCardForecastV49 = () => adjustPlan(prevPlan());
  }

  if (typeof generated === 'function' && !window.__occurrenceCardGeneratedV65) {
    window.__occurrenceCardGeneratedV65 = true;
    const prevGenerated = generated;
    generated = function generatedOccurrenceCardV65(days = 90) {
      const st = stateNow();
      return prevGenerated(days).map(r => applyToCardEstimate(r, st)).filter(r => Math.abs(Number(r.amount) || 0) > 0 || Number(r.amount) > 0);
    };
  }

  window.householdOccurrenceCardV65 = { applyToCardEstimate, adjustPlan };
})();
