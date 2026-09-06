(() => {
  const $=id=>document.getElementById(id);
  const mobileMq=window.matchMedia('(max-width:820px)');

  function installCss(){
    if($('mobileHostStyleV70'))return;
    const s=document.createElement('style');
    s.id='mobileHostStyleV70';
    s.textContent=`
      @media(max-width:820px){
        #mobileCashflowV60{display:block!important;grid-column:1/-1!important}
        #mobileCashflowV60 .v60-horizons{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0 12px}
        #mobileCashflowV60 .v60-horizons button{padding:10px 4px;min-width:0;font-size:13px}
        #mobileCashflowV60 .v60-horizons button.active{background:#28436c;border-color:#7dd3fc;color:#eef4ff}
        #mobileCashflowV60 .v60-row{display:block;padding:11px 0;border-bottom:1px solid #263755}
        #mobileCashflowV60 .v60-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
        #mobileCashflowV60 .v60-name{min-width:0;flex:1;overflow-wrap:anywhere}
        #mobileCashflowV60 .v60-actions{display:flex;gap:7px;margin-top:8px;justify-content:flex-end;flex-wrap:wrap}
        #mobileCashflowV60 .v60-actions .btn{padding:8px 13px}
        #mobileFutureV59{display:none!important}
        #cashflow #eventsBody{display:none!important}
      }
      @media(min-width:821px){#mobileCashflowV60{display:none!important}}
    `;
    document.head.appendChild(s);
  }

  function ensureUi(){
    installCss();
    let card=$('mobileCashflowV60');
    if(card)return card;
    const grid=document.querySelector('#cashflow .grid');
    if(!grid)return null;
    card=document.createElement('div');
    card.id='mobileCashflowV60';
    card.className='card full';
    card.innerHTML=`<div><div class="title" style="margin-bottom:3px">将来イベント <span class="tag">携帯 v70</span></div><div class="tiny">スマホCash Flowは単一の操作層で表示します。</div></div><div class="v60-horizons"><button class="btn secondary active" data-v60-h="30">30日</button><button class="btn secondary" data-v60-h="60">60日</button><button class="btn secondary" data-v60-h="90">90日</button><button class="btn secondary" data-v60-h="180">6か月</button></div><div id="mobileCashflowRowsV60"></div>`;
    grid.prepend(card);
    card.addEventListener('click',e=>{
      const b=e.target.closest?.('[data-v60-h]');
      if(!b)return;
      card.querySelectorAll('[data-v60-h]').forEach(x=>x.classList.toggle('active',x===b));
      const sel=$('forecastHorizon');
      if(sel)sel.value=String(Number(b.dataset.v60H)||30);
      // v68 remains the sole row renderer and handles the bubbled click.
    });
    return card;
  }

  function boot(){
    if(!mobileMq.matches)return;
    ensureUi();
    window.renderMobileHostV70=ensureUi;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
