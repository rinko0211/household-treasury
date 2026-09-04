(() => {
  const $ = id => document.getElementById(id);
  const finite = v => v !== null && v !== '' && Number.isFinite(Number(v));
  const ntext = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・]/g, '').toUpperCase();

  function pickHeader(headers, candidates) {
    const normalized = headers.map(ntext);
    for (const c of candidates.map(ntext)) {
      const i = normalized.findIndex(h => h === c || h.includes(c) || c.includes(h));
      if (i >= 0) return headers[i];
    }
    return null;
  }

  if (typeof parseYucho === 'function') {
    parseYucho = function parseYuchoV13(src, file) {
      const rows = parseCsv(src.text);
      const hi = findHeader(rows, ['取引日', '入出金明細ＩＤ']);
      if (hi < 0) throw new Error('ゆうちょ明細ヘッダーを認識できません。');
      const h = rows[hi];
      const dateH = pickHeader(h, ['取引日']);
      const idH = pickHeader(h, ['入出金明細ＩＤ', '入出金明細ID']);
      const inH = pickHeader(h, ['受入金額（円）', '受入金額(円)', '受入金額']);
      const outH = pickHeader(h, ['払出金額（円）', '払出金額(円)', '払出金額']);
      const d1H = pickHeader(h, ['詳細１', '詳細1']);
      const d2H = pickHeader(h, ['詳細２', '詳細2']);
      const balH = pickHeader(h, ['現在（貸付）高', '現在(貸付)高', '現在貸付高', '現在高', '残高']);
      if (!dateH || !idH || !inH || !outH) throw new Error('ゆうちょCSVの主要列を認識できません。');
      if (!balH) throw new Error('ゆうちょCSVの残高列を認識できません。列名を確認してください。');

      const items = [];
      for (const r of rows.slice(hi + 1)) {
        const o = rowObj(h, r);
        if (!o[dateH]) continue;
        const inAmt = number(o[inH]) || 0;
        const outAmt = number(o[outH]) || 0;
        const amount = inAmt - outAmt;
        const bal = number(o[balH]);
        const desc = [d1H ? o[d1H] : '', d2H ? o[d2H] : ''].filter(Boolean).join(' ');
        const c = classifyBank(desc, amount);
        items.push({
          id: crypto.randomUUID(), source: 'Yucho', source_file: file.name, account: 'yucho',
          date: parseDate(o[dateH]), amount, balance_after: bal, description_raw: desc,
          cashflow_type: c.category, category: c.category, subcategory: c.subcategory || '',
          is_transfer: c.is_transfer, confidence: c.confidence, ordinary_or_special: c.ordinary_or_special
        });
      }
      if (!items.length) throw new Error('ゆうちょ明細行が見つかりません。');
      const balanceItems = items.filter(x => finite(x.balance_after));
      if (!balanceItems.length) throw new Error('ゆうちょCSVから残高を取得できませんでした。');

      // Remove incomplete legacy copies of the same Yucho transactions before adding balance-aware rows.
      const incoming = new Set(items.map(x => [x.date, x.amount, ntext(x.description_raw)].join('|')));
      state.cashTransactions = (state.cashTransactions || []).filter(t => {
        if (t.source !== 'Yucho' || finite(t.balance_after)) return true;
        return !incoming.has([t.date, t.amount, ntext(t.description_raw)].join('|'));
      });

      const res = upsertCash(items);
      const latestDate = balanceItems.map(x => x.date).sort().at(-1);
      const latestCandidates = balanceItems.filter(x => x.date === latestDate);
      const latest = latestCandidates.at(-1);
      state.sources = state.sources || {};
      state.sources.yucho = {
        institution: 'ゆうちょ', sourceType: 'transaction_csv', sourceAsOf: latest.date,
        latestBalance: Number(latest.balance_after), importedAt: new Date().toISOString(), sourceFile: file.name
      };
      return {
        ...res,
        review: items.filter(x => x.confidence < .7).length,
        source: 'ゆうちょ', latest: latest.date, balance: Number(latest.balance_after)
      };
    };
  }

  if (typeof importOne === 'function') {
    const originalImportOne = importOne;
    importOne = async function importOneV13(file) {
      const buf = await file.arrayBuffer();
      const src = detectSource(file, buf);
      if (src.type === 'bank_yucho') {
        const hasUsableYucho = Array.isArray(state.cashTransactions) && state.cashTransactions.some(t => t.source === 'Yucho' && finite(t.balance_after));
        if (!hasUsableYucho) {
          const sha = await fileHash(buf);
          state.imports = (state.imports || []).filter(x => x.sha256 !== sha);
        }
      }
      return originalImportOne(file);
    };
  }

  if (typeof generated === 'function') {
    generated = function generatedV13(days = 90) {
      const from = new Date(); from.setHours(0, 0, 0, 0);
      const to = new Date(from); to.setDate(to.getDate() + days);
      const out = [...state.events];
      for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d.setMonth(d.getMonth() + 1)) {
        const y = d.getFullYear(), m = d.getMonth() + 1, month = `${y}-${String(m).padStart(2, '0')}`;
        for (const r of state.rules.filter(x => x.enabled !== false)) {
          const o = state.overrides.find(x => (x.ruleId === r.id || (!x.ruleId && x.name === r.name)) && x.month === month);
          if (o?.deleted) continue;
          const amount = o && finite(o.amount) ? Number(o.amount) : Number(r.amount) || 0;
          const date = o?.date || ruleDate(y, m, r.day || 1);
          const name = o?.displayName || r.name;
          out.push({
            id: `rule:${r.id}:${month}`, date, name, amount,
            type: r.type || 'fixed', ordinary_or_special: r.ordinary_or_special || 'ORDINARY',
            generated: true, source: 'rule', ruleId: r.id, month, overridden: !!o
          });
        }
      }
      for (const s of state.cardSettlements) {
        if (!s.due_date) continue;
        const amount = -Math.abs(Number(s.amount) || 0);
        if (!amount) continue;
        const duplicate = out.some(e => e.date === s.due_date && Number(e.amount) === amount);
        if (!duplicate) out.push({
          id: `settlement:${s.settlement_id}`, date: s.due_date,
          name: s.manual_name || `${s.card}カード支払`, amount,
          type: 'CARD_SETTLEMENT', ordinary_or_special: 'DEBT',
          generated: true, source: 'card_settlement', settlementId: s.settlement_id
        });
      }
      return out.filter(e => e.date >= iso(from) && e.date <= iso(to))
        .sort((a, b) => a.date.localeCompare(b.date) || String(a.name).localeCompare(String(b.name)));
    };
  }

  function ensureModal() {
    if ($('eventEditModalV13')) return;
    const modal = document.createElement('div');
    modal.id = 'eventEditModalV13';
    modal.className = 'hidden';
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:#0009;z-index:9998" data-close-event-modal></div>
      <div class="card" style="position:fixed;z-index:9999;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,520px);max-height:88vh;overflow:auto">
        <div class="title">予定イベントを編集</div>
        <div class="form" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>日付</label><input id="eventEditDateV13" type="date"></div>
          <div class="field"><label>金額</label><input id="eventEditAmountV13" type="number"></div>
          <div class="field" style="grid-column:1/-1"><label>内容</label><input id="eventEditNameV13"></div>
          <div class="field" style="grid-column:1/-1"><label>区分</label><input id="eventEditTypeV13"></div>
        </div>
        <div class="tiny" id="eventEditHintV13" style="margin-top:10px"></div>
        <div class="controls" style="margin-top:14px;flex-wrap:wrap">
          <button class="btn" id="eventEditSaveV13">保存</button>
          <button class="btn secondary" id="eventEditCancelV13">キャンセル</button>
          <button class="btn danger" id="eventEditDeleteV13">この予定を削除</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close-event-modal]').onclick = closeEditor;
    $('eventEditCancelV13').onclick = closeEditor;
    $('eventEditSaveV13').onclick = saveEditor;
    $('eventEditDeleteV13').onclick = deleteEditor;
  }

  let editing = null;
  function closeEditor() { $('eventEditModalV13')?.classList.add('hidden'); editing = null; }
  function upsertRuleOverride(e, patch) {
    let o = state.overrides.find(x => (x.ruleId === e.ruleId || (!x.ruleId && x.name === e.name)) && x.month === e.month);
    if (!o) {
      o = { id: `override:${e.ruleId}:${e.month}`, ruleId: e.ruleId, name: e.name, month: e.month };
      state.overrides.push(o);
    }
    Object.assign(o, patch);
    return o;
  }

  window.openEventEditorV13 = i => {
    ensureModal();
    const e = window.__forecastRowsV13?.[i];
    if (!e) return;
    editing = e;
    $('eventEditDateV13').value = e.date || '';
    $('eventEditNameV13').value = e.name || '';
    $('eventEditAmountV13').value = Number(e.amount) || 0;
    $('eventEditTypeV13').value = e.type || '';
    $('eventEditTypeV13').disabled = e.source === 'rule' || e.source === 'card_settlement';
    $('eventEditHintV13').textContent = e.source === 'rule'
      ? 'この月だけ変更します。毎月の基準ルール自体は変更しません。'
      : e.source === 'card_settlement'
        ? 'カード支払予定を手動補正します。後日のCSV再取込で最新確定額が優先される場合があります。'
        : 'この予定イベント自体を変更します。';
    $('eventEditModalV13').classList.remove('hidden');
  };

  function saveEditor() {
    if (!editing) return;
    const date = $('eventEditDateV13').value;
    const name = $('eventEditNameV13').value.trim();
    const amount = Number($('eventEditAmountV13').value);
    const type = $('eventEditTypeV13').value.trim() || editing.type;
    if (!date || !name || !Number.isFinite(amount)) { alert('日付・内容・金額を確認してください。'); return; }
    if (editing.source === 'rule') {
      upsertRuleOverride(editing, { date, displayName: name, amount, deleted: false });
    } else if (editing.source === 'card_settlement') {
      const s = state.cardSettlements.find(x => x.settlement_id === editing.settlementId || `settlement:${x.settlement_id}` === editing.id);
      if (s) { s.due_date = date; s.amount = Math.abs(amount); s.manual_name = name; s.manual_override = true; }
    } else {
      const e = state.events.find(x => String(x.id) === String(editing.id));
      if (e) Object.assign(e, { date, name, amount, type });
    }
    save(); render(); closeEditor();
  }

  function deleteEditor() {
    if (!editing) return;
    if (!confirm(`「${editing.name}」をこの予定から削除しますか？`)) return;
    if (editing.source === 'rule') {
      upsertRuleOverride(editing, { deleted: true });
    } else if (editing.source === 'card_settlement') {
      state.cardSettlements = state.cardSettlements.filter(x => x.settlement_id !== editing.settlementId && `settlement:${x.settlement_id}` !== editing.id);
    } else {
      state.events = state.events.filter(x => String(x.id) !== String(editing.id));
    }
    save(); render(); closeEditor();
  }

  const previousRender = typeof render === 'function' ? render : null;
  if (previousRender) {
    render = function renderV13() {
      previousRender();
      const horizon = Number($('forecastHorizon')?.value) || 90;
      const rows = forecast(horizon).rows;
      window.__forecastRowsV13 = rows;
      const trs = [...document.querySelectorAll('#eventsBody tr')];
      trs.forEach((tr, i) => {
        const e = rows[i]; if (!e) return;
        const td = tr.lastElementChild; if (!td) return;
        td.innerHTML = `<button class="btn secondary" onclick="openEventEditorV13(${i})">編集 / 削除</button>`;
      });

      const yuchoRows = (state.cashTransactions || []).filter(t => t.source === 'Yucho');
      const usable = yuchoRows.some(t => finite(t.balance_after));
      const box = $('bankBalanceBreakdown');
      if (box && yuchoRows.length && !usable && !document.getElementById('yuchoBalanceWarningV13')) {
        const note = document.createElement('div');
        note.id = 'yuchoBalanceWarningV13'; note.className = 'note'; note.style.marginTop = '10px';
        note.innerHTML = '<b>ゆうちょ残高が未取得です。</b><br>旧版で明細だけ保存され、残高列が欠けています。同じゆうちょCSVをもう一度Importしてください。今回は同一ファイルでも残高修復のため再取込できます。';
        box.appendChild(note);
      }
    };
  }

  ensureModal();
  try { render(); } catch {}
})();