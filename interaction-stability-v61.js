(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const mobileMq=window.matchMedia('(max-width:820px)');
  let patching=false,patchTimer=null;
  const openCardKeys=new Set();

  function currentHorizon(){const a=document.querySelector('#mobileCashflowV60 [data-v60-h].active');return Number(a?.dataset.v60H)||30}
  function rowsNow(){try{return typeof forecast==='function'?(forecast(currentHorizon()).rows||[]):[]}catch{return[]}}
  function manualParent(e,st){
    if(e?.parent_event_id&&(st.events||[]).some(x=>String(x.id)===String(e.parent_event_id)))return String(e.parent_event_id);
    if((st.events||[]).some(x=>String(x.id)===String(e?.id)))return String(e.id);
    const id=String(e?.id||'');if(id.startsWith('future:'))for(const x of st.events||[])if(id.startsWith(`future:${x.id}:`))return String(x.id);
    return'';
  }
  function sourceKind(e,st){
    const pid=manualParent(e,st);if(pid)return{kind:'EVENT',id:pid};
    const mid=String(e?.master_id||e?.source_master_id||'');if(mid&&(st.masters?.fixedExpenses||[]).some(x=>String(x.id)===mid))return{kind:'MASTER',id:mid};
    const src=String(e?.source||''),type=String(e?.type||'');
    if(src==='card_estimate_v49'||type==='CARD_ESTIMATE')return{kind:'CARD',card:e.card||'',ym:e.billing_month||String(e.date||'').slice(0,7)};
    if(src==='card_settlement'||type==='CARD_SETTLEMENT')return{kind:'CARD_ACTUAL',card:e.card||String(e.name||'').replace(/カード支払.*/,''),ym:String(e.date||'').slice(0,7)};
    if(src==='settings_salary'||type==='SALARY')return{kind:'SETTINGS'};
    return{kind:'GENERATED'};
  }
  function actionHtml(src){
    if(src.kind==='EVENT')return`<button class="btn secondary" data-v61-event-edit="${esc(src.id)}">編集</button><button class="btn danger" data-v61-event-del="${esc(src.id)}">削除</button>`;
    if(src.kind==='MASTER')return`<button class="btn secondary" data-v61-master-edit="${esc(src.id)}">元を編集</button><button class="btn danger" data-v61-master-del="${esc(src.id)}">削除</button>`;
    if(src.kind==='CARD'||src.kind==='CARD_ACTUAL')return`<button class="btn secondary" data-v61-card="${esc(src.card)}" data-v61-card-ym="${esc(src.ym)}">詳細</button>`;
    if(src.kind==='SETTINGS')return`<button class="btn secondary" data-v61-settings>設定を編集</button>`;
    return`<span class="tiny">自動生成</span>`;
  }
  function patchMobileActions(){
    if(!mobileMq.matches||patching)return;const host=$('mobileCashflowRowsV60');if(!host)return;patching=true;
    try{
      const st=stateNow(),rows=rowsNow(),dom=[...host.querySelectorAll('.v60-row')];
      dom.forEach((row,i)=>{const e=rows[i];if(!e)return;let actions=row.querySelector('.v60-actions');if(!actions){actions=document.createElement('div');actions.className='v60-actions';row.appendChild(actions)}const src=sourceKind(e,st);actions.innerHTML=actionHtml(src);row.querySelector('.v60-generated')?.remove();});
    }finally{patching=false}
  }
  function queuePatch(delay=40){clearTimeout(patchTimer);patchTimer=setTimeout(patchMobileActions,delay)}

  function saveState(st,msg){window.treasuryRecoverySnapshot?.(`${msg}直前`);window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();window.setTreasurySaveStatus?.(`${msg}・同期中`);window.cloudSyncOnLocalSave?.();setTimeout(()=>{window.renderMobileCashflowV60?.();queuePatch(80);renderStableCards()},60)}
  function editEvent(id){
    const b=document.querySelector(`#mobileCashflowV60 [data-v60-edit="${CSS.escape(String(id))}"]`);if(b){b.click();return}
    const legacy=document.querySelector(`[data-future-edit="${CSS.escape(String(id))}"]`);if(legacy){legacy.click();return}
    alert('編集画面を開けませんでした。ページを再読み込みしてください。')
  }
  function delEvent(id){const st=stateNow(),e=(st.events||[]).find(x=>String(x.id)===String(id));if(!e)return;if(!confirm(`「${e.name||'この予定'}」を削除しますか？`))return;st.events=st.events.filter(x=>String(x.id)!==String(id));saveState(st,'将来イベント削除')}
  function editMaster(id){
    document.querySelector('[data-page="settings"]')?.click();setTimeout(()=>{const box=document.querySelector(`[data-v48-fixed="${CSS.escape(String(id))}"]`);if(box){box.open=true;box.scrollIntoView({behavior:'smooth',block:'start'})}},120)
  }
  function delMaster(id){const st=stateNow(),m=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(id));if(!m)return;if(!confirm(`「${m.name||'この予定'}」のマスタを削除しますか？\n将来の自動生成も停止します。`))return;st.masters.fixedExpenses=st.masters.fixedExpenses.filter(x=>String(x.id)!==String(id));st.masters.updatedAt=new Date().toISOString();saveState(st,'予定マスタ削除')}

  function cardKey(r){return `${String(r.card||'')}|${String(r.billing_month||'')}`}
  function planRows(){try{return window.householdCardForecastV49?.().rows||[]}catch{return[]}}
  function ensureStableCardUi(){
    const old=$('cardForecastV49');if(old)old.style.display='none';const grid=document.querySelector('#cashflow .grid');if(!grid)return null;let card=$('cardForecastStableV61');if(card)return card;
    card=document.createElement('div');card.id='cardForecastStableV61';card.className='card full';card.innerHTML=`<div class="title">カード見込請求 <span class="tag">安定表示 v61</span></div><div class="tiny">詳細の開閉状態は再描画後も保持します。</div><div id="cardForecastStableRowsV61" style="margin-top:10px"></div>`;const mobile=$('mobileCashflowV60');if(mobile&&mobile.parentElement===grid)mobile.after(card);else grid.prepend(card);return card
  }
  function renderStableCards(){
    const card=ensureStableCardUi();if(!card)return;const host=$('cardForecastStableRowsV61');if(!host)return;const rows=planRows().slice(0,18);
    host.innerHTML=rows.length?rows.map(r=>{const key=cardKey(r),open=openCardKeys.has(key);return`<div class="card" style="padding:10px;margin-top:7px" data-v61-cardbox="${esc(key)}"><button class="btn secondary" style="width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left" data-v61-card-toggle="${esc(key)}"><span><b>${esc(r.card)} · ${esc(r.billing_month)}</b> <span class="tiny">見込</span></span><span class="amt">${yen(Math.abs(r.amount))} ${open?'▲':'▼'}</span></button><div data-v61-card-detail="${esc(key)}" class="${open?'':'hidden'}" style="margin-top:7px"><div class="row"><span>取込済み利用明細</span><b>${yen(r.known_purchase_total)}</b></div><div class="row"><span>未実績のカード固定費</span><b>${yen(r.scheduled_fixed_total)}</b></div>${(r.components?.scheduled||[]).map(x=>`<div class="tiny" style="padding:4px 0">予定: ${esc(x.name)} ${yen(x.amount)}</div>`).join('')}</div></div>`}).join(''):'<div class="muted">見込請求はありません。確定請求がある月はそちらを使用します。</div>'
  }
  function openCardDetail(card,ym){
    const row=planRows().find(r=>(!card||String(r.card)===String(card))&&(!ym||String(r.billing_month)===String(ym)));if(!row){document.querySelector('[data-page="cashflow"]')?.click();setTimeout(renderStableCards,60);return}openCardKeys.add(cardKey(row));document.querySelector('[data-page="cashflow"]')?.click();renderStableCards();setTimeout(()=>document.querySelector(`[data-v61-cardbox="${CSS.escape(cardKey(row))}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),50)
  }

  document.addEventListener('click',e=>{
    const a=e.target.closest?.('[data-v61-event-edit],[data-v61-event-del],[data-v61-master-edit],[data-v61-master-del],[data-v61-card],[data-v61-settings],[data-v61-card-toggle]');if(!a)return;
    if(a.matches('[data-v61-event-edit]'))return editEvent(a.dataset.v61EventEdit);
    if(a.matches('[data-v61-event-del]'))return delEvent(a.dataset.v61EventDel);
    if(a.matches('[data-v61-master-edit]'))return editMaster(a.dataset.v61MasterEdit);
    if(a.matches('[data-v61-master-del]'))return delMaster(a.dataset.v61MasterDel);
    if(a.matches('[data-v61-card]'))return openCardDetail(a.dataset.v61Card,a.dataset.v61CardYm);
    if(a.matches('[data-v61-settings]'))return document.querySelector('[data-page="settings"]')?.click();
    if(a.matches('[data-v61-card-toggle]')){const key=a.dataset.v61CardToggle;if(openCardKeys.has(key))openCardKeys.delete(key);else openCardKeys.add(key);renderStableCards()}
  },true);

  function boot(){
    ensureStableCardUi();renderStableCards();queuePatch(120);
    const host=$('mobileCashflowRowsV60');if(host){const ob=new MutationObserver(()=>queuePatch(30));ob.observe(host,{childList:true,subtree:false})}
    document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="cashflow"]'))setTimeout(()=>{renderStableCards();queuePatch(100)},80);if(e.target.closest?.('#mobileCashflowV60 [data-v60-h]'))setTimeout(()=>queuePatch(80),60)});
    window.addEventListener('focus',()=>setTimeout(()=>{renderStableCards();queuePatch(80)},80));
    window.renderInteractionStabilityV61=()=>{renderStableCards();patchMobileActions()};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,700),{once:true});else setTimeout(boot,700);
})();