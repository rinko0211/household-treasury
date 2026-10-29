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

    // v185: v50 may return a Proxy whose "observe" getter invokes the native
    // instance. Mutating observer.observe then makes v50 call our override,
    // which re-enters v50 forever (RangeError: Maximum call stack size exceeded).
    // Intercept reads on an OUTER proxy instead. Never replace the native method.
    const nativeObserve = observer.observe.bind(observer);
    return new Proxy(observer, {
      get(target, prop) {
        if (prop === 'observe') return (node, options) => {
          if (node?.matches?.('main.app') && options?.childList && options?.subtree) {
            target.__v71SuppressedMainObserver = true;
            return;
          }
          return nativeObserve(node, options);
        };
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
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
