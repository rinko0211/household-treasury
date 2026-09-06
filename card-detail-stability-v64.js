(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const openForecast=new Set(),openInline=new Set();
  let timer=null,observer=null;

  function horizon(){return Number(document.querySelector('#mobileCashflowV60 [data-v60-h].active')?.dataset.v60H)||30}
  function cashRows(){try{return typeof forecast==='function'?(forecast(horizon()).rows||[]):[]}catch{return[]}}
  function planRows(){try{return window.householdCardForecastV49?.().rows||[]}catch{return[]}}
  function key(card,ym){return `${norm(card)}|${String(ym||'')}`}
  function amountOfPurchase(p){const v=p?.payment_amount;return v!==null&&v!==''&&Number.isFinite(Number(v))?Math.abs(Number(v)):Math.abs(Number(p?.original_amount)||0)}

  function estimateDetail(card,ym){
    const r=planRows().find(x=>norm(x.card)===norm(card)&&String(x.billing_month)===String(ym));
    if(!r)return null;
    const purchases=(r.components?.purchases||[]).map(x=>({name:x.name||'カード利用',amount:Number(x.amount)||0,meta:'利用明細'}));
    const scheduled=(r.components?.scheduled||[]).map(x=>({name:x.name||'固定費予定',amount:Number(x.amount)||0,meta:'未実績のカード固定費'}));
    return {kind:'ESTIMATE',card:r.card,ym:r.billing_month,total:Math.abs(Number(r.amount)||0),known:Number(r.known_purchase_total)||0,scheduled:Number(r.scheduled_fixed_total)||0,items:[...purchases,...scheduled]};
  }

  function actualDetail(card,ym){
    const st=stateNow();
    const settlement=(st.cardSettlements||[]).find(s=>norm(s.card)===norm(card)&&String(s.due_date||'').slice(0,7)===String(ym));
    if(!settlement)return null;
    let items=(st.cardBillingLines||[]).filter(x=>norm(x.card)===norm(card)&&String(x.billing_month||'')===String(ym)).map(x=>({name:x.merchant_raw||'カード明細',amount:Number(x.billed_amount)||0,meta:[x.purchase_date,x.line_kind==='ADJUSTMENT'?'請求調整':x.category||''].filter(Boolean).join(' · ')}));
    if(!items.length){
      items=(st.purchaseEvents||[]).filter(p=>String(p.card_settlement_id||'')===String(settlement.settlement_id||'')).map(p=>({name:p.merchant_raw||'カード利用',amount:amountOfPurchase(p),meta:[p.purchase_date,p.category||''].filter(Boolean).join(' · ')}));
    }
    return {kind:'ACTUAL',card:settlement.card||card,ym,total:Math.abs(Number(settlement.amount)||0),items,detailCount:settlement.detail_count};
  }

  function itemsHtml(items){
    if(!items?.length)return '<div class="muted" style="padding:8px 0">明細はまだ取得できていません。</div>';
    return items.map(x=>`<div class="row" style="align-items:flex-start"><div style="min-width:0;flex:1"><b style="overflow-wrap:anywhere">${esc(x.name)}</b>${x.meta?`<div class="tiny">${esc(x.meta)}</div>`:''}</div><b class="amt ${Number(x.amount)<0?'good':''}">${yen(x.amount)}</b></div>`).join('');
  }
  function detailHtml(d){
    if(!d)return '<div class="muted">詳細を取得できませんでした。</div>';
    const head=d.kind==='ESTIMATE'?`<div class="row"><span>取込済み利用</span><b>${yen(d.known)}</b></div><div class="row"><span>未実績固定費</span><b>${yen(d.scheduled)}</b></div>`:`<div class="row"><span>確定請求額</span><b>${yen(d.total)}</b></div>`;
    return `${head}<div class="tiny" style="margin:8px 0 4px">内訳 ${d.items?.length||0}件</div>${itemsHtml(d.items)}`;
  }

  function installCss(){
    if($('cardDetailStyleV64'))return;const s=document.createElement('style');s.id='cardDetailStyleV64';s.textContent=`
      #cardForecastV49,#cardForecastStableV61,#cardForecastStableV62{display:none!important}
      #cardForecastStableV64 .v64-toggle{width:100%;display:flex;justify-content:space-between;gap:8px;align-items:center;text-align:left}
      #cardForecastStableV64 .v64-detail{margin-top:8px}
      #mobileCashflowV60 .v64-inline-detail{margin-top:8px;padding:8px;border:1px solid #263755;border-radius:10px}
      #mobileCashflowV60 .v64-inline-toggle{min-width:88px}
    `;document.head.appendChild(s);
  }

  function ensureForecastUi(){
    installCss();const grid=document.querySelector('#cashflow .grid');if(!grid)return null;let card=$('cardForecastStableV64');
    if(!card){card=document.createElement('div');card.id='cardForecastStableV64';card.className='card full';card.innerHTML='<div class="title">カード見込請求 <span class="tag">明細 v64</span></div><div class="tiny">タップ時はこの明細部分だけを開閉します。Cash Flow全体は再描画しません。</div><div id="cardForecastStableRowsV64" style="margin-top:10px"></div>';const mobile=$('mobileCashflowV60');if(mobile&&mobile.parentElement===grid)mobile.after(card);else grid.prepend(card);
      card.addEventListener('click',e=>{const b=e.target.closest?.('[data-v64-forecast-toggle]');if(!b)return;const k=b.dataset.v64ForecastToggle,p=card.querySelector(`[data-v64-forecast-detail="${CSS.escape(k)}"]`),icon=b.querySelector('[data-v64-icon]');if(!p)return;const willOpen=p.hidden;p.hidden=!willOpen;if(willOpen)openForecast.add(k);else openForecast.delete(k);b.setAttribute('aria-expanded',String(willOpen));if(icon)icon.textContent=willOpen?'▲':'▼';});
    }
    return card;
  }

  function renderForecastUi(){
    const card=ensureForecastUi(),host=$('cardForecastStableRowsV64');if(!card||!host)return;const rows=planRows().slice(0,18);
    host.innerHTML=rows.length?rows.map(r=>{const k=key(r.card,r.billing_month),open=openForecast.has(k),d=estimateDetail(r.card,r.billing_month);return `<div class="card" style="padding:10px;margin-top:7px"><button type="button" class="btn secondary v64-toggle" data-v64-forecast-toggle="${esc(k)}" aria-expanded="${open}"><span><b>${esc(r.card)} · ${esc(r.billing_month)}</b> <span class="tiny">見込</span></span><span class="amt">${yen(Math.abs(r.amount))} <span data-v64-icon>${open?'▲':'▼'}</span></span></button><div class="v64-detail" data-v64-forecast-detail="${esc(k)}" ${open?'':'hidden'}>${detailHtml(d)}</div></div>`}).join(''):'<div class="muted">見込請求はありません。確定請求がある月はそちらを使用します。</div>';
  }

  function cardSource(e){
    const src=String(e?.source||''),type=String(e?.type||'');
    if(src==='card_estimate_v49'||type==='CARD_ESTIMATE')return{kind:'ESTIMATE',card:e.card||'',ym:e.billing_month||String(e.date||'').slice(0,7)};
    if(src==='card_settlement'||type==='CARD_SETTLEMENT')return{kind:'ACTUAL',card:e.card||String(e.name||'').replace(/カード支払.*/,''),ym:String(e.date||'').slice(0,7)};
    return null;
  }

  function patchInline(){
    const host=$('mobileCashflowRowsV60');if(!host)return;const rows=cashRows(),dom=[...host.querySelectorAll('.v60-row')];
    dom.forEach((row,i)=>{const src=cardSource(rows[i]);if(!src)return;const k=`${src.kind}|${key(src.card,src.ym)}`,d=src.kind==='ESTIMATE'?estimateDetail(src.card,src.ym):actualDetail(src.card,src.ym);let actions=row.querySelector('.v60-actions');if(!actions){actions=document.createElement('div');actions.className='v60-actions';row.appendChild(actions)}actions.innerHTML=`<button type="button" class="btn secondary v64-inline-toggle" data-v64-inline-toggle="${esc(k)}">内訳 ${d?.items?.length||0}件</button>`;let panel=row.querySelector('.v64-inline-detail');if(!panel){panel=document.createElement('div');panel.className='v64-inline-detail';row.appendChild(panel)}panel.dataset.v64InlineDetail=k;panel.innerHTML=detailHtml(d);panel.hidden=!openInline.has(k);});
    if(!host.dataset.v64Bound){host.dataset.v64Bound='1';host.addEventListener('click',e=>{const b=e.target.closest?.('[data-v64-inline-toggle]');if(!b)return;e.preventDefault();e.stopPropagation();const k=b.dataset.v64InlineToggle,row=b.closest('.v60-row'),p=row?.querySelector(`[data-v64-inline-detail="${CSS.escape(k)}"]`);if(!p)return;const willOpen=p.hidden;p.hidden=!willOpen;if(willOpen)openInline.add(k);else openInline.delete(k);});}
  }

  function queue(delay=80){clearTimeout(timer);timer=setTimeout(()=>{renderForecastUi();patchInline()},delay)}
  function boot(){installCss();renderForecastUi();patchInline();const host=$('mobileCashflowRowsV60');if(host){observer=new MutationObserver(()=>queue(70));observer.observe(host,{childList:true,subtree:false})}document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="cashflow"],#mobileCashflowV60 [data-v60-h]'))queue(120)});window.addEventListener('focus',()=>queue(100));window.renderCardDetailV64=()=>{renderForecastUi();patchInline()}}
  function wait(n=0){if(document.querySelector('#cashflow .grid')&&$('mobileCashflowV60'))return boot();if(n<50)setTimeout(()=>wait(n+1),100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>wait(),{once:true});else wait();
})();