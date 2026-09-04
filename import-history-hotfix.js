(() => {
  const BANK_SOURCES = new Set(['Rakuten Bank', 'Yucho']);

  function isFiniteBalance(v) {
    return v !== null && v !== '' && Number.isFinite(Number(v));
  }

  function accountKey(t) {
    return `${t.source || ''}|${t.account || ''}`;
  }

  function latestTransactionForAccount(items) {
    if (!items.length) return null;
    const latestDate = items.reduce((m, t) => String(t.date || '') > m ? String(t.date || '') : m, '');
    const day = items.filter(t => String(t.date || '') === latestDate && isFiniteBalance(t.balance_after));
    if (!day.length) return null;
    if (day.length === 1) return day[0];

    const startingBalances = new Set(
      day.map(t => Number(t.balance_after) - Number(t.amount || 0))
    );
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
      if (latest) accounts.push({ key, latest });
    }
    if (!accounts.length) return null;

    const cash = accounts.reduce((sum, x) => sum + Number(x.latest.balance_after || 0), 0);
    const asOf = accounts.reduce((m, x) => String(x.latest.date) > m ? String(x.latest.date) : m, '');
    return { cash, asOf, accounts };
  }

  function repairCurrentCash({ persist = true } = {}) {
    const latest = computeLatestBankState();
    if (!latest) return null;
    const changed = Number(state.settings.cash) !== latest.cash || Number(state.assets.bank) !== latest.cash;
    state.settings.cash = latest.cash;
    state.assets.bank = latest.cash;
    state.bankBalanceAsOf = latest.asOf;
    state.bankAccountBalances = Object.fromEntries(
      latest.accounts.map(x => [x.key, { balance: Number(x.latest.balance_after), asOf: x.latest.date }])
    );
    if (persist && changed) {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
      try { render(); } catch {}
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

  if (typeof window.replaceTreasuryState === 'function') {
    const originalReplace = window.replaceTreasuryState;
    window.replaceTreasuryState = function patchedReplaceTreasuryState(next) {
      originalReplace(next);
      const latest = repairCurrentCash({ persist: true });
      if (latest && window.setTreasurySaveStatus) {
        window.setTreasurySaveStatus(`最新銀行残高を採用 (${latest.asOf})`);
      }
    };
  }

  const repaired = repairCurrentCash({ persist: true });
  if (repaired && window.setTreasurySaveStatus) {
    window.setTreasurySaveStatus(`最新銀行残高を採用 (${repaired.asOf})`);
  }
})();
