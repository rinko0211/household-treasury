(() => {
  const HISTORY_KEY='householdTreasuryRecoveryHistoryV1';
  const MAX_HISTORY=30;
  let cloudWrapped=false;

  const getState=()=>window.getTreasuryState?.()||null;
  const fp=obj=>{try{return JSON.stringify(obj)}catch{return''}};
  const score=s=>{
    if(!s||typeof s!=='object')return 0;let n=0;
    for(const k of ['cashTransactions','purchaseEvents','cardSettlements','investmentEvents','assetSnapshots','history','imports','rules','events'])n+=Array.isArray(s[k])?s[k].length:0;
    return n;
  };
  function readHistory(){try{const a=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(a)?a:[]}catch{return[]}}
  function writeHistory(a){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(a.slice(0,MAX_HISTORY)))}catch{}}
  function snapshot(reason){
    const state=getState();if(!state)return;
    const history=readHistory(),fingerprint=fp(state);
    if(history[0]?.fingerprint===fingerprint)return;
    history.unshift({id:crypto.randomUUID(),savedAt:new Date().toISOString(),reason,score:score(state),fingerprint,state});
    writeHistory(history);render();
  }
  function restore(id){
    const item=readHistory().find(x=>x.id===id);if(!item?.state){alert('復元データが見つかりません。');return}
    snapshot('復元直前');
    window.__treasuryRecoveryRestoring=true;
    try{window.replaceTreasuryState(item.state);window.repairTreasuryBankBalances?.();window.setTreasurySaveStatus?.('端末履歴から復元済み（クラウド未送信）')}finally{window.__treasuryRecoveryRestoring=false}
    render();
    alert('端末内の過去状態を復元しました。内容を確認するまでクラウド採用は行わないでください。');
  }
  function ensureUi(){
    if(document.getElementById('recoveryHistoryBox'))return;
    const detail=document.getElementById('cloudDetail');if(!detail)return;
    const box=document.createElement('div');box.id='recoveryHistoryBox';box.className='note';box.style.marginTop='12px';detail.parentElement.appendChild(box);
  }
  function render(){
    ensureUi();const box=document.getElementById('recoveryHistoryBox');if(!box)return;
    const history=readHistory();
    let conflict=false,remote=false;try{conflict=!!JSON.parse(localStorage.getItem('householdTreasuryConflictBackup')||'null')?.state}catch{}try{remote=!!JSON.parse(localStorage.getItem('householdTreasuryRemoteConflictBackup')||'null')?.state}catch{}
    const keys=Object.keys(localStorage).filter(k=>k.startsWith('householdTreasury')).sort();
    const rows=history.slice(0,8).map(x=>`<div class="row"><div><b>${new Date(x.savedAt).toLocaleString('ja-JP')}</b><div class="tiny">${x.reason} · records ${x.score}</div></div><button class="btn secondary" data-recovery-id="${x.id}">復元</button></div>`).join('');
    box.innerHTML=`<div class="title">端末復旧履歴 <span class="tag">${history.length}世代</span></div><div class="tiny" style="margin-bottom:8px">競合backup: ${conflict?'あり':'なし'} / remote backup: ${remote?'あり':'なし'} / localStorage keys: ${keys.length}</div>${rows||'<div class="muted">過去世代はまだありません。v11以降、同期置換前に自動保存します。</div>'}`;
    box.querySelectorAll('[data-recovery-id]').forEach(b=>b.addEventListener('click',()=>restore(b.dataset.recoveryId)));
  }

  if(typeof window.replaceTreasuryState==='function'){
    const original=window.replaceTreasuryState;
    window.replaceTreasuryState=function(next){
      if(!window.__treasuryRecoveryRestoring)snapshot('状態置換直前');
      return original(next);
    };
  }
  function wrapCloudSave(){
    const fn=window.cloudSyncOnLocalSave;
    if(cloudWrapped||typeof fn!=='function')return;
    window.cloudSyncOnLocalSave=function(...args){if(!window.__treasuryRecoveryRestoring)snapshot('ローカル変更');return fn.apply(this,args)};
    cloudWrapped=true;
  }
  snapshot('v11起動時');
  render();
  const timer=setInterval(()=>{wrapCloudSave();render();if(cloudWrapped)clearInterval(timer)},300);
  window.addEventListener('storage',render);
  window.treasuryRecoverySnapshot=snapshot;
})();