(() => {
  const $=id=>document.getElementById(id);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/]/g,'').toUpperCase();
  let repairing=false, compactTimer=null, observer=null;

  function isSalaryRule(x){
    const id=String(x?.id||'').toLowerCase(),type=String(x?.type||x?.category||'').toUpperCase(),name=norm(x?.name);
    return id==='salary'||type==='INCOME_SALARY'||name==='給与'||name==='給料'||name==='SALARY';
  }
  function isMigratedSalaryMaster(x){
    return String(x?.source||'')==='legacy-rule-migration-v43'&&isSalaryRule(x);
  }
  function archiveIncome(st,kind,item){
    st.legacyIncomeRulesArchive=Array.isArray(st.legacyIncomeRulesArchive)?st.legacyIncomeRulesArchive:[];
    const key=`${kind}:${String(item?.id||'')}:${String(item?.name||'')}:${Number(item?.amount)||0}`;
    if(st.legacyIncomeRulesArchive.some(x=>x.archiveKey===key))return;
    st.legacyIncomeRulesArchive.push({archiveKey:key,kind,...structuredClone(item),archivedAt:new Date().toISOString(),archiveReason:'income_not_fixed_expense_v45'});
  }
  function cleanSalaryArtifacts(st){
    st.settings=st.settings||{};st.masters=st.masters||{};
    st.masters.fixedExpenses=Array.isArray(st.masters.fixedExpenses)?st.masters.fixedExpenses:[];
    st.rules=Array.isArray(st.rules)?st.rules:[];
    st.legacyFixedRulesArchive=Array.isArray(st.legacyFixedRulesArchive)?st.legacyFixedRulesArchive:[];
    let changed=false,candidateAmount=0,candidateDay=0;

    const keepRules=[];
    for(const r of st.rules){
      if(isSalaryRule(r)&&Number(r.amount)>0){
        archiveIncome(st,'rule',r);candidateAmount=candidateAmount||Math.abs(Number(r.amount)||0);candidateDay=candidateDay||Number(r.day)||0;changed=true;
      }else keepRules.push(r);
    }
    if(keepRules.length!==st.rules.length)st.rules=keepRules;

    const keepMasters=[];
    for(const x of st.masters.fixedExpenses){
      if(isMigratedSalaryMaster(x)){
        archiveIncome(st,'master',x);candidateAmount=candidateAmount||Math.abs(Number(x.amount)||0);candidateDay=candidateDay||Number(x.dueDay||x.day)||0;changed=true;
      }else keepMasters.push(x);
    }
    if(keepMasters.length!==st.masters.fixedExpenses.length)st.masters.fixedExpenses=keepMasters;

    const fixedArchiveKeep=[];
    for(const x of st.legacyFixedRulesArchive){
      if(isSalaryRule(x)&&Number(x.amount)>0){archiveIncome(st,'legacy-archive',x);changed=true}else fixedArchiveKeep.push(x);
    }
    if(fixedArchiveKeep.length!==st.legacyFixedRulesArchive.length)st.legacyFixedRulesArchive=fixedArchiveKeep;

    if(!(Number(st.settings.salary)>0)&&candidateAmount>0){st.settings.salary=candidateAmount;changed=true}
    if((!Number.isInteger(Number(st.settings.salaryDay))||Number(st.settings.salaryDay)<1||Number(st.settings.salaryDay)>31)&&candidateDay>=1&&candidateDay<=31){st.settings.salaryDay=candidateDay;changed=true}
    if(changed){st.salaryRuleRepairVersion=1;if(st.masters)st.masters.updatedAt=new Date().toISOString()}
    return changed;
  }
  function persistRepair(st,reason){
    if(repairing)return;repairing=true;
    try{
      window.treasuryRecoverySnapshot?.(`${reason}直前`);
      window.replaceTreasuryState?.(st);
      window.setTreasurySaveStatus?.('給与設定修復済み・同期中');
      window.cloudSyncOnLocalSave?.();
    }finally{setTimeout(()=>repairing=false,0)}
  }
  function repairSalaryArtifacts(){
    if(repairing)return;const st=stateNow();if(cleanSalaryArtifacts(st)){persistRepair(st,'給与の旧固定費ルール修復');setTimeout(()=>window.renderUnifiedFixedMasterV43?.(),0)}
  }

  function overrideSettingsSave(){
    const btn=$('saveSettings');if(!btn||btn.dataset.v45SalarySafe)return;btn.dataset.v45SalarySafe='1';
    btn.onclick=()=>{
      const st=stateNow();st.settings=st.settings||{};st.assets=st.assets||{};
      st.settings.cash=Number($('cash')?.value)||0;
      st.settings.reserve=Number($('reserve')?.value)||0;
      st.settings.salary=Math.max(0,Number($('salary')?.value)||0);
      const day=Number($('salaryDay')?.value)||18;st.settings.salaryDay=Math.min(31,Math.max(1,Math.round(day)));
      st.settings.reservedSpecial=Number($('reservedSpecial')?.value)||0;
      st.assets.bank=st.settings.cash;
      cleanSalaryArtifacts(st);
      window.treasuryRecoverySnapshot?.('基本設定変更直前');
      window.replaceTreasuryState?.(st);
      window.setTreasurySaveStatus?.('基本設定保存済み・同期中');
      window.cloudSyncOnLocalSave?.();
      setTimeout(()=>{window.renderUnifiedFixedMasterV43?.();compactFixedRows()},0);
    };
  }

  function activatePage(page,button){
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
    button?.classList.add('active');$(page)?.classList.add('active');
    try{window.render?.()}catch{}
  }
  function ensureSyncPage(){
    const nav=document.querySelector('nav.tabs');if(!nav)return;
    let page=$('sync');if(!page){page=document.createElement('section');page.id='sync';page.className='page';page.innerHTML='<div class="grid" id="syncGridV45"></div>';document.querySelector('main.app')?.appendChild(page)}
    let btn=nav.querySelector('[data-page="sync"]');if(!btn){btn=document.createElement('button');btn.className='tab';btn.dataset.page='sync';btn.textContent='Sync';nav.appendChild(btn)}
    if(!btn.dataset.v45Bound){btn.dataset.v45Bound='1';btn.onclick=()=>activatePage('sync',btn)}
    const syncCard=$('cloudStatusTag')?.closest('.card'),grid=$('syncGridV45');if(syncCard&&grid&&syncCard.parentElement!==grid)grid.appendChild(syncCard);
    if(grid&&!grid.querySelector('[data-v45-sync-head]')){const head=document.createElement('div');head.dataset.v45SyncHead='1';head.className='card full';head.innerHTML='<div class="title">同期・アカウント</div><div class="tiny">サインイン、暗号化パスフレーズ、端末同期の状態をここで管理します。日常の家計設定とは分離しました。</div>';grid.prepend(head)}
  }

  function compactFixedRows(){
    const host=$('v43FixedRows');if(!host)return;
    for(const card of [...host.children]){
      if(!card.classList?.contains('card')||card.dataset.v45Compact)return;
      const header=card.firstElementChild;if(!header)continue;card.dataset.v45Compact='1';
      const rest=[...card.children].slice(1);if(!rest.length)continue;
      const body=document.createElement('div');body.dataset.v45FixedBody='1';body.hidden=true;rest.forEach(el=>body.appendChild(el));card.appendChild(body);
      const controls=document.createElement('div');controls.className='controls';controls.style.marginLeft='auto';
      const toggle=document.createElement('button');toggle.type='button';toggle.className='btn secondary';toggle.textContent='▽ 詳細';toggle.dataset.v45FixedToggle='1';
      toggle.onclick=e=>{e.preventDefault();e.stopPropagation();body.hidden=!body.hidden;toggle.textContent=body.hidden?'▽ 詳細':'△ 閉じる'};
      controls.appendChild(toggle);header.appendChild(controls);
    }
  }
  function scheduleCompact(){clearTimeout(compactTimer);compactTimer=setTimeout(compactFixedRows,40)}
  function observeFixedRows(){
    const host=$('v43FixedRows');if(!host||observer)return;observer=new MutationObserver(scheduleCompact);observer.observe(host,{childList:true});compactFixedRows();
  }

  function boot(){
    repairSalaryArtifacts();overrideSettingsSave();ensureSyncPage();
    setTimeout(()=>{observeFixedRows();compactFixedRows()},0);
    document.addEventListener('click',e=>{
      if(e.target.closest?.('[data-page="settings"]'))setTimeout(()=>{repairSalaryArtifacts();overrideSettingsSave();compactFixedRows()},0);
      if(e.target.closest?.('[data-page="sync"]'))setTimeout(ensureSyncPage,0);
    });
    window.addEventListener('focus',()=>{repairSalaryArtifacts();ensureSyncPage();scheduleCompact()});
    const main=document.querySelector('main.app');if(main){const o=new MutationObserver(()=>{ensureSyncPage();overrideSettingsSave();if($('v43FixedRows')){observeFixedRows();scheduleCompact()}});o.observe(main,{childList:true,subtree:true})}
    window.renderSettingsUxV45=()=>{repairSalaryArtifacts();ensureSyncPage();compactFixedRows()};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();