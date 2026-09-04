(() => {
  const $ = id => document.getElementById(id);
  const esc2 = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen2 = n => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);

  function ensureAdhocCard(){
    if($('adhocEventListCardV15')) return;
    const grid = document.querySelector('#cashflow .grid');
    if(!grid) return;
    const card = document.createElement('div');
    card.id = 'adhocEventListCardV15';
    card.className = 'card full';
    card.innerHTML = `
      <div class="title">臨時イベント一覧</div>
      <div class="tiny" style="margin-bottom:10px">予測期間に関係なく、登録済みの臨時イベントをすべて編集・削除できます。固定費ルールは対象外です。</div>
      <div id="adhocEventListV15"></div>`;
    grid.appendChild(card);
  }

  function ensureAdhocModal(){
    if($('adhocEditModalV15')) return;
    const modal = document.createElement('div');
    modal.id = 'adhocEditModalV15';
    modal.className = 'hidden';
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:#0009;z-index:10020" data-close-adhoc-v15></div>
      <div class="card" style="position:fixed;z-index:10021;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,520px);max-height:88vh;overflow:auto">
        <div class="title">臨時イベントを編集</div>
        <div class="form" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>日付</label><input id="adhocDateV15" type="date"></div>
          <div class="field"><label>金額</label><input id="adhocAmountV15" type="number"></div>
          <div class="field" style="grid-column:1/-1"><label>内容</label><input id="adhocNameV15"></div>
          <div class="field" style="grid-column:1/-1"><label>区分</label><input id="adhocTypeV15"></div>
        </div>
        <div class="tiny" style="margin-top:10px">このイベント自体を変更します。固定費ルールや他月には影響しません。</div>
        <div class="controls" style="margin-top:14px;flex-wrap:wrap">
          <button class="btn" id="adhocSaveV15">保存</button>
          <button class="btn secondary" id="adhocCancelV15">キャンセル</button>
          <button class="btn danger" id="adhocDeleteV15">削除</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close-adhoc-v15]').onclick = closeAdhocEditor;
    $('adhocCancelV15').onclick = closeAdhocEditor;
    $('adhocSaveV15').onclick = saveAdhocEditor;
    $('adhocDeleteV15').onclick = deleteAdhocEditor;
  }

  let editingId = null;
  function findEvent(){ return (state.events || []).find(e => String(e.id) === String(editingId)); }
  function closeAdhocEditor(){ $('adhocEditModalV15')?.classList.add('hidden'); editingId = null; }

  window.openAdhocEditorV15 = id => {
    ensureAdhocModal();
    const e = (state.events || []).find(x => String(x.id) === String(id));
    if(!e) return;
    editingId = e.id;
    $('adhocDateV15').value = e.date || '';
    $('adhocNameV15').value = e.name || '';
    $('adhocAmountV15').value = Number(e.amount) || 0;
    $('adhocTypeV15').value = e.type || '';
    $('adhocEditModalV15').classList.remove('hidden');
  };

  function saveAdhocEditor(){
    const e = findEvent();
    if(!e) return;
    const date = $('adhocDateV15').value;
    const name = $('adhocNameV15').value.trim();
    const amount = Number($('adhocAmountV15').value);
    const type = $('adhocTypeV15').value.trim() || e.type || 'OTHER_SPECIAL';
    if(!date || !name || !Number.isFinite(amount)) { alert('日付・内容・金額を確認してください。'); return; }
    Object.assign(e,{date,name,amount,type,manualEditedAt:new Date().toISOString()});
    save(); render(); closeAdhocEditor();
  }

  function deleteAdhocEditor(){
    const e = findEvent();
    if(!e) return;
    if(!confirm(`「${e.name}」を削除しますか？`)) return;
    state.events = (state.events || []).filter(x => String(x.id) !== String(e.id));
    save(); render(); closeAdhocEditor();
  }

  window.deleteAdhocEventV15 = id => {
    const e = (state.events || []).find(x => String(x.id) === String(id));
    if(!e) return;
    if(!confirm(`「${e.name}」を削除しますか？`)) return;
    state.events = state.events.filter(x => String(x.id) !== String(id));
    save(); render();
  };

  function renderAdhocList(){
    ensureAdhocCard();
    const box = $('adhocEventListV15');
    if(!box) return;
    const rows = [...(state.events || [])].sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')) || String(a.name||'').localeCompare(String(b.name||''),'ja'));
    if(!rows.length){ box.innerHTML = '<div class="muted">臨時イベントはありません。</div>'; return; }
    const now = typeof today === 'function' ? today() : '';
    box.innerHTML = rows.map(e => {
      const past = now && e.date < now;
      const estimate = e.estimated ? ' · 暫定' : '';
      return `<div class="row" style="align-items:flex-start;gap:12px">
        <div style="min-width:0;flex:1"><b>${esc2(e.name)}</b><div class="tiny">${esc2(e.date||'日付未設定')} · ${esc2(e.type||'')}${estimate}${past?' · 過去':''}</div></div>
        <div class="controls" style="flex-wrap:wrap;justify-content:flex-end">
          <span class="amt ${Number(e.amount)<0?'bad':'good'}">${Number(e.amount)>0?'+':''}${yen2(e.amount)}</span>
          <button class="btn secondary" onclick='openAdhocEditorV15(${JSON.stringify(String(e.id))})'>編集</button>
          <button class="btn danger" onclick='deleteAdhocEventV15(${JSON.stringify(String(e.id))})'>削除</button>
        </div>
      </div>`;
    }).join('');
  }

  const prevRender = typeof render === 'function' ? render : null;
  if(prevRender){
    render = function renderV15(){
      prevRender();
      renderAdhocList();
    };
  }

  ensureAdhocCard();
  ensureAdhocModal();
  try { renderAdhocList(); } catch {}
})();