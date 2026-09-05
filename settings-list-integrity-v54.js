(() => {
  const $=id=>document.getElementById(id);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  let addSnapshot=null, checking=false, timer=null;

  function activeFixed(st=stateNow()){
    return (st.masters?.fixedExpenses||[]).filter(x=>x.active!==false);
  }
  function renderedFixedIds(){
    return [...document.querySelectorAll('#semanticFixedRowsV48 [data-v48-fixed]')].map(x=>String(x.dataset.v48Fixed||''));
  }
  function updateCount(){
    const card=$('semanticFixedMasterV48'); if(!card)return;
    const actual=activeFixed().length, shown=renderedFixedIds().length;
    let el=$('fixedMasterCountV54');
    if(!el){
      el=document.createElement('span'); el.id='fixedMasterCountV54'; el.className='tag';
      const title=card.querySelector('.title'); title?.append(' ',el);
    }
    el.textContent=`${shown}/${actual}件`;
    el.title='表示件数 / マスタ件数';
  }
  function highlightNew(id){
    if(!id)return;
    const host=$('semanticFixedRowsV48');
    const row=host?.querySelector(`[data-v48-fixed="${CSS.escape(String(id))}"]`);
    if(!row)return;
    host.prepend(row);
    row.open=true;
    row.style.outline='2px solid currentColor';
    row.style.outlineOffset='2px';
    row.dataset.v54New='1';
    setTimeout(()=>{row.style.outline='';row.style.outlineOffset='';delete row.dataset.v54New},2200);
    row.scrollIntoView?.({block:'nearest',behavior:'smooth'});
  }
  function reconcileFixedList(newId=null){
    clearTimeout(timer);
    timer=setTimeout(()=>{
      if(checking)return; checking=true;
      try{
        const actual=activeFixed(), ids=renderedFixedIds(), set=new Set(ids);
        const missing=actual.some(x=>!set.has(String(x.id)));
        if(ids.length!==actual.length||missing){
          window.renderSemanticUiV48?.();
        }
        setTimeout(()=>{updateCount();highlightNew(newId)},0);
      }finally{checking=false}
    },0);
  }

  function dedupeCardAddButtons(){
    const settings=$('settings'); if(!settings)return;
    const preferred=$('addCardV52');
    const buttons=[...settings.querySelectorAll('button')].filter(b=>b.textContent.trim()==='＋カード');
    if(preferred){
      preferred.style.display='';
      buttons.forEach(b=>{if(b!==preferred)b.style.display='none'});
    }else if(buttons.length>1){
      buttons.slice(0,-1).forEach(b=>b.style.display='none');
    }
    const legacy=$('masterAddCardV1'); if(legacy&&legacy!==preferred)legacy.style.display='none';
  }

  document.addEventListener('pointerdown',e=>{
    if(!e.target.closest?.('[data-v48-add]'))return;
    addSnapshot=new Set(activeFixed().map(x=>String(x.id)));
  },true);
  document.addEventListener('click',e=>{
    if(e.target.closest?.('[data-v48-add]')){
      setTimeout(()=>{
        const now=activeFixed();
        const added=addSnapshot?now.find(x=>!addSnapshot.has(String(x.id))):null;
        reconcileFixedList(added?.id||null); addSnapshot=null;
      },0);
    }
    if(e.target.closest?.('[data-v48-fixed-save],[data-v48-fixed-del],[data-page="settings"],#addCardV52,#masterAddCardV1')){
      setTimeout(()=>{reconcileFixedList();dedupeCardAddButtons()},0);
    }
  });

  const previousReplace=window.replaceTreasuryState;
  if(typeof previousReplace==='function'&&!window.__settingsListIntegrityV54Wrapped){
    window.__settingsListIntegrityV54Wrapped=true;
    window.replaceTreasuryState=function replaceTreasuryStateV54(next){
      const result=previousReplace(next);
      setTimeout(()=>{reconcileFixedList();dedupeCardAddButtons()},0);
      return result;
    };
  }

  function boot(){
    reconcileFixedList(); dedupeCardAddButtons();
    setTimeout(()=>{reconcileFixedList();dedupeCardAddButtons()},120);
    window.refreshSettingsListsV54=()=>{reconcileFixedList();dedupeCardAddButtons()};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
