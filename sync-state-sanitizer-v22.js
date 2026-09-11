(() => {
  const originalGet = window.getTreasuryState;
  if (typeof originalGet !== 'function') return;

  // v70 phase 2: data/model compatibility remains, but legacy hidden UI boots are disabled.
  window.__householdConsolidatedUiV70 = true;

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
  injectClassic('./card-settings-unified-v77.js?v=77', 'data-household-card-settings-unified-v77');
  injectClassic('./import-engine-v28.js?v=28', 'data-household-import-v28');
  injectClassic('./csv-parser-v73.js?v=73', 'data-household-csv-parser-v73');
  injectClassic('./date-normalizer-v75.js?v=75', 'data-household-date-normalizer-v75');
  injectClassic('./mobile-import-v73.js?v=73', 'data-household-mobile-import-v73');
  injectClassic('./mufg-import-integrity-v65.js?v=65', 'data-household-mufg-import-v65');
  injectClassic('./phase2-reconcile-ui-v29.js?v=29', 'data-household-reconcile-v29');
  injectClassic('./link-audit-v33.js?v=33', 'data-household-link-audit-v33');
  // v34 expense-scope UI/normalizer retired in v65. Semantic v47 is the canonical migration/classification layer.
  injectClassic('./reimbursement-v35.js?v=35', 'data-household-reimbursement-v35');
  injectClassic('./mobile-runtime-gate-v72.js?v=72', 'data-household-mobile-runtime-gate-v72');
  // v36 annual-reserve UI retired in v65. v48/v59 are canonical; v65 preserves the paid action there.
  injectClassic('./future-planner-v37.js?v=37', 'data-household-future-planner-v37');
  injectClassic('./forecast-v38.js?v=38', 'data-household-forecast-v38');
  injectClassic('./dashboard-v39.js?v=39', 'data-household-dashboard-v39');
  // v40 review center retired in v65. Semantic v47/v48 own review rules and review UI.
  injectClassic('./cashflow-integration-v41.js?v=41', 'data-household-cashflow-integration-v41');
  injectClassic('./payment-routing-v42.js?v=42', 'data-household-payment-routing-v42');
  injectClassic('./fixed-master-unified-v43.js?v=43', 'data-household-fixed-master-unified-v43');
  injectClassic('./kabu-card-v44.js?v=44', 'data-household-kabu-card-v44');
  injectClassic('./settings-ux-v45.js?v=45', 'data-household-settings-ux-v45');
  injectClassic('./card-autolink-v46.js?v=46', 'data-household-card-autolink-v46');
  injectClassic('./observer-guard-v50.js?v=50', 'data-household-observer-guard-v50');
  injectClassic('./semantic-model-v47.js?v=47', 'data-household-semantic-model-v47');
  injectClassic('./mufg-card-semantics-v75.js?v=75', 'data-household-mufg-card-semantics-v75');
  injectClassic('./semantic-observer-guard-v71.js?v=71', 'data-household-semantic-observer-guard-v71');
  injectClassic('./semantic-ui-v48.js?v=48', 'data-household-semantic-ui-v48');
  injectClassic('./semantic-review-stability-v76.js?v=76', 'data-household-semantic-review-stability-v76');
  injectClassic('./card-identity-v51.js?v=51', 'data-household-card-identity-v51');
  injectClassic('./card-forecast-v49.js?v=49', 'data-household-card-forecast-v49');
  // v52 card settings UI retired in v77. Phase 1 household master is the sole card settings owner.
  injectClassic('./settings-reactive-v53.js?v=53', 'data-household-settings-reactive-v53');
  injectClassic('./settings-list-integrity-v54.js?v=54', 'data-household-settings-list-integrity-v54');
  injectClassic('./rakuten-billing-v56.js?v=56', 'data-household-rakuten-billing-v56');
  injectClassic('./card-import-corrections-v73.js?v=73', 'data-household-card-import-corrections-v73');
  injectClassic('./rakuten-enavi-v74.js?v=74', 'data-household-rakuten-enavi-v74');
  injectClassic('./integrity-hotfix-v57.js?v=57', 'data-household-integrity-hotfix-v57');
  injectClassic('./bonus-allocation-v58.js?v=58', 'data-household-bonus-allocation-v58');
  injectClassic('./bonus-allocation-target-fix-v58.js?v=58', 'data-household-bonus-allocation-target-fix-v58');
  injectClassic('./mobile-cashflow-v59.js?v=59', 'data-household-mobile-cashflow-v59');
  // v60 row renderer retired in v70 phase 1. It competed for the mobile rows host.
  injectClassic('./mobile-host-v70.js?v=70', 'data-household-mobile-host-v70');
  // v62/v63/v64 UI layers are retired. Data compatibility is owned by v65+ model layers.
  injectClassic('./occurrence-card-bridge-v65.js?v=65', 'data-household-occurrence-card-v65');
  injectClassic('./audit-hardening-v65.js?v=65', 'data-household-audit-hardening-v65');
  injectClassic('./revolving-card-v66.js?v=66', 'data-household-revolving-card-v66');
  injectClassic('./bonus-modal-stability-v67.js?v=67', 'data-household-bonus-modal-v67');
  // v68 mobile owner retired in v70 phase 2. v70 remains the single mobile interaction owner; v78 only changes its row presentation.
  injectClassic('./mobile-interaction-v70.js?v=78', 'data-household-mobile-interaction-v70');
  injectClassic('./card-cashflow-edit-v75.js?v=75', 'data-household-card-cashflow-edit-v75');
  if (window.matchMedia?.('(min-width:821px)').matches) injectClassic('./desktop-interaction-v69.js?v=69', 'data-household-desktop-interaction-v69');
  injectClassic('./tab-router-v71.js?v=71', 'data-household-tab-router-v71');
  // v79 is the base planning layer; v80 separates annual UI and hardens recurring card baselines.
  injectClassic('./planning-model-v79.js?v=79', 'data-household-planning-model-v79');
  injectClassic('./planning-ui-v79.js?v=79', 'data-household-planning-ui-v79');
  injectClassic('./planning-model-v80.js?v=80', 'data-household-planning-model-v80');
  injectClassic('./planning-ui-v80.js?v=80', 'data-household-planning-ui-v80');
  // v81 is the final card-cycle authority and restores bank balances to the planning dashboard.
  injectClassic('./card-cycle-v81.js?v=81', 'data-household-card-cycle-v81');
  injectClassic('./card-cycle-ui-v81.js?v=81', 'data-household-card-cycle-ui-v81');
  injectClassic('./dashboard-bank-v81.js?v=81', 'data-household-dashboard-bank-v81');
  // v82 removes the legacy confirmation-only import rows and visualizes securities cash -> bank -> revolving repayment.
  injectClassic('./import-review-cleanup-v82.js?v=82', 'data-household-import-review-cleanup-v82');
  injectClassic('./liquidity-flow-v82.js?v=82', 'data-household-liquidity-flow-v82');
})();
