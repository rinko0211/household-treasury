(() => {
  const input = document.getElementById('csvInput');
  const drop = document.getElementById('drop');
  const results = document.getElementById('importResults');
  if (!input || !drop || !results || !window.getTreasuryState || !window.replaceTreasuryState) return;

  const originalChange = input.onchange;
  const yen = n => new Intl.NumberFormat('ja-JP', {
    style: 'currency', currency: 'JPY', maximumFractionDigits: 0
  }).format(Number(n) || 0);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));

  function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(x => x.length);
    return lines.map(line => {
      const out = []; let value = '', quoted = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (quoted && line[i + 1] === '"') { value += '"'; i++; }
          else quoted = !quoted;
        } else if (c === ',' && !quoted) {
          out.push(value); value = '';
        } else value += c;
      }
      out.push(value);
      return out;
    });
  }

  function ymd(s) {
    if (!/^\d{8}$/.test(s)) return null;
    const y = +s.slice(0,4), m = +s.slice(4,6), d = +s.slice(6,8);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  }

  function intStrict(s) {
    const t = String(s ?? '').replace(/,/g, '').trim();
    return /^-?\d+$/.test(t) ? Number(t) : null;
  }

  function decodeRakuten(buffer) {
    const candidates = [];
    try { candidates.push(new TextDecoder('shift-jis').decode(buffer)); } catch {}
    try { candidates.push(new TextDecoder('utf-8').decode(buffer)); } catch {}
    for (const text of candidates) {
      const rows = parseCsv(text);
      const h = rows[0] || [];
      if (h.length === 4 &&
          h[0] === '取引日' &&
          h[1] === '入出金(円)' &&
          h[2] === '取引後残高(円)' &&
          h[3] === '入出金内容') return { text, rows };
    }
    return null;
  }

  async function sha256(buffer) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
    return [...hash].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function validateRakuten(rows) {
    if (rows.length < 2) throw new Error('明細行がありません。');
    const tx = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length !== 4) throw new Error(`${i + 1}行目: 列数が4ではありません。`);
      const date = ymd(r[0]);
      const amount = intStrict(r[1]);
      const balance = intStrict(r[2]);
      if (!date) throw new Error(`${i + 1}行目: 取引日を解釈できません。`);
      if (amount === null) throw new Error(`${i + 1}行目: 入出金額を解釈できません。`);
      if (balance === null) throw new Error(`${i + 1}行目: 取引後残高を解釈できません。`);
      tx.push({ date, amount, balance, description: r[3] });
    }
    for (let i = 1; i < tx.length; i++) {
      if (tx[i].date < tx[i - 1].date) {
        throw new Error(`${i + 2}行目: 日付順が逆転しています。`);
      }
      if (tx[i - 1].balance + tx[i].amount !== tx[i].balance) {
        throw new Error(`${i + 2}行目: 前残高＋入出金額と取引後残高が一致しません。`);
      }
    }
    const first = tx[0], last = tx[tx.length - 1];
    return {
      tx,
      firstDate: first.date,
      lastDate: last.date,
      openingBalance: first.balance - first.amount,
      latestBalance: last.balance,
      inflow: tx.reduce((s, x) => s + Math.max(0, x.amount), 0),
      outflow: tx.reduce((s, x) => s + Math.min(0, x.amount), 0)
    };
  }

  function card(file, parsed, fingerprint) {
    const state = window.getTreasuryState();
    const already = Array.isArray(state.imports) && state.imports.some(x => x.fingerprint === fingerprint);
    const div = document.createElement('div');
    div.className = 'card';
    div.style.marginTop = '10px';
    div.innerHTML = `
      <div class="title">${esc(file.name)} <span class="tag">楽天銀行・専用判定</span></div>
      <div class="row"><span>期間</span><b>${parsed.firstDate} → ${parsed.lastDate}</b></div>
      <div class="row"><span>明細件数</span><b>${parsed.tx.length}件</b></div>
      <div class="row"><span>期間開始前残高</span><b>${yen(parsed.openingBalance)}</b></div>
      <div class="row"><span>最終残高 / source as of</span><b>${yen(parsed.latestBalance)} · ${parsed.lastDate}</b></div>
      <div class="row"><span>入金合計</span><b class="good">+${yen(parsed.inflow)}</b></div>
      <div class="row"><span>出金合計</span><b class="bad">${yen(parsed.outflow)}</b></div>
      <div class="note" style="margin-top:10px">全行について残高連続性を検証してから反映します。未知の列構成や不整合があるCSVは反映しません。</div>
      <div class="controls" style="margin-top:10px">
        <button class="btn" data-apply ${already ? 'disabled' : ''}>${already ? '取込済み' : '楽天銀行残高へ反映'}</button>
      </div>`;
    results.prepend(div);
    const btn = div.querySelector('[data-apply]');
    if (already || !btn) return;
    btn.addEventListener('click', () => {
      const next = window.getTreasuryState();
      next.settings = next.settings || {};
      next.assets = next.assets || {};
      next.settings.cash = parsed.latestBalance;
      next.assets.bank = parsed.latestBalance;
      next.sources = next.sources || {};
      next.sources.rakutenBank = {
        institution: '楽天銀行',
        sourceType: 'transaction_csv',
        sourceAsOf: parsed.lastDate,
        periodStart: parsed.firstDate,
        periodEnd: parsed.lastDate,
        latestBalance: parsed.latestBalance,
        rowCount: parsed.tx.length,
        importedAt: new Date().toISOString(),
        fingerprint
      };
      next.imports = Array.isArray(next.imports) ? next.imports : [];
      next.imports.unshift({
        at: new Date().toISOString(),
        file: file.name,
        kind: '楽天銀行',
        adapter: 'rakuten_bank_v1',
        fingerprint,
        sourceAsOf: parsed.lastDate,
        periodStart: parsed.firstDate,
        periodEnd: parsed.lastDate,
        rows: parsed.tx.length,
        last: parsed.latestBalance
      });
      window.replaceTreasuryState(next);
      window.setTreasurySaveStatus?.('楽天銀行CSV反映済み · 同期待ち');
      window.cloudSyncOnLocalSave?.();
      btn.disabled = true;
      btn.textContent = '反映済み';
    });
  }

  async function handleFiles(files) {
    const unknown = [];
    for (const file of [...files]) {
      try {
        const buffer = await file.arrayBuffer();
        const decoded = decodeRakuten(buffer);
        if (!decoded) { unknown.push(file); continue; }
        const parsed = validateRakuten(decoded.rows);
        const fingerprint = await sha256(buffer);
        card(file, parsed, fingerprint);
      } catch (e) {
        const div = document.createElement('div');
        div.className = 'card';
        div.style.marginTop = '10px';
        div.innerHTML = `<div class="title">${esc(file.name)} <span class="tag bad">楽天銀行CSVエラー</span></div>
          <div class="note">${esc(e.message)} このファイルは反映していません。</div>`;
        results.prepend(div);
      }
    }
    if (unknown.length && typeof originalChange === 'function') {
      originalChange({ target: { files: unknown } });
    }
  }

  input.onchange = e => {
    handleFiles(e.target.files);
    input.value = '';
  };
  drop.ondrop = e => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };
})();