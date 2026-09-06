(() => {
  const OCC_GUARD_KEY='householdTreasuryOccurrenceGuardV65';
  const $=id=>document.getElementById(id);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const clone=o=>structuredClone(o||{});
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  let applying=false,timer=null;

  function time(v){const n=Date.parse(v||'');return Number.isFinite(n)?n:0}
  function occurrenceTs(st){
    let t=time(st?.masterOccurrenceOverridesUpdatedAt);
    for(const o of st?.masterOccurrenceOverrides||[])t=Math.max(t,time(o?.updatedAt),time(o?.createdAt));
    return t;
  }
  function occComparable(st){return JSON.stringify(st?.masterOccurrenceOverrides||[])}
  function readGuard(){try{return JSON.parse(localStorage.getItem(OCC_GUARD_KEY)||'null')}catch{return null}}
  function writeGuard(st,reason='local'){
    const rows=Array.isArray(st?.masterOccurrenceOverrides)?st.masterOccurrenceOverrides:[];
    if(!rows.length)return;
    const savedAt=st.masterOccurrenceOverridesUpdatedAt||new Date(Math.max(occurrenceTs(st),Date.now())).toISOString();
    try{localStorage.setItem(OCC_GUARD_KEY,JSON.stringify({version:1,savedAt,reason,rows:clone(rows)}))}catch{}
  }
  function isBonusEvent(e){
    if(Number(e?.amount)<=0)return false;
    const s=norm(`${e?.name||''} ${e?.type||''} ${e?.future_kind||''} ${e?.note||''}`);
    return /BONUS|ボーナス|賞与|期末勤勉|勤勉手当/.test(s);
  }
  function cleanupStaleBonusPlans(st){
    if(!Array.isArray(st?.bonusPlans))return false;
    const valid=new Set((st.events||[]).filter(isBonusEvent).map(e=>String(e.id)));
    const before=st.bonusPlans.length;
    st.bonusPlans=st.bonusPlans.filter(p=>!p?.autoCreated||!p?.source_event_id||valid.has(String(p.source_event_id)));
    if(st.bonusPlans.length!==before){st.bonusPlansUpdatedAt=new Date().toISOString();return true}
    return false;
  }

  const previousReplace=window.replaceTreasuryState;
  if(typeof previousReplace==='function'&&!window.__auditHardeningReplaceV65){
    window.__auditHardeningReplaceV65=true;
    window.replaceTreasuryState=function replaceTreasuryStateAuditV65(next){
      if(applying)return previousReplace(next);
      applying=true;
      try{
        next=clone(next||{});next.masterOccurrenceOverrides=Array.isArray(next.masterOccurrenceOverrides)?next.masterOccurrenceOverrides:[];
        const cur=stateNow(),different=occComparable(cur)!==occComparable(next),remote=!!window.__treasuryApplyingRemote,restoring=!!window.__treasuryRecoveryRestoring;
        if(remote&&!restoring&&different&&(cur.masterOccurrenceOverrides||[]).length){
          const guard=readGuard(),curTs=Math.max(occurrenceTs(cur),time(guard?.savedAt)),nextTs=occurrenceTs(next);
          if(curTs>nextTs){
            next.masterOccurrenceOverrides=clone(cur.masterOccurrenceOverrides||guard?.rows||[]);
            next.masterOccurrenceOverridesUpdatedAt=cur.masterOccurrenceOverridesUpdatedAt||guard?.savedAt||new Date().toISOString();
          }
        }else if(!remote&&!restoring&&different){
          next.masterOccurrenceOverridesUpdatedAt=new Date().toISOString();
        }
        cleanupStaleBonusPlans(next);
        const out=previousReplace(next),after=stateNow();writeGuard(after,'after-replace');queue();return out;
      }finally{applying=false}
    };
  }

  function persist(st,msg){
    window.treasuryRecoverySnapshot?.(`${msg}直前`);
    window.replaceTreasuryState?.(st);
    window.setTreasurySaveStatus?.(`${msg}・同期中`);
    window.cloudSyncOnLocalSave?.();
  }
  function hideLegacyAnnual(){const old=$('annualReserveCardV36');if(old)old.style.display='none'}
  function addAnnualPaidButtons(){
    hideLegacyAnnual();const st=stateNow();
    document.querySelectorAll('[data-v48-fixed]').forEach(box=>{
      const id=box.dataset.v48Fixed,item=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(id));
      if(!item||String(item.cadence||'').toUpperCase()!=='ANNUAL')return;
      let b=box.querySelector('[data-v65-annual-paid]');if(b)return;
      const controls=[...box.querySelectorAll('.controls')].at(-1);if(!controls)return;
      b=document.createElement('button');b.type='button';b.className='btn secondary';b.dataset.v65AnnualPaid=id;b.textContent='今年分支払済み';controls.appendChild(b);
    });
  }
  function markAnnualPaid(id){
    const st=stateNow(),item=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(id));if(!item)return;
    const year=new Date().getFullYear();if(!confirm(`「${item.name||'この年払い'}」を${year}年分支払済みにしますか？\n積立済額は0円に戻します。`))return;
    item.lastPaidYear=year;item.reservedAmount=0;item.lastPaidAt=new Date().toISOString();st.masters.updatedAt=new Date().toISOString();persist(st,'年払い支払済み');
  }

  function canonicalCard(name){try{return window.householdCardIdentityV51?.canonicalCard?.(name)||String(name||'')}catch{return String(name||'')}}
  function renderCardCollisionWarning(){
    const card=$('semanticCardSettingsV48');if(!card)return;let note=$('cardIdentityWarningV65');if(!note){note=document.createElement('div');note.id='cardIdentityWarningV65';note.className='note warn';note.style.marginTop='10px';card.appendChild(note)}
    const st=stateNow(),groups=new Map();for(const c of st.masters?.cards||[]){if(c.active===false)continue;const k=norm(canonicalCard(c.name));if(!k)continue;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(c.name)}
    const collisions=[...groups.entries()].filter(([,names])=>new Set(names.map(norm)).size>1);
    const mufgRows=(st.purchaseEvents||[]).some(p=>norm(p.card)==='MUFGDCJAL'||norm(p.card)==='MUFG/DC/JAL');
    if(!collisions.length&&!mufgRows){note.style.display='none';return}
    note.style.display='';
    const parts=[];
    if(collisions.length)parts.push(`カード識別が同じ扱いになる候補: ${collisions.map(([,n])=>n.join(' / ')).join('、')}`);
    if(mufgRows)parts.push('MUFG/DC/JAL CSVは現状1つの取込ソース名で保存されるため、複数の実カードを自動で完全分離できません。');
    note.textContent=parts.join(' ');
  }
  function renderStorageRisk(){
    const box=$('syncSafetyBox');if(!box)return;let n=$('storageRiskV65');if(!n){n=document.createElement('div');n.id='storageRiskV65';n.className='tiny';n.style.marginTop='8px';box.appendChild(n)}
    const keys=['householdTreasuryConflictBackup','householdTreasuryRemoteConflictBackup'];let bytes=0;for(const k of keys)bytes+=(localStorage.getItem(k)||'').length*2;
    n.textContent=bytes>500000?`競合バックアップ推定 ${(bytes/1024/1024).toFixed(1)} MB。容量逼迫時はIndexedDB移行対象です。`:`競合バックアップ推定 ${(bytes/1024).toFixed(0)} KB`;
  }
  function renderAll(){hideLegacyAnnual();addAnnualPaidButtons();renderCardCollisionWarning();renderStorageRisk()}
  function queue(delay=80){clearTimeout(timer);timer=setTimeout(renderAll,delay)}

  document.addEventListener('click',e=>{
    const paid=e.target.closest?.('[data-v65-annual-paid]');if(paid){e.preventDefault();e.stopPropagation();return markAnnualPaid(paid.dataset.v65AnnualPaid)}
    if(e.target.closest?.('[data-page="settings"],[data-page="sync"]'))queue(120);
  },true);
  window.addEventListener('focus',()=>queue(100));

  function boot(){
    const st=stateNow();let changed=cleanupStaleBonusPlans(st);if((st.masterOccurrenceOverrides||[]).length)writeGuard(st,'boot');
    if(changed){window.replaceTreasuryState?.(st);window.cloudSyncOnLocalSave?.()}
    queue(120);window.renderAuditHardeningV65=renderAll;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();