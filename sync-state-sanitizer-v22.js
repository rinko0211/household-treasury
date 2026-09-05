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

  injectClassic('./master-manager-v27.js?v=27', 'data-household-master-v27');
  injectClassic('./import-engine-v28.js?v=28', 'data-household-import-v28');
  injectClassic('./phase2-reconcile-ui-v29.js?v=29', 'data-household-reconcile-v29');
  injectClassic('./link-audit-v30.js?v=30', 'data-household-link-audit-v30');
})();