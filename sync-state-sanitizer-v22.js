(() => {
  const originalGet = window.getTreasuryState;
  if (typeof originalGet !== 'function') return;

  const DERIVED_KEYS = new Set([
    'updatedAt',
    'bankBalanceAsOf',
    'bankInstitutionBalances',
    'bankAccountBalances'
  ]);

  function sanitize(obj) {
    const out = structuredClone(obj || {});
    for (const k of DERIVED_KEYS) delete out[k];
    return out;
  }

  function fingerprint(obj) {
    const s = JSON.stringify(obj);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  const raw = originalGet();
  const comparable = sanitize(raw);
  const rawUpdatedAt = Date.parse(raw?.updatedAt || '');

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('householdTreasurySyncMeta:')) continue;
      let meta;
      try { meta = JSON.parse(localStorage.getItem(key) || 'null'); } catch { continue; }
      if (!meta || meta.fingerprintVersion === 2) continue;

      const syncedAt = Date.parse(meta.syncedAt || '');
      const noUserSaveAfterLastSync = Number.isFinite(syncedAt) && (!Number.isFinite(rawUpdatedAt) || rawUpdatedAt <= syncedAt + 2000);
      if (!noUserSaveAfterLastSync) continue;

      meta.syncedFingerprint = fingerprint(comparable);
      meta.fingerprintVersion = 2;
      meta.migratedAt = new Date().toISOString();
      localStorage.setItem(key, JSON.stringify(meta));
    }
  } catch {}

  window.getTreasuryState = () => sanitize(originalGet());
  window.getTreasuryStateRaw = () => originalGet();

  function injectClassic(src, marker){
    if (document.querySelector(`script[${marker}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.setAttribute(marker, '1');
    document.head.appendChild(script);
  }

  injectClassic('./storage-budget-v55.js?v=55', 'data-household-storage-budget-v55');
  injectClassic('./master-manager-v27.js?v=27', 'data-household-master-v27');
  injectClassic('./import-engine-v28.js?v=28', 'data-household-import-v28');
  injectClassic('./phase2-reconcile-ui-v29.js?v=29', 'data-household-reconcile-v29');
  injectClassic('./link-audit-v33.js?v=33', 'data-household-link-audit-v33');
  injectClassic('./expense-scope-v34.js?v=34', 'data-household-expense-scope-v34');
  injectClassic('./reimbursement-v35.js?v=35', 'data-household-reimbursement-v35');
  injectClassic('./annual-reserve-v36.js?v=36', 'data-household-annual-reserve-v36');
  injectClassic('./future-planner-v37.js?v=37', 'data-household-future-planner-v37');
  injectClassic('./forecast-v38.js?v=38', 'data-household-forecast-v38');
  injectClassic('./dashboard-v39.js?v=39', 'data-household-dashboard-v39');
  injectClassic('./review-center-v40.js?v=40', 'data-household-review-center-v40');
  injectClassic('./cashflow-integration-v41.js?v=41', 'data-household-cashflow-integration-v41');
  injectClassic('./payment-routing-v42.js?v=42', 'data-household-payment-routing-v42');
  injectClassic('./fixed-master-unified-v43.js?v=43', 'data-household-fixed-master-unified-v43');
  injectClassic('./kabu-card-v44.js?v=44', 'data-household-kabu-card-v44');
  injectClassic('./settings-ux-v45.js?v=45', 'data-household-settings-ux-v45');
  injectClassic('./card-autolink-v46.js?v=46', 'data-household-card-autolink-v46');
  injectClassic('./observer-guard-v50.js?v=50', 'data-household-observer-guard-v50');
  injectClassic('./semantic-model-v47.js?v=47', 'data-household-semantic-model-v47');
  injectClassic('./semantic-ui-v48.js?v=48', 'data-household-semantic-ui-v48');
  injectClassic('./card-identity-v51.js?v=51', 'data-household-card-identity-v51');
  injectClassic('./card-forecast-v49.js?v=49', 'data-household-card-forecast-v49');
  injectClassic('./card-master-refresh-v52.js?v=52', 'data-household-card-master-refresh-v52');
  injectClassic('./settings-reactive-v53.js?v=53', 'data-household-settings-reactive-v53');
  injectClassic('./settings-list-integrity-v54.js?v=54', 'data-household-settings-list-integrity-v54');
  injectClassic('./rakuten-billing-v56.js?v=56', 'data-household-rakuten-billing-v56');
  injectClassic('./integrity-hotfix-v57.js?v=57', 'data-household-integrity-hotfix-v57');
  injectClassic('./bonus-allocation-v58.js?v=58', 'data-household-bonus-allocation-v58');
  injectClassic('./bonus-allocation-target-fix-v58.js?v=58', 'data-household-bonus-allocation-target-fix-v58');
})();