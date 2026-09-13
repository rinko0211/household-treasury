(() => {
  if (window.__cardMasterBaselineV95) return;
  window.__cardMasterBaselineV95 = true;

  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const yen = n => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const paymentMode = c => String(c?.paymentMode || c?.payment_mode || 'FULL').toUpperCase() === 'REVOLVING' ? 'REVOLVING' : 'FULL';
  const baselineOf = c => {
    for (const v of [c?.monthlyBaselineAmount,c?.cardBaselineAmount,c?.forecastBaseline]) {
      if (v !== null && v !== '' && Number.isFinite(Number(v))) return Math.max(0,Number(v));
    }
    return 0;
  };

  function cardById(st,id){
    return (st.masters?.cards || []).find(c => String(c.id) === String(id)) || null;
  }

  function refreshForecastUi(){
    try { window.renderMobileInteractionV70?.(); } catch {}
    try { window.renderForecastV38?.(); } catch {}
    try { window.renderPlanningUiV79?.(); } catch {}
  }

  function persist(st,message){
    st.masters = st.masters || {};
    st.masters.updatedAt = new Date().toISOString();
    window.treasuryRecoverySnapshot?.(`${message}直前`);
    window.replaceTreasuryState?.(st);
    window.setTreasurySaveStatus?.(`${message}・同期中`);
    window.cloudSyncOnLocalSave?.();
    setTimeout(() => {
      try { window.householdCardSettingsV77?.render?.(); } catch {}
      augment();
      refreshForecastUi();
    },0);
  }

  function readAmount(input){
    const raw = String(input?.value ?? '').trim();
    if (raw === '') return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function applyAmount(id,input,{persistNow=false}={}){
    const amount = readAmount(input);
    if (amount === null) {
      alert('標準額を0以上の数字で入力してください。');
      return false;
    }
    const st = stateNow(), c = cardById(st,id);
    if (!c || paymentMode(c) !== 'FULL') return true;
    const before = baselineOf(c);
    const beforeMode = String(c.forecastMode || c.forecast_mode || '').toUpperCase();
    const nextMode = amount > 0 ? 'BASELINE' : 'COMPONENTS';
    c.monthlyBaselineAmount = amount;
    c.forecastMode = nextMode;
    c.forecast_mode = nextMode;
    c.baselineModeExplicitV88 = nextMode;
    c.baselineSource = 'CARD_MASTER_V95';
    c.updatedAt = new Date().toISOString();
    const changed = before !== amount || beforeMode !== nextMode;
    if (persistNow && changed) persist(st,'カードマスタ標準額保存');
    return true;
  }

  function titleV95(root){
    const summary = root?.querySelector(':scope > summary');
    const title = summary?.querySelector('b');
    if (title) title.textContent = 'カードマスタ';
    const titleHost = title?.parentElement;
    if (titleHost && !titleHost.querySelector('[data-v95-title-tag]')) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.dataset.v95TitleTag = '1';
      tag.style.marginLeft = '6px';
      tag.textContent = 'v95';
      title.after(tag);
    }
    const tiny = titleHost?.querySelector('.tiny');
    if (tiny) tiny.textContent = '標準額・引落日・支払方式をカードごとに一元管理';
  }

  function retireSeparateBaselineUi(){
    const old = document.getElementById('cardBaselineV79');
    if (!old) return;
    old.hidden = true;
    old.style.display = 'none';
    old.dataset.retiredBy = 'v95';
  }

  function addBaselineField(box,c){
    if (paymentMode(c) !== 'FULL') {
      box.querySelector('[data-v95-baseline-field]')?.remove();
      return;
    }
    const form = box.querySelector('.form');
    if (!form) return;
    let field = box.querySelector('[data-v95-baseline-field]');
    if (!field) {
      field = document.createElement('div');
      field.className = 'field';
      field.dataset.v95BaselineField = '1';
      field.innerHTML = `<label>標準額（月）</label><input type="number" min="0" inputmode="numeric" data-v95-card-base-amount><div class="tiny">この額未満の月は標準額を使用。判明済み予定が上回れば高い方を使用。</div>`;
      const modeField = box.querySelector('[data-v77-mode]')?.closest('.field');
      if (modeField?.nextSibling) form.insertBefore(field,modeField.nextSibling);
      else form.appendChild(field);
    }
    const input = field.querySelector('[data-v95-card-base-amount]');
    input.dataset.v95CardBaseAmount = String(c.id);
    if (document.activeElement !== input) input.value = baselineOf(c) || '';

    let meta = box.querySelector('[data-v95-baseline-summary]');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'tiny';
      meta.dataset.v95BaselineSummary = '1';
      const summaryLeft = box.querySelector(':scope > summary > div');
      summaryLeft?.appendChild(meta);
    }
    meta.textContent = baselineOf(c) > 0 ? `標準額 ${yen(baselineOf(c))}` : '標準額 未設定';
  }

  function augment(){
    const root = document.getElementById('unifiedCardsV77');
    if (!root) return false;
    titleV95(root);
    retireSeparateBaselineUi();
    const st = stateNow();
    for (const box of root.querySelectorAll('[data-v77-card]')) {
      const c = cardById(st,box.dataset.v77Card);
      if (c) addBaselineField(box,c);
    }
    return true;
  }

  document.addEventListener('change',e => {
    const input = e.target.closest?.('[data-v95-card-base-amount]');
    if (!input) return;
    applyAmount(input.dataset.v95CardBaseAmount,input,{persistNow:true});
  },true);

  document.addEventListener('click',e => {
    const save = e.target.closest?.('[data-v77-save]');
    if (save) {
      const box = save.closest('[data-v77-card]');
      const input = box?.querySelector('[data-v95-card-base-amount]');
      if (input && !applyAmount(box.dataset.v77Card,input,{persistNow:false})) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      setTimeout(() => { augment(); refreshForecastUi(); },0);
      return;
    }
    if (e.target.closest?.('[data-page="settings"],[data-v77-card],#unifiedCardsV77')) setTimeout(augment,0);
  },true);

  window.addEventListener('treasury:pagechange',e => {
    if (e?.detail?.page === 'settings') setTimeout(augment,0);
  });
  window.addEventListener('pageshow',() => setTimeout(augment,0));

  const install = () => {
    try { window.householdCardSettingsV77?.render?.(); } catch {}
    if (augment()) return;
    setTimeout(install,75);
  };
  install();

  window.householdCardMasterBaselineV95 = {augment,applyAmount,baselineOf,paymentMode};
})();
