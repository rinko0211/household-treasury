(() => {
  if (window.__planningUiV80) return;
  window.__planningUiV80 = true;

  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  let timer=null;

  function annualIds(){return new Set((stateNow().masters?.fixedExpenses||[]).filter(x=>x.active!==false&&String(x.cadence||'').toUpperCase()==='ANNUAL').map(x=>String(x.id)))}
  function ensureAnnualCard(){
    const fixed=$('semanticFixedMasterV48'),grid=document.querySelector('#settings .grid');if(!fixed||!grid)return null;
    const title=fixed.querySelector('.title');if(title)title.childNodes[0].textContent='毎月・準固定費 ';
    const annualAdd=fixed.querySelector('[data-v48-add="ANNUAL"]');if(annualAdd)annualAdd.style.display='none';
    let card=$('annualSpecialV80');if(!card){card=document.createElement('div');card.id='annualSpecialV80';card.className='card full';card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap"><div><div class="title">年間特別費・年払い <span class="tag">v80</span></div><div class="tiny">ふるさと納税・税金・保険・車関連など、毎月の固定費とは別に年間単位で管理します。年額・支払月・積立・ボーナス充当はこの枠で確認できます。</div></div><button type="button" class="btn secondary" data-v80-add-annual>＋年間支出</button></div><div id="annualSpecialRowsV80" style="margin-top:10px"></div>`;fixed.after(card);card.addEventListener('click',annualClick);card.addEventListener('change',annualChange)}
    return card;
  }
  function syncAnnualRows(){
    const card=ensureAnnualCard(),fixedHost=$('semanticFixedRowsV48'),annualHost=$('annualSpecialRowsV80');if(!card||!fixedHost||!annualHost)return;
    try{window.householdPlanningUiV79?.enhanceAnnualBoxes?.()}catch{}
    const ids=annualIds();
    for(const box of [...annualHost.querySelectorAll('[data-v48-fixed]')])if(!ids.has(String(box.dataset.v48Fixed)))box.remove();
    for(const box of [...fixedHost.querySelectorAll('[data-v48-fixed]')]){
      const cad=box.querySelector('[data-f-cad]')?.value||'';if(cad!=='ANNUAL')continue;
      const id=String(box.dataset.v48Fixed||''),old=[...annualHost.querySelectorAll('[data-v48-fixed]')].find(x=>String(x.dataset.v48Fixed||'')===id);if(old&&old!==box)old.replaceWith(box);else if(!old)annualHost.appendChild(box);
    }
    const existing=annualHost.querySelectorAll('[data-v48-fixed]').length;let empty=$('annualSpecialEmptyV80');if(!existing){if(!empty){empty=document.createElement('div');empty.id='annualSpecialEmptyV80';empty.className='muted';empty.textContent='年間支出はありません。';annualHost.appendChild(empty)}}else empty?.remove();
  }
  function legacyAction(box,button){const host=$('semanticFixedRowsV48');if(!host||!box||!button)return;host.appendChild(box);setTimeout(()=>button.click(),0)}
  function annualClick(e){
    const add=e.target.closest?.('[data-v80-add-annual]');if(add){e.preventDefault();e.stopPropagation();const legacy=$('semanticFixedMasterV48')?.querySelector('[data-v48-add="ANNUAL"]');legacy?.click();schedule(180);return}
    const box=e.target.closest?.('[data-v48-fixed]');if(!box)return;
    const save=e.target.closest?.('[data-v48-fixed-save]'),del=e.target.closest?.('[data-v48-fixed-del]');if(!save&&!del)return;
    e.preventDefault();e.stopPropagation();legacyAction(box,save||del);schedule(220);
  }
  function annualChange(e){
    const box=e.target.closest?.('[data-v48-fixed]');if(!box)return;
    if(!e.target.matches('[data-f-cat],[data-f-econ],[data-f-route]'))return;
    const host=$('semanticFixedRowsV48'),annualHost=$('annualSpecialRowsV80');if(!host||!annualHost)return;
    e.stopPropagation();host.appendChild(box);e.target.dispatchEvent(new Event('change',{bubbles:true}));annualHost.appendChild(box);
  }
  function patchDashboard(){
    const root=$('dashboardPlanningV79');if(!root)return;for(const t of root.querySelectorAll('.title'))if(t.textContent.includes('年払い・ボーナス使途'))t.childNodes[0].textContent='年間特別費・ボーナス使途';
    root.querySelectorAll('th').forEach(th=>{if(th.textContent.trim()==='年払い積立')th.textContent='年間特別費積立'});
  }
  function renderBaselinePreview(){
    const box=$('cardBaselineV79');if(!box)return;let host=$('cardBaselinePreviewV80');if(!host){host=document.createElement('div');host.id='cardBaselinePreviewV80';host.style.marginTop='8px';box.appendChild(host)}
    const cards=window.householdPlanningV80?.baselinePreview?.(6)||[];host.innerHTML=cards.length?`<details><summary class="tiny" style="cursor:pointer">標準額の6か月反映を確認</summary>${cards.map(c=>`<div class="card" style="padding:8px;margin-top:7px"><b>${esc(c.card)}</b><div class="tiny">${c.settlementDay?`引落 ${c.settlementDay}日`:'引落日未設定'}</div><div class="controls" style="margin-top:6px;flex-wrap:wrap">${c.months.map(m=>`<span class="tag">${Number(m.ym.slice(5,7))}月 ${yen(m.amount)}${m.source==='ACTUAL'?' 確定':m.source==='OVERRIDE'?' 補正':' 標準'}</span>`).join('')}</div></div>`).join('')}</details>`:'';
  }
  function boundaryNotice(){
    const card=$('mobileCashflowV60');if(!card)return;let host=$('baselineBoundaryV80');if(!host){host=document.createElement('div');host.id='baselineBoundaryV80';host.className='tiny';host.style.marginTop='8px';card.appendChild(host)}
    const days=Number(card.querySelector('[data-v60-h].active')?.dataset.v60H)||30,range=window.householdPlanningV80?.coveredMonths?.(days),preview=window.householdPlanningV80?.baselinePreview?.(2)||[];if(!range){host.textContent='';return}
    const next=[];for(const c of preview){for(const m of c.months){if(!m.date||m.date<=range.to)continue;if(String(m.date).slice(0,7)===String(range.to).slice(0,7))next.push(`${c.card} ${m.date} ${yen(m.amount)}`);break}}
    host.innerHTML=next.length?`※表示期間は ${esc(range.to)} まで。同じ月でも期間外の標準請求: ${next.map(esc).join(' / ')}`:'';
  }
  function render(){syncAnnualRows();patchDashboard();renderBaselinePreview();boundaryNotice()}
  function schedule(ms=140){clearTimeout(timer);timer=setTimeout(render,ms)}

  document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="settings"],[data-page="dashboard"],[data-page="cashflow"],[data-v60-h]'))schedule(160)},false);
  window.addEventListener('treasury:pagechange',()=>schedule(180));window.addEventListener('pageshow',()=>schedule(220));
  const prevReplace=window.replaceTreasuryState;if(typeof prevReplace==='function'&&!window.__planningUiReplaceV80){window.__planningUiReplaceV80=true;window.replaceTreasuryState=function(n){const r=prevReplace(n);schedule(220);return r}}
  setTimeout(()=>schedule(260),0);window.householdPlanningUiV80={render,syncAnnualRows,patchDashboard,renderBaselinePreview,boundaryNotice};
})();
