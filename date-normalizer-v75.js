(() => {
  if (window.__dateNormalizerV75) return;
  window.__dateNormalizerV75 = true;
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const originalParseDate = typeof parseDate === 'function' ? parseDate : null;

  function isoDate(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    let m = raw.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日(?:\s*\([^)]*\))?$/);
    if (m) return `${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`;
    m = raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (m) return `${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`;
    m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const prior = originalParseDate ? originalParseDate(raw) : raw;
    return /^\d{4}-\d{2}-\d{2}$/.test(String(prior)) ? String(prior) : raw;
  }
  function isoMonth(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    let m = raw.match(/^(\d{4})年\s*(\d{1,2})月(?:\s*\d{1,2}日)?/);
    if (m) return `${m[1]}-${String(+m[2]).padStart(2,'0')}`;
    m = raw.match(/^(\d{4})[-\/]?(\d{1,2})(?:[-\/]\d{1,2})?$/);
    if (m) return `${m[1]}-${String(+m[2]).padStart(2,'0')}`;
    const d = isoDate(raw);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(0,7) : raw;
  }

  window.parseDate = isoDate;
  window.householdDateNormalizerV75 = { isoDate, isoMonth };

  let repaired = false;
  function repairExisting() {
    if (repaired) return;
    const getter = window.getTreasuryStateRaw || window.getTreasuryState;
    if (typeof getter !== 'function' || typeof window.replaceTreasuryState !== 'function') return;
    const st = getter();
    let changed = false;
    const set = (o,k,v) => { if (o && v && String(o[k] ?? '') !== String(v)) { o[k]=v; changed=true; } };
    for (const p of st.purchaseEvents || []) {
      set(p,'purchase_date',isoDate(p.purchase_date));
      set(p,'billing_month',isoMonth(p.billing_month));
    }
    for (const l of st.cardBillingLines || []) {
      set(l,'purchase_date',isoDate(l.purchase_date));
      set(l,'billing_month',isoMonth(l.billing_month));
    }
    for (const s of st.cardSettlements || []) set(s,'due_date',isoDate(s.due_date));
    for (const t of st.cashTransactions || []) set(t,'date',isoDate(t.date));
    for (const e of st.events || []) set(e,'date',isoDate(e.date));
    for (const q of st.reviewQueue || []) if (q.date) set(q,'date',isoDate(q.date));

    try { if (window.householdSemanticV47?.migrateState?.(st)) changed = true; } catch {}
    for (const p of st.purchaseEvents || []) {
      if (!p.card) continue;
      if (!p.economic_type || p.economic_type === 'UNKNOWN') { p.economic_type='EXPENSE'; changed=true; }
      if (p.economic_type === 'EXPENSE' && !p.category) { p.category='OTHER'; p.subcategory='OTHER'; changed=true; }
      if (p.economic_type === 'EXPENSE' && Number(p.confidence || 0) < .8) { p.confidence=.8; changed=true; }
      if (!p.record_kind) { p.record_kind='CARD_PURCHASE'; changed=true; }
    }
    if (Array.isArray(st.reviewQueue)) {
      const before = st.reviewQueue.length;
      st.reviewQueue = st.reviewQueue.filter(q => !(st.purchaseEvents || []).some(p => p.card && norm(p.card)===norm(q.source) && norm(p.merchant_raw||'')===norm(q.merchant||q.description||'') && (!q.date || isoDate(q.date)===p.purchase_date) && p.economic_type==='EXPENSE' && p.category));
      if (st.reviewQueue.length !== before) changed = true;
    }
    if (changed) {
      repaired = true;
      window.treasuryRecoverySnapshot?.('カード日付正規化v75直前');
      window.replaceTreasuryState(st);
      window.setTreasurySaveStatus?.('カード日付・支出分類を補正済み');
      window.cloudSyncOnLocalSave?.();
    } else repaired = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(repairExisting,700),{once:true});
  else setTimeout(repairExisting,700);
  window.addEventListener('pageshow',()=>setTimeout(repairExisting,300),{once:true});
})();
