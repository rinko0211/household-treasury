(() => {
  const Native=window.MutationObserver;
  if(typeof Native!=='function'||window.__householdObserverGuardV50)return;
  window.__householdObserverGuardV50=true;
  window.MutationObserver=function HouseholdMutationObserverV50(callback){
    const risky=/renderAll|renderSemanticUiV48|renderCardForecastV49|cardForecastRowsV49/.test(String(callback));
    const native=new Native(callback);
    if(!risky)return native;
    return new Proxy(native,{get(target,prop){
      if(prop==='observe')return (node,options)=>{
        if(node?.matches?.('main.app')){
          const importHost=document.getElementById('importResults');
          if(importHost)return target.observe(importHost,{childList:true,subtree:true,characterData:true});
        }
        return target.observe(node,options);
      };
      const value=target[prop];return typeof value==='function'?value.bind(target):value;
    }});
  };
  window.MutationObserver.prototype=Native.prototype;
})();
