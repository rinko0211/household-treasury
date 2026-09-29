(() => {
  const HISTORY_KEY='householdTreasuryRecoveryHistoryV1';
  const MAX_HISTORY=30;
  let cloudWrapped=false;

  const getState=()=>window.getTreasuryState?.()||null;
  const semantic=obj=>{
    const VOLATILE_TOP=new Set([
      'updatedAt','bankBalanceAsOf','bankInstitutionBalances','bankAccountBalances',
      'cashflowReconciliationV102','cashflowRolloverV101','recoveredCanonicalEvidenceV104'
    ]);
    const walk=v=>{
      if(Array.isArray(v))return v.map(walk);
      if(!v||typeof v!=='object')return v;
      const out={};
      for(const k of Object.keys(v).sort()){
        if(VOLATILE_TOP.has(k))continue;
        if(/(?:UpdatedAt|updatedAt|updated_at|savedAt|reconciledAt|archivedAt|lastLoadRebuildAt)$/.test(k))continue;
        out[k]=walk(v[k]);
      }
      return out;
    };
    return walk(obj||{});
  };
  const fp=obj=>{try{return JSON.stringify(semantic(obj))}catch{return''}};
  function caller(){
    try{
      const lines=String(new Error().stack||'').split('\n').map(x=>x.trim()).filter(Boolean);
      const hit=lines.find(x=>!/recovery-safety\.js|snapshot\s*\(|caller\s*\(/.test(x));
      return (hit||lines[1]||'unknown').replace(/^at\s+/,'').slice(0,220);
    }catch{return'unknown'}
  }
  function diffPaths(a,b,max=8){
    a=semantic(a);b=semantic(b);const out=[];
    const walk=(x,y,path)=>{
      if(out.length>=max)return;
      if(Object.is(x,y))return;
      const xa=Array.isArray(x),ya=Array.isArray(y);
      if(xa||ya){
        if(!(xa&&ya)){out.push(path||'(root)');return}
        if(x.length!==y.length)out.push(`${path||'(root)'}.length:${x.length}->${y.length}`);
        const n=Math.min(Math.max(x.length,y.length),20);
        for(let i=0;i<n&&out.length<max;i++)walk(x[i],y[i],`${path}[${i}]`);
        return;
      }
      if(!x||!y||typeof x!=='object'||typeof y!=='object'){out.push(`${path||'(root)'}:${String(x).slice(0,40)}->${String(y).slice(0,40)}`);return}
      const keys=[...new Set([...Object.keys(x),...Object.keys(y)])].sort();
      for(const k of keys){if(out.length>=max)break;walk(x[k],y[k],path?path+'.'+k:k)}
    };
    walk(a,b,'');return out;
  }
  const score=s=>{
    if(!s||typeof s!=='object')return 0;let n=0;
    for(const k of ['cashTransactions','purchaseEvents','cardSettlements','investmentEvents','assetSnapshots','history','imports','rules','events'])n+=Array.isArray(s[k])?s[k].length:0;
    return n;
  };
  function readHistory(){try{const a=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(a)?a:[]}catch{return[]}}
  function writeHistory(a){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(a.slice(0,MAX_HISTORY)))}catch{}}
  function snapshot(reason,diagnostic={}){
    const state=getState();if(!state)return false;
    const history=readHistory(),fingerprint=fp(state);
    if(history[0]?.fingerprint===fingerprint)return false;
    history.unshift({
      id:crypto.randomUUID(),savedAt:new Date().toISOString(),reason,score:score(state),fingerprint,state,
      caller:String(diagnostic.caller||caller()).slice(0,220),
      diff:Array.isArray(diagnostic.diff)?diagnostic.diff.slice(0,8):[]
    });
    writeHistory(history);render();
    return true;
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
    const rows=history.slice(0,8).map(x=>{
      const callerText=x.caller?`<div class="tiny" style="word-break:break-all">caller: ${String(x.caller).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}</div>`:'';
      const diffText=Array.isArray(x.diff)&&x.diff.length?`<div class="tiny" style="word-break:break-all">diff: ${x.diff.map(v=>String(v).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))).join(' / ')}</div>`:'';
      return `<div class="row" style="align-items:flex-start"><div style="min-width:0"><b>${new Date(x.savedAt).toLocaleString('ja-JP')}</b><div class="tiny">${x.reason} · records ${x.score}</div>${callerText}${diffText}</div><button class="btn secondary" data-recovery-id="${x.id}">復元</button></div>`;
    }).join('');
    box.innerHTML=`<div class="title">端末復旧履歴 <span class="tag">${history.length}世代</span></div><div class="tiny" style="margin-bottom:8px">過去の競合backup: ${conflict?'あり':'なし'} / 過去のremote backup: ${remote?'あり':'なし'} / localStorage keys: ${keys.length}</div>${rows||'<div class="muted">過去世代はまだありません。v11以降、同期置換前に自動保存します。</div>'}`;
    box.querySelectorAll('[data-recovery-id]').forEach(b=>b.addEventListener('click',()=>restore(b.dataset.recoveryId)));
  }

  if(typeof window.replaceTreasuryState==='function'){
    const original=window.replaceTreasuryState;
    window.replaceTreasuryState=function(next){
      const current=getState();
      const meaningfulChange=fp(current)!==fp(next);
      if(!window.__treasuryRecoveryRestoring&&meaningfulChange){
        snapshot('状態置換直前',{caller:caller(),diff:diffPaths(current,next)});
      }
      const out=original(next);
      return out;
    };
  }
  function wrapCloudSave(){
    const fn=window.cloudSyncOnLocalSave;
    if(cloudWrapped||typeof fn!=='function')return;
    window.cloudSyncOnLocalSave=function(...args){
      if(!window.__treasuryRecoveryRestoring){
        const state=getState(),history=readHistory(),fingerprint=fp(state);
        if(history[0]?.fingerprint!==fingerprint){
          snapshot('ローカル変更',{caller:caller(),diff:diffPaths(history[0]?.state||{},state)});
        }
      }
      return fn.apply(this,args);
    };
    cloudWrapped=true;
  }
  snapshot('v122起動時',{caller:'startup',diff:[]});
  render();
  const timer=setInterval(()=>{wrapCloudSave();render();if(cloudWrapped)clearInterval(timer)},300);
  window.addEventListener('storage',render);
  window.treasuryRecoverySnapshot=snapshot;
  window.renderTreasuryRecoverySafety=render;
})();