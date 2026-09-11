(() => {
  if (window.__assetSnapshotV85) return;
  window.__assetSnapshotV85 = true;

  const parseSnapshotDate = name => {
    const m = String(name || '').match(/assetbalance\(all\)_(\d{4})(\d{2})(\d{2})_/i);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : (typeof today === 'function' ? today() : new Date().toISOString().slice(0,10));
  };

  const exactValue = (rows, label) => {
    const row = rows.find(r => String(r?.[0] ?? '').replace(/^\uFEFF/, '').trim() === label);
    if (!row || row.length < 2) return null;
    return typeof number === 'function' ? number(row[1]) : Number(String(row[1]).replace(/,/g,''));
  };

  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const isRakutenBrokerAccount = a => {
    const name = norm(a?.name), key = norm(a?.sourceKey), type = String(a?.type || '').toUpperCase();
    if (key.includes('RAKUTENSECURITIES') || key.includes('楽天証券')) return true;
    if (!name.includes('楽天証券')) return false;
    return name.includes('預り金') || name.includes('預かり金') || name.includes('預り') || name.includes('預かり') || type === 'BROKER';
  };
  const transferSideLooksRakutenBroker = (t, side) => {
    const id = String(t?.[`${side}_account_id`] || '');
    const name = norm(t?.[`${side}_account_name`]);
    const type = String(t?.[`${side}_account_type`] || '').toUpperCase();
    if (id.startsWith('detected:broker:') && (name.includes('楽天証券') || name.includes('RAKUTEN') || !name)) return true;
    return type === 'BROKER' && (name.includes('楽天証券') || name.includes('RAKUTEN'));
  };

  function autoLinkRakutenBrokerCash(cash, snapshotDate) {
    if (cash === null || cash === '' || !Number.isFinite(Number(cash))) return {linked:false, changed:false, rewired:0};
    state.masters = state.masters || {accounts:[],cards:[],liabilities:[],fixedExpenses:[]};
    state.masters.accounts = Array.isArray(state.masters.accounts) ? state.masters.accounts : [];
    const accounts = state.masters.accounts.filter(a => a && a.active !== false);
    const candidates = accounts.filter(isRakutenBrokerAccount);
    const exactNames = new Set(['楽天証券預かり金','楽天証券預り金','楽天証券']);
    const target = candidates.find(a => norm(a.sourceKey).includes('RAKUTENSECURITIES'))
      || candidates.find(a => exactNames.has(String(a.name || '').trim()))
      || candidates.find(a => String(a.type || '').toUpperCase() === 'BROKER')
      || (candidates.length === 1 ? candidates[0] : null);
    if (!target) return {linked:false, changed:false, rewired:0};

    let changed = false;
    const set = (k,v) => { if (target[k] !== v) { target[k] = v; changed = true; } };
    set('type','BROKER');
    set('sourceKey','Rakuten Securities');
    set('balanceSource','import');
    set('autoLinkedRakutenCash',true);
    set('importedCashBalance',Number(cash));
    set('importedCashAsOf',snapshotDate);

    // Once linked, the imported snapshot is authoritative. Remove stale manual balance fields
    // so v83 chooses the imported row instead of an older hand-entered balance.
    if (Object.prototype.hasOwnProperty.call(target,'balance')) {
      if (target.balance !== null && target.balance !== '' && target.manualBalanceBeforeAutoLink === undefined) target.manualBalanceBeforeAutoLink = target.balance;
      delete target.balance; changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(target,'balanceAsOf')) { delete target.balanceAsOf; changed = true; }
    if (Object.prototype.hasOwnProperty.call(target,'balance_as_of')) { delete target.balance_as_of; changed = true; }

    let rewired = 0;
    state.accountTransfersV83 = Array.isArray(state.accountTransfersV83) ? state.accountTransfersV83 : [];
    for (const t of state.accountTransfersV83) {
      for (const side of ['from','to']) {
        const currentId = String(t?.[`${side}_account_id`] || '');
        if (currentId === String(target.id || '')) continue;
        if (!transferSideLooksRakutenBroker(t, side)) continue;
        t[`${side}_account_id`] = target.id;
        t[`${side}_account_name`] = target.name || '楽天証券預かり金';
        t[`${side}_account_type`] = 'BROKER';
        rewired++;
        changed = true;
      }
    }
    if (changed) target.updatedAt = new Date().toISOString();
    return {linked:true, changed, rewired, accountId:target.id, accountName:target.name || '楽天証券預かり金'};
  }

  if (typeof parseAssetSnapshot === 'function') {
    parseAssetSnapshot = function parseAssetSnapshotV85(src, file) {
      const rows = typeof parseCsv === 'function' ? parseCsv(src.text) : [];
      const total = exactValue(rows, '資産合計');
      const holdings = exactValue(rows, '保有商品の評価額合計');
      const cash = exactValue(rows, '預り金合計');
      const yenCash = exactValue(rows, '預り金');
      const fxCash = exactValue(rows, '外貨預り金');
      if (total === null && cash === null) throw new Error('楽天証券の資産合計・預り金合計を読み取れません。');

      const snapshotDate = parseSnapshotDate(file.name);
      const snap = {
        snapshot_date: snapshotDate,
        institution: 'Rakuten Securities',
        asset_type: 'ALL',
        market_value: total,
        invested_market_value: holdings,
        cash_balance: cash,
        cash_yen: yenCash,
        cash_foreign_yen_equivalent: fxCash,
        source_file: file.name,
        parser_version: 85
      };

      state.assetSnapshots = Array.isArray(state.assetSnapshots) ? state.assetSnapshots : [];
      const idx = state.assetSnapshots.findIndex(x => String(x.source_file || '') === String(file.name || ''));
      if (idx >= 0) state.assetSnapshots[idx] = {...state.assetSnapshots[idx], ...snap};
      else state.assetSnapshots.push(snap);

      // Keep legacy net-asset semantics: investment includes the brokerage account total,
      // while v83 separately exposes the cash portion as an account for liquidity planning.
      if (total !== null) state.assets.investment = total;
      const linked = autoLinkRakutenBrokerCash(cash, snapshotDate);

      return {
        added: idx >= 0 ? 0 : 1,
        updated: idx >= 0 ? 1 : 0,
        duplicates: 0,
        review: 0,
        read: 1,
        autoClassified: 1,
        source: '楽天証券 資産残高',
        latest: snapshotDate,
        balance: cash,
        marketValue: total,
        holdingsValue: holdings,
        parserVersion: 85,
        linkedAccountId: linked.accountId || '',
        linkedAccountName: linked.accountName || '',
        rewiredTransfers: linked.rewired || 0
      };
    };
  }

  if (typeof importOne === 'function' && !window.__assetSnapshotImportV85) {
    window.__assetSnapshotImportV85 = true;
    const previousImportOne = importOne;
    importOne = async function importOneAssetSnapshotV85(file) {
      const buf = await file.arrayBuffer();
      const src = typeof detectSource === 'function' ? detectSource(file, buf) : {type:''};
      if (src?.type !== 'broker_asset_snapshot') return previousImportOne(file);

      const sha = typeof fileHash === 'function' ? await fileHash(buf) : '';
      const imports = Array.isArray(state.imports) ? state.imports : (state.imports = []);
      const removed = sha ? imports.filter(x => x.sha256 === sha) : [];
      if (removed.length) state.imports = imports.filter(x => x.sha256 !== sha);

      try {
        const result = await previousImportOne(file);
        return {...result, reprocessed: removed.length > 0, parserVersion: 85};
      } catch (err) {
        if (removed.length) state.imports.unshift(...removed);
        throw err;
      }
    };
  }

  // Repair an already-imported v85 snapshot on startup without asking the user to relink it.
  try {
    const latest = (state.assetSnapshots || [])
      .filter(x => Number(x?.parser_version) >= 85 && norm(x?.institution).includes('RAKUTENSECURITIES') && Number.isFinite(Number(x?.cash_balance)))
      .sort((a,b) => String(b.snapshot_date || '').localeCompare(String(a.snapshot_date || '')))[0];
    if (latest) {
      const linked = autoLinkRakutenBrokerCash(latest.cash_balance, latest.snapshot_date || '');
      if (linked.changed && typeof save === 'function') save();
    }
  } catch {}
})();
