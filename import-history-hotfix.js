(() => {
  const BANK_SOURCES = new Set(['Rakuten Bank', 'Yucho']);
  const SOURCE_LABELS = {
    'Rakuten Bank': '楽天銀行',
    'Yucho': 'ゆうちょ'
  };

  function isFiniteBalance(v) {
    return v !== null && v !== '' && Number.isFinite(Number(v));
  }

  function accountKey(t) {
    return `${t.source || ''}|${t.account || ''}`;
  }

  function accountLabel(source, account) {
    const base = SOURCE_LABELS[source] || source || '銀行';
    if (!account || account === 'main' || account === 'yucho') return base;
    return `${base} (${account})`;
  }

  function latestTransactionForAccount(items) {
    if (!items.length) return null;
    const latestDate = items.reduce((m, t) => String(t.date || '') > m ? String(t.date || '') : m, '');
    const day = items.filter(t => String(t.date || '') === latestDate && isFiniteBalance(t.balance_after));
    if (!day.length) return null;
    if (day.length === 1) return day[0];

    // When several transactions exist on the latest date, select the terminal balance.
    const startingBalances = new Set(day.map(t => Number(t.balance_after) - Number(t.amount || 0)));
    const terminal = day.filter(t => !startingBalances.has(Number(t.balance_after)));
    return terminal.length === 1 ? terminal[0] : day[day.length - 1];
  }

  function computeLatestBankState() {
    if (typeof state === 'undefined' || !Array.isArray(state.cashTransactions)) return null;
    const groups = new Map();
    state.cashTransactions.forEach((t, index) => {
      if (!BANK_SOURCES.has(t.source) || !isFiniteBalance(t.balance_after) || !t.date) return;
      const k = accountKey(t);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ ...t, __index: index });
    });
    if (!groups.size) return null;

    const accounts = [];
    for (const [key, items] of groups.entries()) {
      const latest = latestTransactionForAccount(items);
      if (!latest) continue;
      accounts.push({
        key,
        source: latest.source,
        account: latest.account || '',
        label: accountLabel(latest.source, latest.account),
        balance: Number(latest.balance_after),
        asOf: latest.date,
        latest
      });
    }
    if (!accounts.length) return null;

    accounts.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
    const cash = accounts.reduce((sum, x) => sum + x.balance, 0);
    const asOf = accounts.reduce((m, x) => String(x.asOf) > m ? String(x.asOf) : m, '');
    return { cash, asOf, accounts };
  }

  function ensureBankBreakdownUi() {
    if (document.getElementById('bankBalanceBreakdown')) return;
    const assets = document.getElementById('assets');
    const host = assets?.closest('.card');
    if (!host) return;
    const card = document.createElement('div');
    card.className = 'card full';
    card.id = 'bankBalanceBreakdownCard';
    card.innerHTML = '<div class="title">銀行残高</div><div id="bankBalanceBreakdown"><div class="muted">銀行CSVを取り込むと口座別残高を表示します。</div></div>';
    host.parentElement.insertBefore(card, host);
  }

  function formatYen(n) {
    try {
      if (typeof yen === 'function') return yen(n);
    } catch {}
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(Number(n) || 0);
  }

  function renderBankBreakdown(latest = computeLatestBankState()) {
    ensureBankBreakdownUi();
    const box = document.getElementById('bankBalanceBreakdown');
    if (!box) return;
    const cashLabel = document.getElementById('kpiCash')?.parentElement?.querySelector('.muted');
    if (cashLabel) cashLabel.textContent = '銀行残高 合計';

    if (!latest) {
      box.innerHTML = '<div class="muted">銀行CSVを取り込むと口座別残高を表示します。</div>';
      return;
    }

    const rows = latest.accounts.map(x =>
      `<div class="row"><div><b>${x.label}</b><div class="tiny">${x.asOf} 時点</div></div><span class="amt">${formatYen(x.balance)}</span></div>`
    ).join('');
    box.innerHTML = `${rows}<div class="row"><div><b>合計</b><div class="tiny">各銀行の最新残高を合算</div></div><span class="amt good">${formatYen(latest.cash)}</span></div>`;
  }

  function repairCurrentCash({ persist = true } = {}) {
    const latest = computeLatestBankState();
    if (!latest) {
      renderBankBreakdown(null);
      return null;
    }
    const changed = Number(state.settings.cash) !== latest.cash || Number(state.assets.bank) !== latest.cash;
    state.settings.cash = latest.cash;
    state.assets.bank = latest.cash;
    state.bankBalanceAsOf = latest.asOf;
    state.bankAccountBalances = Object.fromEntries(
      latest.accounts.map(x => [x.key, {
        source: x.source,
        account: x.account,
        label: x.label,
        balance: x.balance,
        asOf: x.asOf
      }])
    );
    renderBankBreakdown(latest);
    if (persist && changed) {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
      try { originalRender?.(); } catch {}
      renderBankBreakdown(latest);
    }
    return latest;
  }

  if (typeof parseBankMain === 'function') {
    const original = parseBankMain;
    parseBankMain = function patchedParseBankMain(src, file) {
      const result = original(src, file);
      const latest = repairCurrentCash({ persist: false });
      if (latest) {
        result.balance = latest.cash;
        result.current_as_of = latest.asOf;
        result.history_only = !!result.latest && result.latest < latest.asOf;
        result.account_balances = latest.accounts.map(x => ({ label: x.label, balance: x.balance, asOf: x.asOf }));
      }
      return result;
    };
  }

  if (typeof parseYucho === 'function') {
    const original = parseYucho;
    parseYucho = function patchedParseYucho(src, file) {
      const result = original(src, file);
      const latest = repairCurrentCash({ persist: false });
      if (latest) {
        result.balance = latest.cash;
        result.current_as_of = latest.asOf;
        result.history_only = !!result.latest && result.latest < latest.asOf;
        result.account_balances = latest.accounts.map(x => ({ label: x.label, balance: x.balance, asOf: x.asOf }));
      }
      return result;
    };
  }

  if (typeof save === 'function') {
    const originalSave = save;
    save = function patchedSave() {
      repairCurrentCash({ persist: false });
      return originalSave();
    };
  }

  const originalRender = typeof render === 'function' ? render : null;
  if (originalRender) {
    render = function patchedRender() {
      originalRender();
      renderBankBreakdown();
    };
  }

  if (typeof window.replaceTreasuryState === 'function') {
    const originalReplace = window.replaceTreasuryState;
    window.replaceTreasuryState = function patchedReplaceTreasuryState(next) {
      originalReplace(next);
      const latest = repairCurrentCash({ persist: true });
      if (latest && window.setTreasurySaveStatus) {
        window.setTreasurySaveStatus(`銀行合計を更新 (${latest.asOf})`);
      }
    };
  }

  const repaired = repairCurrentCash({ persist: true });
  renderBankBreakdown(repaired);
  if (repaired && window.setTreasurySaveStatus) {
    window.setTreasurySaveStatus(`銀行合計を更新 (${repaired.asOf})`);
  }
})();
