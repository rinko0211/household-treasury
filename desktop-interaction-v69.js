(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const desktopMq=window.matchMedia('(min-width:821px)');
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const openInline=new Set(),openForecast=new Set();
  let days=30,editEventId=null,editOccurrence=null,timer=null;

  const originalDate=e=>String(e?.occurrence_original_date||e?.date||'');
  const overrideKey=(mid,date)=>`${String(mid)}|${String(date)}`;
  const ensureOverrides=st=>{st.masterOccurrenceOverrides=Array.isArray(st.masterOccurrenceOverrides)?st.masterOccurrenceOverrides:[];return st.masterOccurrenceOverrides};
  const isMasterEvent=e=>!!(e&&(e.source==='master_fixed'||e.source==='master_annual'||e.master_id||e.source_master_id));

  function manualId(e,st){
    if(e?.parent_event_id&&(st.events||[]).some(x=>String(x.id)===String(e.parent_event_id)))return String(e.parent_event_id);
    if((st.events||[]).some(x=>String(x.id)===String(e?.id)))return String(e.id);
    const id=String(e?.id||'');
    if(id.startsWith('future:'))for(const x of st.events||[])if(id.startsWith(`future:${x.id}:`))return String(x.id);
    return'';
  }
  function cardMeta(e){
    const src=String(e?.source||''),type=String(e?.type||'');
    if(type==='CARD_ESTIMATE'||src==='card_estimate_v49')return{kind:'ESTIMATE',card:e.card||'',ym:e.billing_month||String(e.date||'').slice(0,7)};
    if(type==='CARD_REVOLVING_PAYMENT'||src==='card_revolving_v66')return{kind:'REVOLVING',card:e.card||'',ym:e.billing_month||String(e.date||'').slice(0,7)};
    if(type==='CARD_SETTLEMENT'||src==='card_settlement')return{kind:'ACTUAL',card:e.card||String(e.name||'').replace(/カード支払.*/,''),ym:String(e.date||'').slice(0,7)};
    return null;
  }
  function kindLabel(e){
    const cm=cardMeta(e);if(cm)return cm.kind==='REVOLVING'?'リボ返済':'カード支払';
    const k=String(e?.future_kind||'').toUpperCase();
    if(k==='INCOME'||Number(e?.amount)>0)return'収入';
    if(k==='NORMAL')return'通常費';if(k==='SPECIAL')return'特別費';if(k==='INVESTMENT')return'投資';if(k==='DEBT')return'負債返済';if(k==='TRANSFER')return'資金移動';return'予定';
  }
  function rows(){try{return typeof forecast==='function'?(forecast(days).rows||[]):[]}catch(e){console.error('desktop v69 forecast',e);return[]}}
  function sameCard(a,b){try{return window.householdCardIdentityV51?.sameCard?.(a,b)??norm(a)===norm(b)}catch{return norm(a)===norm(b)}}
  function purchaseAmount(p){const v=p?.payment_amount;return v!==null&&v!==''&&Number.isFinite(Number(v))?Math.abs(Number(v)):Math.abs(Number(p?.original_amount)||0)}
  function planRows(){try{return window.householdCardForecastV49?.(180)?.rows||[]}catch{return[]}}
  function detailFromForecast(meta){
    const r=planRows().find(x=>sameCard(x.card,meta.card)&&String(x.billing_month||'')===String(meta.ym)&&(meta.kind!=='REVOLVING'||String(x.type||'')==='CARD_REVOLVING_PAYMENT'));if(!r)return null;
    const items=[...(r.components?.purchases||[]).map(x=>({name:x.name||'カード利用',amount:Number(x.amount)||0,meta:'利用明細'})),...(r.components?.scheduled||[]).map(x=>({name:x.name||'固定費予定',amount:Number(x.amount)||0,meta:'未実績のカード固定費'}))];
    return{kind:String(r.type||'')==='CARD_REVOLVING_PAYMENT'?'REVOLVING':'ESTIMATE',card:r.card,ym:r.billing_month,total:Math.abs(Number(r.amount)||0),known:Number(r.known_purchase_total)||0,scheduled:Number(r.scheduled_fixed_total)||0,balance:r.revolving_balance,items};
  }
  function detailActual(meta){
    const st=stateNow(),s=(st.cardSettlements||[]).find(x=>sameCard(x.card,meta.card)&&String(x.due_date||'').slice(0,7)===String(meta.ym));if(!s)return null;
    let items=(st.cardBillingLines||[]).filter(x=>sameCard(x.card,meta.card)&&String(x.billing_month||'')===String(meta.ym)).map(x=>({name:x.merchant_raw||'カード明細',amount:Number(x.billed_amount)||0,meta:[x.purchase_date,x.line_kind==='ADJUSTMENT'?'請求調整':x.category||''].filter(Boolean).join(' · ')}));
    if(!items.length)items=(st.purchaseEvents||[]).filter(p=>String(p.card_settlement_id||'')===String(s.settlement_id||'')).map(p=>({name:p.merchant_raw||'カード利用',amount:purchaseAmount(p),meta:[p.purchase_date,p.category||''].filter(Boolean).join(' · ')}));
    return{kind:'ACTUAL',card:s.card||meta.card,ym:meta.ym,total:Math.abs(Number(s.amount)||0),items};
  }
  function detailFor(meta){return meta.kind==='ACTUAL'?detailActual(meta):detailFromForecast(meta)}
  function itemsHtml(items){return items?.length?items.map(x=>`<div class="row"><div><b>${esc(x.name)}</b>${x.meta?`<div class="tiny">${esc(x.meta)}</div>`:''}</div><b>${yen(x.amount)}</b></div>`).join(''):'<div class="muted" style="padding:7px 0">明細はまだ取得できていません。</div>'}
  function detailHtml(d){
    if(!d)return'<div class="muted">詳細を取得できませんでした。</div>';
    if(d.kind==='REVOLVING')return`<div class="row"><span>次回リボ返済</span><b>${yen(d.total)}</b></div><div class="row"><span>取込済み利用</span><b>${yen(d.known)}</b></div><div class="row"><span>未実績固定費</span><b>${yen(d.scheduled)}</b></div>${d.balance!==null&&d.balance!==undefined?`<div class="row"><span>現在リボ残高</span><b>${yen(d.balance)}</b></div>`:''}<div class="note" style="margin-top:7px">元本・手数料は取得できない限り推測しません。</div>${itemsHtml(d.items)}`;
    if(d.kind==='ESTIMATE')return`<div class="row"><span>見込請求額</span><b>${yen(d.total)}</b></div><div class="row"><span>取込済み利用</span><b>${yen(d.known)}</b></div><div class="row"><span>未実績固定費</span><b>${yen(d.scheduled)}</b></div>${itemsHtml(d.items)}`;
    return`<div class="row"><span>確定請求額</span><b>${yen(d.total)}</b></div>${itemsHtml(d.items)}`;
  }

  function installCss(){if($('desktopInteractionStyleV69'))return;const s=document.createElement('style');s.id='desktopInteractionStyleV69';s.textContent=`
    @media(min-width:821px){
      #cashflow #eventsBody{display:none!important}
      #futurePlannerCardV37,#adhocEventListCardV15,#cardForecastV49,#cardForecastStableV61,#cardForecastStableV62,#cardForecastStableV64,#cardForecastStableV68{display:none!important}
      #desktopCashflowV69{display:block!important;grid-column:1/-1}
      #desktopCashflowV69 .v69-h{display:flex;gap:8px;margin:10px 0 12px}
      #desktopCashflowV69 .v69-h .active{background:#28436c;border-color:#7dd3fc}
      #desktopCashflowV69 .v69-row{padding:11px 0;border-bottom:1px solid #263755}
      #desktopCashflowV69 .v69-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      #desktopCashflowV69 .v69-actions{display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap;margin-top:8px}
      #desktopCashflowV69 .v69-detail,#desktopCardForecastV69 .v69-detail{margin-top:8px;padding:8px;border:1px solid #263755;border-radius:10px}
      #futureEditorV69 .v69-bg,#occurrenceEditorV69 .v69-bg{position:fixed;inset:0;background:#0009;z-index:10900}
      #futureEditorV69 .v69-modal,#occurrenceEditorV69 .v69-modal{position:fixed;z-index:10901;left:50%;top:50%;transform:translate(-50%,-50%);width:min(760px,90vw);max-height:90vh;overflow:auto}
    }
  `;document.head.appendChild(s)}
  function ensureUi(){
    installCss();const grid=document.querySelector('#cashflow .grid');if(!grid)return null;let card=$('desktopCashflowV69');
    if(!card){card=document.createElement('div');card.id='desktopCashflowV69';card.className='card full';card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><div class="title" style="margin-bottom:3px">将来イベント <span class="tag">PC v69</span></div><div class="tiny">スマホと同じ操作モデルです。固定費マスタ由来はその回だけ変更できます。</div></div><button class="btn" id="desktopAddFutureV69">＋将来イベント</button></div><div class="v69-h"><button class="btn secondary active" data-v69-h="30">30日</button><button class="btn secondary" data-v69-h="60">60日</button><button class="btn secondary" data-v69-h="90">90日</button><button class="btn secondary" data-v69-h="180">6か月</button></div><div id="desktopRowsV69"></div>`;grid.prepend(card)}
    let cf=$('desktopCardForecastV69');if(!cf){cf=document.createElement('div');cf.id='desktopCardForecastV69';cf.className='card full';cf.innerHTML='<div class="title">カード見込・返済 <span class="tag">PC v69</span></div><div class="tiny">詳細部分だけを開閉するため、再描画で開閉状態が飛びません。</div><div id="desktopCardRowsV69" style="margin-top:10px"></div>';card.after(cf)}return card;
  }
  function source(e,st){const pid=manualId(e,st);if(pid)return{kind:'EVENT',id:pid};if(isMasterEvent(e)){const id=String(e.master_id||e.source_master_id||''),date=originalDate(e);if(id&&date)return{kind:'MASTER',id,date}}const cm=cardMeta(e);if(cm)return{kind:'CARD',meta:cm};return{kind:'GENERATED'}}
  function actionHtml(a){
    if(a.kind==='EVENT')return`<button class="btn secondary" data-v69-event-edit="${esc(a.id)}">編集</button><button class="btn danger" data-v69-event-del="${esc(a.id)}">削除</button>`;
    if(a.kind==='MASTER')return`<button class="btn secondary" data-v69-occ-edit="${esc(a.id)}" data-v69-occ-date="${esc(a.date)}">この回を編集</button><button class="btn danger" data-v69-occ-del="${esc(a.id)}" data-v69-occ-date="${esc(a.date)}">この回を削除</button><button class="btn secondary" data-v69-master="${esc(a.id)}">元マスタ</button>`;
    if(a.kind==='CARD'){const k=`inline:${a.meta.kind}:${a.meta.card}:${a.meta.ym}`,d=detailFor(a.meta);return`<button class="btn secondary" data-v69-inline="${esc(k)}">内訳 ${d?.items?.length||0}件</button>`}return'<span class="tiny">自動生成</span>';
  }
  function render(){
    if(!desktopMq.matches)return;const card=ensureUi(),host=$('desktopRowsV69');if(!card||!host)return;card.querySelectorAll('[data-v69-h]').forEach(b=>b.classList.toggle('active',Number(b.dataset.v69H)===days));const st=stateNow(),rs=rows().slice(0,120);
    host.innerHTML=rs.length?rs.map(e=>{const a=source(e,st),amt=Number(e.amount)||0,unknown=e.amount===null||e.amount===''||!Number.isFinite(Number(e.amount));let detail='';if(a.kind==='CARD'){const k=`inline:${a.meta.kind}:${a.meta.card}:${a.meta.ym}`,d=detailFor(a.meta);detail=`<div class="v69-detail" data-v69-inline-panel="${esc(k)}" ${openInline.has(k)?'':'hidden'}>${detailHtml(d)}</div>`}return`<div class="v69-row"><div class="v69-top"><div><b>${esc(e.name||'予定')}</b><div class="tiny">${esc(e.date||'')} · ${esc(kindLabel(e))}${e.occurrence_overridden?' · この回だけ変更済み':''}</div></div><b class="amt ${unknown?'warn':amt<0?'bad':'good'}">${unknown?'未定':`${amt>0?'+':''}${yen(amt)}`}</b></div><div class="v69-actions">${actionHtml(a)}</div>${detail}</div>`}).join(''):'<div class="muted">この期間の予定はありません。</div>';
    renderCards();
  }
  function renderCards(){const host=$('desktopCardRowsV69');if(!host)return;const ps=planRows().slice(0,24);host.innerHTML=ps.length?ps.map(r=>{const meta={kind:String(r.type||'')==='CARD_REVOLVING_PAYMENT'?'REVOLVING':'ESTIMATE',card:r.card||'',ym:r.billing_month||''},k=`forecast:${meta.kind}:${meta.card}:${meta.ym}`,d=detailFor(meta);return`<div class="card" style="padding:10px;margin-top:7px"><button class="btn secondary" style="width:100%;display:flex;justify-content:space-between;align-items:center" data-v69-forecast="${esc(k)}"><span><b>${esc(meta.card)} · ${esc(meta.ym)}</b> <span class="tiny">${meta.kind==='REVOLVING'?'リボ返済':'見込'}</span></span><span>${yen(Math.abs(Number(r.amount)||0))} <span data-v69-arrow>${openForecast.has(k)?'▲':'▼'}</span></span></button><div class="v69-detail" data-v69-forecast-panel="${esc(k)}" ${openForecast.has(k)?'':'hidden'}>${detailHtml(d)}</div></div>`}).join(''):'<div class="muted">見込請求・返済予定はありません。</div>'}

  function ensureEditors(){
    if(!$('futureEditorV69')){const m=document.createElement('div');m.id='futureEditorV69';m.hidden=true;m.style.display='none';m.innerHTML=`<div class="v69-bg" data-v69-event-close></div><div class="card v69-modal"><div class="title">将来イベントを編集</div><div class="form"><div class="field"><label>日付</label><input id="v69EventDate" type="date"></div><div class="field"><label>内容</label><input id="v69EventName"></div><div class="field"><label>種類</label><select id="v69EventKind"><option value="INCOME">収入</option><option value="NORMAL">通常費</option><option value="SPECIAL">特別費</option><option value="INVESTMENT">投資</option><option value="DEBT">負債返済</option><option value="TRANSFER">資金移動</option></select></div><div class="field"><label>金額</label><input id="v69EventAmount" type="number" min="0"></div><div class="field"><label>確度</label><select id="v69EventCert"><option value="CONFIRMED">確定</option><option value="ESTIMATED">概算</option><option value="TBD">未定</option></select></div><div class="field"><label>繰り返し</label><select id="v69EventRecurring"><option value="NONE">単発</option><option value="MONTHLY">毎月</option><option value="YEARLY">毎年</option></select></div></div><div class="controls" style="margin-top:12px"><button class="btn" data-v69-event-save>保存</button><button class="btn secondary" data-v69-event-close>キャンセル</button></div></div>`;document.body.appendChild(m)}
    if(!$('occurrenceEditorV69')){const m=document.createElement('div');m.id='occurrenceEditorV69';m.hidden=true;m.style.display='none';m.innerHTML=`<div class="v69-bg" data-v69-occ-close></div><div class="card v69-modal"><div class="title">この回だけ編集</div><div class="note" style="margin-bottom:10px">固定費マスタ本体は変更せず、この発生分だけ上書きします。</div><div class="form"><div class="field"><label>日付</label><input id="v69OccDate" type="date"></div><div class="field"><label>内容</label><input id="v69OccName"></div><div class="field"><label>金額</label><input id="v69OccAmount" type="number" min="0"></div></div><div class="controls" style="margin-top:12px"><button class="btn" data-v69-occ-save>この回だけ保存</button><button class="btn secondary" data-v69-occ-reset>元に戻す</button><button class="btn secondary" data-v69-occ-close>キャンセル</button></div></div>`;document.body.appendChild(m)}
  }
  function show(id){const m=$(id);if(!m)return;m.hidden=false;m.style.display='block'}function hide(id){const m=$(id);if(!m)return;m.hidden=true;m.style.display='none'}
  function eventKind(e){const k=String(e?.future_kind||'').toUpperCase();return['INCOME','NORMAL','SPECIAL','INVESTMENT','DEBT','TRANSFER'].includes(k)?k:(Number(e?.amount)>0?'INCOME':'SPECIAL')}
  function openEvent(id){ensureEditors();const e=(stateNow().events||[]).find(x=>String(x.id)===String(id));if(!e)return alert('編集対象が見つかりません。');editEventId=String(id);$('v69EventDate').value=e.date||'';$('v69EventName').value=e.name||'';$('v69EventKind').value=eventKind(e);$('v69EventAmount').value=e.amount===null||e.amount===''?'':String(Math.abs(Number(e.amount)||0));$('v69EventCert').value=String(e.certainty||'ESTIMATED').toUpperCase();$('v69EventRecurring').value=String(e.recurring||'NONE').toUpperCase();show('futureEditorV69')}
  function closeEvent(){hide('futureEditorV69');editEventId=null}
  function persist(st,msg){window.treasuryRecoverySnapshot?.(`${msg}直前`);window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();window.setTreasurySaveStatus?.(`${msg}・同期中`);window.cloudSyncOnLocalSave?.();setTimeout(render,80)}
  function saveEvent(){const st=stateNow(),e=(st.events||[]).find(x=>String(x.id)===String(editEventId));if(!e)return;const date=$('v69EventDate').value,name=$('v69EventName').value.trim(),kind=$('v69EventKind').value,raw=$('v69EventAmount').value,cert=$('v69EventCert').value,rec=$('v69EventRecurring').value;if(!date||!name)return alert('日付と内容を確認してください。');const n=raw===''?null:Number(raw);if(n!==null&&!Number.isFinite(n))return alert('金額を確認してください。');Object.assign(e,{date,name,amount:n===null?null:(kind==='INCOME'?Math.abs(n):-Math.abs(n)),type:`FUTURE_${kind}`,future_kind:kind,expense_scope:kind==='INCOME'?null:kind,certainty:cert,estimated:cert!=='CONFIRMED',recurring:rec,updatedAt:new Date().toISOString()});persist(st,'将来イベント保存');closeEvent()}
  function delEvent(id){const st=stateNow(),e=(st.events||[]).find(x=>String(x.id)===String(id));if(!e)return;if(!confirm(`「${e.name||'この予定'}」を削除しますか？`))return;st.events=(st.events||[]).filter(x=>String(x.id)!==String(id));persist(st,'将来イベント削除')}
  function openOccurrence(mid,date){ensureEditors();const st=stateNow(),m=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(mid)),o=ensureOverrides(st).find(x=>overrideKey(x.master_id,x.occurrence_date)===overrideKey(mid,date)),e=rows().find(x=>isMasterEvent(x)&&String(x.master_id||x.source_master_id||'')===String(mid)&&originalDate(x)===String(date));if(!m&&!e)return alert('元マスタが見つかりません。');editOccurrence={mid:String(mid),date:String(date),sign:Number(e?.amount)<0?-1:1};$('v69OccDate').value=o?.date||e?.date||date;$('v69OccName').value=o?.name||e?.name||m?.name||'';$('v69OccAmount').value=String(Math.abs(Number(o?.amount)||Number(e?.amount)||Number(m?.amount)||0));show('occurrenceEditorV69')}
  function closeOccurrence(){hide('occurrenceEditorV69');editOccurrence=null}
  function saveOccurrence(){if(!editOccurrence)return;const date=$('v69OccDate').value,name=$('v69OccName').value.trim(),raw=Number($('v69OccAmount').value);if(!date||!name||!Number.isFinite(raw)||raw<0)return alert('日付・内容・金額を確認してください。');const st=stateNow(),now=new Date().toISOString();st.masterOccurrenceOverrides=ensureOverrides(st).filter(x=>overrideKey(x.master_id,x.occurrence_date)!==overrideKey(editOccurrence.mid,editOccurrence.date));st.masterOccurrenceOverrides.push({id:`occ:${crypto.randomUUID()}`,master_id:editOccurrence.mid,occurrence_date:editOccurrence.date,action:'OVERRIDE',date,name,amount:(editOccurrence.sign<0?-1:1)*Math.abs(raw),createdAt:now,updatedAt:now,version:1});st.masterOccurrenceOverridesUpdatedAt=now;persist(st,'固定費この回だけ編集');closeOccurrence()}
  function delOccurrence(mid,date){const st=stateNow(),m=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(mid));if(!confirm(`「${m?.name||'この予定'}」の ${date} 分だけ削除しますか？\n元マスタと翌月以降は残ります。`))return;const now=new Date().toISOString();st.masterOccurrenceOverrides=ensureOverrides(st).filter(x=>overrideKey(x.master_id,x.occurrence_date)!==overrideKey(mid,date));st.masterOccurrenceOverrides.push({id:`occ:${crypto.randomUUID()}`,master_id:String(mid),occurrence_date:String(date),action:'SKIP',createdAt:now,updatedAt:now,version:1});st.masterOccurrenceOverridesUpdatedAt=now;persist(st,'固定費この回だけ削除')}
  function resetOccurrence(){if(!editOccurrence)return;const st=stateNow(),now=new Date().toISOString();st.masterOccurrenceOverrides=ensureOverrides(st).filter(x=>overrideKey(x.master_id,x.occurrence_date)!==overrideKey(editOccurrence.mid,editOccurrence.date));st.masterOccurrenceOverridesUpdatedAt=now;persist(st,'固定費この回の変更解除');closeOccurrence()}
  function editMaster(id){document.querySelector('[data-page="settings"]')?.click();let n=0;const seek=()=>{try{window.renderSemanticUiV48?.()}catch{}const box=document.querySelector(`[data-v48-fixed="${CSS.escape(String(id))}"]`)||document.querySelector(`[data-v43-save="${CSS.escape(String(id))}"]`)?.closest('.card');if(box){if('open'in box)box.open=true;box.scrollIntoView({behavior:'smooth',block:'center'});return}if(++n<30)setTimeout(seek,100)};setTimeout(seek,50)}
  function addFuture(){const b=$('futureAddV37')||$('addEvent');if(b)b.click();else alert('予定追加画面を開けませんでした。')}
  function toggle(b,p,set,k){if(!p)return;const op=p.hidden;p.hidden=!op;if(op)set.add(k);else set.delete(k);const a=b.querySelector('[data-v69-arrow]');if(a)a.textContent=op?'▲':'▼'}

  document.addEventListener('click',e=>{if(!desktopMq.matches)return;const b=e.target.closest?.('[data-v69-h],#desktopAddFutureV69,[data-v69-event-edit],[data-v69-event-del],[data-v69-occ-edit],[data-v69-occ-del],[data-v69-master],[data-v69-inline],[data-v69-forecast],[data-v69-event-save],[data-v69-event-close],[data-v69-occ-save],[data-v69-occ-reset],[data-v69-occ-close]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
    if(b.matches('[data-v69-h]')){days=Number(b.dataset.v69H)||30;return render()}if(b.id==='desktopAddFutureV69')return addFuture();if(b.matches('[data-v69-event-edit]'))return openEvent(b.dataset.v69EventEdit);if(b.matches('[data-v69-event-del]'))return delEvent(b.dataset.v69EventDel);if(b.matches('[data-v69-occ-edit]'))return openOccurrence(b.dataset.v69OccEdit,b.dataset.v69OccDate);if(b.matches('[data-v69-occ-del]'))return delOccurrence(b.dataset.v69OccDel,b.dataset.v69OccDate);if(b.matches('[data-v69-master]'))return editMaster(b.dataset.v69Master);if(b.matches('[data-v69-inline]')){const k=b.dataset.v69Inline,p=b.closest('.v69-row')?.querySelector(`[data-v69-inline-panel="${CSS.escape(k)}"]`);return toggle(b,p,openInline,k)}if(b.matches('[data-v69-forecast]')){const k=b.dataset.v69Forecast,p=b.closest('.card')?.querySelector(`[data-v69-forecast-panel="${CSS.escape(k)}"]`);return toggle(b,p,openForecast,k)}if(b.matches('[data-v69-event-save]'))return saveEvent();if(b.matches('[data-v69-event-close]'))return closeEvent();if(b.matches('[data-v69-occ-save]'))return saveOccurrence();if(b.matches('[data-v69-occ-reset]'))return resetOccurrence();if(b.matches('[data-v69-occ-close]'))return closeOccurrence();
  },true);
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('futureEditorV69')?.hidden){e.preventDefault();closeEvent();return}if(!$('occurrenceEditorV69')?.hidden){e.preventDefault();closeOccurrence()}},true);
  function queue(d=80){clearTimeout(timer);timer=setTimeout(render,d)}
  const prev=window.replaceTreasuryState;if(typeof prev==='function'&&!window.__desktopInteractionReplaceV69){window.__desktopInteractionReplaceV69=true;window.replaceTreasuryState=function(next){const out=prev(next);queue(100);return out}}
  function boot(){installCss();ensureEditors();ensureUi();render();window.addEventListener('focus',()=>queue(100));desktopMq.addEventListener?.('change',()=>queue(100));window.renderDesktopInteractionV69=render}
  function wait(n=0){if(typeof forecast==='function'&&document.querySelector('#cashflow .grid'))return boot();if(n<60)setTimeout(()=>wait(n+1),100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>wait(),{once:true});else wait();
})();
