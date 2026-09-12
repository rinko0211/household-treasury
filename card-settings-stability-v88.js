(() => {
  if (window.__cardSettingsStabilityV88) return;
  window.__cardSettingsStabilityV88 = true;

  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g, '').toUpperCase();
  const canonicalFallback = s => {
    const raw = norm(s), n = raw.replace(/カード|CARD/g, '');
    if (!n) return '';
    if (/JAL/.test(raw)) return 'JAL';
    if (n === 'D' || /DOCOMO|DCMX/.test(raw)) return 'D_CARD';
    if (/RAKUTEN|楽天/.test(raw)) return 'RAKUTEN';
    if (/MUFG|三菱UFJ|ミツビシUFJ/.test(raw)) return 'MUFG';
    if (n === 'DC' || /^DC/.test(n)) return 'DC';
    return n;
  };
  const canonical = s => {
    try { return window.householdCardCycleV81?.canonicalCard?.(s) || canonicalFallback(s); }
    catch { return canonicalFallback(s); }
  };
  const baselineOf = c => {
    for (const v of [c?.monthlyBaselineAmount, c?.cardBaselineAmount, c?.forecastBaseline]) {
      if (v !== null && v !== '' && Number.isFinite(Number(v))) return Math.max(0, Number(v));
    }
    return 0;
  };
  const validDay = v => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
  };

  function persist(st, message) {
    st.masters = st.masters || {};
    st.masters.updatedAt = new Date().toISOString();
    window.treasuryRecoverySnapshot?.(`${message}直前`);
    window.replaceTreasuryState?.(st);
    window.setTreasurySaveStatus?.(`${message}・同期中`);
    window.cloudSyncOnLocalSave?.();
  }

  function cardById(st, id) {
    return (st.masters?.cards || []).find(c => String(c.id) === String(id)) || null;
  }

  function saveClosingFromInput(input) {
    const box = input.closest?.('[data-v77-card]');
    if (!box) return;
    const raw = input.value.trim();
    const n = raw === '' ? null : Number(raw);
    if (n !== null && validDay(n) === null) {
      alert('締め日は1〜31で入力してください。');
      return;
    }
    const st = stateNow(), c = cardById(st, box.dataset.v77Card);
    if (!c) return;
    const before = validDay(c.closingDay ?? c.statementClosingDay ?? c.cutoffDay);
    if (before === n) return;
    c.closingDay = n;
    c.statementClosingDay = n;
    c.updatedAt = new Date().toISOString();
    persist(st, '締め日を自動保存');
  }

  function baselineControls(id) {
    const key = CSS.escape(String(id));
    return {
      mode: document.querySelector(`[data-v79-card-base-mode="${key}"]`),
      amount: document.querySelector(`[data-v79-card-base-amount="${key}"]`)
    };
  }

  function saveBaselineFromDom(id, trigger) {
    const st = stateNow(), c = cardById(st, id);
    if (!c) return;
    const ctl = baselineControls(id);
    const raw = ctl.amount?.value ?? '';
    const amount = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      alert('標準見込み額を確認してください。');
      return;
    }

    let mode = ctl.mode?.value === 'BASELINE' ? 'BASELINE' : 'COMPONENTS';
    if (trigger === 'amount' && amount > 0) {
      mode = 'BASELINE';
      if (ctl.mode) ctl.mode.value = 'BASELINE';
    }

    const beforeAmount = baselineOf(c);
    const beforeMode = String(c.forecastMode || c.forecast_mode || '').toUpperCase();
    if (trigger === 'mode') c.baselineModeExplicitV88 = mode;
    else if (amount > 0) c.baselineModeExplicitV88 = 'BASELINE';

    c.monthlyBaselineAmount = Math.max(0, amount);
    c.forecastMode = mode;
    c.forecast_mode = mode;
    c.updatedAt = new Date().toISOString();

    if (beforeAmount === amount && beforeMode === mode) return;
    persist(st, '標準見込み額を自動保存');
  }

  function migrateDCardDefaults() {
    const st = stateNow();
    const cards = st.masters?.cards || [];
    let changed = false;
    for (const c of cards) {
      if (c?.active === false || canonical(c.name) !== 'D_CARD') continue;
      if (validDay(c.closingDay ?? c.statementClosingDay ?? c.cutoffDay) === null) {
        c.closingDay = 15;
        c.statementClosingDay = 15;
        changed = true;
      }
      if (validDay(c.settlementDay ?? c.paymentDay ?? c.dueDay) === null) {
        c.settlementDay = 10;
        changed = true;
      }
      const base = baselineOf(c);
      const mode = String(c.forecastMode || c.forecast_mode || '').toUpperCase();
      if (base > 0 && c.baselineModeExplicitV88 !== 'COMPONENTS' && mode !== 'BASELINE') {
        c.forecastMode = 'BASELINE';
        c.forecast_mode = 'BASELINE';
        changed = true;
      }
      if (changed) c.updatedAt = new Date().toISOString();
    }
    if (changed) persist(st, 'dカード予測設定を補正');
  }

  function addHints() {
    for (const input of document.querySelectorAll('[data-v81-closing]')) {
      const field = input.closest('.field');
      if (!field || field.querySelector('[data-v88-autosave-closing]')) continue;
      const note = document.createElement('div');
      note.className = 'tiny';
      note.dataset.v88AutosaveClosing = '1';
      note.textContent = '入力確定で自動保存';
      field.appendChild(note);
    }
    for (const input of document.querySelectorAll('[data-v79-card-base-amount]')) {
      const host = input.parentElement;
      if (!host || host.querySelector('[data-v88-autosave-baseline]')) continue;
      const note = document.createElement('span');
      note.className = 'tiny';
      note.dataset.v88AutosaveBaseline = '1';
      note.textContent = ' 金額入力で基準額方式・自動保存';
      host.appendChild(note);
    }
  }

  document.addEventListener('change', e => {
    const t = e.target;
    if (t?.matches?.('[data-v81-closing]')) {
      saveClosingFromInput(t);
      return;
    }
    if (t?.matches?.('[data-v79-card-base-amount]')) {
      saveBaselineFromDom(t.dataset.v79CardBaseAmount, 'amount');
      return;
    }
    if (t?.matches?.('[data-v79-card-base-mode]')) {
      saveBaselineFromDom(t.dataset.v79CardBaseMode, 'mode');
    }
  }, true);

  document.addEventListener('click', e => {
    if (e.target.closest?.('[data-page="settings"],[data-v77-card],[data-v79-card-base-save]')) addHints();
  }, false);
  window.addEventListener('treasury:pagechange', e => {
    if (e?.detail?.page === 'settings') addHints();
  });
  window.addEventListener('pageshow', addHints);

  migrateDCardDefaults();
  addHints();

  window.householdCardSettingsStabilityV88 = {
    canonicalFallback,
    baselineOf,
    validDay,
    migrateDCardDefaults,
    saveClosingFromInput,
    saveBaselineFromDom
  };
})();
