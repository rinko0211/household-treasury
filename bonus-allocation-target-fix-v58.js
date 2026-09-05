(() => {
  const $=id=>document.getElementById(id);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const splitTarget=v=>{const s=String(v||'CUSTOM:');const i=s.indexOf(':');return i<0?[s,'']:[s.slice(0,i),s.slice(i+1)]};
  const parseEditToken=v=>{const s=String(v||'');const marker=':alloc:';const i=s.lastIndexOf(marker);return i<0?[s,'']:[s.slice(0,i),`alloc:${s.slice(i+marker.length)}`]};
  const targetRecord=(st,v)=>{const[type,id]=splitTarget(v);if(type==='FIXED_MASTER')return(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===id);if(type==='LIABILITY')return(st.masters?.liabilities||[]).find(x=>String(x.id)===id);if(type==='EVENT')return(st.events||[]).find(x=>String(x.id)===id);return null};

  document.addEventListener('click',e=>{
    const add=e.target.closest?.('[data-b58-add-alloc]'),edit=e.target.closest?.('[data-b58-edit-alloc]');
    if(add)setTimeout(()=>{const m=$('bonusAllocModalV58');if(m){m.dataset.planId=add.dataset.b58AddAlloc||'';m.dataset.allocId=''}},0);
    if(edit){const[p,a]=parseEditToken(edit.dataset.b58EditAlloc);setTimeout(()=>{const m=$('bonusAllocModalV58');if(m){m.dataset.planId=p;m.dataset.allocId=a}},0)}
  },true);

  document.addEventListener('change',e=>{
    if(e.target.id!=='b58AllocTarget')return;
    setTimeout(()=>{const st=stateNow(),r=targetRecord(st,e.target.value);if(!r)return;const label=$('b58AllocLabel'),amount=$('b58AllocAmount');if(label)label.value=r.name||label.value;const a=Math.abs(Number(r.amount??r.balance??r.referenceBalance)||0);if(a&&amount)amount.value=a},0);
  },true);

  document.addEventListener('click',e=>{
    const save=e.target.closest?.('#b58AllocSave');if(!save)return;
    e.preventDefault();e.stopImmediatePropagation();
    const modal=$('bonusAllocModalV58'),planId=modal?.dataset.planId||'',allocId=modal?.dataset.allocId||'',target=$('b58AllocTarget')?.value||'CUSTOM:',[type,targetId]=splitTarget(target),label=$('b58AllocLabel')?.value.trim()||'',amount=Number($('b58AllocAmount')?.value),note=$('b58AllocNote')?.value.trim()||'';
    if(!planId||!label||!Number.isFinite(amount)||amount<0){alert('使途名・予約額を確認してください。');return}
    const st=stateNow(),p=(st.bonusPlans||[]).find(x=>String(x.id)===String(planId));if(!p)return;
    p.allocations=Array.isArray(p.allocations)?p.allocations:[];let a=allocId?p.allocations.find(x=>String(x.id)===String(allocId)):null;if(!a){a={id:`alloc:${crypto.randomUUID()}`,createdAt:new Date().toISOString()};p.allocations.push(a)}
    Object.assign(a,{label,amount,target_type:type||'CUSTOM',target_id:targetId||null,note,updatedAt:new Date().toISOString()});p.updatedAt=new Date().toISOString();st.bonusPlansUpdatedAt=new Date().toISOString();
    window.treasuryRecoverySnapshot?.('ボーナス使途予約保存直前');window.replaceTreasuryState?.(st);window.setTreasurySaveStatus?.('ボーナス使途予約保存・同期中');window.cloudSyncOnLocalSave?.();modal?.classList.add('hidden');setTimeout(()=>window.renderBonusAllocationV58?.(),0);
  },true);
})();