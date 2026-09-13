(function(root){
  'use strict';

  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const canonicalCard=s=>{
    const raw=norm(s),n=raw.replace(/カード|CARD/g,'');
    if(!n)return'';
    if(/RAKUTEN|楽天/.test(raw))return'RAKUTEN';
    if(/JAL/.test(raw))return'JAL';
    if(n==='D'||/DOCOMO|DCMX/.test(raw))return'D_CARD';
    if(/MUFG|三菱UFJ|ミツビシUFJ/.test(raw))return'MUFG';
    if(n==='DC'||/^DC/.test(n))return'DC';
    return n;
  };
  const validDay=v=>{
    const n=Number(v);
    return Number.isInteger(n)&&n>=1&&n<=31?n:null;
  };
  const defaultCycleForName=name=>canonicalCard(name)==='RAKUTEN'?{closingDay:31,settlementDay:27}:null;

  const pure={canonicalCard,validDay,defaultCycleForName};
  if(typeof module!=='undefined'&&module.exports)module.exports=pure;
  if(!root)return;
  if(root.__cardCycleDefaultsV96)return;
  root.__cardCycleDefaultsV96=true;

  const stateNow=()=> (root.getTreasuryStateRaw||root.getTreasuryState)?.()||{};

  function refreshForecast(){
    try{root.householdCardCycleUiV81?.render?.()}catch{}
    try{root.renderMobileInteractionV70?.()}catch{}
    try{root.renderForecastV38?.()}catch{}
    try{root.renderPlanningUiV79?.()}catch{}
  }

  function applyDefaults({persist=true,refresh=true}={}){
    const st=stateNow();
    const cards=st.masters?.cards;
    if(!Array.isArray(cards))return false;
    let changed=false;
    for(const c of cards){
      if(!c||c.active===false)continue;
      const defaults=defaultCycleForName(c.name);
      if(!defaults)continue;
      let cardChanged=false;
      if(validDay(c.closingDay??c.statementClosingDay??c.cutoffDay)===null){
        c.closingDay=defaults.closingDay;
        c.statementClosingDay=defaults.closingDay;
        cardChanged=true;
      }
      if(validDay(c.settlementDay??c.paymentDay??c.dueDay)===null){
        c.settlementDay=defaults.settlementDay;
        cardChanged=true;
      }
      if(cardChanged){
        c.cardCycleDefaultsSource='RAKUTEN_V96';
        c.updatedAt=new Date().toISOString();
        changed=true;
      }
    }
    if(changed&&persist){
      st.masters=st.masters||{};
      st.masters.updatedAt=new Date().toISOString();
      root.treasuryRecoverySnapshot?.('楽天カード締め・引落既定値v96補正直前');
      root.replaceTreasuryState?.(st);
      root.setTreasurySaveStatus?.('楽天カード 月末締め・翌月27日引落を補正済み・同期中');
      root.cloudSyncOnLocalSave?.();
    }
    if(changed&&refresh)setTimeout(refreshForecast,0);
    return changed;
  }

  function delayedApply(){setTimeout(()=>applyDefaults(),0)}

  applyDefaults();
  setTimeout(()=>applyDefaults(),250);
  setTimeout(()=>applyDefaults(),1000);

  if(typeof document!=='undefined'){
    document.addEventListener('click',e=>{
      if(e.target.closest?.('[data-v77-save]'))setTimeout(()=>applyDefaults(),0);
    },false);
  }
  root.addEventListener?.('treasury:pagechange',e=>{
    if(['settings','cashflow','dashboard'].includes(String(e?.detail?.page||'')))delayedApply();
  });
  root.addEventListener?.('pageshow',delayedApply);
  root.addEventListener?.('focus',delayedApply);

  root.householdCardCycleDefaultsV96={...pure,applyDefaults};
})(typeof window!=='undefined'?window:null);
