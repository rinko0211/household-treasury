(() => {
  if (window.__revolvingPayoffCapV87) return;
  window.__revolvingPayoffCapV87 = true;

  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g, '').toUpperCase();
  const sameCard = (a, b) => {
    try { return window.householdCardIdentityV51?.sameCard?.(a, b) ?? norm(a) === norm(b); }
    catch { return norm(a) === norm(b); }
  };
  const isRevolvingRow = r => String(r?.type || '') === 'CARD_REVOLVING_PAYMENT' || String(r?.source || '') === 'card_revolving_v66';
  const balanceOf = c => {
    const v = c?.revolvingBalance;
    return v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : null;
  };

  function capRows(rows) {
    const st = stateNow();
    const cards = (st.masters?.cards || []).filter(c => c?.active !== false && balanceOf(c) !== null);
    if (!cards.length) return Array.isArray(rows) ? rows : [];

    const source = Array.isArray(rows) ? rows : [];
    const decisions = new Map();

    for (const card of cards) {
      let remaining = balanceOf(card);
      const matches = source
        .map((row, index) => ({ row, index }))
        .filter(x => isRevolvingRow(x.row) && sameCard(x.row.card || x.row.name, card.name))
        .sort((a, b) => String(a.row.date || '').localeCompare(String(b.row.date || '')) || a.index - b.index);

      for (const { row, index } of matches) {
        if (remaining <= 0) {
          decisions.set(index, null);
          continue;
        }

        const planned = Math.max(0, Math.abs(Number(row.amount) || 0));
        if (!planned) {
          decisions.set(index, null);
          continue;
        }

        const manual = row.card_cashflow_override === true || row.manual_cashflow_correction === true;
        const payment = manual ? planned : Math.min(planned, remaining);
        const before = remaining;
        const after = Math.max(0, before - payment);
        remaining = after;

        decisions.set(index, {
          ...row,
          amount: -payment,
          revolving_balance_before: before,
          revolving_balance_after: after,
          revolving_payoff_capped_v87: !manual && payment < planned,
          revolving_payoff_complete_v87: after === 0
        });
      }
    }

    return source.flatMap((row, index) => {
      if (!decisions.has(index)) return [row];
      const decided = decisions.get(index);
      return decided ? [decided] : [];
    });
  }

  window.householdRevolvingPayoffCapV87 = { capRows };

  const previousPlan = window.householdCardForecastV49;
  if (typeof previousPlan === 'function') {
    window.householdCardForecastV49 = function householdCardForecastV87(days = 180) {
      const plan = structuredClone(previousPlan(days) || { rows: [], warnings: [] });
      plan.rows = capRows(plan.rows || []);
      return plan;
    };
  }

  if (typeof generated === 'function') {
    const previousGenerated = generated;
    generated = function generatedRevolvingPayoffV87(days = 90) {
      return capRows(previousGenerated(days));
    };
  }
})();
