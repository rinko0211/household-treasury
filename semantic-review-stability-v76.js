(() => {
  if (window.__semanticReviewStabilityV76) return;
  window.__semanticReviewStabilityV76 = true;

  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g, '').toUpperCase();
  const isExpense = e => String(e || '') === 'EXPENSE';
  const sameActions = (a, next) => {
    const x = a || {};
    return String(x.economic_type || '') === String(next.economic_type || '') &&
      String(x.spending_class || '') === String(next.spending_class || '') &&
      String(x.category || '') === String(next.category || '') &&
      String(x.subcategory || '') === String(next.subcategory || '');
  };

  function stateNow() {
    try { if (typeof state !== 'undefined') return state; } catch {}
    return (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  }

  function recordId(kind, o, i) {
    return kind === 'purchase' ? String(o?.purchase_id || `purchase:${i}`) : String(o?.id || `cash:${i}`);
  }

  function findRecord(st, kind, id) {
    const arr = kind === 'purchase' ? (st.purchaseEvents || []) : (st.cashTransactions || []);
    return arr.find((o, i) => recordId(kind, o, i) === String(id)) || null;
  }

  function recordName(kind, o) {
    return kind === 'purchase' ? (o?.merchant_raw || o?.merchant_normalized || 'カード利用') : (o?.description_raw || o?.description || '銀行明細');
  }

  function selected(card) {
    const economic_type = card.querySelector('[data-v48-econ]')?.value || '';
    const spending_class = isExpense(economic_type) ? (card.querySelector('[data-v48-spend]')?.value || 'NORMAL') : null;
    const category = isExpense(economic_type) ? (card.querySelector('[data-v48-cat]')?.value || null) : null;
    const subcategory = isExpense(economic_type) ? (card.querySelector('[data-v48-sub]')?.value || null) : null;
    return { economic_type, spending_class, category, subcategory };
  }

  function matchingRules(st, kind, o, name) {
    const key = window.householdSemanticV47?.ruleKey?.(kind, o) || `${kind}|${norm(name)}`;
    const n = norm(name);
    return (st.automationRules || []).filter(r => {
      const rk = String(r?.match?.key || '');
      const rn = norm(r?.match?.name || '');
      return (rk && rk === key) || (rn && rn === n);
    });
  }

  function consolidateRememberRule(st, kind, o, name, actions) {
    st.automationRules = Array.isArray(st.automationRules) ? st.automationRules : [];
    const key = window.householdSemanticV47?.ruleKey?.(kind, o) || `${kind}|${norm(name)}`;
    const hits = matchingRules(st, kind, o, name);
    const now = new Date().toISOString();
    let primary = hits.find(r => String(r?.match?.key || '') === key) || hits[0] || null;
    if (!primary) {
      primary = { id:`rule:${crypto.randomUUID()}`, active:true, match:{kind,key,name}, actions:{}, source:'semantic-review-v76', createdAt:now };
      st.automationRules.push(primary);
    }
    primary.active = true;
    primary.match = { kind, key, name };
    primary.actions = actions;
    primary.source = 'semantic-review-v76';
    primary.updatedAt = now;
    for (const r of hits) {
      if (r === primary) continue;
      r.active = false;
      r.disabled_reason = 'duplicate_review_rule_v76';
      r.disabledAt = now;
    }
  }

  function disableConflictingRules(st, kind, o, name, actions) {
    const now = new Date().toISOString();
    for (const r of matchingRules(st, kind, o, name)) {
      if (r.active === false || sameActions(r.actions, actions)) continue;
      r.active = false;
      r.disabled_reason = 'manual_override_v76';
      r.disabledAt = now;
    }
  }

  function persistDirect(msg) {
    try {
      if (typeof save === 'function') save();
      else {
        const st = stateNow();
        window.replaceTreasuryState?.(st);
        window.cloudSyncOnLocalSave?.();
      }
      window.setTreasurySaveStatus?.(`${msg}・同期中`);
    } catch (err) {
      console.error('v76 review save', err);
      throw err;
    }
  }

  function immediateFeedback(card, button) {
    button.disabled = true;
    button.dataset.v76Done = '1';
    button.textContent = '保存済み ✓';
    card.style.opacity = '.72';
    card.style.pointerEvents = 'none';
    setTimeout(() => {
      const host = document.getElementById('semanticReviewRowsV48');
      card.remove();
      if (host && !host.querySelector('[data-v48-kind]')) host.innerHTML = '<div class="note good">要確認はありません。</div>';
    }, 90);
    setTimeout(() => {
      try { if (document.getElementById('imports')?.classList.contains('active')) window.renderSemanticUiV48?.(); } catch {}
    }, 450);
  }

  function saveCard(card, remember, button) {
    const st = stateNow();
    const kind = card.dataset.v48Kind;
    const id = card.dataset.v48Id;
    const o = findRecord(st, kind, id);
    if (!o) {
      button.textContent = '対象なし';
      return;
    }
    const actions = selected(card);
    if (!actions.economic_type) return;
    if (isExpense(actions.economic_type) && !actions.category) {
      const cat = card.querySelector('[data-v48-cat]');
      button.textContent = 'カテゴリを選択';
      cat?.focus();
      setTimeout(() => { if (!button.dataset.v76Done) button.textContent = remember ? '保存して記憶' : '保存'; }, 1200);
      return;
    }

    button.disabled = true;
    button.textContent = '保存中…';
    const name = recordName(kind, o);
    const now = new Date().toISOString();
    o.economic_type = actions.economic_type;
    o.spending_class = actions.spending_class;
    o.category = actions.category;
    o.subcategory = actions.subcategory;
    o.expense_scope = isExpense(actions.economic_type) ? actions.spending_class : actions.economic_type === 'INVESTMENT' ? 'INVESTMENT' : actions.economic_type.startsWith('DEBT_') ? 'DEBT' : actions.economic_type === 'TRANSFER' ? 'TRANSFER' : actions.economic_type === 'INCOME' ? 'INCOME' : null;
    o.ordinary_or_special = o.expense_scope;
    o.confidence = 1;
    o.review_status = 'RESOLVED';
    o.reviewed_at = now;
    o.semantic_manual_override = !remember;
    o.semantic_review_version = 76;

    st.reviewQueue = (st.reviewQueue || []).filter(q => norm(q.merchant || q.description || '') !== norm(name));
    if (remember) consolidateRememberRule(st, kind, o, name, actions);
    else disableConflictingRules(st, kind, o, name, actions);

    try {
      window.treasuryRecoverySnapshot?.(`${remember ? '分類ルール' : '分類'}保存直前`);
      persistDirect(remember ? '分類ルール保存済み' : '分類保存済み');
      immediateFeedback(card, button);
    } catch {
      button.disabled = false;
      button.textContent = '保存失敗';
    }
  }

  document.addEventListener('click', e => {
    const button = e.target.closest?.('[data-v48-review-save],[data-v48-review-remember]');
    if (!button) return;
    const card = button.closest('[data-v48-kind]');
    if (!card) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    saveCard(card, button.matches('[data-v48-review-remember]'), button);
  }, true);
})();
