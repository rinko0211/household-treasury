(() => {
  const PLAN='bonusPlanModalV58';
  const ALLOC='bonusAllocModalV58';
  const $=id=>document.getElementById(id);

  function forceClose(id){
    const m=$(id);if(!m)return;
    m.classList.add('hidden');
    m.style.setProperty('display','none','important');
    m.setAttribute('aria-hidden','true');
  }
  function prepareOpen(id){
    const m=$(id);if(!m)return;
    m.style.removeProperty('display');
    m.removeAttribute('aria-hidden');
  }
  function clearPlanDraft(){
    const name=$('b58PlanName'),amount=$('b58PlanAmount');
    if(name)name.value='';if(amount)amount.value='';
  }
  function clearAllocDraft(){
    const label=$('b58AllocLabel'),amount=$('b58AllocAmount'),note=$('b58AllocNote');
    if(label)label.value='';if(amount)amount.value='';if(note)note.value='';
  }
  function closePlan(){forceClose(PLAN);clearPlanDraft()}
  function closeAlloc(){forceClose(ALLOC);clearAllocDraft()}

  document.addEventListener('click',e=>{
    const t=e.target;
    if(t.closest?.('#b58AddPlan,[data-b58-edit-plan]')){
      setTimeout(()=>prepareOpen(PLAN),0);
      return;
    }
    if(t.closest?.('[data-b58-add-alloc],[data-b58-edit-alloc]')){
      setTimeout(()=>prepareOpen(ALLOC),0);
      return;
    }
    if(t.closest?.('#b58PlanCancel,[data-b58-close-plan]')){
      e.preventDefault();e.stopPropagation();closePlan();return;
    }
    if(t.closest?.('#b58AllocCancel,[data-b58-close-alloc]')){
      e.preventDefault();e.stopPropagation();closeAlloc();return;
    }
  },true);

  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    const plan=$(PLAN),alloc=$(ALLOC);
    if(plan&&!plan.classList.contains('hidden')){e.preventDefault();closePlan();return}
    if(alloc&&!alloc.classList.contains('hidden')){e.preventDefault();closeAlloc()}
  },true);

  // Rebind after v58 creates the modal. This also fixes stale DOM where the original onclick was lost.
  function bind(){
    const pc=$('b58PlanCancel');if(pc&&!pc.dataset.v67Bound){pc.dataset.v67Bound='1';pc.type='button'}
    const ac=$('b58AllocCancel');if(ac&&!ac.dataset.v67Bound){ac.dataset.v67Bound='1';ac.type='button'}
  }
  const observer=new MutationObserver(bind);observer.observe(document.body,{childList:true,subtree:true});bind();
  window.householdBonusModalV67={closePlan,closeAlloc,prepareOpen};
})();
