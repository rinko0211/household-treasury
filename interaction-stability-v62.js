(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const mobileMq=window.matchMedia('(max-width:820px)');
  const openCardKeys=new Set();
  let patching=false,patchTimer=null,observer=null;

  function isMobile(){return mobileMq.matches}
  function currentHorizon(){const a=document.querySelector('#mobileCashflowV60 [data-v60-h].active');return Number(a?.dataset.v60H)||30}
  function rowsNow(){try{return typeof forecast==='function'?(forecast(currentHorizon()).rows||[]):[]}catch{return[]}}
  function manualParent(e,st){
    if(e?.parent_event_id&&(st.events||[]).some(x=>String(x.id)===String(e.parent_event_id)))return String(e.parent_event_id);
    if((st.events||[]).some(x=>String(x.id)===String(e?.id)))return String(e.id);
    const id=String(e?.id||'');
    if(id.startsWith('future:'))for(const x of st.events||[])if(id.startsWith(`future:${x.id}:`))return String(x.id);
    return'';
  }
  function sourceKind(e,st){
    const pid=manualParent(e,st);if(pid)return{kind:'EVENT',id:pid};
    const mid=String(e?.master_id||e?.source_master_id||'');
    if(mid&&(st.masters?.fixedExpenses||[]).some(x=>String(x.id)===mid))return{kind:'MASTER',id:mid};
    const src=String(e?.source||''),type=String(e?.type||'');
    if(src==='card_estimate_v49'||type==='CARD_ESTIMATE')return{kind:'CARD',card:e.card||'',ym:e.billing_month||String(e.date||'').slice(0,7)};
    if(src==='card_settlement'||type==='CARD_SETTLEMENT')return{kind:'CARD_ACTUAL',card:e.card||String(e.name||'').replace(/カード支払.*/,''),ym:String(e.date||'').slice(0,7)};
    if(src==='settings_salary'||type==='SALARY')return{kind:'SETTINGS'};
    return{kind:'GENERATED'};
  }
  function actionHtml(src){
    if(src.kind==='EVENT')return`<button class="btn secondary" data-v62-event-edit="${esc(src.id)}">編集</button><button class="btn danger" data-v62-event-del="${esc(src.id)}">削除</button>`;
    if(src.kind==='MASTER')return`<button class="btn secondary" data-v62-master-edit="${esc(src.id)}">元を編集</button><button class="btn danger" data-v62-master-del="${esc(src.id)}">削除</button>`;
    if(src.kind==='CARD')return`<button class="btn secondary" data-v62-card="${esc(src.card)}" data-v62-card-ym="${esc(src.ym)}">詳細</button>`;
    if(src.kind==='CARD_ACTUAL')return`<button class="btn secondary" data-v62-card-actual="${esc(src.card)}" data-v62-card-ym="${esc(src.ym)}">請求詳細</button>`;
    if(src.kind==='SETTINGS')return`<button class="btn secondary" data-v62-settings>設定を編集</button>`;
    return`<span class="tiny">自動生成</span>`;
  }

  function installCss(){
    if($('interactionStyleV62'))return;
    const s=document.createElement('style');s.id='interactionStyleV62';s.textContent=`
      @media(max-width:820px){
        #futurePlannerCardV37,#adhocEventListCardV15,#mobileFutureV59{display:none!important}
        #mobileCashflowV60 .v60-actions{display:flex!important;gap:7px!important;justify-content:flex-end!important;margin-top:8px!important;flex-wrap:wrap!important}
        #mobileCashflowV60 .v60-actions .btn{min-width:72px}
        #mobileAddFutureV62{width:100%;margin:8px 0 2px}
      }
    `;document.head.appendChild(s);
  }
  function hideLegacyFutureUi(){
    if(!isMobile())return;
    for(const id of ['futurePlannerCardV37','adhocEventListCardV15','mobileFutureV59']){const el=$(id);if(el)el.style.display='none'}
    const oldTableCard=$('eventsBody')?.closest('.card');if(oldTableCard&&oldTableCard.id!=='mobileCashflowV60')oldTableCard.style.display='none';
    const old61=$('cardForecastStableV61');if(old61)old61.style.display='none';
  }
  function ensureAddButton(){
    if(!isMobile())return;const card=$('mobileCashflowV60');if(!card||$('mobileAddFutureV62'))return;
    const b=document.createElement('button');b.id='mobileAddFutureV62';b.className='btn';b.textContent='＋将来イベントを追加';
    const horizons=card.querySelector('.v60-horizons');if(horizons)horizons.before(b);else card.prepend(b);
    b.onclick=()=>{const legacy=$('futureAddV37');if(legacy){legacy.click();return}alert('予定追加画面を開けませんでした。ページを再読み込みしてください。')};
  }
  function patchMobileActions(){
    if(!isMobile()||patching)return;const host=$('mobileCashflowRowsV60');if(!host)return;patching=true;
    try{
      hideLegacyFutureUi();ensureAddButton();
      const st=stateNow(),rows=rowsNow(),dom=[...host.querySelectorAll('.v60-row')];
      dom.forEach((row,i)=>{
        const e=rows[i];if(!e)return;let actions=row.querySelector('.v60-actions');
        if(!actions){actions=document.createElement('div');actions.className='v60-actions';row.appendChild(actions)}
        actions.innerHTML=actionHtml(sourceKind(e,st));row.querySelector('.v60-generated')?.remove();
      });
    }finally{patching=false}
  }
  function queuePatch(delay=50){clearTimeout(patchTimer);patchTimer=setTimeout(patchMobileActions,delay)}

  function saveState(st,msg){
    window.treasuryRecoverySnapshot?.(`${msg}直前`);
    window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();
    window.setTreasurySaveStatus?.(`${msg}・同期中`);window.cloudSyncOnLocalSave?.();
    setTimeout(()=>{window.renderMobileCashflowV60?.();queuePatch(100);renderStableCards()},70);
  }
  function editEvent(id){
    const card=$('mobileCashflowV60');if(!card)return alert('編集画面を開けませんでした。');
    const tmp=document.createElement('button');tmp.type='button';tmp.hidden=true;tmp.dataset.v60Edit=String(id);card.appendChild(tmp);tmp.click();tmp.remove();
  }
  function delEvent(id){
    const st=stateNow(),e=(st.events||[]).find(x=>String(x.id)===String(id));if(!e)return alert('削除対象の予定が見つかりません。');
    if(!confirm(`「${e.name||'この予定'}」を削除しますか？`))return;
    st.events=(st.events||[]).filter(x=>String(x.id)!==String(id));
    if(Array.isArray(st.bonusPlans))st.bonusPlans=st.bonusPlans.filter(p=>!(p.autoCreated&&String(p.source_event_id||'')===String(id)));
    saveState(st,'将来イベント削除');
  }
  function matchingLegacyRule(r,m){
    const rid=String(r?.source_master_id||r?.master_id||'');if(rid&&rid===String(m.id))return true;
    return !!m.name&&norm(r?.name)===norm(m.name);
  }
  function retireLegacyRules(st,m){
    st.rules=Array.isArray(st.rules)?st.rules:[];st.legacyFixedRulesArchive=Array.isArray(st.legacyFixedRulesArchive)?st.legacyFixedRulesArchive:[];
    const now=new Date().toISOString(),retired=[];
    for(const r of st.rules)if(matchingLegacyRule(r,m)){
      retired.push(r);
      if(!st.legacyFixedRulesArchive.some(x=>String(x.id||'')===String(r.id||'')))st.legacyFixedRulesArchive.push({...structuredClone(r),archivedAt:now,archiveReason:'canonical_master_deleted_v62'});
    }
    if(retired.length)st.rules=st.rules.filter(r=>!retired.includes(r));
  }
  function delMaster(id){
    const st=stateNow();st.masters=st.masters||{};st.masters.fixedExpenses=Array.isArray(st.masters.fixedExpenses)?st.masters.fixedExpenses:[];
    const m=st.masters.fixedExpenses.find(x=>String(x.id)===String(id));if(!m)return alert('削除対象の固定マスタが見つかりません。');
    if(!confirm(`「${m.name||'この予定'}」の固定マスタを削除しますか？\n将来の自動生成も停止します。`))return;
    retireLegacyRules(st,m);
    st.masters.fixedExpenses=st.masters.fixedExpenses.filter(x=>String(x.id)!==String(id));st.masters.updatedAt=new Date().toISOString();
    if(Array.isArray(st.bonusPlans))for(const p of st.bonusPlans)p.allocations=(p.allocations||[]).filter(a=>!(a.target_type==='FIXED_MASTER'&&String(a.target_id||'')===String(id)));
    saveState(st,'固定マスタ削除');
  }
  function editMaster(id){
    document.querySelector('[data-page="settings"]')?.click();
    let tries=0;
    const seek=()=>{
      try{window.renderSemanticUiV48?.()}catch{}
      const q=`[data-v48-fixed="${CSS.escape(String(id))}"]`;
      let box=document.querySelector(q);
      if(!box){const save=document.querySelector(`[data-v43-save="${CSS.escape(String(id))}"]`);box=save?.closest('.card')||null}
      if(box){
        if('open'in box)box.open=true;box.style.outline='2px solid var(--accent)';box.style.outlineOffset='3px';box.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>{box.style.outline='';box.style.outlineOffset=''},1800);return;
      }
      if(++tries<24)return setTimeout(seek,100);
      alert('固定マスタは存在しますが、編集欄の描画に失敗しました。Settingsを開き直してください。');
    };
    setTimeout(seek,60);
  }

  function cardKey(r){return `${String(r.card||'')}|${String(r.billing_month||'')}`}
  function planRows(){try{return window.householdCardForecastV49?.().rows||[]}catch{return[]}}
  function ensureStableCardUi(){
    const old=$('cardForecastV49');if(old)old.style.display='none';const old61=$('cardForecastStableV61');if(old61)old61.style.display='none';
    const grid=document.querySelector('#cashflow .grid');if(!grid)return null;let card=$('cardForecastStableV62');if(card)return card;
    card=document.createElement('div');card.id='cardForecastStableV62';card.className='card full';
    card.innerHTML=`<div class="title">カード見込請求 <span class="tag">安定表示 v62</span></div><div class="tiny">開いている請求月を状態として保持するため、再描画でも詳細が閉じません。</div><div id="cardForecastStableRowsV62" style="margin-top:10px"></div>`;
    const mobile=$('mobileCashflowV60');if(mobile&&mobile.parentElement===grid)mobile.after(card);else grid.prepend(card);return card;
  }
  function renderStableCards(){
    const card=ensureStableCardUi();if(!card)return;const host=$('cardForecastStableRowsV62');if(!host)return;const rows=planRows().slice(0,18);
    host.innerHTML=rows.length?rows.map(r=>{const key=cardKey(r),open=openCardKeys.has(key);return`<div class="card" style="padding:10px;margin-top:7px" data-v62-cardbox="${esc(key)}"><button class="btn secondary" style="width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left" data-v62-card-toggle="${esc(key)}"><span><b>${esc(r.card)} · ${esc(r.billing_month)}</b> <span class="tiny">見込</span></span><span class="amt">${yen(Math.abs(r.amount))} ${open?'▲':'▼'}</span></button><div class="${open?'':'hidden'}" style="margin-top:7px"><div class="row"><span>取込済み利用明細</span><b>${yen(r.known_purchase_total)}</b></div><div class="row"><span>未実績のカード固定費</span><b>${yen(r.scheduled_fixed_total)}</b></div>${(r.components?.scheduled||[]).map(x=>`<div class="tiny" style="padding:4px 0">予定: ${esc(x.name)} ${yen(x.amount)}</div>`).join('')}</div></div>`}).join(''):'<div class="muted">見込請求はありません。確定請求がある月はそちらを使用します。</div>';
  }
  function openCardDetail(card,ym){
    const row=planRows().find(r=>(!card||norm(r.card)===norm(card))&&(!ym||String(r.billing_month)===String(ym)));
    document.querySelector('[data-page="cashflow"]')?.click();
    if(!row){setTimeout(renderStableCards,60);return}
    const key=cardKey(row);openCardKeys.add(key);renderStableCards();setTimeout(()=>document.querySelector(`[data-v62-cardbox="${CSS.escape(key)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),60);
  }
  function openActualCardDetail(card,ym){
    const st=stateNow(),s=(st.cardSettlements||[]).find(x=>norm(x.card)===norm(card)&&String(x.due_date||'').slice(0,7)===String(ym));
    if(!s)return alert('確定請求の詳細が見つかりません。');
    const text=[`${s.card||card} ${ym} 確定請求`, `請求額 ${yen(Math.abs(Number(s.amount)||0))}`, s.detail_count!=null?`明細 ${s.detail_count}件`:'', s.detail_difference!=null?`照合差額 ${yen(s.detail_difference)}`:''].filter(Boolean).join('\n');alert(text);
  }

  document.addEventListener('click',e=>{
    const a=e.target.closest?.('[data-v62-event-edit],[data-v62-event-del],[data-v62-master-edit],[data-v62-master-del],[data-v62-card],[data-v62-card-actual],[data-v62-settings],[data-v62-card-toggle]');if(!a)return;
    e.preventDefault();e.stopPropagation();
    if(a.matches('[data-v62-event-edit]'))return editEvent(a.dataset.v62EventEdit);
    if(a.matches('[data-v62-event-del]'))return delEvent(a.dataset.v62EventDel);
    if(a.matches('[data-v62-master-edit]'))return editMaster(a.dataset.v62MasterEdit);
    if(a.matches('[data-v62-master-del]'))return delMaster(a.dataset.v62MasterDel);
    if(a.matches('[data-v62-card]'))return openCardDetail(a.dataset.v62Card,a.dataset.v62CardYm);
    if(a.matches('[data-v62-card-actual]'))return openActualCardDetail(a.dataset.v62CardActual,a.dataset.v62CardYm);
    if(a.matches('[data-v62-settings]'))return document.querySelector('[data-page="settings"]')?.click();
    if(a.matches('[data-v62-card-toggle]')){const key=a.dataset.v62CardToggle;if(openCardKeys.has(key))openCardKeys.delete(key);else openCardKeys.add(key);renderStableCards()}
  },true);

  function attachObserver(){
    const host=$('mobileCashflowRowsV60');if(!host||observer)return;observer=new MutationObserver(()=>queuePatch(40));observer.observe(host,{childList:true,subtree:false});
  }
  function boot(){
    installCss();hideLegacyFutureUi();ensureAddButton();ensureStableCardUi();renderStableCards();patchMobileActions();attachObserver();
    document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="cashflow"]'))setTimeout(()=>{hideLegacyFutureUi();ensureAddButton();renderStableCards();patchMobileActions();attachObserver()},100);if(e.target.closest?.('#mobileCashflowV60 [data-v60-h]'))setTimeout(()=>queuePatch(100),70)});
    window.addEventListener('focus',()=>setTimeout(()=>{hideLegacyFutureUi();renderStableCards();queuePatch(90)},80));
    mobileMq.addEventListener?.('change',()=>{hideLegacyFutureUi();ensureAddButton();queuePatch(100)});
    window.renderInteractionStabilityV62=()=>{hideLegacyFutureUi();ensureAddButton();renderStableCards();patchMobileActions()};
  }
  function waitBoot(n=0){if(document.querySelector('#cashflow .grid')&&$('mobileCashflowV60'))return boot();if(n<50)setTimeout(()=>waitBoot(n+1),100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>waitBoot(),{once:true});else waitBoot();
})();