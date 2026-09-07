(() => {
  if (window.__mobileRuntimeGateV72) return;
  if (!window.matchMedia?.('(max-width:820px)').matches) return;
  window.__mobileRuntimeGateV72 = true;

  const source = () => String(new Error().stack || '');
  const has = (stack, names) => names.some(n => stack.includes(n));

  // Legacy UI modules below still provide model/import compatibility, but their
  // global tab/focus refresh handlers duplicate the v70 mobile owner.
  const suppressDocClick = [
    'forecast-v38.js','dashboard-v39.js','cashflow-integration-v41.js',
    'card-autolink-v46.js','semantic-ui-v48.js','rakuten-billing-v56.js',
    'bonus-allocation-v58.js'
  ];
  const suppressFocus = [
    'forecast-v38.js','dashboard-v39.js','cashflow-integration-v41.js',
    'settings-ux-v45.js','card-autolink-v46.js','semantic-ui-v48.js',
    'rakuten-billing-v56.js','integrity-hotfix-v57.js','bonus-allocation-v58.js'
  ];

  const nativeDocAdd = document.addEventListener.bind(document);
  document.addEventListener = function(type, listener, options) {
    const stack = source();
    if (type === 'click' && has(stack, suppressDocClick)) return;
    if (type === 'change' && has(stack, ['forecast-v38.js','semantic-ui-v48.js'])) return;
    return nativeDocAdd(type, listener, options);
  };

  const nativeWinAdd = window.addEventListener.bind(window);
  window.addEventListener = function(type, listener, options) {
    const stack = source();
    if (type === 'focus' && has(stack, suppressFocus)) return;
    return nativeWinAdd(type, listener, options);
  };

  const NativeMutationObserver = window.MutationObserver;
  if (typeof NativeMutationObserver === 'function') {
    function MobileMutationObserverV72(callback) {
      const stack = source();
      const observer = new NativeMutationObserver(callback);
      const nativeObserve = observer.observe.bind(observer);
      observer.observe = (target, options) => {
        const broadMain = target?.matches?.('main.app');
        const oldEvents = target?.id === 'eventsBody';
        const wholeBody = target === document.body;
        if (broadMain && has(stack, ['cashflow-integration-v41.js','settings-ux-v45.js','semantic-ui-v48.js','integrity-hotfix-v57.js'])) return;
        if (oldEvents && has(stack, ['forecast-v38.js','dashboard-v39.js','integrity-hotfix-v57.js'])) return;
        if (wholeBody && has(stack, ['bonus-modal-stability-v67.js'])) return;
        return nativeObserve(target, options);
      };
      return observer;
    }
    MobileMutationObserverV72.prototype = NativeMutationObserver.prototype;
    try { Object.setPrototypeOf(MobileMutationObserverV72, NativeMutationObserver); } catch {}
    window.MutationObserver = MobileMutationObserverV72;
  }

  const style = document.createElement('style');
  style.id = 'mobileRuntimeStyleV72';
  style.textContent = `@media(max-width:820px){
    #desktopCashflowV69,#desktopCardForecastV69,#futureEditorV69,#occurrenceEditorV69{display:none!important}
  }`;
  document.head.appendChild(style);

  // Refresh only the page actually entered. Heavy legacy refreshers are not run
  // on Cash Flow because v70 is the canonical mobile owner there.
  window.addEventListener('treasury:pagechange', e => {
    const page = e?.detail?.page || '';
    if (page === 'dashboard') {
      setTimeout(() => { try { window.renderDashboardV39?.(); } catch {} }, 0);
    } else if (page === 'settings') {
      setTimeout(() => {
        try { window.renderSemanticUiV48?.(); } catch {}
        try { window.renderCashflowIntegrationV41?.(); } catch {}
      }, 0);
    } else if (page === 'imports') {
      setTimeout(() => {
        try { window.renderSemanticUiV48?.(); } catch {}
        try { window.renderCardClaimsV56?.(); } catch {}
      }, 0);
    }
  });
})();
