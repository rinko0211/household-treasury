(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const iso=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const mobileMq=window.matchMedia('(max-width:820px)');
  const openInline=new Set(),openForecast=new Set();
  let editEventId=null,editOccurrence=null,renderTimer=null,planCache=null;

  const horizon=()=>Number(document.querySelector('#mobileCashflowV60 [data-v60-h].active')?.dataset.v60H)||30;
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
    if(k==='NORMAL')return'通常費';if(k==='SPECIAL')return'特別費';if(k==='INVESTMENT')return'投資';if(k==='DEBT')return'負債返済';if(k==='TRANSFER')return'資金移動';
    return'予定';
  }
  function eventKind(e){const k=String(e?.future_kind||'').toUpperCase();return['INCOME','NORMAL','SPECIAL','INVESTMENT','DEBT','TRANSFER'].includes(k)?k:(Number(e?.amount)>0?'INCOME':'SPECIAL')}

  // v70 owns occurrence override application after retiring the v68 owner.
  if(typeof generated==='function'&&!window.__mobileKernelGeneratedV70){
    window.__mobileKernelGeneratedV70=true;
    const previousGenerated=generated;
    generated=function generatedMobileKernelV70(days=90){
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

  function cashRows(){try{return typeof forecast==='function'?(forecast(horizon()).rows||[]):[]}catch(e){console.error('v70 forecast',e);return[]}}
  function planRows(){
    try{
      const now=performance.now();
      if(planCache&&now-planCache.at<750)return planCache.rows;
      const rows=window.householdCardForecastV49?.(180)?.rows||[];
      planCache={at:now,rows};
      return rows;
    }catch{return[]}
  }
  function sameCard(a,b){try{return window.householdCardIdentityV51?.sameCard?.(a,b)??norm(a)===norm(b)}catch{return norm(a)===norm(b)}}
  function purchaseAmount(p){const v=p?.payment_amount;return v!==null&&v!==''&&Number.isFinite(Number(v))?Math.abs(Number(v)):Math.abs(Number(p?.original_amount)||0)}
  function detailFromForecast(meta){
    const row=planRows().find(r=>sameCard(r.card,meta.card)&&String(r.billing_month||'')===String(meta.ym)&&(meta.kind!=='REVOLVING'||String(r.type||'')==='CARD_REVOLVING_PAYMENT'));
    if(!row)return null;
    const items=[...(row.components?.purchases||[]).map(x=>({name:x.name||'カード利用',amount:Number(x.amount)||0,meta:'利用明細'})),...(row.components?.scheduled||[]).map(x=>({name:x.name||'固定費予定',amount:Number(x.amount)||0,meta:'未実績のカード固定費'}))];
    return{kind:String(row.type||'')==='CARD_REVOLVING_PAYMENT'?'REVOLVING':'ESTIMATE',card:row.card,ym:row.billing_month,total:Math.abs(Number(row.amount)||0),known:Number(row.known_purchase_total)||0,scheduled:Number(row.scheduled_fixed_total)||0,balance:row.revolving_balance,items};
  }
  function detailActual(meta){
    const st=stateNow(),s=(st.cardSettlements||[]).find(x=>sameCard(x.card,meta.card)&&String(x.due_date||'').slice(0,7)===String(meta.ym));if(!s)return null;
    let items=(st.cardBillingLines||[]).filter(x=>sameCard(x.card,meta.card)&&String(x.billing_month||'')===String(meta.ym)).map(x=>({name:x.merchant_raw||'カード明細',amount:Number(x.billed_amount)||0,meta:[x.purchase_date,x.line_kind==='ADJUSTMENT'?'請求調整':x.category||''].filter(Boolean).join(' · ')}));
    if(!items.length)items=(st.purchaseEvents||[]).filter(p=>String(p.card_settlement_id||'')===String(s.settlement_id||'')).map(p=>({name:p.merchant_raw||'カード利用',amount:purchaseAmount(p),meta:[p.purchase_date,p.category||''].filter(Boolean).join(' · ')}));
    return{kind:'ACTUAL',card:s.card||meta.card,ym:meta.ym,total:Math.abs(Number(s.amount)||0),items};
  }
  function detailFor(meta){return meta.kind==='ACTUAL'?detailActual(meta):detailFromForecast(meta)}
  function itemsHtml(items){return items?.length?items.map(x=>`<div class="row" style="align-items:flex-start"><div style="min-width:0;flex:1"><b style="overflow-wrap:anywhere">${esc(x.name)}</b>${x.meta?`<div class="tiny">${esc(x.meta)}</div>`:''}</div><b class="amt">${yen(x.amount)}</b></div>`).join(''):'<div class="muted" style="padding:7px 0">明細はまだ取得できていません。</div>'}
  function detailHtml(d){
    if(!d)return'<div class="muted">詳細を取得できませんでした。</div>';
    if(d.kind==='REVOLVING')return`<div class="row"><span>次回リボ返済</span><b>${yen(d.total)}</b></div><div class="row"><span>取込済み利用</span><b>${yen(d.known)}</b></div><div class="row"><span>未実績固定費</span><b>${yen(d.scheduled)}</b></div>${d.balance!==null&&d.balance!==undefined?`<div class="row"><span>現在リボ残高</span><b>${yen(d.balance)}</b></div>`:''}<div class="note" style="margin-top:7px">元本・手数料は取得できない限り推測しません。</div><div class="tiny" style="margin:8px 0 4px">利用・予定内訳 ${d.items.length}件</div>${itemsHtml(d.items)}`;
    if(d.kind==='ESTIMATE')return`<div class="row"><span>見込請求額</span><b>${yen(d.total)}</b></div><div class="row"><span>取込済み利用</span><b>${yen(d.known)}</b></div><div class="row"><span>未実績固定費</span><b>${yen(d.scheduled)}</b></div><div class="tiny" style="margin:8px 0 4px">内訳 ${d.items.length}件</div>${itemsHtml(d.items)}`;
    return`<div class="row"><span>確定請求額</span><b>${yen(d.total)}</b></div><div class="tiny" style="margin:8px 0 4px">内訳 ${d.items.length}件</div>${itemsHtml(d.items)}`;
  }

  function installCss(){if($('mobileInteractionStyleV70'))return;const s=document.createElement('style');s.id='mobileInteractionStyleV70';s.textContent=`
    @media(max-width:820px){
      #futurePlannerCardV37,#adhocEventListCardV15,#mobileFutureV59,#cardForecastV49,#cardForecastStableV61,#cardForecastStableV62,#cardForecastStableV64,#cardForecastStableV68{display:none!important}
      #mobileCashflowV60 .v70-actions{display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap;margin-top:8px}
      #mobileCashflowV60 .v70-detail,#cardForecastStableV70 .v70-detail{margin-top:8px;padding:8px;border:1px solid #263755;border-radius:10px}
      #futureEditorV70 .v70-bg,#occurrenceEditorV70 .v70-bg{position:fixed;inset:0;background:#0009;z-index:11000}
      #futureEditorV70 .v70-modal,#occurrenceEditorV70 .v70-modal{position:fixed;z-index:11001;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,520px);max-height:90vh;overflow:auto}
      #futureEditorV70 .form,#occurrenceEditorV70 .form{grid-template-columns:1fr!important}
    }
  `;document.head.appendChild(s)}
  function ensureUi(){
    installCss();const card=$('mobileCashflowV60');if(!card)return null;
    let add=$('mobileAddFutureV70');if(!add){add=document.createElement('button');add.id='mobileAddFutureV70';add.type='button';add.className='btn';add.style.width='100%';add.style.margin='8px 0 2px';add.textContent='＋将来イベントを追加';card.querySelector('.v60-horizons')?.before(add)}
    return card;
  }
  function sourceAction(e,st){
    const pid=manualId(e,st);if(pid)return{kind:'EVENT',id:pid};
    if(isMasterEvent(e)){const id=String(e.master_id||e.source_master_id||''),date=originalDate(e);if(id&&date)return{kind:'MASTER',id,date}}
    const meta=cardMeta(e);if(meta)return{kind:'CARD',meta};
    return{kind:'GENERATED'};
  }
  function actionHtml(a){
    if(a.kind==='EVENT')return`<button type="button" class="btn secondary" data-v70-event-edit="${esc(a.id)}">編集</button><button type="button" class="btn danger" data-v70-event-del="${esc(a.id)}">削除</button>`;
    if(a.kind==='MASTER')return`<button type="button" class="btn secondary" data-v70-occ-edit="${esc(a.id)}" data-v70-occ-date="${esc(a.date)}">この回を編集</button><button type="button" class="btn danger" data-v70-occ-del="${esc(a.id)}" data-v70-occ-date="${esc(a.date)}">この回を削除</button><button type="button" class="btn secondary" data-v70-master="${esc(a.id)}">元マスタ</button>`;
    if(a.kind==='CARD'){const k=`inline:${a.meta.kind}:${a.meta.card}:${a.meta.ym}`,d=detailFor(a.meta);return`<button type="button" class="btn secondary" data-v70-inline="${esc(k)}">内訳 ${d?.items?.length||0}件</button>`}
    return'<span class="tiny">自動生成</span>';
  }
  function renderRows(){
    if(!mobileMq.matches)return;const card=ensureUi(),host=$('mobileCashflowRowsV60');if(!card||!host)return;
    planCache=null;const st=stateNow(),rows=cashRows().slice(0,80);planRows();
    host.innerHTML=rows.length?rows.map(e=>{
      const a=sourceAction(e,st),unknown=e.amount_unknown||e.amount===null||e.amount===''||!Number.isFinite(Number(e.amount)),amount=Number(e.amount)||0;let detail='';
      if(a.kind==='CARD'){const k=`inline:${a.meta.kind}:${a.meta.card}:${a.meta.ym}`,d=detailFor(a.meta);detail=`<div class="v70-detail" data-v70-inline-panel="${esc(k)}" ${openInline.has(k)?'':'hidden'}>${detailHtml(d)}</div>`}
      return`<div class="v60-row" data-v70-row="${esc(String(e.id||''))}"><div class="v60-top"><div class="v60-name"><b>${esc(e.name||'予定')}</b><div class="tiny">${esc(e.date||'')} · ${esc(kindLabel(e))}${e.occurrence_overridden?' · この回だけ変更済み':''}</div></div><b class="amt ${unknown?'warn':amount<0?'bad':'good'}">${unknown?'未定':`${amount>0?'+':''}${yen(amount)}`}</b></div><div class="v70-actions">${actionHtml(a)}</div>${detail}</div>`;
    }).join(''):'<div class="muted">この期間の予定はありません。</div>';
    renderForecastCard();
  }
  function ensureForecastCard(){
    const grid=document.querySelector('#cashflow .grid');if(!grid)return null;let card=$('cardForecastStableV70');
    if(!card){card=document.createElement('div');card.id='cardForecastStableV70';card.className='card full';card.innerHTML='<div class="title">カード見込・返済 <span class="tag">v70</span></div><div class="tiny">詳細の開閉では予測を再計算しません。</div><div id="cardForecastStableRowsV70" style="margin-top:10px"></div>';$('mobileCashflowV60')?.after(card)}
    return card;
  }
  function renderForecastCard(){
    const card=ensureForecastCard(),host=$('cardForecastStableRowsV70');if(!card||!host)return;const rows=planRows().slice(0,18);
    host.innerHTML=rows.length?rows.map(r=>{const meta={kind:String(r.type||'')==='CARD_REVOLVING_PAYMENT'?'REVOLVING':'ESTIMATE',card:r.card||'',ym:r.billing_month||''},k=`forecast:${meta.kind}:${meta.card}:${meta.ym}`,d=detailFor(meta);return`<div class="card" style="padding:10px;margin-top:7px"><button type="button" class="btn secondary" style="width:100%;display:flex;justify-content:space-between;gap:8px;align-items:center;text-align:left" data-v70-forecast="${esc(k)}"><span><b>${esc(meta.card)} · ${esc(meta.ym)}</b> <span class="tiny">${meta.kind==='REVOLVING'?'リボ返済':'見込'}</span></span><span class="amt">${yen(Math.abs(Number(r.amount)||0))} <span data-v70-arrow>${openForecast.has(k)?'▲':'▼'}</span></span></button><div class="v70-detail" data-v70-forecast-panel="${esc(k)}" ${openForecast.has(k)?'':'hidden'}>${detailHtml(d)}</div></div>`}).join(''):'<div class="muted">見込請求・返済予定はありません。</div>';
  }

  function ensureEditors(){
    if(!$('futureEditorV70')){const m=document.createElement('div');m.id='futureEditorV70';m.hidden=true;m.style.display='none';m.innerHTML=`<div class="v70-bg" data-v70-event-close></div><div class="card v70-modal"><div class="title" data-v70-event-title>将来イベント</div><div class="form"><div class="field"><label>日付</label><input id="v70EventDate" type="date"></div><div class="field"><label>内容</label><input id="v70EventName"></div><div class="field"><label>種類</label><select id="v70EventKind"><option value="INCOME">収入</option><option value="NORMAL">通常費</option><option value="SPECIAL">特別費</option><option value="INVESTMENT">投資</option><option value="DEBT">負債返済</option><option value="TRANSFER">資金移動</option></select></div><div class="field"><label>金額</label><input id="v70EventAmount" type="number" min="0" placeholder="未定なら空欄"></div><div class="field"><label>確度</label><select id="v70EventCert"><option value="CONFIRMED">確定</option><option value="ESTIMATED">概算</option><option value="TBD">未定</option></select></div><div class="field"><label>繰り返し</label><select id="v70EventRecurring"><option value="NONE">単発</option><option value="MONTHLY">毎月</option><option value="YEARLY">毎年</option></select></div><div class="field"><label>メモ</label><input id="v70EventNote"></div></div><div class="controls" style="margin-top:12px"><button type="button" class="btn" data-v70-event-save>保存</button><button type="button" class="btn secondary" data-v70-event-close>キャンセル</button></div></div>`;document.body.appendChild(m)}
    if(!$('occurrenceEditorV70')){const m=document.createElement('div');m.id='occurrenceEditorV70';m.hidden=true;m.style.display='none';m.innerHTML=`<div class="v70-bg" data-v70-occ-close></div><div class="card v70-modal"><div class="title">この回だけ編集</div><div class="note" style="margin-bottom:10px">固定費マスタ本体は変更せず、この発生分だけ上書きします。</div><div class="form"><div class="field"><label>日付</label><input id="v70OccDate" type="date"></div><div class="field"><label>内容</label><input id="v70OccName"></div><div class="field"><label>金額</label><input id="v70OccAmount" type="number" min="0"></div></div><div class="controls" style="margin-top:12px;flex-wrap:wrap"><button type="button" class="btn" data-v70-occ-save>この回だけ保存</button><button type="button" class="btn secondary" data-v70-occ-reset>元の予定に戻す</button><button type="button" class="btn secondary" data-v70-occ-close>キャンセル</button></div></div>`;document.body.appendChild(m)}
  }
  function show(id){const m=$(id);if(!m)return;m.hidden=false;m.style.display='block'}
  function hide(id){const m=$(id);if(!m)return;m.hidden=true;m.style.display='none'}
  function openEvent(id=''){
    ensureEditors();const e=id?(stateNow().events||[]).find(x=>String(x.id)===String(id)):null;if(id&&!e)return alert('編集対象の予定が見つかりません。');editEventId=e?String(e.id):null;
    $('[data-v70-event-title]')?.replaceChildren(document.createTextNode(e?'将来イベントを編集':'将来イベントを追加'));
    $('v70EventDate').value=e?.date||iso(new Date());$('v70EventName').value=e?.name||'';$('v70EventKind').value=e?eventKind(e):'SPECIAL';$('v70EventAmount').value=e&&(e.amount!==null&&e.amount!==''&&Number.isFinite(Number(e.amount)))?String(Math.abs(Number(e.amount))):'';$('v70EventCert').value=String(e?.certainty||'ESTIMATED').toUpperCase();$('v70EventRecurring').value=String(e?.recurring||'NONE').toUpperCase();$('v70EventNote').value=e?.note||'';show('futureEditorV70');
  }
  function closeEvent(){hide('futureEditorV70');editEventId=null}
  function saveEvent(){
    const st=stateNow();st.events=Array.isArray(st.events)?st.events:[];let e=editEventId?st.events.find(x=>String(x.id)===String(editEventId)):null;
    const date=$('v70EventDate').value,name=$('v70EventName').value.trim(),kind=$('v70EventKind').value,raw=$('v70EventAmount').value,cert=$('v70EventCert').value,rec=$('v70EventRecurring').value,note=$('v70EventNote').value.trim();if(!date||!name)return alert('日付と内容を確認してください。');const n=raw===''?null:Number(raw);if(n!==null&&!Number.isFinite(n))return alert('金額を確認してください。');
    const isNew=!e;if(!e){e={id:crypto.randomUUID(),createdAt:new Date().toISOString()};st.events.push(e)}
    Object.assign(e,{date,name,amount:n===null?null:(kind==='INCOME'?Math.abs(n):-Math.abs(n)),type:`FUTURE_${kind}`,future_kind:kind,expense_scope:kind==='INCOME'?null:kind,certainty:cert,estimated:cert!=='CONFIRMED',recurring:rec,note,updatedAt:new Date().toISOString(),futurePlannerVersion:1});persist(st,isNew?'将来イベント追加':'将来イベント保存');closeEvent();
  }
  function deleteEvent(id){const st=stateNow(),e=(st.events||[]).find(x=>String(x.id)===String(id));if(!e)return alert('削除対象の予定が見つかりません。');if(!confirm(`「${e.name||'この予定'}」を削除しますか？`))return;st.events=(st.events||[]).filter(x=>String(x.id)!==String(id));persist(st,'将来イベント削除')}

  function findOverride(st,mid,date){return ensureOverrides(st).find(o=>overrideKey(o.master_id,o.occurrence_date)===overrideKey(mid,date))||null}
  function baseMasterRow(mid,date){return cashRows().find(e=>isMasterEvent(e)&&String(e.master_id||e.source_master_id||'')===String(mid)&&originalDate(e)===String(date))||null}
  function openOccurrence(mid,date){ensureEditors();const st=stateNow(),m=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(mid)),o=findOverride(st,mid,date),e=baseMasterRow(mid,date);if(!m&&!e)return alert('元の固定マスタが見つかりません。');editOccurrence={mid:String(mid),date:String(date),sign:Number(e?.amount)<0?-1:1};$('v70OccDate').value=o?.date||e?.date||date;$('v70OccName').value=o?.name||e?.name||m?.name||'';$('v70OccAmount').value=String(Math.abs(Number(o?.amount)||Number(e?.amount)||Number(m?.amount)||0));show('occurrenceEditorV70')}
  function closeOccurrence(){hide('occurrenceEditorV70');editOccurrence=null}
  function saveOccurrence(){if(!editOccurrence)return;const date=$('v70OccDate').value,name=$('v70OccName').value.trim(),raw=Number($('v70OccAmount').value);if(!date||!name||!Number.isFinite(raw)||raw<0)return alert('日付・内容・金額を確認してください。');const st=stateNow(),now=new Date().toISOString();st.masterOccurrenceOverrides=ensureOverrides(st).filter(o=>overrideKey(o.master_id,o.occurrence_date)!==overrideKey(editOccurrence.mid,editOccurrence.date));st.masterOccurrenceOverrides.push({id:`occ:${crypto.randomUUID()}`,master_id:editOccurrence.mid,occurrence_date:editOccurrence.date,action:'OVERRIDE',date,name,amount:(editOccurrence.sign<0?-1:1)*Math.abs(raw),createdAt:now,updatedAt:now,version:1});st.masterOccurrenceOverridesUpdatedAt=now;persist(st,'固定費この回だけ編集');closeOccurrence()}
  function deleteOccurrence(mid,date){const st=stateNow(),m=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(mid));if(!confirm(`「${m?.name||'この予定'}」の ${date} 分だけ削除しますか？\n元マスタと翌月以降は残ります。`))return;const now=new Date().toISOString();st.masterOccurrenceOverrides=ensureOverrides(st).filter(o=>overrideKey(o.master_id,o.occurrence_date)!==overrideKey(mid,date));st.masterOccurrenceOverrides.push({id:`occ:${crypto.randomUUID()}`,master_id:String(mid),occurrence_date:String(date),action:'SKIP',createdAt:now,updatedAt:now,version:1});st.masterOccurrenceOverridesUpdatedAt=now;persist(st,'固定費この回だけ削除')}
  function resetOccurrence(){if(!editOccurrence)return;const st=stateNow(),now=new Date().toISOString();st.masterOccurrenceOverrides=ensureOverrides(st).filter(o=>overrideKey(o.master_id,o.occurrence_date)!==overrideKey(editOccurrence.mid,editOccurrence.date));st.masterOccurrenceOverridesUpdatedAt=now;persist(st,'固定費この回の変更解除');closeOccurrence()}
  function editMaster(id){document.querySelector('[data-page="settings"]')?.click();let tries=0;const seek=()=>{try{window.renderSemanticUiV48?.()}catch{}const box=document.querySelector(`[data-v48-fixed="${CSS.escape(String(id))}"]`)||document.querySelector(`[data-v43-save="${CSS.escape(String(id))}"]`)?.closest('.card');if(box){if('open'in box)box.open=true;box.scrollIntoView({behavior:'smooth',block:'center'});return}if(++tries<25)setTimeout(seek,80);else alert('固定マスタは存在しますが、編集欄を開けませんでした。Settingsを開き直してください。')};setTimeout(seek,40)}

  function persist(st,msg){planCache=null;window.treasuryRecoverySnapshot?.(`${msg}直前`);window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();window.setTreasurySaveStatus?.(`${msg}・同期中`);window.cloudSyncOnLocalSave?.();scheduleRender(50)}
  function toggle(button,panel,set,key){if(!panel)return;const open=panel.hidden;panel.hidden=!open;if(open)set.add(key);else set.delete(key);const arrow=button.querySelector('[data-v70-arrow]');if(arrow)arrow.textContent=open?'▲':'▼'}

  document.addEventListener('click',e=>{
    if(!mobileMq.matches)return;const t=e.target;
    const own=t.closest?.('#mobileAddFutureV70,[data-v70-event-edit],[data-v70-event-del],[data-v70-occ-edit],[data-v70-occ-del],[data-v70-master],[data-v70-inline],[data-v70-forecast],[data-v70-event-save],[data-v70-event-close],[data-v70-occ-save],[data-v70-occ-reset],[data-v70-occ-close]');
    if(own){e.preventDefault();e.stopImmediatePropagation();
      if(own.id==='mobileAddFutureV70')return openEvent('');
      if(own.matches('[data-v70-event-edit]'))return openEvent(own.dataset.v70EventEdit);
      if(own.matches('[data-v70-event-del]'))return deleteEvent(own.dataset.v70EventDel);
      if(own.matches('[data-v70-occ-edit]'))return openOccurrence(own.dataset.v70OccEdit,own.dataset.v70OccDate);
      if(own.matches('[data-v70-occ-del]'))return deleteOccurrence(own.dataset.v70OccDel,own.dataset.v70OccDate);
      if(own.matches('[data-v70-master]'))return editMaster(own.dataset.v70Master);
      if(own.matches('[data-v70-inline]')){const k=own.dataset.v70Inline,p=own.closest('.v60-row')?.querySelector(`[data-v70-inline-panel="${CSS.escape(k)}"]`);return toggle(own,p,openInline,k)}
      if(own.matches('[data-v70-forecast]')){const k=own.dataset.v70Forecast,p=own.closest('.card')?.querySelector(`[data-v70-forecast-panel="${CSS.escape(k)}"]`);return toggle(own,p,openForecast,k)}
      if(own.matches('[data-v70-event-save]'))return saveEvent();if(own.matches('[data-v70-event-close]'))return closeEvent();
      if(own.matches('[data-v70-occ-save]'))return saveOccurrence();if(own.matches('[data-v70-occ-reset]'))return resetOccurrence();if(own.matches('[data-v70-occ-close]'))return closeOccurrence();
    }
    if(t.closest?.('#mobileCashflowV60 [data-v60-h],[data-page="cashflow"]'))scheduleRender(30);
  },true);
  document.addEventListener('keydown',e=>{if(e.key!=='Escape'||!mobileMq.matches)return;if(!$('futureEditorV70')?.hidden){e.preventDefault();closeEvent();return}if(!$('occurrenceEditorV70')?.hidden){e.preventDefault();closeOccurrence()}},true);

  function scheduleRender(delay=50){clearTimeout(renderTimer);renderTimer=setTimeout(renderRows,delay)}
  const prevReplace=window.replaceTreasuryState;
  if(typeof prevReplace==='function'&&!window.__mobileInteractionReplaceV70){window.__mobileInteractionReplaceV70=true;window.replaceTreasuryState=function replaceTreasuryStateMobileV70(next){planCache=null;const out=prevReplace(next);scheduleRender(50);return out}}
  function boot(){ensureEditors();installCss();ensureUi();scheduleRender(80);window.addEventListener('focus',()=>{if(document.getElementById('cashflow')?.classList.contains('active'))scheduleRender(70)});mobileMq.addEventListener?.('change',()=>scheduleRender(70));window.renderMobileInteractionV70=renderRows}
  function wait(n=0){if($('mobileCashflowV60')&&typeof forecast==='function'&&typeof window.householdCardForecastV49==='function')return boot();if(n<60)setTimeout(()=>wait(n+1),80)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>wait(),{once:true});else wait();
})();
