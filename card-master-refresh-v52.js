(() => {
  const $=id=>document.getElementById(id);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  let refreshing=false, timer=null;

  function refreshSemantic(){
    clearTimeout(timer);
    timer=setTimeout(()=>{
      if(refreshing)return;
      refreshing=true;
      try{window.renderSemanticUiV48?.();enhanceCardSettings()}finally{refreshing=false}
    },0);
  }

  const previousReplace=window.replaceTreasuryState;
  if(typeof previousReplace==='function'&&!window.__cardMasterRefreshV52Wrapped){
    window.__cardMasterRefreshV52Wrapped=true;
    window.replaceTreasuryState=function replaceTreasuryStateV52(next){
      const result=previousReplace(next);
      refreshSemantic();
      return result;
    };
  }

  function persist(st,msg){
    window.treasuryRecoverySnapshot?.(`${msg}直前`);
    st.masters=st.masters||{};
    st.masters.cards=Array.isArray(st.masters.cards)?st.masters.cards:[];
    st.masters.updatedAt=new Date().toISOString();
    window.replaceTreasuryState?.(st);
    window.setTreasurySaveStatus?.(`${msg}・同期中`);
    window.cloudSyncOnLocalSave?.();
    refreshSemantic();
  }

  function addCard(){
    const name=prompt('カード名','');
    if(!name?.trim())return;
    const st=stateNow();st.masters=st.masters||{};st.masters.cards=Array.isArray(st.masters.cards)?st.masters.cards:[];
    const key=norm(name);
    if(st.masters.cards.some(c=>c.active!==false&&norm(c.name)===key))return alert('同じ名前のカードがすでに登録されています。');
    st.masters.cards.push({id:`card:${crypto.randomUUID()}`,name:name.trim(),active:true,source:'card-settings-v52',createdAt:new Date().toISOString()});
    persist(st,'カード追加済み');
  }

  function enhanceCardSettings(){
    const card=$('semanticCardSettingsV48');if(!card)return;
    let header=card.firstElementChild;
    if(header&&!header.dataset.v52CardHeader){
      header.dataset.v52CardHeader='1';
      const wrap=document.createElement('div');wrap.style.display='flex';wrap.style.justifyContent='space-between';wrap.style.gap='8px';wrap.style.alignItems='flex-start';wrap.style.flexWrap='wrap';
      const left=document.createElement('div');
      while(card.firstChild&&card.firstChild!==$('semanticCardRowsV48'))left.appendChild(card.firstChild);
      const controls=document.createElement('div');controls.className='controls';
      const add=document.createElement('button');add.type='button';add.className='btn secondary';add.id='addCardV52';add.textContent='＋カード';add.onclick=addCard;controls.appendChild(add);
      wrap.appendChild(left);wrap.appendChild(controls);card.insertBefore(wrap,$('semanticCardRowsV48'));
    }
    if(!$('addCardV52')){
      const add=document.createElement('button');add.type='button';add.className='btn secondary';add.id='addCardV52';add.textContent='＋カード';add.onclick=addCard;card.insertBefore(add,$('semanticCardRowsV48'));
    }
  }

  function boot(){
    refreshSemantic();
    setTimeout(enhanceCardSettings,50);
    document.addEventListener('click',e=>{
      if(e.target.closest?.('#masterAddCardV1,[data-page="settings"],[data-master-edit^="cards:"],[data-master-del^="cards:"]'))refreshSemantic();
    });
    window.addEventListener('focus',refreshSemantic);
    window.renderCardMasterV52=()=>{refreshSemantic();enhanceCardSettings()};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
