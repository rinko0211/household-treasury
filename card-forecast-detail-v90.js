(() => {
  if (window.__cardForecastDetailV90) return;
  window.__cardForecastDetailV90 = true;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g, '').toUpperCase();
  const yen = n => new Intl.NumberFormat('ja-JP', {style:'currency', currency:'JPY', maximumFractionDigits:0}).format(Number(n) || 0);
  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  let activeLineKey = '';
  let uiTimer = null;

  function canonical(s) {
    try { return window.householdCardCycleV81?.canonicalCard?.(s) || ''; }
    catch { return ''; }
  }
  function sameCard(a, b) {
    try { return window.householdCardIdentityV51?.sameCard?.(a, b) ?? norm(a) === norm(b); }
    catch { return norm(a) === norm(b); }
  }
  function baselineOf(c) {
    try { return window.householdPlanningV79?.baselineOf?.(c) || 0; }
    catch { return Math.max(0, Number(c?.monthlyBaselineAmount) || 0); }
  }
  function forecastMode(c) {
    try { return window.householdPlanningV79?.forecastMode?.(c) || 'COMPONENTS'; }
    catch { return String(c?.forecastMode || c?.forecast_mode || '').toUpperCase(); }
  }
  function paymentMode(c) {
    try { return window.householdPlanningV79?.paymentMode?.(c) || 'FULL'; }
    catch { return String(c?.paymentMode || c?.payment_mode || 'FULL').toUpperCase(); }
  }
  function cardMaster(st, name) {
    return (st.masters?.cards || []).find(c => c?.active !== false && sameCard(c.name, name)) || null;
  }

  // For d-card, a configured standard estimate is an estimate, not merely a floor.
  // Confirmed settlements and explicit month overrides remain authoritative upstream.
  function enforceDCardStandard(rows) {
    const st = stateNow();
    return (Array.isArray(rows) ? rows : []).map(row => {
      if (String(row?.type || '') !== 'CARD_ESTIMATE') return row;
      if (canonical(row.card || row.name) !== 'D_CARD') return row;
      if (row.card_cashflow_override === true || row.manual_cashflow_correction === true) return row;
      const c = cardMaster(st, row.card || row.name);
      if (!c || paymentMode(c) !== 'FULL' || forecastMode(c) !== 'BASELINE') return row;
      const base = baselineOf(c);
      if (!(base > 0)) return row;
      return {
        ...row,
        amount: -base,
        baseline_amount: base,
        forecast_method: 'D_CARD_STANDARD_BASELINE_V90',
        baseline_exact_applied_v90: true,
        baseline_floor_applied: false
      };
    });
  }

  const prevPlan = window.householdCardForecastV49;
  if (typeof prevPlan === 'function' && !window.__cardForecastPlanV90) {
    window.__cardForecastPlanV90 = true;
    window.householdCardForecastV49 = function householdCardForecastV90(days = 180) {
      const plan = structuredClone(prevPlan(days) || {rows: [], warnings: []});
      plan.rows = enforceDCardStandard(plan.rows || []);
      return plan;
    };
  }
  if (typeof generated === 'function' && !window.__cardForecastGeneratedV90) {
    window.__cardForecastGeneratedV90 = true;
    const prevGenerated = generated;
    generated = function generatedCardForecastV90(days = 90) {
      return enforceDCardStandard(prevGenerated(days));
    };
  }

  function lineKey(l, i = 0) {
    return String(l?.billing_line_id || l?.line_id || l?.id || [
      l?.purchase_id || '', Number(l?.occurrence_index || 1), l?.source_file || '',
      l?.purchase_date || '', l?.merchant_raw || '', Number(l?.original_amount) || 0,
      l?.billing_month || '', i
    ].join('|'));
  }
  function linkedPurchase(st, line) {
    let p = (st.purchaseEvents || []).find(x => line.purchase_id && String(x.purchase_id || '') === String(line.purchase_id) && Number(x.occurrence_index || 1) === Number(line.occurrence_index || 1));
    if (p) return p;
    return (st.purchaseEvents || []).find(x => sameCard(x.card, line.card) && String(x.purchase_date || '') === String(line.purchase_date || '') && norm(x.merchant_raw || x.merchant_normalized) === norm(line.merchant_raw || '') && Math.abs(Number(x.original_amount) || 0) === Math.abs(Number(line.original_amount) || 0) && String(x.billing_month || '') === String(line.billing_month || '')) || null;
  }
  function lineAmount(l) {
    const original = Number(l?.original_amount);
    if (Number.isFinite(original) && original !== 0) return Math.abs(original);
    const billed = Number(l?.billed_amount);
    return Number.isFinite(billed) ? Math.abs(billed) : 0;
  }
  function unlinkedBillingLines(st) {
    return (st.cardBillingLines || [])
      .map((line, i) => ({line, i}))
      .filter(x => x.line?.card && !linkedPurchase(st, x.line))
      .sort((a, b) => String(b.line.purchase_date || '').localeCompare(String(a.line.purchase_date || '')) || String(b.line.source_file || '').localeCompare(String(a.line.source_file || '')))
      .slice(0, 80);
  }

  function ensureLineModal() {
    if ($('v90BillingLineModal')) return;
    const modal = document.createElement('div');
    modal.id = 'v90BillingLineModal';
    modal.hidden = true;
    modal.style.display = 'none';
    modal.innerHTML = `<div data-v90-line-close style="position:fixed;inset:0;background:#0009;z-index:12600"></div><div class="card" style="position:fixed;z-index:12601;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,560px);max-height:90vh;overflow:auto"><div class="title">最近取り込んだカード明細を編集</div><div class="form" style="grid-template-columns:1fr 1fr"><div class="field"><label>カード</label><input id="v90LineCard"></div><div class="field"><label>利用日</label><input id="v90LineDate" type="date"></div><div class="field" style="grid-column:1/-1"><label>利用先</label><input id="v90LineMerchant"></div><div class="field"><label>利用額</label><input id="v90LineAmount" type="number" min="0" inputmode="numeric"></div><div class="field"><label>請求月</label><input id="v90LineMonth" type="month"></div><div class="field"><label>当月請求額</label><input id="v90LineBilled" type="number" inputmode="numeric"></div></div><div class="controls" style="margin-top:12px"><button type="button" class="btn" data-v90-line-save>保存</button><button type="button" class="btn secondary" data-v90-line-close>キャンセル</button></div></div>`;
    document.body.appendChild(modal);
  }
  function findLine(st, key) {
    return (st.cardBillingLines || []).find((l, i) => lineKey(l, i) === String(key)) || null;
  }
  function openLine(key) {
    ensureLineModal();
    const st = stateNow(), line = findLine(st, key);
    if (!line) return alert('編集対象の明細が見つかりません。');
    activeLineKey = key;
    $('v90LineCard').value = line.card || '';
    $('v90LineDate').value = line.purchase_date || '';
    $('v90LineMerchant').value = line.merchant_raw || line.merchant_normalized || '';
    $('v90LineAmount').value = String(lineAmount(line));
    $('v90LineMonth').value = line.billing_month || '';
    $('v90LineBilled').value = String(Number(line.billed_amount) || 0);
    const modal = $('v90BillingLineModal'); modal.hidden = false; modal.style.display = 'block';
  }
  function closeLine() {
    const modal = $('v90BillingLineModal'); if (modal) { modal.hidden = true; modal.style.display = 'none'; }
    activeLineKey = '';
  }
  function persist(st, msg) {
    window.treasuryRecoverySnapshot?.(`${msg}直前`);
    window.replaceTreasuryState?.(st);
    window.setTreasurySaveStatus?.(`${msg}・同期中`);
    window.cloudSyncOnLocalSave?.();
    scheduleUi(140);
  }
  function saveLine() {
    if (!activeLineKey) return;
    const st = stateNow(), line = findLine(st, activeLineKey);
    if (!line) return alert('編集対象の明細が見つかりません。');
    const date = $('v90LineDate').value, amount = Number($('v90LineAmount').value), billed = Number($('v90LineBilled').value), merchant = $('v90LineMerchant').value.trim(), month = $('v90LineMonth').value, card = $('v90LineCard').value.trim();
    if (!date || !card || !Number.isFinite(amount) || amount < 0) return alert('カード・利用日・利用額を確認してください。');
    line.card = card; line.purchase_date = date; line.original_amount = Math.abs(amount); line.billing_month = month || line.billing_month || '';
    if (merchant) { line.merchant_raw = merchant; line.merchant_normalized = merchant; }
    if (Number.isFinite(billed)) line.billed_amount = billed;
    line.manual_corrected_at = new Date().toISOString();
    const p = linkedPurchase(st, line);
    if (p) {
      p.card = card; p.purchase_date = date; p.original_amount = Math.abs(amount); p.billing_month = line.billing_month;
      if (merchant) { p.merchant_raw = merchant; p.merchant_normalized = merchant; }
      p.manual_corrected_at = line.manual_corrected_at;
    }
    persist(st, 'カード明細補正'); closeLine();
  }

  function makeImportRowsCollapsible() {
    const card = $('cardImportCorrectionsV73');
    if (!card) return;
    const purchaseHost = $('cardImportCorrectionRowsV73');
    if (purchaseHost && !purchaseHost.closest('[data-v90-import-detail]')) {
      const title = [...card.querySelectorAll('.title')].find(x => String(x.textContent || '').includes('カード取込補正'));
      const intro = title?.nextElementSibling?.classList?.contains('tiny') ? title.nextElementSibling : null;
      const details = document.createElement('details'); details.dataset.v90ImportDetail = '1'; details.style.marginTop = '10px';
      const summary = document.createElement('summary'); summary.style.cursor = 'pointer'; summary.innerHTML = '<b>明細の編集を表示 / 非表示</b>';
      purchaseHost.parentElement.insertBefore(details, purchaseHost); details.append(summary, purchaseHost);
      if (intro) details.insertBefore(intro, purchaseHost);
    }
    const settlementHost = $('cardSettlementCorrectionRowsV73');
    if (settlementHost && !settlementHost.closest('[data-v90-settlement-detail]')) {
      const precedingTitle = settlementHost.previousElementSibling;
      const details = document.createElement('details'); details.dataset.v90SettlementDetail = '1'; details.style.marginTop = '10px';
      const summary = document.createElement('summary'); summary.style.cursor = 'pointer'; summary.innerHTML = '<b>請求明細を表示 / 非表示</b>';
      settlementHost.parentElement.insertBefore(details, precedingTitle?.classList?.contains('title') ? precedingTitle : settlementHost);
      details.append(summary);
      if (precedingTitle?.classList?.contains('title')) details.appendChild(precedingTitle);
      details.appendChild(settlementHost);
    }
  }

  function appendRecentBillingLines() {
    const host = $('cardImportCorrectionRowsV73'); if (!host) return;
    host.querySelectorAll('[data-v90-line-only]').forEach(x => x.remove());
    const st = stateNow(), lines = unlinkedBillingLines(st);
    if (!lines.length) return;
    const head = document.createElement('div'); head.dataset.v90LineOnly = '1'; head.className = 'note'; head.style.marginTop = '8px'; head.textContent = `最近の取込明細（従来の編集一覧に無かったもの） ${lines.length}件`;
    host.prepend(head);
    for (const {line, i} of lines) {
      const row = document.createElement('div'); row.dataset.v90LineOnly = '1'; row.className = 'row'; row.style.cssText = 'align-items:flex-start;gap:8px';
      const key = lineKey(line, i);
      row.innerHTML = `<div style="min-width:0;flex:1"><b>${esc(line.merchant_raw || line.merchant_normalized || 'カード利用')}</b><div class="tiny">${esc(line.purchase_date || '')} · ${esc(line.card || '')} · 請求月 ${esc(line.billing_month || '未設定')} · ${yen(lineAmount(line))}</div><div class="tiny">${esc(line.source_file || '')}</div></div><div class="controls"><span class="tag">最近取込</span><button type="button" class="btn secondary" data-v90-line-edit="${esc(key)}">編集</button></div>`;
      head.insertAdjacentElement('afterend', row);
    }
  }

  function makeCashflowEditorCollapsible() {
    const modal = $('cardCashflowEditV75'), host = $('v75PurchaseRows');
    if (!modal || !host || host.closest('[data-v90-cashflow-detail]')) return;
    const title = [...modal.querySelectorAll('.title')].find(x => String(x.textContent || '').includes('利用明細'));
    const hint = title?.nextElementSibling?.classList?.contains('tiny') ? title.nextElementSibling : null;
    const details = document.createElement('details'); details.dataset.v90CashflowDetail = '1'; details.style.marginTop = '12px';
    const summary = document.createElement('summary'); summary.style.cursor = 'pointer'; summary.innerHTML = '<b>明細の編集を表示 / 非表示</b>';
    const parent = host.parentElement; parent.insertBefore(details, title || host); details.append(summary);
    if (title) details.appendChild(title); if (hint) details.appendChild(hint); details.appendChild(host);
  }

  function retirePhase4Ui() {
    const card = $('reimbursementCardV35');
    if (card) card.style.display = 'none';
    for (const el of document.querySelectorAll('a,button')) {
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/Phase\s*4/i.test(text) && /立替|精算/.test(text)) el.style.display = 'none';
    }
  }

  function refreshUi() {
    retirePhase4Ui();
    makeImportRowsCollapsible();
    appendRecentBillingLines();
    makeCashflowEditorCollapsible();
  }
  function scheduleUi(ms = 80) { clearTimeout(uiTimer); uiTimer = setTimeout(refreshUi, ms); }

  document.addEventListener('click', e => {
    const lineEdit = e.target.closest?.('[data-v90-line-edit]');
    if (lineEdit) { e.preventDefault(); e.stopPropagation(); openLine(lineEdit.dataset.v90LineEdit); return; }
    if (e.target.closest?.('[data-v90-line-save]')) { e.preventDefault(); saveLine(); return; }
    if (e.target.closest?.('[data-v90-line-close]')) { e.preventDefault(); closeLine(); return; }
    if (e.target.closest?.('[data-page="imports"],[data-page="cashflow"],[data-v75-card-edit]')) scheduleUi(120);
  }, true);
  window.addEventListener('treasury:pagechange', () => scheduleUi(120));
  window.addEventListener('pageshow', () => scheduleUi(180));
  setTimeout(refreshUi, 0);

  window.householdCardForecastDetailV90 = { enforceDCardStandard, unlinkedBillingLines, refreshUi };
})();
