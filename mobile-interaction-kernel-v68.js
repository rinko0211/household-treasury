(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const mobileMq=window.matchMedia('(max-width:820px)');
  const openInline=new Set(),openForecast=new Set();
  let editEventId=null,editOccurrence=null,renderTimer=null;

  const horizon=()=>Number(document.querySelector('#mobileCashflowV60 [data-v60-h].active')?.dataset.v60H)||30;
  const originalDate=e=>String(e?.occurrence_original_date||e?.date||'');
  const overrideKey=(mid,date)=>`${String(mid)}|${String(date)}`;
  const ensureOverrides=st=>{st.masterOccurrenceOverrides=Array.isArray(st.masterOccurrenceOverrides)?st.masterOccurrenceOverrides:[];return st.masterOccurrenceOverrides};

  function isMasterEvent(e){return !!(e&&(e.source==='master_fixed'||e.source==='master_annual'||e.master_id||e.source_master_id))}
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
    const k=String(e?.future_kind||'').toUpperCase();
    if(k==='INCOME'||Number(e?.amount)>0)return'収入';
    if(k==='NORMAL')return'通常費';if(k==='SPECIAL')return'特別費';if(k==='INVESTMENT')return'投資';if(k==='DEBT')return'負債返済';if(k==='TRANSFER')return'資金移動';
    if(cardMeta(e))return cardMeta(e).kind==='REVOLVING'?'リボ返済':'カード支払';
    return'予定';
  }

  if(typeof generated==='function'&&!window.__mobileKernelGeneratedV68){
    window.__mobileKernelGeneratedV68=true;
    const previousGenerated=generated;
    generated=function generatedMobileKernelV68(days=90){
      const st=stateNow(),map=new Map(ensureOverrides(st).map(o=>[overrideKey(o.master_id,o.occurrence_date),o])),out=[];
      for(const e of previousGenerated(days)||[]){
        if(!isMasterEvent(e)){out.push(e);continue}
        const mid=String(e.master_id||e.source_master_id||''),base=originalDate(e),o=map.get(overrideKey(mid,base));
        if(!o){out.push(e);continue}
        if(o.action==='SKIP')continue;
        if(o.action==='OVERRIDE'){
          out.push({...e,date:o.date||e.date,name:o.name||e.name,amount:Number.isFinite(Number(o.amount))?Number(o.amount):e.amount,occurrence_original_date:base,occurrence_overridden:true,occurrence_override_id:o.id});
          continue;
        }
        out.push(e);
      }
      return out.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
    };
  }

  function cashRows(){try{return typeof forecast==='function'?(forecast(horizon()).rows||[]):[]}catch(e){console.error('v68 forecast',e);return[]}}
  function planRows(){try{return window.householdCardForecastV49?.(180)?.rows||[]}catch{return[]}}
  function sameCard(a,b){try{return window.householdCardIdentityV51?.sameCard?.(a,b)??norm(a)===norm(b)}catch{return norm(a)===norm(b)}}
  function purchaseAmount(p){const v=p?.payment_amount;return v!==null&&v!==''&&Number.isFinite(Number(v))?Math.abs(Number(v)):Math.abs(Number(p?.original_amount)||0)}

  function detailFromForecast(card,ym,kindHint=''){
    const row=planRows().find(r=>sameCard(r.card,card)&&String(r.billing_month||'')===String(ym)&&(kindHint!=='REVOLVING'||String(r.type||'')==='CARD_REVOLVING_PAYMENT'));
    if(!row)return null;
    const items=[...(row.components?.purchases||[]).map(x=>({name:x.name||'カード利用',amount:Number(x.amount)||0,meta:'利用明細'})),...(row.components?.scheduled||[]).map(x=>({name:x.name||'固定費予定',amount:Number(x.amount)||0,meta:'未実績のカード固定費'}))];
    return{kind:String(row.type||'')==='CARD_REVOLVING_PAYMENT'?'REVOLVING':'ESTIMATE',card:row.card,ym:row.billing_month,total:Math.abs(Number(row.amount)||0),known:Number(row.known_purchase_total)||0,scheduled:Number(row.scheduled_fixed_total)||0,balance:row.revolving_balance,items};
  }
  function detailActual(card,ym){
    const st=stateNow(),s=(st.cardSettlements||[]).find(x=>sameCard(x.card,card)&&String(x.due_date||'').slice(0,7)===String(ym));if(!s)return null;
    let items=(st.cardBillingLines||[]).filter(x=>sameCard(x.card,card)&&String(x.billing_month||'')===String(ym)).map(x=>({name:x.merchant_raw||'カード明細',amount:Number(x.billed_amount)||0,meta:[x.purchase_date,x.line_kind==='ADJUSTMENT'?'請求調整':x.category||''].filter(Boolean).join(' · ')}));
    if(!items.length)items=(st.purchaseEvents||[]).filter(p=>String(p.card_settlement_id||'')===String(s.settlement_id||'')).map(p=>({name:p.merchant_raw||'カード利用',amount:purchaseAmount(p),meta:[p.purchase_date,p.category||''].filter(Boolean).join(' · ')}));
    return{kind:'ACTUAL',card:s.card||card,ym,total:Math.abs(Number(s.amount)||0),items};
  }
  function detailFor(meta){return meta.kind==='ACTUAL'?detailActual(meta.card,meta.ym):detailFromForecast(meta.card,meta.ym,meta.kind)}
  function itemsHtml(items){return items?.length?items.map(x=>`<div class="row" style="align-items:flex-start"><div style="min-width:0;flex:1"><b style="overflow-wrap:anywhere">${esc(x.name)}</b>${x.meta?`<div class="tiny">${esc(x.meta)}</div>`:''}</div><b class="amt">${yen(x.amount)}</b></div>`).join(''):'<div class="muted" style="padding:7px 0">明細はまだ取得できていません。</div>'}
  function detailHtml(d){
    if(!d)return'<div class="muted">詳細を取得できませんでした。</div>';
    if(d.kind==='REVOLVING')return`<div class="row"><span>次回リボ返済</span><b>${yen(d.total)}</b></div><div class="row"><span>取込済み利用</span><b>${yen(d.known)}</b></div><div class="row"><span>未実績固定費</span><b>${yen(d.scheduled)}</b></div>${d.balance!==null&&d.balance!==undefined?`<div class="row"><span>現在リボ残高</span><b>${yen(d.balance)}</b></div>`:''}<div class="note" style="margin-top:7px">元本・手数料は取得できない限り推測しません。</div><div class="tiny" style="margin:8px 0 4px">利用・予定内訳 ${d.items.length}件</div>${itemsHtml(d.items)}`;
    if(d.kind==='ESTIMATE')return`<div class="row"><span>見込請求額</span><b>${yen(d.total)}</b></div><div class="row"><span>取込済み利用</span><b>${yen(d.known)}</b></div><div class="row"><span>未実績固定費</span><b>${yen(d.scheduled)}</b></div><div class="tiny" style="margin:8px 0 4px">内訳 ${d.items.length}件</div>${itemsHtml(d.items)}`;
    return`<div class="row"><span>確定請求額</span><b>${yen(d.total)}</b></div><div class="tiny" style="margin:8px 0 4px">内訳 ${d.items.length}件</div>${itemsHtml(d.items)}`;
  }

  function installCss(){if($('mobileKernelStyleV68'))return;const s=document.createElement('style');s.id='mobileKernelStyleV68';s.textContent=`
    @media(max-width:820px){
      #futurePlannerCardV37,#adhocEventListCardV15,#mobileFutureV59,#cardForecastV49,#cardForecastStableV61,#cardForecastStableV62,#cardForecastStableV64{display:none!important}
      #mobileCashflowV60 .v68-actions{display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap;margin-top:8px}
      #mobileCashflowV60 .v68-detail{margin-top:8px;padding:8px;border:1px solid #263755;border-radius:10px}
      #mobileCashflowV60 [data-v66-inline-toggle],#mobileCashflowV60 .v66-inline-detail{display:none!important}
      #futureEditorV68 .v68-bg,#occurrenceEditorV68 .v68-bg{position:fixed;inset:0;background:#0009;z-index:10800}
      #futureEditorV68 .v68-modal,#occurrenceEditorV68 .v68-modal{position:fixed;z-index:10801;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,520px);max-height:90vh;overflow:auto}
      #futureEditorV68 .form,#occurrenceEditorV68 .form{grid-template-columns:1fr!important}
    }
  `;document.head.appendChild(s)}

  function ensureUi(){installCss();const card=$('mobileCashflowV60');if(!card)return null;let add=$('mobileAddFutureV68');if(!add){add=document.createElement('button');add.id='mobileAddFutureV68';add.className='btn';add.style.width='100%';add.style.margin='8px 0 2px';add.textContent='＋将来イベントを追加';card.querySelector('.v60-horizons')?.before(add)}return card}
  function sourceActions(e,st){
    const pid=manualId(e,st);if(pid)return{kind:'EVENT',id:pid};
    if(isMasterEvent(e)){const mid=String(e.master_id||e.source_master_id||''),date=originalDate(e);if(mid&&date)return{kind:'MASTER',id:mid,date}}
    const cm=cardMeta(e);if(cm)return{kind:'CARD',cardKind:cm.kind,card:cm.card,ym:cm.ym};
    return{kind:'GENERATED'};
  }
  function actionHtml(a){
    if(a.kind==='EVENT')return`<button type="button" class="btn secondary" data-v68-event-edit="${esc(a.id)}">編集</button><button type="button" class="btn danger" data-v68-event-del="${esc(a.id)}">削除</button>`;
    if(a.kind==='MASTER')return`<button type="button" class="btn secondary" data-v68-occ-edit="${esc(a.id)}" data-v68-occ-date="${esc(a.date)}">この回を編集</button><button type="button" class="btn danger" data-v68-occ-del="${esc(a.id)}" data-v68-occ-date="${esc(a.date)}">この回を削除</button><button type="button" class="btn secondary" data-v68-master="${esc(a.id)}">元マスタ</button>`;
    if(a.kind==='CARD'){const k=`card:${a.cardKind}:${a.card}:${a.ym}`,d=detailFor({kind:a.cardKind,card:a.card,ym:a.ym});return`<button type="button" class="btn secondary" data-v68-card-toggle="${esc(k)}">内訳 ${d?.items?.length||0}件</button>`}
    return'<span class="tiny">自動生成</span>';
  }
  function renderRows(){
    if(!mobileMq.matches)return;const card=ensureUi(),host=$('mobileCashflowRowsV60');if(!card||!host)return;const st=stateNow(),rows=cashRows().slice(0,80);
    host.innerHTML=rows.length?rows.map(e=>{const a=sourceActions(e,st),amountUnknown=e.amount_unknown||e.amount===null||e.amount===''||!Number.isFinite(Number(e.amount)),amount=Number(e.amount)||0;let detail='';if(a.kind==='CARD'){const k=`card:${a.cardKind}:${a.card}:${a.ym}`,open=openInline.has(k),d=detailFor({kind:a.cardKind,card:a.card,ym:a.ym});detail=`<div class="v68-detail" data-v68-card-panel="${esc(k)}" ${open?'':'hidden'}>${detailHtml(d)}</div>`}return`<div class="v60-row" data-v68-row="${esc(String(e.id||''))}"><div class="v60-top"><div class="v60-name"><b>${esc(e.name||'予定')}</b><div class="tiny">${esc(e.date||'')} · ${esc(kindLabel(e))}${e.occurrence_overridden?' · この回だけ変更済み':''}</div></div><b class="amt ${amountUnknown?'warn':amount<0?'bad':'good'}">${amountUnknown?'未定':`${amount>0?'+':''}${yen(amount)}`}</b></div><div class="v68-actions">${actionHtml(a)}</div>${detail}</div>`}).join(''):'<div class="muted">この期間の予定はありません。</div>';
    renderForecastCard();
  }

  function ensureForecastCard(){let card=$('cardForecastStableV68');const grid=document.querySelector('#cashflow .grid');if(!grid)return null;if(!card){card=document.createElement('div');card.id='cardForecastStableV68';card.className='card full';card.innerHTML='<div class="title">カード見込・返済 <span class="tag">安定表示 v68</span></div><div class="tiny">詳細は対象部分だけを開閉します。Cash Flow全体は再描画しません。</div><div id="cardForecastStableRowsV68" style="margin-top:10px"></div>';const mobile=$('mobileCashflowV60');mobile?.after(card)}return card}
  function renderForecastCard(){const card=ensureForecastCard(),host=$('cardForecastStableRowsV68');if(!card||!host)return;const rows=planRows().slice(0,18);host.innerHTML=rows.length?rows.map(r=>{const meta={kind:String(r.type||'')==='CARD_REVOLVING_PAYMENT'?'REVOLVING':'ESTIMATE',card:r.card||'',ym:r.billing_month||''},k=`forecast:${meta.kind}:${meta.card}:${meta.ym}`,open=openForecast.has(k),d=detailFor(meta);return`<div class="card" style="padding:10px;margin-top:7px"><button type="button" class="btn secondary" style="width:100%;display:flex;justify-content:space-between;gap:8px;align-items:center;text-align:left" data-v68-forecast-toggle="${esc(k)}"><span><b>${esc(meta.card)} · ${esc(meta.ym)}</b> <span class="tiny">${meta.kind==='REVOLVING'?'リボ返済':'見込'}</span></span><span class="amt">${yen(Math.abs(Number(r.amount)||0))} <span data-v68-arrow>${open?'▲':'▼'}</span></span></button><div class="v68-detail" data-v68-forecast-panel="${esc(k)}" ${open?'':'hidden'}>${detailHtml(d)}</div></div>`}).join(''):'<div class="muted">見込請求・返済予定はありません。</div>'}

  function ensureEditors(){
    if(!$('futureEditorV68')){const m=document.createElement('div');m.id='futureEditorV68';m.hidden=true;m.style.display='none';m.innerHTML=`<div class="v68-bg" data-v68-event-close></div><div class="card v68-modal"><div class="title">将来イベントを編集</div><div class="form"><div class="field"><label>日付</label><input id="v68EventDate" type="date"></div><div class="field"><label>内容</label><input id="v68EventName"></div><div class="field"><label>種類</label><select id="v68EventKind"><option value="INCOME">収入</option><option value="NORMAL">通常費</option><option value="SPECIAL">特別費</option><option value="INVESTMENT">投資</option><option value="DEBT">負債返済</option><option value="TRANSFER">資金移動</option></select></div><div class="field"><label>金額</label><input id="v68EventAmount" type="number" min="0"></div><div class="field"><label>確度</label><select id="v68EventCert"><option value="CONFIRMED">確定</option><option value="ESTIMATED">概算</option><option value="TBD">未定</option></select></div><div class="field"><label>繰り返し</label><select id="v68EventRecurring"><option value="NONE">単発</option><option value="MONTHLY">毎月</option><option value="YEARLY">毎年</option></select></div></div><div class="controls" style="margin-top:12px"><button type="button" class="btn" data-v68-event-save>保存</button><button type="button" class="btn secondary" data-v68-event-close>キャンセル</button></div></div>`;document.body.appendChild(m)}
    if(!$('occurrenceEditorV68')){const m=document.createElement('div');m.id='occurrenceEditorV68';m.hidden=true;m.style.display='none';m.innerHTML=`<div class="v68-bg" data-v68-occ-close></div><div class="card v68-modal"><div class="title">この回だけ編集</div><div class="note" style="margin-bottom:10px">固定費マスタ本体は変更せず、この発生分だけ上書きします。</div><div class="form"><div class="field"><label>日付</label><input id="v68OccDate" type="date"></div><div class="field"><label>内容</label><input id="v68OccName"></div><div class="field"><label>金額</label><input id="v68OccAmount" type="number" min="0"></div></div><div class="controls" style="margin-top:12px;flex-wrap:wrap"><button type="button" class="btn" data-v68-occ-save>この回だけ保存</button><button type="button" class="btn secondary" data-v68-occ-reset>元の予定に戻す</button><button type="button" class="btn secondary" data-v68-occ-close>キャンセル</button></div></div>`;document.body.appendChild(m)}
  }
  function show(id){const m=$(id);if(!m)return;m.hidden=false;m.style.display='block'}
  function hide(id){const m=$(id);if(!m)return;m.hidden=true;m.style.display='none'}
  function eventKind(e){const k=String(e?.future_kind||'').toUpperCase();return['INCOME','NORMAL','SPECIAL','INVESTMENT','DEBT','TRANSFER'].includes(k)?k:(Number(e?.amount)>0?'INCOME':'SPECIAL')}
  function openEventEditor(id){ensureEditors();const e=(stateNow().events||[]).find(x=>String(x.id)===String(id));if(!e)return alert('編集対象の予定が見つかりません。');editEventId=String(id);$('v68EventDate').value=e.date||'';$('v68EventName').value=e.name||'';$('v68EventKind').value=eventKind(e);$('v68EventAmount').value=e.amount===null||e.amount===''?'':String(Math.abs(Number(e.amount)||0));$('v68EventCert').value=String(e.certainty||'ESTIMATED').toUpperCase();$('v68EventRecurring').value=String(e.recurring||'NONE').toUpperCase();show('futureEditorV68')}
  function closeEventEditor(){hide('futureEditorV68');editEventId=null}
  function saveEvent(){const st=stateNow(),e=(st.events||[]).find(x=>String(x.id)===String(editEventId));if(!e)return alert('保存対象の予定が見つかりません。');const date=$('v68EventDate').value,name=$('v68EventName').value.trim(),kind=$('v68EventKind').value,raw=$('v68EventAmount').value,cert=$('v68EventCert').value,rec=$('v68EventRecurring').value;if(!date||!name)return alert('日付と内容を確認してください。');const n=raw===''?null:Number(raw);if(n!==null&&!Number.isFinite(n))return alert('金額を確認してください。');Object.assign(e,{date,name,amount:n===null?null:(kind==='INCOME'?Math.abs(n):-Math.abs(n)),type:`FUTURE_${kind}`,future_kind:kind,expense_scope:kind==='INCOME'?null:kind,certainty:cert,estimated:cert!=='CONFIRMED',recurring:rec,updatedAt:new Date().toISOString()});persist(st,'将来イベント保存');closeEventEditor()}
  function deleteEvent(id){const st=stateNow(),e=(st.events||[]).find(x=>String(x.id)===String(id));if(!e)return alert('削除対象の予定が見つかりません。');if(!confirm(`「${e.name||'この予定'}」を削除しますか？`))return;st.events=(st.events||[]).filter(x=>String(x.id)!==String(id));persist(st,'将来イベント削除')}

  function findOverride(st,mid,date){return ensureOverrides(st).find(o=>overrideKey(o.master_id,o.occurrence_date)===overrideKey(mid,date))||null}
  function baseMasterRow(mid,date){return cashRows().find(e=>isMasterEvent(e)&&String(e.master_id||e.source_master_id||'')===String(mid)&&originalDate(e)===String(date))||null}
  function openOccurrence(mid,date){ensureEditors();const st=stateNow(),m=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(mid)),o=findOverride(st,mid,date),e=baseMasterRow(mid,date);if(!m&&!e)return alert('元の固定マスタが見つかりません。');editOccurrence={mid:String(mid),date:String(date),sign:Number(e?.amount)<0?-1:1};$('v68OccDate').value=o?.date||e?.date||date;$('v68OccName').value=o?.name||e?.name||m?.name||'';$('v68OccAmount').value=String(Math.abs(Number(o?.amount)||Number(e?.amount)||Number(m?.amount)||0));show('occurrenceEditorV68')}
  function closeOccurrence(){hide('occurrenceEditorV68');editOccurrence=null}
  function saveOccurrence(){if(!editOccurrence)return;const date=$('v68OccDate').value,name=$('v68OccName').value.trim(),raw=Number($('v68OccAmount').value);if(!date||!name||!Number.isFinite(raw)||raw<0)return alert('日付・内容・金額を確認してください。');const st=stateNow(),now=new Date().toISOString();st.masterOccurrenceOverrides=ensureOverrides(st).filter(o=>overrideKey(o.master_id,o.occurrence_date)!==overrideKey(editOccurrence.mid,editOccurrence.date));st.masterOccurrenceOverrides.push({id:`occ:${crypto.randomUUID()}`,master_id:editOccurrence.mid,occurrence_date:editOccurrence.date,action:'OVERRIDE',date,name,amount:(editOccurrence.sign<0?-1:1)*Math.abs(raw),createdAt:now,updatedAt:now,version:1});st.masterOccurrenceOverridesUpdatedAt=now;persist(st,'固定費この回だけ編集');closeOccurrence()}
  function deleteOccurrence(mid,date){const st=stateNow(),m=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(mid));if(!confirm(`「${m?.name||'この予定'}」の ${date} 分だけ削除しますか？\n元マスタと翌月以降は残ります。`))return;const now=new Date().toISOString();st.masterOccurrenceOverrides=ensureOverrides(st).filter(o=>overrideKey(o.master_id,o.occurrence_date)!==overrideKey(mid,date));st.masterOccurrenceOverrides.push({id:`occ:${crypto.randomUUID()}`,master_id:String(mid),occurrence_date:String(date),action:'SKIP',createdAt:now,updatedAt:now,version:1});st.masterOccurrenceOverridesUpdatedAt=now;persist(st,'固定費この回だけ削除')}
  function resetOccurrence(){if(!editOccurrence)return;const st=stateNow(),now=new Date().toISOString();st.masterOccurrenceOverrides=ensureOverrides(st).filter(o=>overrideKey(o.master_id,o.occurrence_date)!==overrideKey(editOccurrence.mid,editOccurrence.date));st.masterOccurrenceOverridesUpdatedAt=now;persist(st,'固定費この回の変更解除');closeOccurrence()}
  function editMaster(id){document.querySelector('[data-page="settings"]')?.click();let tries=0;const seek=()=>{try{window.renderSemanticUiV48?.()}catch{}const box=document.querySelector(`[data-v48-fixed="${CSS.escape(String(id))}"]`)||document.querySelector(`[data-v43-save="${CSS.escape(String(id))}"]`)?.closest('.card');if(box){if('open'in box)box.open=true;box.scrollIntoView({behavior:'smooth',block:'center'});return}if(++tries<30)setTimeout(seek,100);else alert('固定マスタは存在しますが、編集欄を開けませんでした。Settingsを開き直してください。')};setTimeout(seek,50)}
  function addFuture(){const legacy=$('futureAddV37');if(legacy){legacy.click();return}const old=$('addEvent');if(old){old.click();return}alert('予定追加画面を開けませんでした。')}

  function persist(st,msg){window.treasuryRecoverySnapshot?.(`${msg}直前`);window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();window.setTreasurySaveStatus?.(`${msg}・同期中`);window.cloudSyncOnLocalSave?.();try{window.renderForecastV38?.()}catch{}scheduleRender(80)}
  function togglePanel(button,panel,set,key){if(!panel)return;const open=panel.hidden;panel.hidden=!open;if(open)set.add(key);else set.delete(key);const arrow=button.querySelector('[data-v68-arrow]');if(arrow)arrow.textContent=open?'▲':'▼'}

  document.addEventListener('click',e=>{
    const t=e.target;
    const own=t.closest?.('[data-v68-event-edit],[data-v68-event-del],[data-v68-occ-edit],[data-v68-occ-del],[data-v68-master],[data-v68-card-toggle],[data-v68-forecast-toggle],[data-v68-event-save],[data-v68-event-close],[data-v68-occ-save],[data-v68-occ-reset],[data-v68-occ-close],#mobileAddFutureV68');
    if(own){e.preventDefault();e.stopImmediatePropagation();
      if(own.id==='mobileAddFutureV68')return addFuture();
      if(own.matches('[data-v68-event-edit]'))return openEventEditor(own.dataset.v68EventEdit);
      if(own.matches('[data-v68-event-del]'))return deleteEvent(own.dataset.v68EventDel);
      if(own.matches('[data-v68-occ-edit]'))return openOccurrence(own.dataset.v68OccEdit,own.dataset.v68OccDate);
      if(own.matches('[data-v68-occ-del]'))return deleteOccurrence(own.dataset.v68OccDel,own.dataset.v68OccDate);
      if(own.matches('[data-v68-master]'))return editMaster(own.dataset.v68Master);
      if(own.matches('[data-v68-card-toggle]')){const k=own.dataset.v68CardToggle,p=own.closest('.v60-row')?.querySelector(`[data-v68-card-panel="${CSS.escape(k)}"]`);return togglePanel(own,p,openInline,k)}
      if(own.matches('[data-v68-forecast-toggle]')){const k=own.dataset.v68ForecastToggle,p=own.closest('.card')?.querySelector(`[data-v68-forecast-panel="${CSS.escape(k)}"]`);return togglePanel(own,p,openForecast,k)}
      if(own.matches('[data-v68-event-save]'))return saveEvent();if(own.matches('[data-v68-event-close]'))return closeEventEditor();
      if(own.matches('[data-v68-occ-save]'))return saveOccurrence();if(own.matches('[data-v68-occ-reset]'))return resetOccurrence();if(own.matches('[data-v68-occ-close]'))return closeOccurrence();
    }
    if(t.closest?.('#mobileCashflowV60 [data-v60-h],[data-page="cashflow"]'))scheduleRender(40);
  },true);

  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('futureEditorV68')?.hidden){e.preventDefault();closeEventEditor();return}if(!$('occurrenceEditorV68')?.hidden){e.preventDefault();closeOccurrence()}},true);

  function scheduleRender(delay=60){clearTimeout(renderTimer);renderTimer=setTimeout(renderRows,delay)}
  const prevReplace=window.replaceTreasuryState;if(typeof prevReplace==='function'&&!window.__mobileKernelReplaceV68){window.__mobileKernelReplaceV68=true;window.replaceTreasuryState=function replaceTreasuryStateMobileV68(next){const out=prevReplace(next);scheduleRender(100);return out}}
  function boot(){ensureEditors();installCss();ensureUi();scheduleRender(120);window.addEventListener('focus',()=>scheduleRender(100));mobileMq.addEventListener?.('change',()=>scheduleRender(100));window.renderMobileInteractionV68=renderRows}
  function wait(n=0){if($('mobileCashflowV60')&&typeof forecast==='function')return boot();if(n<60)setTimeout(()=>wait(n+1),100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>wait(),{once:true});else wait();
})();
