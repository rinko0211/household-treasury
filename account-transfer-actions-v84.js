(() => {
  if (window.__accountTransferActionsV84) return;
  window.__accountTransferActionsV84 = true;

  const $ = id => document.getElementById(id);
  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  let decorateTimer = null;

  function transferIdFromRow(row) {
    const raw = String(row?.dataset?.v70Row || '');
    if (!raw.startsWith('acct-transfer:')) return '';
    const rest = raw.slice('acct-transfer:'.length);
    const cut = rest.lastIndexOf(':');
    return cut > 0 ? rest.slice(0, cut) : '';
  }

  function persist(st, msg) {
    window.treasuryRecoverySnapshot?.(`${msg}直前`);
    window.replaceTreasuryState?.(st);
    window.repairTreasuryBankBalances?.();
    window.setTreasurySaveStatus?.(`${msg}・同期中`);
    window.cloudSyncOnLocalSave?.();
    try { window.renderMobileInteractionV70?.(); } catch {}
    try { window.householdAccountTransferV83?.render?.(); } catch {}
    scheduleDecorate(80);
  }

  function editTransfer(id) {
    if (!id) return;
    const st = stateNow();
    const t = (st.accountTransfersV83 || []).find(x => String(x.id) === String(id));
    if (!t) return alert('編集対象の資金移動が見つかりません。');
    if (t.active === false) return alert('この資金移動はキャンセル済みです。');
    window.householdAccountTransferV83?.openTransfer?.(id);
  }

  function cancelTransfer(id) {
    if (!id) return;
    const st = stateNow();
    st.accountTransfersV83 = Array.isArray(st.accountTransfersV83) ? st.accountTransfersV83 : [];
    const t = st.accountTransfersV83.find(x => String(x.id) === String(id));
    if (!t) return alert('キャンセル対象の資金移動が見つかりません。');
    if (t.active === false) return;
    const recurring = String(t.recurring || 'NONE').toUpperCase();
    const extra = recurring === 'NONE' ? '' : '\n繰り返し予定の場合、今後の予定をすべて停止します。';
    if (!confirm(`「${t.name || 'この資金移動'}」をキャンセルしますか？${extra}`)) return;
    t.active = false;
    t.cancelledAt = new Date().toISOString();
    t.updatedAt = t.cancelledAt;
    t.cancelledBy = 'user-v84';
    persist(st, '資金移動キャンセル');
  }

  function decorateCashflow() {
    const host = $('mobileCashflowRowsV60');
    if (!host) return;
    host.querySelectorAll('[data-v70-row^="acct-transfer:"]').forEach(row => {
      const id = transferIdFromRow(row);
      if (!id) return;
      let actions = row.querySelector('.v70-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'v70-actions';
        row.appendChild(actions);
      }
      if (actions.querySelector('[data-v84-transfer-edit]')) return;
      [...actions.querySelectorAll('.tiny')].forEach(x => {
        if (String(x.textContent || '').trim() === '自動生成') x.remove();
      });
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn secondary';
      edit.dataset.v84TransferEdit = id;
      edit.textContent = '編集';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn danger';
      cancel.dataset.v84TransferCancel = id;
      cancel.textContent = 'キャンセル';
      actions.append(edit, cancel);
    });
  }

  function decorateDashboard() {
    const st = stateNow();
    const cancelled = new Set((st.accountTransfersV83 || []).filter(x => x.active === false).map(x => String(x.id)));
    document.querySelectorAll('#accountTransfersRowsV83 [data-v83-transfer-del]').forEach(btn => {
      const id = String(btn.dataset.v83TransferDel || '');
      const row = btn.closest('.v83-transfer-row');
      const edit = row?.querySelector('[data-v83-transfer-edit]');
      if (cancelled.has(id)) {
        btn.textContent = 'キャンセル済み';
        btn.disabled = true;
        if (edit) edit.disabled = true;
        if (row && !row.querySelector('[data-v84-cancelled-label]')) {
          const label = document.createElement('div');
          label.className = 'tiny';
          label.dataset.v84CancelledLabel = '1';
          label.textContent = 'キャンセル済み・将来残高には反映しません';
          row.firstElementChild?.appendChild(label);
        }
      } else {
        btn.textContent = 'キャンセル';
        btn.dataset.v84DashboardCancel = id;
      }
    });
  }

  function decorate() {
    decorateCashflow();
    decorateDashboard();
  }

  function scheduleDecorate(ms = 80) {
    clearTimeout(decorateTimer);
    decorateTimer = setTimeout(decorate, ms);
  }

  document.addEventListener('click', e => {
    const edit = e.target.closest?.('[data-v84-transfer-edit]');
    const cancel = e.target.closest?.('[data-v84-transfer-cancel]');
    const dashboardCancel = e.target.closest?.('[data-v84-dashboard-cancel]');
    if (edit) {
      e.preventDefault();
      e.stopImmediatePropagation();
      editTransfer(edit.dataset.v84TransferEdit);
      return;
    }
    if (cancel) {
      e.preventDefault();
      e.stopImmediatePropagation();
      cancelTransfer(cancel.dataset.v84TransferCancel);
      return;
    }
    if (dashboardCancel) {
      e.preventDefault();
      e.stopImmediatePropagation();
      cancelTransfer(dashboardCancel.dataset.v84DashboardCancel);
      return;
    }
    if (e.target.closest?.('[data-page="cashflow"],[data-page="dashboard"],#mobileAddTransferV83,#addTransferV83')) scheduleDecorate(120);
  }, true);

  window.addEventListener('treasury:pagechange', () => scheduleDecorate(120));
  window.addEventListener('pageshow', () => scheduleDecorate(180));

  function wait(n = 0) {
    if (window.householdAccountTransferV83) {
      decorate();
      return;
    }
    if (n < 80) setTimeout(() => wait(n + 1), 75);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => wait(), {once:true}); else wait();

  window.householdAccountTransferActionsV84 = {decorate, editTransfer, cancelTransfer};
})();
