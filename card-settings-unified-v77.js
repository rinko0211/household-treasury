(() => {
  if (window.__cardSettingsUnifiedV77) return;
  window.__cardSettingsUnifiedV77 = true;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const sameCard = (a,b) => {
    try { return window.householdCardIdentityV51?.sameCard?.(a,b) ?? norm(a) === norm(b); }
    catch { return norm(a) === norm(b); }
  };
  const paymentMode = c => String(c?.paymentMode || c?.payment_mode || 'FULL').toUpperCase() === 'REVOLVING' ? 'REVOLVING' : 'FULL';
  let pendingOpenId = null;
  let semanticWrapped = false;

  function cardsOf(st) {
    st.masters = st.masters || {};
    st.masters.cards = Array.isArray(st.masters.cards) ? st.masters.cards : [];
    st.masters.fixedExpenses = Array.isArray(st.masters.fixedExpenses) ? st.masters.fixedExpenses : [];
    return st.masters.cards;
  }

  function syncAggregateBalance(st) {
    st.assets = st.assets || {};
    const vals = cardsOf(st)
      .filter(c => c.active !== false && paymentMode(c) === 'REVOLVING')
      .map(c => c.revolvingBalance)
      .filter(v => v !== null && v !== '' && Number.isFinite(Number(v)))
      .map(Number);
    if (vals.length) {
      st.assets.revolvingBalance = vals.reduce((a,b) => a + Math.max(0,b), 0);
      st.revolvingBalanceManagedByCards = true;
    } else if (st.revolvingBalanceManagedByCards) {
      st.assets.revolvingBalance = 0;
    }
  }

  function inferredDay(st, c) {
    const rows = (st.cardSettlements || [])
      .filter(s => s.due_date && sameCard(s.card, c.name))
      .sort((a,b) => String(b.due_date).localeCompare(String(a.due_date)));
    return rows.length ? Number(String(rows[0].due_date).slice(8,10)) || null : null;
  }

  function retireLegacyCardUi() {
    const oldAdd = $('masterAddCardV1');
    if (oldAdd) oldAdd.style.display = 'none';
    const oldRows = $('masterCardsV1');
    if (oldRows) oldRows.style.display = 'none';

    const legacy = $('semanticCardSettingsV48');
    if (legacy) legacy.style.display = 'none';
    const legacyRows = $('semanticCardRowsV48');
    if (legacyRows) legacyRows.remove();

    const v52 = $('addCardV52');
    if (v52) v52.remove();
  }

  function ensureUi() {
    retireLegacyCardUi();
    const oldRows = $('masterCardsV1');
    const panel = oldRows?.closest('.card.half') || oldRows?.parentElement;
    if (!panel) return null;
    const legacyTitle = [...panel.children].find(x => x.classList?.contains('title'));
    if (legacyTitle) legacyTitle.style.display = 'none';

    let root = $('unifiedCardsV77');
    if (!root) {
      root = document.createElement('details');
      root.id = 'unifiedCardsV77';
      root.innerHTML = `
        <summary style="cursor:pointer;display:flex;justify-content:space-between;gap:8px;align-items:center">
          <div><b>カード</b><div class="tiny">カードマスタと支払設定をここに統合</div></div>
          <span class="tag" id="unifiedCardCountV77">0件</span>
        </summary>
        <div style="margin-top:10px">
          <div class="note" style="margin-bottom:8px">設定は必要な時だけ開きます。カード追加・削除・名称変更は固定費マスタの支払カード選択肢へ即時反映します。</div>
          <div class="controls" style="margin-bottom:8px"><button type="button" class="btn secondary" id="addUnifiedCardV77">＋カード</button></div>
          <div id="unifiedCardRowsV77"></div>
        </div>`;
      panel.appendChild(root);
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
    }
    return root;
  }

  function cardRow(c, st) {
    const mode = paymentMode(c);
    const day = Number(c.settlementDay || c.paymentDay || c.dueDay) || '';
    const inferred = inferredDay(st,c);
    const monthly = Number(c.revolvingMonthlyPayment ?? c.monthlyPaymentAmount ?? c.monthlyPayment) || '';
    const balance = c.revolvingBalance === null || c.revolvingBalance === '' || c.revolvingBalance === undefined ? '' : Number(c.revolvingBalance);
    const summary = [mode === 'REVOLVING' ? 'リボ' : '一括', day ? `引落 ${day}日` : inferred ? `引落 推定${inferred}日` : '引落日未設定', c.active === false ? '停止' : '有効'].join(' · ');
    return `<details class="card" style="padding:10px;margin-top:8px" data-v77-card="${esc(String(c.id))}">
      <summary style="cursor:pointer;display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b>${esc(c.name || 'カード')}</b><div class="tiny">${esc(summary)}</div></div><span class="tag">${mode === 'REVOLVING' ? 'リボ' : '一括'}</span></summary>
      <div class="form" style="grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px">
        <div class="field"><label>カード名</label><input data-v77-name value="${esc(c.name || '')}"></div>
        <div class="field"><label>引落日</label><input data-v77-day type="number" min="1" max="31" inputmode="numeric" value="${day}" placeholder="1〜31"></div>
        <div class="field"><label>支払方式</label><select data-v77-mode><option value="FULL" ${mode==='FULL'?'selected':''}>一括</option><option value="REVOLVING" ${mode==='REVOLVING'?'selected':''}>リボ</option></select></div>
        <div class="field"><label>状態</label><select data-v77-active><option value="1" ${c.active!==false?'selected':''}>有効</option><option value="0" ${c.active===false?'selected':''}>停止</option></select></div>
        <div class="field" data-v77-rev ${mode==='REVOLVING'?'':'hidden'}><label>標準の毎月返済額</label><input data-v77-monthly type="number" min="0" inputmode="numeric" value="${monthly}" placeholder="月別補正はCash Flowで設定"></div>
        <div class="field" data-v77-rev ${mode==='REVOLVING'?'':'hidden'}><label>現在リボ残高</label><input data-v77-balance type="number" min="0" inputmode="numeric" value="${balance}"></div>
        <div class="field" data-v77-rev ${mode==='REVOLVING'?'':'hidden'}><label>残高基準日</label><input data-v77-asof type="date" value="${esc(c.revolvingBalanceAsOf || '')}"></div>
      </div>
      <div class="tiny" style="margin-top:7px">${mode==='REVOLVING'?'標準返済額は将来予測の基準値です。月ごとの実額・補正はCash Flow側で変更できます。':'カード利用＋カード払い固定費から見込請求を計算します。'}</div>
      <div class="controls" style="margin-top:9px"><button type="button" class="btn" data-v77-save>保存</button><button type="button" class="btn danger" data-v77-del>削除</button></div>
    </details>`;
  }

  function renderUnifiedCards() {
    const root = ensureUi();
    const host = $('unifiedCardRowsV77');
    if (!root || !host) return;
    const wasTopOpen = root.open;
    const openIds = new Set([...host.querySelectorAll('[data-v77-card][open]')].map(x => String(x.dataset.v77Card)));
    if (pendingOpenId) openIds.add(String(pendingOpenId));
    const st = stateNow(), cards = cardsOf(st);
    $('unifiedCardCountV77').textContent = `${cards.filter(c=>c.active!==false).length}/${cards.length}件`;
    host.innerHTML = cards.length ? cards.map(c => cardRow(c,st)).join('') : '<div class="muted">カードは未登録です。</div>';
    root.open = wasTopOpen || !!pendingOpenId;
    for (const id of openIds) host.querySelector(`[data-v77-card="${CSS.escape(id)}"]`)?.setAttribute('open','');
    pendingOpenId = null;
    retireLegacyCardUi();
  }

  function refreshFixedCardSelects() {
    const st = stateNow(), cards = cardsOf(st).filter(c => c.active !== false);
    for (const box of document.querySelectorAll('#semanticFixedRowsV48 [data-v48-fixed]')) {
      const sel = box.querySelector('[data-f-card]');
      if (!sel) continue;
      const m = (st.masters?.fixedExpenses || []).find(x => String(x.id) === String(box.dataset.v48Fixed));
      const before = sel.value;
      const route = box.querySelector('[data-f-route]')?.value || m?.paymentRoute || m?.payment_route || 'DIRECT';
      sel.innerHTML = '<option value="">未指定</option>' + cards.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
      const fromDom = cards.find(c => sameCard(c.name,before))?.name;
      const fromState = cards.find(c => sameCard(c.name,m?.paymentCard))?.name;
      sel.value = fromDom || fromState || '';
      sel.disabled = String(route).toUpperCase() !== 'CARD';
    }
  }

  function persist(st, msg) {
    st.masters = st.masters || {};
    st.masters.updatedAt = new Date().toISOString();
    syncAggregateBalance(st);
    window.treasuryRecoverySnapshot?.(`${msg}直前`);
    window.replaceTreasuryState?.(st);
    window.setTreasurySaveStatus?.(`${msg}・同期中`);
    window.cloudSyncOnLocalSave?.();
    renderUnifiedCards();
    refreshFixedCardSelects();
  }

  function addCard() {
    const name = prompt('カード名','')?.trim();
    if (!name) return;
    const st = stateNow(), cards = cardsOf(st);
    if (cards.some(c => c.active !== false && norm(c.name) === norm(name))) return alert('同じ名前のカードがすでに登録されています。');
    const id = `card:${crypto.randomUUID()}`;
    cards.push({id,name,active:true,paymentMode:'FULL',payment_mode:'FULL',createdAt:new Date().toISOString(),source:'card-settings-unified-v77'});
    pendingOpenId = id;
    persist(st,'カード追加済み');
  }

  function saveCard(box) {
    const st = stateNow(), cards = cardsOf(st), c = cards.find(x => String(x.id) === String(box.dataset.v77Card));
    if (!c) return;
    const oldName = String(c.name || '');
    const name = box.querySelector('[data-v77-name]')?.value.trim();
    const rawDay = box.querySelector('[data-v77-day]')?.value ?? '';
    const day = rawDay === '' ? null : Number(rawDay);
    const mode = box.querySelector('[data-v77-mode]')?.value === 'REVOLVING' ? 'REVOLVING' : 'FULL';
    const active = box.querySelector('[data-v77-active]')?.value !== '0';
    const rawMonthly = box.querySelector('[data-v77-monthly]')?.value ?? '';
    const monthly = rawMonthly === '' ? 0 : Number(rawMonthly);
    const rawBalance = box.querySelector('[data-v77-balance]')?.value ?? '';
    const balance = rawBalance === '' ? null : Number(rawBalance);
    const asOf = box.querySelector('[data-v77-asof]')?.value || '';
    if (!name) return alert('カード名を入力してください。');
    if (cards.some(x => String(x.id)!==String(c.id) && x.active!==false && norm(x.name)===norm(name))) return alert('同じ名前のカードがすでに登録されています。');
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) return alert('引落日は1〜31で入力してください。');
    if (mode === 'REVOLVING' && (!Number.isFinite(monthly) || monthly <= 0)) return alert('リボの標準毎月返済額を入力してください。月ごとの実額はCash Flow側で補正できます。');
    if (balance !== null && (!Number.isFinite(balance) || balance < 0)) return alert('リボ残高を確認してください。');

    if (oldName && oldName !== name) {
      c.aliases = Array.isArray(c.aliases) ? c.aliases : [];
      if (!c.aliases.includes(oldName)) c.aliases.push(oldName);
      for (const m of st.masters.fixedExpenses || []) if (m.paymentCard && sameCard(m.paymentCard,oldName)) m.paymentCard = name;
    }
    Object.assign(c,{
      name,active,settlementDay:day,paymentMode:mode,payment_mode:mode,
      revolvingMonthlyPayment:mode==='REVOLVING'?Math.max(0,monthly):0,
      revolvingBalance:mode==='REVOLVING'?balance:null,
      revolvingBalanceAsOf:mode==='REVOLVING'&&balance!==null?(asOf || new Date().toISOString().slice(0,10)):null,
      revolvingDetailMode:mode==='REVOLVING'?'MANUAL_PAYMENT_ONLY':null,
      updatedAt:new Date().toISOString()
    });
    pendingOpenId = c.id;
    persist(st,'カード設定保存済み');
  }

  function deleteCard(box) {
    const st = stateNow(), cards = cardsOf(st), c = cards.find(x => String(x.id) === String(box.dataset.v77Card));
    if (!c) return;
    const refs = (st.masters.fixedExpenses || []).filter(m => m.paymentCard && sameCard(m.paymentCard,c.name));
    const msg = refs.length
      ? `「${c.name}」を削除しますか？\nこのカードを選択している固定費 ${refs.length}件は「カード未指定」に戻します。\n過去の利用明細は削除しません。`
      : `「${c.name}」を削除しますか？\n過去の利用明細は削除しません。`;
    if (!confirm(msg)) return;
    st.masters.cards = cards.filter(x => String(x.id) !== String(c.id));
    for (const m of st.masters.fixedExpenses || []) if (m.paymentCard && sameCard(m.paymentCard,c.name)) { m.paymentCard = null; delete m.paymentCardId; }
    persist(st,'カード削除済み');
  }

  function toggleRevolving(box) {
    const rev = box.querySelector('[data-v77-mode]')?.value === 'REVOLVING';
    box.querySelectorAll('[data-v77-rev]').forEach(el => el.hidden = !rev);
  }

  function onClick(e) {
    const add = e.target.closest?.('#addUnifiedCardV77');
    if (add) { e.preventDefault(); return addCard(); }
    const box = e.target.closest?.('[data-v77-card]');
    if (!box) return;
    if (e.target.closest('[data-v77-save]')) { e.preventDefault(); return saveCard(box); }
    if (e.target.closest('[data-v77-del]')) { e.preventDefault(); return deleteCard(box); }
  }

  function onChange(e) {
    const box = e.target.closest?.('[data-v77-card]');
    if (box && e.target.matches('[data-v77-mode]')) toggleRevolving(box);
  }

  function wrapSemanticOnce() {
    if (semanticWrapped || typeof window.renderSemanticUiV48 !== 'function') return false;
    semanticWrapped = true;
    const previous = window.renderSemanticUiV48;
    window.renderSemanticUiV48 = function renderSemanticUiV48WithUnifiedCardsV77() {
      const r = previous();
      setTimeout(() => { retireLegacyCardUi(); refreshFixedCardSelects(); }, 0);
      return r;
    };
    return true;
  }

  function install() {
    if (!ensureUi()) return false;
    renderUnifiedCards();
    refreshFixedCardSelects();
    wrapSemanticOnce();
    return true;
  }

  window.addEventListener('treasury:pagechange', e => {
    if (e?.detail?.page !== 'settings') return;
    setTimeout(() => { install(); renderUnifiedCards(); refreshFixedCardSelects(); }, 0);
  });

  window.householdCardSettingsV77 = {render:renderUnifiedCards,refreshFixedCardSelects,retireLegacyCardUi};

  let tries = 0;
  const wait = () => {
    if (install()) return;
    if (++tries < 80) setTimeout(wait,75);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',wait,{once:true}); else setTimeout(wait,0);
})();