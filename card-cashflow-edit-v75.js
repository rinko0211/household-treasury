(() => {
  if (window.__cardCashflowEditV75) return;
  window.__cardCashflowEditV75 = true;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const mobileMq=window.matchMedia('(max-width:820px)');
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const sameCard=(a,b)=>{try{return window.householdCardIdentityV51?.sameCard?.(a,b)??norm(a)===norm(b)}catch{return norm(a)===norm(b)}};
  const horizon=()=>Number(document.querySelector('#mobileCashflowV60 [data-v60-h].active')?.dataset.v60H)||30;
  let editMeta=null, patchTimer=null;

  function kindOf(r){
    const t=String(r?.type||''),src=String(r?.source||'');
    if(t==='CARD_REVOLVING_PAYMENT'||src==='card_revolving_v66')return'REVOLVING';
    if(t==='CARD_ESTIMATE'||src==='card_estimate_v49')return'ESTIMATE';
    if(t==='CARD_SETTLEMENT'||src==='card_settlement')return'ACTUAL';
    return'';
  }
  function metaOf(r){const kind=kindOf(r);if(!kind)return null;return{kind,card:r.card||String(r.name||'').replace(/カード支払.*/,''),ym:r.billing_month||String(r.date||'').slice(0,7),id:String(r.id||'')}}
  function keyOf(m){return `${m.kind}|${norm(m.card)}|${m.ym}`}
  function overrides(st){st.cardCashflowOverrides=Array.isArray(st.cardCashflowOverrides)?st.cardCashflowOverrides:[];return st.cardCashflowOverrides}
  function findOverride(st,m){return overrides(st).find(o=>o.key===keyOf(m))||null}
  function applyOverrideRows(rows){
    const st=stateNow(),map=new Map(overrides(st).map(o=>[o.key,o]));
    return (rows||[]).map(r=>{
      const m=metaOf(r);if(!m||m.kind==='ACTUAL')return r;const o=map.get(keyOf(m));if(!o)return r;
      return {...r,date:o.date||r.date,amount:-Math.abs(Number(o.amount)||0),card_cashflow_override:true,card_cashflow_override_id:o.id};
    });
  }
  const prevPlan=window.householdCardForecastV49;
  if(typeof prevPlan==='function'&&!window.__cardCashflowPlanV75){window.__cardCashflowPlanV75=true;window.householdCardForecastV49=function(days=180){const p=structuredClone(prevPlan(days)||{rows:[],warnings:[]});p.rows=applyOverrideRows(p.rows);return p}}
  if(typeof generated==='function'&&!window.__cardCashflowGeneratedV75){window.__cardCashflowGeneratedV75=true;const prevGenerated=generated;generated=function generatedCardCashflowV75(days=90){return applyOverrideRows(prevGenerated(days))}}

  function rowsNow(){try{return typeof forecast==='function'?(forecast(horizon()).rows||[]):[]}catch{return[]}}
  function planNow(){try{return window.householdCardForecastV49?.(180)?.rows||[]}catch{return[]}}
  function purchaseKey(p,i){return String(p.purchase_id||p.id||`${p.source_file||''}|${p.purchase_date||''}|${p.merchant_raw||''}|${p.original_amount||0}|${i}`)}
  function lineKey(l,i){return String(l.billing_line_id||l.line_id||l.id||`${l.purchase_id||''}|${l.occurrence_index||1}|${l.source_file||''}|${l.purchase_date||''}|${l.merchant_raw||''}|${l.original_amount||0}|${l.billing_month||''}|${i}`)}
  function linkedLines(st,p){
    let lines=(st.cardBillingLines||[]).filter(x=>p.purchase_id&&String(x.purchase_id||'')===String(p.purchase_id)&&Number(x.occurrence_index||1)===Number(p.occurrence_index||1));
    if(lines.length)return lines;
    return (st.cardBillingLines||[]).filter(x=>sameCard(x.card,p.card)&&String(x.purchase_date||'')===String(p.purchase_date||'')&&norm(x.merchant_raw||x.merchant_normalized)===norm(p.merchant_raw||p.merchant_normalized)&&Math.abs(Number(x.original_amount)||0)===Math.abs(Number(p.original_amount)||0)&&String(x.billing_month||'')===String(p.billing_month||''));
  }
  function linkedPurchase(st,line){
    let p=(st.purchaseEvents||[]).find(x=>line.purchase_id&&String(x.purchase_id||'')===String(line.purchase_id)&&Number(x.occurrence_index||1)===Number(line.occurrence_index||1));
    if(p)return p;
    return (st.purchaseEvents||[]).find(x=>sameCard(x.card,line.card)&&String(x.purchase_date||'')===String(line.purchase_date||'')&&norm(x.merchant_raw||x.merchant_normalized)===norm(line.merchant_raw||line.merchant_normalized)&&Math.abs(Number(x.original_amount)||0)===Math.abs(Number(line.original_amount)||0)&&String(x.billing_month||'')===String(line.billing_month||''))||null;
  }
  function billingLineAmount(line){const billed=Number(line?.billed_amount);if(Number.isFinite(billed)&&billed!==0)return Math.abs(billed);return Math.abs(Number(line?.original_amount)||0)}
  function detailRowsFor(st,m){
    const rows=[];
    (st.purchaseEvents||[]).forEach((p,i)=>{if(!sameCard(p.card,m.card)||String(p.billing_month||'')!==String(m.ym))return;rows.push({kind:'purchase',key:purchaseKey(p,i),date:p.purchase_date||'',merchant:p.merchant_raw||p.merchant_normalized||'カード利用',amount:Math.abs(Number(p.original_amount)||0),source:p.source_file||'',object:p})});
    (st.cardBillingLines||[]).forEach((line,i)=>{if(!sameCard(line.card,m.card)||String(line.billing_month||'')!==String(m.ym)||linkedPurchase(st,line))return;rows.push({kind:'billing',key:lineKey(line,i),date:line.purchase_date||'',merchant:line.merchant_raw||line.merchant_normalized||'カード明細',amount:billingLineAmount(line),source:line.source_file||'',object:line})});
    return rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(a.merchant).localeCompare(String(b.merchant),'ja')).slice(0,120);
  }

  function ensureModal(){
    if($('cardCashflowEditV75'))return;const m=document.createElement('div');m.id='cardCashflowEditV75';m.hidden=true;m.style.display='none';m.innerHTML=`<div data-v75-close style="position:fixed;inset:0;background:#0009;z-index:12300"></div><div class="card" style="position:fixed;z-index:12301;left:50%;top:50%;transform:translate(-50%,-50%);width:min(95vw,620px);max-height:92vh;overflow:auto"><div class="title" id="v75CardEditTitle">カードCash Flowを編集</div><div class="note" id="v75CardEditNote" style="margin-bottom:10px">この月だけ補正します。カードマスターの金額は変更しません。</div><div class="form" style="grid-template-columns:1fr 1fr"><div class="field"><label>カード</label><input id="v75CardName" readonly></div><div class="field"><label>対象月</label><input id="v75CardMonth" readonly></div><div class="field"><label>支払日</label><input id="v75CardDate" type="date"></div><div class="field"><label>Cash Flow支払額</label><input id="v75CardAmount" type="number" min="0" inputmode="numeric"></div></div><details id="v75PurchaseDetails" style="margin-top:14px"><summary style="cursor:pointer"><b>明細の編集を表示 / 非表示</b> <span class="tiny" id="v75PurchaseCount"></span></summary><div class="title" style="margin-top:12px">利用明細（支出実績）</div><div class="tiny" style="margin-bottom:7px">利用日は支出実績の日付です。最近取り込んだ請求行だけ存在する場合もここに表示します。</div><div id="v75PurchaseRows"></div></details><div class="controls" style="margin-top:12px;flex-wrap:wrap"><button type="button" class="btn" data-v75-save>この月だけ保存</button><button type="button" class="btn secondary" data-v75-reset>月補正を解除</button><button type="button" class="btn secondary" data-v75-close>キャンセル</button></div></div>`;document.body.appendChild(m);m.addEventListener('click',onModalClick)}
  function show(){const m=$('cardCashflowEditV75');m.hidden=false;m.style.display='block'}
  function hide(){const m=$('cardCashflowEditV75');m.hidden=true;m.style.display='none';editMeta=null}

  function actualSettlement(st,m){return (st.cardSettlements||[]).find(s=>sameCard(s.card,m.card)&&String(s.due_date||'').slice(0,7)===String(m.ym))||null}
  function openEditor(m){
    ensureModal();const st=stateNow(),o=findOverride(st,m),actual=m.kind==='ACTUAL'?actualSettlement(st,m):null;
    const sourceRows=m.kind==='ACTUAL'?rowsNow():planNow(),r=sourceRows.find(x=>{const q=metaOf(x);return q&&q.kind===m.kind&&sameCard(q.card,m.card)&&q.ym===m.ym})||{};
    editMeta={...m};$('v75CardEditTitle').textContent=`${m.card} · ${m.ym} ${m.kind==='REVOLVING'?'リボ返済':m.kind==='ACTUAL'?'確定請求':'カード見込'}を編集`;
    $('v75CardEditNote').textContent=m.kind==='ACTUAL'?'確定請求そのものを補正します。カードマスターは変更しません。':'この月だけ支払日・支払額を補正します。カードマスターの毎月金額は変更しません。';
    $('v75CardName').value=m.card;$('v75CardMonth').value=m.ym;$('v75CardDate').value=o?.date||actual?.due_date||r.date||'';$('v75CardAmount').value=String(Math.abs(Number(o?.amount??actual?.amount??r.amount)||0));
    const details=detailRowsFor(st,m),host=$('v75PurchaseRows');if($('v75PurchaseDetails'))$('v75PurchaseDetails').open=false;if($('v75PurchaseCount'))$('v75PurchaseCount').textContent=`${details.length}件`;
    host.innerHTML=details.length?details.map(d=>`<div class="card" style="padding:9px;margin-top:7px" data-v75-purchase="${esc(d.key)}" data-v75-detail-kind="${esc(d.kind)}"><div class="tiny">${esc(d.source)}${d.kind==='billing'?' · 最近取込（請求行）':''}</div><div class="form" style="grid-template-columns:1fr 1fr;gap:7px;margin-top:5px"><div class="field"><label>利用日</label><input type="date" data-v75-pdate value="${esc(d.date)}"></div><div class="field"><label>${d.kind==='billing'?'当月請求額':'利用額'}</label><input type="number" min="0" inputmode="numeric" data-v75-pamount value="${Math.abs(Number(d.amount)||0)}"></div><div class="field" style="grid-column:1/-1"><label>利用先</label><input data-v75-pmerchant value="${esc(d.merchant)}"></div></div></div>`).join(''):'<div class="muted">この月に紐づく利用明細はありません。</div>';show()
  }
  function findPurchaseByKey(st,key){return (st.purchaseEvents||[]).find((p,i)=>purchaseKey(p,i)===String(key))||null}
  function findLineByKey(st,key){return (st.cardBillingLines||[]).find((l,i)=>lineKey(l,i)===String(key))||null}
  function persist(st,msg){window.treasuryRecoverySnapshot?.(`${msg}直前`);window.replaceTreasuryState?.(st);window.setTreasurySaveStatus?.(`${msg}・同期中`);window.cloudSyncOnLocalSave?.();schedulePatch(120)}
  function saveEditor(){
    if(!editMeta)return;const st=stateNow(),date=$('v75CardDate').value,amount=Number($('v75CardAmount').value);if(!date||!Number.isFinite(amount)||amount<0)return alert('支払日・支払額を確認してください。');
    if(editMeta.kind==='ACTUAL'){
      const s=actualSettlement(st,editMeta);if(!s)return alert('確定請求が見つかりません。');s.due_date=date;s.amount=Math.abs(amount);s.manual_cashflow_correction=true;s.updatedAt=new Date().toISOString();
    }else{
      const key=keyOf(editMeta),now=new Date().toISOString();st.cardCashflowOverrides=overrides(st).filter(o=>o.key!==key);st.cardCashflowOverrides.push({id:`cardcf:${crypto.randomUUID()}`,key,kind:editMeta.kind,card:editMeta.card,billing_month:editMeta.ym,date,amount:Math.abs(amount),source:'MANUAL_MONTH_OVERRIDE',createdAt:now,updatedAt:now});
    }
    document.querySelectorAll('#v75PurchaseRows [data-v75-purchase]').forEach(box=>{const kind=box.dataset.v75DetailKind,key=box.dataset.v75Purchase,d=box.querySelector('[data-v75-pdate]')?.value||'',merchant=box.querySelector('[data-v75-pmerchant]')?.value.trim()||'',a=Number(box.querySelector('[data-v75-pamount]')?.value),now=new Date().toISOString();if(kind==='billing'){const line=findLineByKey(st,key);if(!line)return;if(d)line.purchase_date=d;if(merchant){line.merchant_raw=merchant;line.merchant_normalized=merchant}if(Number.isFinite(a)&&a>=0)line.billed_amount=Math.abs(a);line.manual_corrected_at=now;return}const p=findPurchaseByKey(st,key);if(!p)return;if(d)p.purchase_date=d;if(merchant){p.merchant_raw=merchant;p.merchant_normalized=merchant}if(Number.isFinite(a)&&a>=0)p.original_amount=Math.abs(a);p.manual_corrected_at=now;for(const line of linkedLines(st,p)){if(d)line.purchase_date=d;if(merchant){line.merchant_raw=merchant;line.merchant_normalized=merchant}if(Number.isFinite(a)&&a>=0)line.original_amount=Math.abs(a);line.manual_corrected_at=now}});
    persist(st,'カードCash Flowこの月だけ補正');hide()
  }
  function resetEditor(){if(!editMeta)return;const st=stateNow();if(editMeta.kind==='ACTUAL')return alert('確定請求は月補正ではないため解除できません。必要な値へ再編集してください。');const key=keyOf(editMeta);st.cardCashflowOverrides=overrides(st).filter(o=>o.key!==key);persist(st,'カードCash Flow月補正解除');hide()}
  function onModalClick(e){const b=e.target.closest?.('[data-v75-save],[data-v75-reset],[data-v75-close]');if(!b)return;e.preventDefault();e.stopPropagation();if(b.matches('[data-v75-save]'))saveEditor();else if(b.matches('[data-v75-reset]'))resetEditor();else hide()}

  function editButton(m,label='編集') {return `<button type="button" class="btn secondary" data-v75-card-edit data-v75-kind="${esc(m.kind)}" data-v75-card="${esc(m.card)}" data-v75-ym="${esc(m.ym)}">${label}</button>`}
  function patchCashflow(){
    if(!mobileMq.matches||!$('cashflow')?.classList.contains('active'))return;const byId=new Map(rowsNow().map(r=>[String(r.id||''),r]));
    document.querySelectorAll('#mobileCashflowRowsV60 .v60-row[data-v70-row]').forEach(row=>{if(row.querySelector('[data-v75-card-edit]'))return;const r=byId.get(String(row.dataset.v70Row||'')),m=metaOf(r);if(!m)return;const actions=row.querySelector('.v70-actions');if(actions)actions.insertAdjacentHTML('beforeend',editButton(m,m.kind==='REVOLVING'?'この月の返済額を編集':m.kind==='ACTUAL'?'請求を編集':'この月の見込を編集'))});
    document.querySelectorAll('#cardForecastStableRowsV70 [data-v70-forecast]').forEach(toggle=>{const wrap=toggle.parentElement;if(!wrap||wrap.querySelector('[data-v75-card-edit]'))return;const raw=String(toggle.dataset.v70Forecast||''),parts=raw.split(':');if(parts.length<4)return;const m={kind:parts[1],card:parts.slice(2,-1).join(':'),ym:parts.at(-1)};wrap.insertAdjacentHTML('beforeend',`<div class="controls" style="margin-top:7px;justify-content:flex-end">${editButton(m,m.kind==='REVOLVING'?'この月の返済額を編集':'この月の見込を編集')}</div>`)});
  }
  function schedulePatch(ms=80){clearTimeout(patchTimer);patchTimer=setTimeout(patchCashflow,ms)}
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-v75-card-edit]');if(b){e.preventDefault();e.stopPropagation();return openEditor({kind:b.dataset.v75Kind,card:b.dataset.v75Card,ym:b.dataset.v75Ym})}if(e.target.closest?.('[data-v60-h],[data-page="cashflow"]'))schedulePatch(180)},true);
  window.addEventListener('treasury:pagechange',e=>{if(e?.detail?.page==='cashflow')schedulePatch(180)});
  const prevReplace=window.replaceTreasuryState;if(typeof prevReplace==='function'&&!window.__cardCashflowReplaceV75){window.__cardCashflowReplaceV75=true;window.replaceTreasuryState=function(n){const r=prevReplace(n);schedulePatch(180);return r}}
  window.addEventListener('pageshow',()=>schedulePatch(220));setTimeout(()=>schedulePatch(300),0);
})();
