(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const iso=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  let timer=null,observer=null;
  function cardKey(s){return norm(s).replace(/カード|CARD/g,'')}
  function sameCard(a,b){const x=cardKey(a),y=cardKey(b);return !!x&&!!y&&(x===y||x.includes(y)||y.includes(x))}
  function addMonths(ym,n){const [y,m]=ym.split('-').map(Number),d=new Date(y,m-1+n,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
  function lastDay(y,m){return new Date(y,m,0).getDate()}
  function dateFor(ym,day){const [y,m]=ym.split('-').map(Number);return `${ym}-${String(Math.min(Math.max(1,Number(day)||1),lastDay(y,m))).padStart(2,'0')}`}
  function purchaseAmount(p){const v=p.payment_amount;return v!==null&&v!==''&&Number.isFinite(Number(v))?Math.abs(Number(v)):Math.abs(Number(p.original_amount)||0)}
  function routeOf(m){return String(m?.paymentRoute||m?.payment_route||'DIRECT').toUpperCase()}
  function occurrence(m,ym){const cad=String(m.cadence||'MONTHLY').toUpperCase(),month=Number(ym.slice(5,7));if(cad==='MONTHLY')return true;if(cad==='SEMI_FIXED')return (m.activeMonths||m.months||[]).map(Number).includes(month);if(cad==='ANNUAL')return Number(m.dueMonth||m.paymentMonth||m.annualMonth||m.month)===month;return false}
  function settlementDayFor(st,card){
    const master=(st.masters?.cards||[]).find(c=>sameCard(c.name,card));for(const v of [master?.settlementDay,master?.paymentDay,master?.dueDay]){const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=31)return{day:n,source:'card-master'}}
    const history=(st.cardSettlements||[]).filter(s=>s.due_date&&sameCard(s.card,card)).sort((a,b)=>String(b.due_date).localeCompare(String(a.due_date)));if(history.length){const n=Number(String(history[0].due_date).slice(8,10));if(n>=1&&n<=31)return{day:n,source:'history'}}
    return{day:null,source:null};
  }
  function actualSettlement(st,card,ym){return (st.cardSettlements||[]).find(s=>sameCard(s.card,card)&&String(s.due_date||'').slice(0,7)===ym)}
  function knownPurchases(st,card,ym){return (st.purchaseEvents||[]).filter(p=>sameCard(p.card,card)&&String(p.billing_month||'')===ym&&!p.is_refinance_adjustment)}
  function cardMasters(st,card,ym){return (st.masters?.fixedExpenses||[]).filter(m=>m.active!==false&&m.forecastEnabled!==false&&routeOf(m)==='CARD'&&m.paymentCard&&sameCard(m.paymentCard,card)&&occurrence(m,ym))}
  function estimateFor(st,card,ym){
    const purchases=knownPurchases(st,card,ym),known=purchases.reduce((a,p)=>a+purchaseAmount(p),0),masters=cardMasters(st,card,ym);let scheduledMissing=0;const missing=[];
    for(const m of masters){const represented=purchases.some(p=>String(p.fixed_expense_master_id||'')===String(m.id));if(!represented){const a=Math.abs(Number(m.amount)||0);scheduledMissing+=a;missing.push({name:m.name||'固定費',amount:a,id:m.id})}}
    return{known,scheduledMissing,total:known+scheduledMissing,purchases,masters,missing};
  }
  function activeCards(st){const names=new Set();for(const m of st.masters?.fixedExpenses||[])if(m.active!==false&&routeOf(m)==='CARD'&&m.paymentCard)names.add(String(m.paymentCard));for(const p of st.purchaseEvents||[])if(p.card)names.add(String(p.card));return[...names]}
  function plan(st,days=180){
    const from=iso(new Date()),start=from.slice(0,7),months=Math.max(1,Math.ceil((Number(days)||180)/28)+1),rows=[],warnings=[];
    for(const card of activeCards(st)){
      const dayInfo=settlementDayFor(st,card);
      for(let i=0;i<months;i++){
        const ym=addMonths(start,i),actual=actualSettlement(st,card,ym);if(actual)continue;const e=estimateFor(st,card,ym);if(e.total<=0)continue;
        if(!dayInfo.day){warnings.push({card,ym,reason:'引落日を特定できません'});continue}
        const date=dateFor(ym,dayInfo.day);if(date<from)continue;rows.push({id:`card-estimate:${cardKey(card)}:${ym}`,date,name:`${card} 見込請求`,amount:-e.total,type:'CARD_ESTIMATE',source:'card_estimate_v49',generated:true,record_kind:'FORECAST_EVENT',economic_type:'TRANSFER',spending_class:null,category:null,subcategory:null,estimated:true,card,billing_month:ym,known_purchase_total:e.known,scheduled_fixed_total:e.scheduledMissing,component_count:e.purchases.length+e.missing.length,components:{purchases:e.purchases.map(p=>({name:p.merchant_raw||'カード利用',amount:purchaseAmount(p)})),scheduled:e.missing},settlement_day_source:dayInfo.source})
      }
    }
    rows.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'ja'));return{rows,warnings}
  }
  const previousGenerated=typeof generated==='function'?generated:null;
  if(previousGenerated){generated=function generatedCardForecastV49(days=90){const base=previousGenerated(days),st=stateNow(),p=plan(st,days),existing=new Set(base.map(e=>String(e.id)));return [...base,...p.rows.filter(e=>!existing.has(e.id))].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.name).localeCompare(String(b.name),'ja'))}}
  function ensureUi(){const grid=document.querySelector('#cashflow .grid');if(!grid)return;if(!$('cardForecastV49')){const card=document.createElement('div');card.id='cardForecastV49';card.className='card full';card.innerHTML=`<div class="title">カード見込請求 <span class="tag">v49</span></div><div class="tiny">確定請求がまだない月だけ、既知のカード利用＋未実績のカード払い固定費から見込請求を作ります。請求CSVが来たら確定額へ自動置換されます。</div><div id="cardForecastRowsV49" style="margin-top:10px"></div>`;const claims=$('cardClaimsV46');if(claims)claims.after(card);else grid.prepend(card)}}
  function render(){ensureUi();const host=$('cardForecastRowsV49');if(!host)return;const st=stateNow(),p=plan(st,180);host.innerHTML=p.rows.length?p.rows.slice(0,18).map(r=>`<details class="card" style="padding:10px;margin-top:7px"><summary style="cursor:pointer"><b>${esc(r.card)} · ${esc(r.billing_month)}</b>　<span class="amt">${yen(Math.abs(r.amount))}</span>　<span class="tiny">見込</span></summary><div class="row"><span>取込済み利用明細</span><b>${yen(r.known_purchase_total)}</b></div><div class="row"><span>未実績のカード固定費</span><b>${yen(r.scheduled_fixed_total)}</b></div>${r.components.scheduled.map(x=>`<div class="tiny" style="padding:4px 0">予定: ${esc(x.name)} ${yen(x.amount)}</div>`).join('')}</details>`).join(''):'<div class="muted">見込請求はありません。確定請求がある月はそちらを使用します。</div>';if(p.warnings.length)host.insertAdjacentHTML('beforeend',`<div class="note warn" style="margin-top:8px">カード引落日を特定できずCash Flowへ入れていない月があります。Settingsのカード情報に引落日を設定するか、過去の請求CSVを1回取り込むと自動推定できます。</div>`)}
  function queue(){clearTimeout(timer);timer=setTimeout(()=>{render();window.renderSemanticUiV48?.()},80)}
  function boot(){render();document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="cashflow"],[data-page="settings"],[data-page="imports"]'))setTimeout(queue,0)});const main=document.querySelector('main.app');if(main){observer=new MutationObserver(queue);observer.observe(main,{childList:true,subtree:true})}window.addEventListener('focus',queue);window.householdCardForecastV49=()=>plan(stateNow(),180);window.renderCardForecastV49=render}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
