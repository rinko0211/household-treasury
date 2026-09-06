(() => {
  if (window.__semanticMainObserverGuardV71) return;
  window.__semanticMainObserverGuardV71 = true;
  const NativeMutationObserver = window.MutationObserver;
  if (typeof NativeMutationObserver !== 'function') return;

  function GuardedMutationObserver(callback) {
    const stack = String(new Error().stack || '');
    const isSemanticV48 = stack.includes('semantic-ui-v48.js');
    const observer = new NativeMutationObserver(callback);
    if (!isSemanticV48) return observer;

    const nativeObserve = observer.observe.bind(observer);
    observer.observe = (target, options) => {
      if (target?.matches?.('main.app') && options?.childList && options?.subtree) {
        observer.__v71SuppressedMainObserver = true;
        return;
      }
      return nativeObserve(target, options);
    };
    return observer;
  }

  GuardedMutationObserver.prototype = NativeMutationObserver.prototype;
  try { Object.setPrototypeOf(GuardedMutationObserver, NativeMutationObserver); } catch {}
  window.MutationObserver = GuardedMutationObserver;

  // v48 boots immediately after this guard. Restore the native constructor for later modules;
  // the already-created v48 observer keeps its per-instance suppressed observe method.
  setTimeout(() => {
    if (window.MutationObserver === GuardedMutationObserver) window.MutationObserver = NativeMutationObserver;
  }, 5000);
})();
