(() => {
  const CARD_ID='forecastCardV38';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const isoDate=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  const todayIso=()=>isoDate(new Date());
  let observer=null,renderTimer=null;

  function addDays(date,days){const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+days);return isoDate(d)}
  function liabilityAmount(x){
    for(const v of [x?.balance,x?.referenceBalance,x?.reference_balance]){
      if(v!==null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0)return Math.abs(Number(v));
    }
    return 0;
  }
  function liabilityDue(x){
    for(const v of [x?.dueDate,x?.payoffDate,x?.targetDate,x?.targetPayoff]){
      const s=String(v||'').trim();
      if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
      if(/^\d{4}-\d{2}$/.test(s))return `${s}-28`;
    }
    return'';
  }
  function isDebtEvent(e){
    if(String(e?.type||'').toUpperCase()==='CARD_SETTLEMENT')return false;
    const scope=String(e?.expense_scope||e?.future_kind||e?.ordinary_or_special||'').toUpperCase();
    const type=String(e?.type||'').toUpperCase();
    return scope==='DEBT'||type.includes('DEBT')||type.includes('LOAN');
  }
  function coreForecast(days){
    const st=stateNow();let bal=Number(st.settings?.cash)||0,low=bal,lowDate=todayIso(),rows=[];
    const events=typeof generated==='function'?generated(days):[];
    for(const e of events){bal+=Number(e.amount)||0;rows.push({...e,balance:bal});if(bal<low){low=bal;lowDate=e.date}}
    return{rows,low,lowDate,endBalance:bal};
  }
  function shortTermLiabilityMetrics(st,days=180){
    const from=todayIso(),to=addDays(from,days),dated=[],undated=[];
    for(const x of st.masters?.liabilities||[]){
      if(x.active===false)continue;const amount=liabilityAmount(x);if(!amount)continue;const due=liabilityDue(x);
      if(!due){undated.push({name:x.name||'負債',amount});continue}
      if(due>=from&&due<=to)dated.push({name:x.name||'負債',amount,due,reference:x.balance==null&&x.referenceBalance!=null});
    }
    const gross=dated.reduce((a,x)=>a+x.amount,0);
    const scheduled=(typeof generated==='function'?generated(days):[]).filter(e=>isDebtEvent(e)&&Number(e.amount)<0).reduce((a,e)=>a+Math.abs(Number(e.amount)||0),0);
    const additional=Math.max(0,gross-scheduled);
    return{dated,undated,gross,scheduled:Math.min(gross,scheduled),additional};
  }

  if(typeof forecast==='function'){
    forecast=function forecastV38(days=90){
      const st=stateNow(),requested=Math.max(0,Number(days)||90),core=coreForecast(requested),safeCore=requested>=180?core:coreForecast(180);
      const safety=Math.max(0,Number(st.settings?.reserve)||0),reserved=Math.max(0,Number(st.settings?.reservedSpecial)||0),liab=shortTermLiabilityMetrics(st,180);
      const safeToSpend=Math.max(0,safeCore.low-safety-reserved-liab.additional);
      return{...core,safeToSpend,safeHorizonDays:180,safeBaseLow:safeCore.low,safetyFloor:safety,reservedSpecial:reserved,shortTermLiabilities:liab.additional,shortTermLiabilitiesGross:liab.gross,scheduledDebtWithinForecast:liab.scheduled};
    };
  }

  function ensureHorizon(){
    const sel=$('forecastHorizon');if(!sel)return;
    if(![...sel.options].some(o=>o.value==='180')){const o=document.createElement('option');o.value='180';o.textContent='6か月';sel.appendChild(o)}
  }
  function ensureUi(){
    ensureHorizon();if($(CARD_ID))return true;
    const grid=document.querySelector('#cashflow .grid');if(!grid)return false;
    const card=document.createElement('div');card.id=CARD_ID;card.className='card full';
    card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><div class="title" style="margin-bottom:3px">資金繰り予測 <span class="tag">Phase 7</span></div><div class="tiny">30日 / 60日 / 90日 / 6か月を比較し、安全に使える額は6か月先まで見て計算します。</div></div><button class="btn secondary" id="refreshForecastV38">再計算</button></div><div id="forecastSummaryV38" class="form" style="margin-top:12px"></div><div id="forecastBreakdownV38" style="margin-top:12px"></div><div id="forecastLiabilitiesV38" style="margin-top:12px"></div>`;
    const future=$('futurePlannerCardV37');if(future&&future.parentElement===grid)future.before(card);else grid.appendChild(card);
    $('refreshForecastV38').onclick=()=>{try{render()}catch{}renderForecast()};return true;
  }
  function renderForecast(){
    if(!ensureUi())return;ensureHorizon();const st=stateNow(),f30=forecast(30),f60=forecast(60),f90=forecast(90),f180=forecast(180),liab=shortTermLiabilityMetrics(st,180);
    const cells=[['30日最低',f30.low],['60日最低',f60.low],['90日最低',f90.low],['6か月最低',f180.low],['安全に使える額',f180.safeToSpend]];
    $('forecastSummaryV38').innerHTML=cells.map(([k,v],i)=>`<div><span class="muted">${k}</span><b class="${i===4?(v>0?'good':'bad'):''}" style="display:block;font-size:19px;margin-top:5px">${yen(v)}</b></div>`).join('');
    const unknown=(st.events||[]).filter(e=>String(e.date||'')>=todayIso()&&(e.amount===null||e.amount===''||!Number.isFinite(Number(e.amount)))).length;
    $('forecastBreakdownV38').innerHTML=`<div class="card" style="padding:12px"><div class="title">safe_to_spend 内訳</div><div class="row"><span>6か月最低残高</span><b>${yen(f180.safeBaseLow)}</b></div><div class="row"><span>− 安全資金</span><b>${yen(f180.safetyFloor)}</b></div><div class="row"><span>− 予約済み特別費</span><b>${yen(f180.reservedSpecial)}</b></div><div class="row"><span>− 短期負債（予定未反映分）</span><b>${yen(f180.shortTermLiabilities)}</b></div><div class="row"><span>= 安全に使える額</span><b class="${f180.safeToSpend>0?'good':'bad'}">${yen(f180.safeToSpend)}</b></div>${liab.scheduled?`<div class="tiny" style="margin-top:8px">短期負債 ${yen(liab.gross)} のうち ${yen(liab.scheduled)} は未来予定の返済として既に残高予測へ入っているため、二重控除していません。</div>`:''}${unknown?`<div class="note warn" style="margin-top:8px">金額未定の未来予定が ${unknown}件あります。金額が決まるまで残高予測には含めません。</div>`:''}</div>`;
    const rows=liab.dated.map(x=>`<div class="row"><div><b>${esc(x.name)}</b><div class="tiny">期限/完済目標 ${esc(x.due)}${x.reference?' · 参考残高':''}</div></div><b class="amt bad">${yen(x.amount)}</b></div>`).join('');
    const undated=liab.undated.length?`<details style="margin-top:8px"><summary class="tiny">期限なし負債 ${liab.undated.length}件（safe_to_spendから自動控除しない）</summary>${liab.undated.map(x=>`<div class="row"><span>${esc(x.name)}</span><b>${yen(x.amount)}</b></div>`).join('')}</details>`:'';
    $('forecastLiabilitiesV38').innerHTML=rows||undated?`<div class="card" style="padding:12px"><div class="title">6か月以内の短期負債</div>${rows||'<div class="muted">期限付き短期負債なし</div>'}${undated}</div>`:'<div class="tiny">6か月以内に期限がある負債はありません。</div>';
    if($('safety'))$('safety').innerHTML=`6か月最低残高 ${yen(f180.safeBaseLow)} から、安全資金 ${yen(f180.safetyFloor)}・予約済み特別費 ${yen(f180.reservedSpecial)}・未反映短期負債 ${yen(f180.shortTermLiabilities)} を差し引いた安全余力は <b>${yen(f180.safeToSpend)}</b> です。`;
    if($('kpiInvest')){$('kpiInvest').textContent=yen(f180.safeToSpend);$('kpiInvest').className=f180.safeToSpend>100000?'good':f180.safeToSpend>0?'warn':'bad'}
  }
  function queue(){clearTimeout(renderTimer);renderTimer=setTimeout(renderForecast,60)}
  function boot(){ensureHorizon();ensureUi();renderForecast();const body=$('eventsBody');if(body){observer=new MutationObserver(queue);observer.observe(body,{childList:true,subtree:true})}document.addEventListener('change',e=>{if(e.target?.id==='forecastHorizon')setTimeout(renderForecast,0)});document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="cashflow"],[data-page="dashboard"]'))setTimeout(renderForecast,0)});window.addEventListener('focus',queue);window.renderForecastV38=renderForecast;window.householdShortTermLiabilitiesV38=()=>shortTermLiabilityMetrics(stateNow(),180)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();