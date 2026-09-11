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
        parserVersion: 85
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
})();
