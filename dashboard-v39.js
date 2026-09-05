(() => {
  const CARD_ID='dashboardPhase8V39';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const iso=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  const todayIso=()=>iso(new Date());
  let timer=null,observers=[];

  function lastDayThisMonth(){const d=new Date();return iso(new Date(d.getFullYear(),d.getMonth()+1,0))}
  function totalNet(st){const a=st.assets||{};return Number(a.bank||0)+Number(a.investment||0)+Number(a.ideco||0)+Number(a.other||0)-Number(a.liabilities||0)}
  function scopeOf(obj){const s=String(obj?.expense_scope||obj?.ordinary_or_special||'').toUpperCase();if(s==='ORDINARY')return'NORMAL';return['NORMAL','SPECIAL','INVESTMENT','DEBT','TRANSFER'].includes(s)?s:'NORMAL'}
  function monthTotalsFallback(st){
    const m=todayIso().slice(0,7),out={ordinary:0,special:0,investment:0,debt:0,transfer:0};
    const add=(scope,amount)=>{const a=Math.abs(Number(amount)||0);if(!a)return;if(scope==='SPECIAL')out.special+=a;else if(scope==='INVESTMENT')out.investment+=a;else if(scope==='DEBT')out.debt+=a;else if(scope==='TRANSFER')out.transfer+=a;else out.ordinary+=a};
    for(const p of st.purchaseEvents||[])if(String(p.purchase_date||'').startsWith(m))add(scopeOf(p),p.original_amount);
    for(const t of st.cashTransactions||[])if(String(t.date||'').startsWith(m)&&Number(t.amount)<0)add(scopeOf(t),t.amount);
    return out;
  }
  function monthTotals(st){try{if(typeof monthEconomicTotals==='function')return monthEconomicTotals()}catch{}return monthTotalsFallback(st)}

  function dueMonthOf(x){for(const v of [x?.dueMonth,x?.paymentMonth,x?.annualMonth,x?.month]){const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=12)return n}const raw=String(x?.nextDueDate||x?.dueDate||'');const m=raw.match(/^\d{4}-(\d{2})/);return m?Number(m[1]):null}
  function reservedOf(x){for(const v of [x?.reservedAmount,x?.reserved_amount,x?.reserveAmount])if(v!==null&&v!==''&&Number.isFinite(Number(v)))return Math.max(0,Number(v));return 0}
  function annualMetrics(st){
    const items=(st.masters?.fixedExpenses||[]).filter(x=>x.active!==false&&String(x.cadence||'').toUpperCase()==='ANNUAL');
    const now=new Date(),year=now.getFullYear(),month=now.getMonth()+1;let annual=0,reserved=0,shortage=0,monthly=0,missingMonth=0,next=null;
    for(const item of items){
      const amount=Math.max(0,Number(item.amount)||0),r=Math.min(amount,reservedOf(item)),s=Math.max(0,amount-r),dm=dueMonthOf(item);annual+=amount;reserved+=r;shortage+=s;
      if(!dm){missingMonth++;continue}
      let y=dm<month?year+1:year;const paid=Number(item.lastPaidYear)||0;if(paid>=y)y=paid+1;const months=Math.max(0,(y-year)*12+(dm-month));const need=Math.ceil(s/Math.max(1,months));monthly+=need;
      if(!next||months<next.months)next={name:item.name||'年払い',months,year:y,month:dm,shortage:s,amount};
    }
    return{items,annual,reserved,shortage,monthly,missingMonth,next};
  }
  function liabilityMetrics(st){
    const all=(st.masters?.liabilities||[]).filter(x=>x.active!==false),amount=x=>{for(const v of [x.balance,x.referenceBalance,x.reference_balance])if(v!==null&&v!==''&&Number.isFinite(Number(v)))return Math.max(0,Number(v));return 0};
    const total=all.reduce((a,x)=>a+amount(x),0),short=window.householdShortTermLiabilitiesV38?.()||{additional:0,gross:0,undated:[]};
    return{count:all.length,total,short};
  }
  function forecastMetrics(st){
    let f30={low:Number(st.settings?.cash)||0},f90=f30,f180=f30,monthEnd=f30,salary=f30;
    try{f30=forecast(30);f90=forecast(90);f180=forecast(180)}catch{}
    try{monthEnd=forecastUntil(lastDayThisMonth())}catch{}
    try{salary=forecastUntil(nextSalaryDate())}catch{}
    return{f30,f90,f180,monthEnd,salary};
  }
  function upcoming(st){
    let rows=[];try{rows=generated(180)}catch{}
    return rows.filter(e=>String(e.date||'')>=todayIso()).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.name||'').localeCompare(String(b.name||''),'ja')).slice(0,8);
  }
  function unknownFuture(st){return (st.events||[]).filter(e=>String(e.date||'')>=todayIso()&&(e.amount===null||e.amount===''||!Number.isFinite(Number(e.amount)))).length}

  function go(page){document.querySelector(`[data-page="${page}"]`)?.click()}
  function ensureUi(){
    if($(CARD_ID))return true;const grid=document.querySelector('#dashboard .grid');if(!grid)return false;
    const card=document.createElement('div');card.id=CARD_ID;card.className='card full';
    card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><div class="title" style="margin-bottom:3px">家計ダッシュボード <span class="tag">Phase 8</span></div><div class="tiny">今使える額 → 今月の支出 → 年払い・負債 → 近い予定、の順で判断します。</div></div><button class="btn secondary" id="dashboardRefreshV39">再計算</button></div><div id="dashboardDecisionV39" class="form" style="margin-top:12px"></div><div class="grid" style="margin-top:12px"><div class="card half"><div class="title">今月の支出</div><div id="dashboardMonthV39"></div></div><div class="card half"><div class="title">年払い・負債</div><div id="dashboardObligationsV39"></div></div><div class="card half"><div class="title">近い予定</div><div id="dashboardUpcomingV39"></div></div><div class="card half"><div class="title">要確認</div><div id="dashboardAlertsV39"></div></div></div>`;
    grid.prepend(card);$('dashboardRefreshV39').onclick=renderDashboard;
    card.addEventListener('click',e=>{const b=e.target.closest?.('[data-dashboard-go]');if(b)go(b.dataset.dashboardGo)});return true;
  }
  function renderDecision(st,f){
    const cells=[
      ['現在現金',Number(st.settings?.cash)||0,''],
      ['次の給与まで最低',f.salary.low,`最低日 ${esc(f.salary.lowDate||'—')}`],
      ['今月末予測',f.monthEnd.endBalance??f.monthEnd.low,''],
      ['6か月最低',f.f180.low,`最低日 ${esc(f.f180.lowDate||'—')}`],
      ['安全に使える額',f.f180.safeToSpend??0,'safe']
    ];
    $('dashboardDecisionV39').innerHTML=cells.map(([k,v,meta],i)=>`<div><span class="muted">${k}</span><b class="${i===4?(Number(v)>0?'good':'bad'):''}" style="display:block;font-size:${i===4?'24':'20'}px;margin-top:5px">${yen(v)}</b>${meta&&meta!=='safe'?`<div class="tiny">${meta}</div>`:''}</div>`).join('');
  }
  function renderMonth(st){
    const t=monthTotals(st),rows=[['NORMAL',t.ordinary??t.normal??0],['SPECIAL',t.special||0],['INVESTMENT',t.investment||0],['DEBT',t.debt||0],['TRANSFER',t.transfer||0]];
    $('dashboardMonthV39').innerHTML=rows.map(([k,v])=>`<div class="row"><span>${k}</span><b>${yen(v)}</b></div>`).join('')+`<div class="controls" style="margin-top:8px"><button class="btn secondary" data-dashboard-go="imports">明細・区分を見る</button></div>`;
  }
  function renderObligations(st){
    const a=annualMetrics(st),l=liabilityMetrics(st);const next=a.next?`${esc(a.next.name)} · ${a.next.year}年${a.next.month}月 · 不足 ${yen(a.next.shortage)}`:'支払月設定済みの年払いなし';
    $('dashboardObligationsV39').innerHTML=`<div class="row"><span>年払い不足</span><b class="${a.shortage>0?'warn':'good'}">${yen(a.shortage)}</b></div><div class="row"><span>必要な月積立</span><b>${yen(a.monthly)}</b></div><div class="row"><span>負債マスタ合計</span><b>${yen(l.total)}</b></div><div class="row"><span>6か月内・未反映短期負債</span><b class="${l.short.additional>0?'warn':''}">${yen(l.short.additional||0)}</b></div><div class="tiny" style="margin-top:8px">次の年払い: ${next}</div><div class="controls" style="margin-top:8px"><button class="btn secondary" data-dashboard-go="settings">年払い・負債を管理</button></div>`;
  }
  function eventLabel(e){const unknown=e.amount_unknown||e.amount===null||e.amount===''||!Number.isFinite(Number(e.amount));const amount=unknown?'金額未定':`${Number(e.amount)>0?'+':''}${yen(e.amount)}`;return`<div class="row" style="align-items:flex-start"><div><b>${esc(e.name||'予定')}</b><div class="tiny">${esc(e.date||'')} · ${esc(e.future_kind||e.expense_scope||e.type||'')}</div></div><b class="amt ${unknown?'warn':Number(e.amount)<0?'bad':'good'}">${amount}</b></div>`}
  function renderUpcoming(st){const rows=upcoming(st);$('dashboardUpcomingV39').innerHTML=(rows.length?rows.map(eventLabel).join(''):'<div class="muted">6か月以内の予定なし</div>')+`<div class="controls" style="margin-top:8px"><button class="btn secondary" data-dashboard-go="cashflow">未来予定・予測を見る</button></div>`}
  function renderAlerts(st,f){
    const alerts=[],unknown=unknownFuture(st),annual=annualMetrics(st),reviews=(st.reviewQueue||[]).length;
    if(Number(f.f180.safeToSpend||0)<=0)alerts.push({level:'bad',text:'安全に使える額が0円です。6か月予測を確認してください。',page:'cashflow'});
    if(unknown)alerts.push({level:'warn',text:`金額未定の未来予定が ${unknown}件あります。`,page:'cashflow'});
    if(annual.missingMonth)alerts.push({level:'warn',text:`支払月未設定の年払いが ${annual.missingMonth}件あります。`,page:'settings'});
    if(reviews)alerts.push({level:'warn',text:`取込の要確認が ${reviews}件あります。`,page:'imports'});
    if(!alerts.length)alerts.push({level:'good',text:'現在、主要な要確認事項はありません。',page:''});
    $('dashboardAlertsV39').innerHTML=alerts.map(x=>`<div class="note ${x.level}" style="margin-bottom:8px">${esc(x.text)}${x.page?` <button class="btn secondary" style="margin-left:6px" data-dashboard-go="${x.page}">確認</button>`:''}</div>`).join('');
  }
  function updateLegacy(st,f){
    const lowLabel=$('kpiLow')?.parentElement?.querySelector('.muted');if(lowLabel)lowLabel.textContent='6か月最低残高';
    if($('kpiLow'))$('kpiLow').textContent=yen(f.f180.low);if($('kpiLowDate'))$('kpiLowDate').textContent=f.f180.lowDate||'';
    const safeLabel=$('kpiInvest')?.parentElement?.querySelector('.muted');if(safeLabel)safeLabel.textContent='安全に使える額';
    if($('kpiInvest')){$('kpiInvest').textContent=yen(f.f180.safeToSpend||0);$('kpiInvest').className=Number(f.f180.safeToSpend)>100000?'good':Number(f.f180.safeToSpend)>0?'warn':'bad'}
    if($('kpiNet'))$('kpiNet').textContent=yen(totalNet(st));
  }
  function renderDashboard(){
    if(!ensureUi())return;const st=stateNow(),f=forecastMetrics(st);renderDecision(st,f);renderMonth(st);renderObligations(st);renderUpcoming(st);renderAlerts(st,f);updateLegacy(st,f);
  }
  function queue(){clearTimeout(timer);timer=setTimeout(renderDashboard,70)}
  function observe(id){const el=$(id);if(!el)return;const o=new MutationObserver(queue);o.observe(el,{childList:true,subtree:true,characterData:true});observers.push(o)}
  function boot(){ensureUi();renderDashboard();['kpiCash','eventsBody','assets','importResults'].forEach(observe);document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="dashboard"]'))setTimeout(renderDashboard,0)});document.addEventListener('change',queue);window.addEventListener('focus',queue);window.renderDashboardV39=renderDashboard}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();