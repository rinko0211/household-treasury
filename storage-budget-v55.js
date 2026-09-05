(() => {
  const MAIN_KEY='householdTreasuryMVP';
  const HISTORY_KEY='householdTreasuryRecoveryHistoryV1';
  const MAX_RECOVERY=2;
  const nativeSet=Storage.prototype.setItem;

  function compactHistoryRaw(raw,max=MAX_RECOVERY){
    let arr=[];try{arr=JSON.parse(raw||'[]')}catch{return raw}
    if(!Array.isArray(arr))return raw;
    return JSON.stringify(arr.slice(0,max).map(x=>({
      id:x?.id||crypto.randomUUID(),
      savedAt:x?.savedAt||new Date().toISOString(),
      reason:x?.reason||'端末復旧',
      score:Number(x?.score)||0,
      state:x?.state||null
    })));
  }
  function compactExisting(max=MAX_RECOVERY){
    try{
      const raw=localStorage.getItem(HISTORY_KEY);if(!raw)return false;
      const compact=compactHistoryRaw(raw,max);
      if(compact!==raw)nativeSet.call(localStorage,HISTORY_KEY,compact);
      return true;
    }catch{return false}
  }
  function quotaError(e){return e?.name==='QuotaExceededError'||e?.name==='NS_ERROR_DOM_QUOTA_REACHED'||e?.code===22||e?.code===1014}

  Storage.prototype.setItem=function(k,v){
    if(this===localStorage&&k===HISTORY_KEY){
      return nativeSet.call(this,k,compactHistoryRaw(String(v),MAX_RECOVERY));
    }
    try{return nativeSet.call(this,k,v)}catch(e){
      if(this!==localStorage||k!==MAIN_KEY||!quotaError(e))throw e;
      compactExisting(1);
      try{return nativeSet.call(this,k,v)}catch(e2){
        if(quotaError(e2)){
          try{window.setTreasurySaveStatus?.('保存容量不足：端末復旧履歴を圧縮しました。再読込後に再取込してください。')}catch{}
        }
        throw e2;
      }
    }
  };

  compactExisting(MAX_RECOVERY);

  async function estimate(){
    let usage=null,quota=null;
    try{const x=await navigator.storage?.estimate?.();usage=x?.usage??null;quota=x?.quota??null}catch{}
    const main=(localStorage.getItem(MAIN_KEY)||'').length*2;
    const hist=(localStorage.getItem(HISTORY_KEY)||'').length*2;
    window.householdStorageV55={mainBytes:main,recoveryBytes:hist,usageBytes:usage,quotaBytes:quota,recoveryGenerations:(()=>{try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]').length}catch{return 0}})()};
    return window.householdStorageV55;
  }
  estimate();
  window.compactTreasuryRecoveryV55=()=>{const ok=compactExisting(MAX_RECOVERY);estimate();return ok};
})();
