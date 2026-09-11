(() => {
  if (window.__liquidityFlowV82) return;
  window.__liquidityFlowV82 = true;

  const $ = id => document.getElementById(id);
  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const yen = n => new Intl.NumberFormat('ja-JP', { style:'currency', currency:'JPY', maximumFractionDigits:0 }).format(Number(n) || 0);
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g, '').toUpperCase();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let timer = null;

  function paymentMode(c) {
    return String(c?.paymentMode || c?.payment_mode || 'FULL').toUpperCase();
  }

  function latestBrokerSnapshot(st) {
    return (st.assetSnapshots || [])
      .map((x, i) => ({...x, __i:i}))
      .filter(x => norm(x.institution).includes('RAKUTEN') || norm(x.institution).includes('楽天証券'))
      .filter(x => x.cash_balance !== null && x.cash_balance !== '' && Number.isFinite(Number(x.cash_balance)))
      .sort((a, b) => String(b.snapshot_date || '').localeCompare(String(a.snapshot_date || '')) || b.__i - a.__i)[0] || null;
  }

  function revolvingInfo(st) {
    const cards = (st.masters?.cards || []).filter(c => c.active !== false && paymentMode(c) === 'REVOLVING');
    const balances = cards.map(c => Number(c.revolvingBalance)).filter(Number.isFinite).map(x => Math.max(0, x));
    let balance = balances.length ? balances.reduce((a, b) => a + b, 0) : null;
    if (balance === null && Number.isFinite(Number(st.assets?.revolvingBalance))) balance = Math.max(0, Number(st.assets.revolvingBalance));
    return { cards, balance, names:cards.map(c => c.name).filter(Boolean) };
  }

  function recentBrokerTransfer(st) {
    const rows = st.cashTransactions || [];
    const brokerOut = rows.filter(t => (norm(t.source).includes('RAKUTEN') || norm(t.source).includes('楽天証券')) && t.is_transfer && Number(t.amount) < 0)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || null;
    if (!brokerOut) return { out:null, bankIn:null };
    let bankIn = rows.find(t => t !== brokerOut && Number(t.amount) > 0 && t.is_transfer && brokerOut.transfer_group_id && t.transfer_group_id === brokerOut.transfer_group_id) || null;
    if (!bankIn && brokerOut.linked_event_id) bankIn = rows.find(t => String(t.id) === String(brokerOut.linked_event_id)) || null;
    if (!bankIn) {
      const d0 = Date.parse(brokerOut.date || '');
      bankIn = rows.find(t => {
        if (t === brokerOut || Number(t.amount) <= 0 || !t.is_transfer) return false;
        if (norm(t.source).includes('RAKUTEN') || norm(t.source).includes('楽天証券')) return false;
        const desc = norm(t.description_raw || t.description || '');
        const mentionsBroker = desc.includes('RAKUTENSHOKEN') || desc.includes('楽天証券');
        const sameAmount = Math.abs(Number(t.amount)) === Math.abs(Number(brokerOut.amount));
        const dt = Date.parse(t.date || '');
        return mentionsBroker && sameAmount && Number.isFinite(d0) && Number.isFinite(dt) && Math.abs(dt - d0) <= 2 * 86400000;
      }) || null;
    }
    return { out:brokerOut, bankIn };
  }

  function latestDebtPrincipal(st, afterDate) {
    return (st.cashTransactions || []).filter(t => {
      if (Number(t.amount) >= 0) return false;
      if (afterDate && String(t.date || '') < String(afterDate)) return false;
      return String(t.economic_type || '') === 'DEBT_PRINCIPAL' || String(t.cashflow_type || '') === 'DEBT_PRINCIPAL';
    }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || null;
  }

  function bankTotal() {
    try {
      const x = window.householdDashboardBankV81?.balances?.();
      if (x && Number.isFinite(Number(x.sum))) return Number(x.sum);
    } catch {}
    return null;
  }

  function model() {
    const st = stateNow();
    const snap = latestBrokerSnapshot(st);
    const brokerCash = snap ? Math.max(0, Number(snap.cash_balance) || 0) : null;
    const rev = revolvingInfo(st);
    const transfer = recentBrokerTransfer(st);
    const transferAmount = transfer.out ? Math.abs(Number(transfer.out.amount) || 0) : 0;
    const sourceAmount = brokerCash !== null && brokerCash > 0 ? brokerCash : transferAmount;
    const allocation = rev.balance !== null ? Math.min(sourceAmount, rev.balance) : sourceAmount;
    const shortage = rev.balance !== null ? Math.max(0, rev.balance - sourceAmount) : null;
    const remainder = rev.balance !== null ? Math.max(0, sourceAmount - rev.balance) : null;
    const debtPayment = latestDebtPrincipal(st, transfer.bankIn?.date || transfer.out?.date || '');
    return { st, snap, brokerCash, rev, transfer, transferAmount, sourceAmount, allocation, shortage, remainder, debtPayment, bank:bankTotal() };
  }

  function ensureStyle() {
    if ($('liquidityFlowStyleV82')) return;
    const style = document.createElement('style');
    style.id = 'liquidityFlowStyleV82';
    style.textContent = `
      #liquidityFlowV82 .v82-flow{display:grid;grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr) 28px minmax(0,1fr);align-items:stretch;gap:6px;margin-top:10px}
      #liquidityFlowV82 .v82-stage{border:1px solid var(--border,#d8dee8);border-radius:12px;padding:11px;min-width:0;background:rgba(127,127,127,.04)}
      #liquidityFlowV82 .v82-stage b{display:block;font-size:17px;margin-top:5px;overflow-wrap:anywhere}
      #liquidityFlowV82 .v82-arrow{display:flex;align-items:center;justify-content:center;font-size:20px;opacity:.55}
      #liquidityFlowV82 .v82-status{font-size:12px;margin-top:6px;font-weight:700}
      #liquidityFlowV82 .v82-ok{color:var(--good,#17803d)}
      #liquidityFlowV82 .v82-wait{color:var(--warn,#9a6700)}
      #liquidityFlowV82 .v82-meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
      #liquidityFlowV82 .v82-meta>div{flex:1 1 150px;padding:8px 0}
      @media(max-width:650px){#liquidityFlowV82 .v82-flow{grid-template-columns:1fr}#liquidityFlowV82 .v82-arrow{height:22px;transform:rotate(90deg)}}
    `;
    document.head.appendChild(style);
  }

  function ensure() {
    const root = $('dashboardPlanningV79') || document.querySelector('#dashboard .grid');
    if (!root) return null;
    let card = $('liquidityFlowV82');
    if (card) return card;
    ensureStyle();
    card = document.createElement('div');
    card.id = 'liquidityFlowV82';
    card.className = 'card full';
    const bank = $('dashboardBankV81');
    if (bank) bank.after(card); else root.prepend(card);
    return card;
  }

  function stage(title, subtitle, amount, status, ok) {
    return `<div class="v82-stage"><div class="tiny">${esc(subtitle)}</div><div>${esc(title)}</div><b>${amount === null ? '—' : yen(amount)}</b><div class="v82-status ${ok ? 'v82-ok' : 'v82-wait'}">${esc(status)}</div></div>`;
  }

  function render() {
    const card = ensure();
    if (!card) return;
    const m = model();
    const stage1Status = m.brokerCash !== null && m.brokerCash > 0 ? '現金化済み・預り金あり' : m.transfer.out ? '証券口座から出金済み' : '預り金データ待ち';
    const stage2Status = m.transfer.bankIn ? `銀行入金確認 ${m.transfer.bankIn.date || ''}` : m.transfer.out ? '出金処理中 / 銀行入金待ち' : 'これから銀行へ移動';
    const stage3Status = m.rev.balance === 0 ? 'リボ残高 0' : m.debtPayment ? `返済実績確認 ${m.debtPayment.date || ''}` : '返済予定';
    const stage2Amount = m.transfer.bankIn ? Math.abs(Number(m.transfer.bankIn.amount) || 0) : (m.transferAmount || m.allocation || null);
    const stage3Amount = m.debtPayment ? Math.abs(Number(m.debtPayment.amount) || 0) : (m.allocation || null);
    const names = m.rev.names.length ? m.rev.names.join(' / ') : 'リボカード';
    const snapshotNote = m.snap ? `楽天証券残高基準 ${m.snap.snapshot_date || '—'}` : '楽天証券の資産残高CSVを取り込むと預り金を自動表示します。';
    const balanceText = m.rev.balance === null ? '未登録' : yen(m.rev.balance);
    const gapText = m.shortage === null ? '—' : m.shortage > 0 ? `不足 ${yen(m.shortage)}` : `余り ${yen(m.remainder || 0)}`;

    card.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap"><div><div class="title" style="margin-bottom:3px">リボ返済 資金移動フロー <span class="tag">v82</span></div><div class="tiny">投資売却後の現金を「証券預り金 → 銀行 → リボ返済」として追跡します。これは表示専用で、資金移動を新しい支出として二重計上しません。</div></div></div>
      <div class="v82-flow">
        ${stage('楽天証券','預り金',m.brokerCash,stage1Status,!!(m.brokerCash > 0 || m.transfer.out))}
        <div class="v82-arrow">→</div>
        ${stage('銀行へ移動','振替予定 / 実績',stage2Amount,stage2Status,!!m.transfer.bankIn)}
        <div class="v82-arrow">→</div>
        ${stage(names,'リボ返済に充当',stage3Amount,stage3Status,!!(m.rev.balance === 0 || m.debtPayment))}
      </div>
      <div class="v82-meta">
        <div><div class="tiny">現在リボ残高</div><b>${balanceText}</b></div>
        <div><div class="tiny">今回充当可能</div><b>${m.allocation ? yen(m.allocation) : '—'}</b></div>
        <div><div class="tiny">返済後見込み</div><b>${gapText}</b></div>
        <div><div class="tiny">銀行口座 最新合計</div><b>${m.bank === null ? '—' : yen(m.bank)}</b></div>
      </div>
      <div class="tiny" style="margin-top:4px">${esc(snapshotNote)}</div>`;
  }

  function schedule(ms = 120) { clearTimeout(timer); timer = setTimeout(render, ms); }
  document.addEventListener('click', e => { if (e.target.closest?.('[data-page="dashboard"]')) schedule(160); }, false);
  window.addEventListener('treasury:pagechange', e => { if (e?.detail?.page === 'dashboard') schedule(160); });
  window.addEventListener('pageshow', () => schedule(220));
  const previousReplace = window.replaceTreasuryState;
  if (typeof previousReplace === 'function' && !window.__liquidityFlowReplaceV82) {
    window.__liquidityFlowReplaceV82 = true;
    window.replaceTreasuryState = function replaceTreasuryStateV82(next) {
      const result = previousReplace(next);
      schedule(180);
      return result;
    };
  }
  setTimeout(() => schedule(260), 0);
  window.householdLiquidityFlowV82 = { render, model };
})();
