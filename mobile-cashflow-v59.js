(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen = n => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const iso = d => { const x=new Date(d); return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
  const todayIso = () => iso(new Date());
  const mobileMq = window.matchMedia('(max-width: 760px)');
  let epoch = 0;
  let editId = null;
  let renderTimer = null;
  const genCache = new Map();
  const forecastCache = new Map();

  function isMobile(){ return mobileMq.matches; }
  function clearCalcCache(){ epoch++; genCache.clear(); forecastCache.clear(); }
  function cacheKey(days){ return `${epoch}:${Math.max(0,Number(days)||0)}`; }

  if(typeof generated === 'function' && !window.__generatedMemoV59){
    window.__generatedMemoV59 = true;
    const previousGenerated = generated;
    generated = function generatedV59(days=90){
      if(!isMobile()) return previousGenerated(days);
      const key=cacheKey(days),now=performance.now(),hit=genCache.get(key);
      if(hit && now-hit.at<500) return hit.value;
      const value=previousGenerated(days); genCache.set(key,{at:now,value}); return value;
    };
  }
  if(typeof forecast === 'function' && !window.__forecastMemoV59){
    window.__forecastMemoV59 = true;
    const previousForecast = forecast;
    forecast = function forecastMemoV59(days=90){
      if(!isMobile()) return previousForecast(days);
      const key=cacheKey(days),now=performance.now(),hit=forecastCache.get(key);
      if(hit && now-hit.at<500) return hit.value;
      const value=previousForecast(days); forecastCache.set(key,{at:now,value}); return value;
    };
  }
  if(typeof save === 'function' && !window.__saveMemoV59){
    window.__saveMemoV59=true;
    const previousSave=save;
    save=function saveV59(){ clearCalcCache(); return previousSave(); };
  }
  const previousReplace=window.replaceTreasuryState;
  if(typeof previousReplace==='function' && !window.__replaceMemoV59){
    window.__replaceMemoV59=true;
    window.replaceTreasuryState=function replaceTreasuryStateV59(next){ clearCalcCache(); return previousReplace(next); };
  }

  function addMonthsYm(ym,n){ const [y,m]=String(ym).split('-').map(Number),d=new Date(y,m-1+n,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
  function ymNow(){ return todayIso().slice(0,7); }
  function dueMonthOf(x){
    for(const v of [x?.dueMonth,x?.paymentMonth,x?.annualMonth,x?.month]){ const n=Number(v); if(Number.isInteger(n)&&n>=1&&n<=12)return n; }
    const m=String(x?.nextDueDate||x?.dueDate||'').match(/^\d{4}-(\d{2})/); return m?Number(m[1]):null;
  }
  function reservedOf(x){
    for(const v of [x?.reservedAmount,x?.reserved_amount,x?.reserveAmount]) if(v!==null&&v!==''&&Number.isFinite(Number(v))) return Math.max(0,Number(v));
    return 0;
  }
  function bonusAllocations(x){
    const out=[];
    if(Array.isArray(x?.bonusAllocations)) for(const b of x.bonusAllocations){ const month=Number(b?.month),amount=Number(b?.amount); if(month>=1&&month<=12&&amount>0)out.push({month,amount}); }
    for(const i of [1,2]){ const month=Number(x?.[`bonusMonth${i}`]),amount=Number(x?.[`bonusAmount${i}`]); if(month>=1&&month<=12&&amount>0&&!out.some(b=>b.month===month&&b.amount===amount))out.push({month,amount}); }
    return out;
  }
  function annualTarget(item,fromYm=ymNow()){
    const dm=dueMonthOf(item); if(!dm)return null;
    const [fy,fm]=fromYm.split('-').map(Number); let y=dm<fm?fy+1:fy;
    const paid=Number(item.lastPaidYear)||0; if(paid>=y)y=paid+1;
    return {year:y,month:dm,ym:`${y}-${String(dm).padStart(2,'0')}`};
  }
  function annualPlanV59(item,startYm,targetYm,startReserved=0){
    const amount=Math.max(0,Number(item.amount)||0);
    const shortage=Math.max(0,amount-Math.min(amount,Math.max(0,Number(startReserved)||0)));
    const months=[]; for(let ym=startYm;ym<targetYm;ym=addMonthsYm(ym,1))months.push(ym);
    const bonusDefs=bonusAllocations(item),bonusByYm={};
    for(const ym of months){
      const m=Number(ym.slice(5,7));
      for(const b of bonusDefs) if(b.month===m) bonusByYm[ym]=(bonusByYm[ym]||0)+b.amount;
    }
    const bonusTotalRaw=Object.values(bonusByYm).reduce((a,b)=>a+Number(b||0),0);
    const bonusTotal=Math.min(shortage,bonusTotalRaw);
    const regularMonths=months.filter(ym=>!(Number(bonusByYm[ym])>0));
    const reserveMode=String(item.reserveMode||'AUTO').toUpperCase();
    const custom=Number(item.monthlyReserveAmount);
    const useCustom=reserveMode==='CUSTOM'&&Number.isFinite(custom)&&custom>=0;
    const regularNeed=Math.max(0,shortage-bonusTotal);
    const regular=useCustom?custom:(regularMonths.length?Math.ceil(regularNeed/regularMonths.length):0);
    const schedule={}; let remaining=shortage;
    for(const ym of months){
      if(remaining<=0){ schedule[ym]=0; continue; }
      if(Number(bonusByYm[ym])>0){
        const b=Math.min(remaining,Number(bonusByYm[ym])||0); remaining-=b; schedule[ym]=b;
      }else{
        const r=Math.min(remaining,regular); remaining-=r; schedule[ym]=r;
      }
    }
    return {amount,shortage,bonusTotal,bonusTotalRaw,regular,regularNeed,regularMonths,bonusMonths:Object.keys(bonusByYm),schedule,remaining,months,reserveMode};
  }
  function annualReserveScheduleV59(st=stateNow(),count=7){
    const start=ymNow(),months=Array.from({length:count},(_,i)=>addMonthsYm(start,i)),totals=Object.fromEntries(months.map(m=>[m,0])),items=[];
    for(const item of (st.masters?.fixedExpenses||[]).filter(x=>x.active!==false&&String(x.cadence||'').toUpperCase()==='ANNUAL')){
      const target=annualTarget(item,start); if(!target){items.push({item,missing:true,schedule:{}});continue;}
      let cycleStart=start,reserved=reservedOf(item),cycleTarget=target,guard=0,combined={}; let currentPlan=null;
      while(cycleTarget&&guard++<3){
        const plan=annualPlanV59(item,cycleStart,cycleTarget.ym,reserved); if(!currentPlan)currentPlan=plan;
        for(const [ym,a] of Object.entries(plan.schedule)){ if(ym in totals){totals[ym]+=a;combined[ym]=(combined[ym]||0)+a;} }
        if(cycleTarget.ym>months.at(-1))break;
        cycleStart=addMonthsYm(cycleTarget.ym,1); reserved=0;
        cycleTarget={year:cycleTarget.year+1,month:cycleTarget.month,ym:`${cycleTarget.year+1}-${String(cycleTarget.month).padStart(2,'0')}`};
      }
      items.push({item,missing:false,schedule:combined,target,currentPlan});
    }
    return {months,totals,items,version:59};
  }
  window.householdAnnualReserveScheduleV41=()=>annualReserveScheduleV59(stateNow(),7);
  window.householdAnnualReserveScheduleV59=(count=7)=>annualReserveScheduleV59(stateNow(),count);
  window.householdAnnualPlanV59=annualPlanV59;
  window.householdEffectiveFlowV41=()=>{
    const st=stateNow(),reserve=annualReserveScheduleV59(st,7),rows=[]; let events=[];
    try{events=generated(220)}catch{}
    for(const ym of reserve.months){
      const monthEvents=events.filter(e=>String(e.date||'').startsWith(ym));
      const income=monthEvents.filter(e=>Number(e.amount)>0).reduce((a,e)=>a+Number(e.amount||0),0);
      const outflow=monthEvents.filter(e=>Number(e.amount)<0).reduce((a,e)=>a+Math.abs(Number(e.amount)||0),0);
      const cashFlow=income-outflow,reserveNeed=Number(reserve.totals[ym]||0);
      rows.push({ym,income,outflow,cashFlow,reserveNeed,effective:cashFlow-reserveNeed,eventCount:monthEvents.length});
    }
    return {rows,reserve,version:59};
  };

  function renderAnnualHints(){
    const host=$('semanticFixedRowsV48'); if(!host)return;
    const st=stateNow(),start=ymNow();
    host.querySelectorAll('[data-v48-fixed]').forEach(box=>{
      box.querySelector('[data-v59-auto-plan]')?.remove();
      const id=box.dataset.v48Fixed,item=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(id));
      if(!item||String(item.cadence||'').toUpperCase()!=='ANNUAL'||String(item.reserveMode||'AUTO').toUpperCase()!=='AUTO')return;
      const target=annualTarget(item,start); if(!target)return;
      const p=annualPlanV59(item,start,target.ym,reservedOf(item));
      const div=document.createElement('div');div.dataset.v59AutoPlan='1';div.className='note';div.style.marginTop='8px';
      const bonusMonths=p.bonusMonths.map(x=>`${Number(x.slice(5,7))}月`).join('・')||'なし';
      div.innerHTML=`<b>AUTO積立</b>：残額 ${yen(p.shortage)} − ボーナス充当 ${yen(p.bonusTotal)} = 通常月対象 ${yen(p.regularNeed)}<br><span class="tiny">ボーナス月 ${esc(bonusMonths)} は通常積立0円。その他 ${p.regularMonths.length}か月に ${yen(p.regular)} / 月で自動按分します。${p.remaining>0?` 未充足 ${yen(p.remaining)}`:''}</span>`;
      const controls=box.querySelector('.controls:last-child'); if(controls)controls.before(div); else box.appendChild(div);
    });
  }

  function parentEventId(e,st){
    if(e?.parent_event_id)return String(e.parent_event_id);
    if((st.events||[]).some(x=>String(x.id)===String(e?.id)))return String(e.id);
    const m=String(e?.id||'').match(/^future:(.+):(\d{4}-\d{2}-\d{2})$/); if(m&&(st.events||[]).some(x=>String(x.id)===m[1]))return m[1];
    return '';
  }
  function ensureMobileFuture(){
    let card=$('mobileFutureV59');
    if(!isMobile()){ if(card)card.style.display='none'; const table=$('eventsBody')?.closest('.table'); if(table)table.style.display=''; return null; }
    const table=$('eventsBody')?.closest('.table'); if(table)table.style.display='none';
    if(!card){
      card=document.createElement('div');card.id='mobileFutureV59';card.className='card full';
      card.innerHTML='<div class="title">将来イベント <span class="tag">携帯表示</span></div><div class="tiny" style="margin-bottom:8px">30/60/90日を切り替えても編集・削除できます。</div><div id="mobileFutureRowsV59"></div>';
      const grid=document.querySelector('#cashflow .grid'); if(grid)grid.prepend(card);
      card.addEventListener('click',e=>{const edit=e.target.closest?.('[data-v59-edit]'),del=e.target.closest?.('[data-v59-del]');if(edit)openEditor(edit.dataset.v59Edit);if(del)deleteEvent(del.dataset.v59Del)});
    }
    card.style.display=''; return card;
  }
  function renderMobileFuture(){
    const card=ensureMobileFuture(); if(!card)return;
    const st=stateNow(),h=Number($('forecastHorizon')?.value)||90; let rows=[];
    try{rows=forecast(h).rows}catch{}
    const max=70,shown=rows.slice(0,max),host=$('mobileFutureRowsV59'); if(!host)return;
    host.innerHTML=shown.length?shown.map(e=>{
      const parent=parentEventId(e,st),unknown=e.amount_unknown||e.amount===null||e.amount===''||!Number.isFinite(Number(e.amount));
      return `<div class="row v59-future-row"><div class="v59-future-main"><b>${esc(e.name||'予定')}</b><div class="tiny">${esc(e.date||'')} · ${esc(e.future_kind||e.expense_scope||e.type||'')}</div></div><div class="v59-future-side"><b class="amt ${unknown?'warn':Number(e.amount)<0?'bad':'good'}">${unknown?'未定':`${Number(e.amount)>0?'+':''}${yen(e.amount)}`}</b>${parent?`<div class="v59-actions"><button class="btn secondary" data-v59-edit="${esc(parent)}">編集</button><button class="btn danger" data-v59-del="${esc(parent)}">削除</button></div>`:''}</div></div>`;
    }).join(''):'<div class="muted">この期間の予定はありません。</div>';
    if(rows.length>max)host.insertAdjacentHTML('beforeend',`<div class="tiny" style="margin-top:8px">表示を軽くするため先頭${max}件を表示中（他 ${rows.length-max}件）</div>`);
  }

  function ensureEditor(){
    if($('futureEditorV59'))return;
    const m=document.createElement('div');m.id='futureEditorV59';m.className='hidden';m.innerHTML=`<div class="v59-modal-bg" data-v59-close></div><div class="card v59-modal"><div class="title">未来予定を編集</div><div class="form v59-editor-form"><div class="field"><label>日付</label><input id="v59Date" type="date"></div><div class="field"><label>種類</label><select id="v59Kind"><option value="INCOME">収入</option><option value="NORMAL">通常費</option><option value="SPECIAL">特別費</option><option value="INVESTMENT">投資</option><option value="DEBT">負債返済</option><option value="TRANSFER">資金移動</option></select></div><div class="field"><label>内容</label><input id="v59Name"></div><div class="field"><label>金額</label><input id="v59Amount" type="number" min="0"></div><div class="field"><label>確度</label><select id="v59Cert"><option value="CONFIRMED">確定</option><option value="ESTIMATED">概算</option><option value="TBD">未定</option></select></div><div class="field"><label>繰り返し</label><select id="v59Recurring"><option value="NONE">単発</option><option value="MONTHLY">毎月</option><option value="YEARLY">毎年</option></select></div><div class="field"><label>メモ</label><input id="v59Note"></div></div><div class="controls v59-modal-actions"><button class="btn" id="v59Save">保存</button><button class="btn secondary" id="v59Cancel">キャンセル</button></div></div>`;
    document.body.appendChild(m);m.querySelector('[data-v59-close]').onclick=closeEditor;$('v59Cancel').onclick=closeEditor;$('v59Save').onclick=saveEditor;
  }
  function inferKind(e){
    const k=String(e?.future_kind||e?.expense_scope||'').toUpperCase(); if(['INCOME','NORMAL','SPECIAL','INVESTMENT','DEBT','TRANSFER'].includes(k))return k;
    if(Number(e?.amount)>0)return'INCOME'; const t=String(e?.type||'').toUpperCase(); if(t.includes('INVEST'))return'INVESTMENT';if(t.includes('DEBT')||t.includes('LOAN'))return'DEBT';if(t.includes('TRANSFER'))return'TRANSFER';if(t.includes('SPECIAL'))return'SPECIAL';return'NORMAL';
  }
  function openEditor(id){
    ensureEditor();const st=stateNow(),e=(st.events||[]).find(x=>String(x.id)===String(id));if(!e)return;editId=e.id;
    $('v59Date').value=e.date||todayIso();$('v59Kind').value=inferKind(e);$('v59Name').value=e.name||'';$('v59Amount').value=(e.amount===null||e.amount===''||!Number.isFinite(Number(e.amount)))?'':String(Math.abs(Number(e.amount)));$('v59Cert').value=['CONFIRMED','ESTIMATED','TBD'].includes(String(e.certainty||'').toUpperCase())?String(e.certainty).toUpperCase():(e.estimated?'ESTIMATED':'CONFIRMED');$('v59Recurring').value=['NONE','MONTHLY','YEARLY'].includes(String(e.recurring||'').toUpperCase())?String(e.recurring).toUpperCase():'NONE';$('v59Note').value=e.note||'';$('futureEditorV59').classList.remove('hidden');
  }
  function closeEditor(){$('futureEditorV59')?.classList.add('hidden');editId=null;}
  function persistEvent(st,msg){
    clearCalcCache();window.treasuryRecoverySnapshot?.(`${msg}直前`);window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();window.setTreasurySaveStatus?.(`${msg}・同期中`);window.cloudSyncOnLocalSave?.();
    setTimeout(()=>{try{window.renderFuturePlannerV37?.();window.renderForecastV38?.();renderMobileFuture();}catch{}},0);
  }
  function saveEditor(){
    const st=stateNow(),e=(st.events||[]).find(x=>String(x.id)===String(editId));if(!e)return;
    const date=$('v59Date').value,name=$('v59Name').value.trim(),kind=$('v59Kind').value,raw=$('v59Amount').value,cert=$('v59Cert').value,rec=$('v59Recurring').value,note=$('v59Note').value.trim();
    if(!date||!name)return alert('日付・内容を確認してください。');const n=raw===''?null:Number(raw);if(n!==null&&!Number.isFinite(n))return alert('金額を確認してください。');
    const amount=n===null?null:(kind==='INCOME'?Math.abs(n):-Math.abs(n));Object.assign(e,{date,name,amount,type:`FUTURE_${kind}`,future_kind:kind,expense_scope:kind==='INCOME'?null:kind,certainty:cert,estimated:cert!=='CONFIRMED',recurring:rec,note,updatedAt:new Date().toISOString(),futurePlannerVersion:1});persistEvent(st,'未来予定編集');closeEditor();
  }
  function deleteEvent(id){const st=stateNow(),e=(st.events||[]).find(x=>String(x.id)===String(id));if(!e)return;if(!confirm(`「${e.name}」を削除しますか？`))return;st.events=st.events.filter(x=>String(x.id)!==String(id));persistEvent(st,'未来予定削除');}

  function installMobileCss(){
    if($('mobileCssV59'))return;const s=document.createElement('style');s.id='mobileCssV59';s.textContent=`
      @media(max-width:760px){
        #semanticReviewV48 [data-v48-kind] .form,#semanticReviewV48 .form{grid-template-columns:minmax(0,1fr)!important;width:100%!important}
        #semanticReviewV48 .card{max-width:100%!important;overflow:hidden}
        #semanticReviewV48 input,#semanticReviewV48 select{width:100%!important;max-width:100%!important;min-width:0!important}
        #semanticReviewV48 .controls{display:grid!important;grid-template-columns:1fr!important;width:100%;gap:8px;flex-wrap:wrap!important}
        #semanticReviewV48 .controls .btn{width:100%}
        #semanticFixedMasterV48 .form{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}
        #semanticFixedMasterV48 input,#semanticFixedMasterV48 select{max-width:100%;width:100%;min-width:0}
        #cashflowForecastChartV21[data-v59-dummy="1"]{display:none!important}
        .v59-future-row{align-items:flex-start!important;gap:8px!important;flex-wrap:wrap!important}
        .v59-future-main{min-width:0;flex:1 1 180px}.v59-future-side{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:0 0 auto}.v59-actions{display:flex;gap:6px}.v59-actions .btn{padding:7px 9px}
        .v59-modal-bg{position:fixed;inset:0;background:#0009;z-index:10300}.v59-modal{position:fixed;z-index:10301;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,560px);max-height:90vh;overflow:auto}.v59-editor-form{grid-template-columns:1fr!important}.v59-modal-actions{margin-top:12px;flex-wrap:wrap}.v59-modal-actions .btn{flex:1}
      }
      @media(max-width:480px){#semanticFixedMasterV48 .form{grid-template-columns:minmax(0,1fr)!important}}
    `;document.head.appendChild(s);
  }
  function disableHeavyChartOnMobile(){
    const existing=$('cashflowForecastChartV21');
    if(isMobile()){
      if(existing&&!existing.dataset.v59Dummy)existing.remove();
      if(!$('cashflowForecastChartV21')){const d=document.createElement('div');d.id='cashflowForecastChartV21';d.dataset.v59Dummy='1';d.style.display='none';document.body.appendChild(d);}
    }else if(existing?.dataset.v59Dummy){existing.remove();setTimeout(()=>window.renderCashflowChartV21?.(),0)}
  }

  function renderAll(){ disableHeavyChartOnMobile();renderMobileFuture();renderAnnualHints(); }
  function queueRender(delay=80){clearTimeout(renderTimer);renderTimer=setTimeout(renderAll,delay);}
  function boot(){
    installMobileCss();disableHeavyChartOnMobile();renderAll();
    document.addEventListener('change',e=>{if(e.target?.id==='forecastHorizon'){clearCalcCache();queueRender(120)}});
    document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="cashflow"],[data-page="settings"]'))queueRender(80);if(e.target.closest?.('[data-v48-fixed-save],[data-v48-add]'))queueRender(180)});
    mobileMq.addEventListener?.('change',()=>{clearCalcCache();renderAll()});
    window.addEventListener('focus',()=>queueRender(100));
    window.renderMobileCashflowV59=renderAll;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
