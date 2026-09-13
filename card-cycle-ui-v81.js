(() => {
  if(window.__cardCycleUiV81)return;window.__cardCycleUiV81=true;
  const $=id=>document.getElementById(id),stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{},cycle=()=>window.householdCardCycleV81;
  let timer=null;

  function cardById(id){return (stateNow().masters?.cards||[]).find(c=>String(c.id)===String(id))||null}
  function augmentCards(){
    const root=$('unifiedCardsV77');if(!root)return;
    for(const box of root.querySelectorAll('[data-v77-card]')){
      const c=cardById(box.dataset.v77Card);if(!c)continue;let input=box.querySelector('[data-v81-closing]');
      const settle=box.querySelector('[data-v77-day]')?.closest('.field');
      if(!input&&settle){const f=document.createElement('div');f.className='field';f.innerHTML=`<label>締め日</label><input data-v81-closing type="number" min="1" max="31" inputmode="numeric" placeholder="例 JAL 15"><div class="tiny" data-v81-cycle-note></div>`;settle.after(f);input=f.querySelector('[data-v81-closing]')}
      if(input){const val=cycle()?.closingDayValue?.(c);if(document.activeElement!==input)input.value=val||'';const note=input.parentElement?.querySelector('[data-v81-cycle-note]'),pay=cycle()?.settlementDayValue?.(c);if(note)note.textContent=val&&pay?`${val}日締め → 翌月${pay}日引落${cycle()?.canonicalCard?.(c.name)==='JAL'?'（12/30利用 → 2/10）':''}`:'締め日を設定すると、利用日から正しい請求月へ振り分けます。'}
    }
  }

  function repairPaymentCardSelects(){
    const st=stateNow(),cards=(st.masters?.cards||[]).filter(c=>c.active!==false);
    for(const box of document.querySelectorAll('[data-v48-fixed]')){
      const m=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(box.dataset.v48Fixed)),sel=box.querySelector('[data-f-card]');if(!m||!sel)continue;
      const route=String(box.querySelector('[data-f-route]')?.value||m.paymentRoute||m.payment_route||'DIRECT').toUpperCase();
      const resolved=cycle()?.resolveCardName?.(m.paymentCard)||m.paymentCard||'';
      const before=sel.value;
      sel.innerHTML='<option value="">未指定</option>'+cards.map(c=>`<option value="${String(c.name).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}">${String(c.name).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}</option>`).join('');
      // v97: a card selected in the open editor is a draft value. Preserve it until Save.
      // Previously the persisted paymentCard won here, so annual rows snapped back to JAL/DC ~120ms after selecting Rakuten.
      const draft=cards.find(c=>String(c.name)===String(before))?.name||cards.find(c=>cycle()?.sameCard?.(c.name,before))?.name||'';
      const persisted=cards.find(c=>cycle()?.sameCard?.(c.name,resolved))?.name||cards.find(c=>String(c.name)===String(resolved))?.name||resolved;
      const desired=draft||persisted;sel.value=cards.some(c=>String(c.name)===String(desired))?desired:'';sel.disabled=route!=='CARD';
      let info=box.querySelector('[data-v81-card-route-note]');if(!info){info=document.createElement('div');info.dataset.v81CardRouteNote='1';info.className='tiny';sel.parentElement?.appendChild(info)}if(info)info.textContent=route==='CARD'?(sel.value?`請求先: ${sel.value}`:'カード未指定'):'カード請求ではありません';
    }
  }

  document.addEventListener('click',e=>{
    const save=e.target.closest?.('[data-v77-save]');if(!save)return;const box=save.closest('[data-v77-card]'),input=box?.querySelector('[data-v81-closing]');if(!box||!input)return;
    const raw=input.value.trim(),n=raw===''?null:Number(raw);if(n!==null&&(!Number.isInteger(n)||n<1||n>31)){e.preventDefault();e.stopImmediatePropagation();alert('締め日は1〜31で入力してください。');return}
    const c=cardById(box.dataset.v77Card);if(c){c.closingDay=n;c.statementClosingDay=n}
  },true);

  function render(){augmentCards();repairPaymentCardSelects()}
  function schedule(ms=120){clearTimeout(timer);timer=setTimeout(render,ms)}
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="settings"],[data-v77-save],[data-v48-fixed-save],[data-v80-add-annual]'))schedule(160)},false);
  document.addEventListener('change',e=>{if(e.target.closest?.('[data-v48-fixed]')||e.target.closest?.('[data-v77-card]'))schedule(120)},false);
  window.addEventListener('treasury:pagechange',e=>{if(e?.detail?.page==='settings')schedule(160)});window.addEventListener('pageshow',()=>schedule(220));
  const prev=window.replaceTreasuryState;if(typeof prev==='function'&&!window.__cardCycleUiReplaceV81){window.__cardCycleUiReplaceV81=true;window.replaceTreasuryState=function(n){const r=prev(n);schedule(180);return r}}
  setTimeout(()=>schedule(260),0);window.householdCardCycleUiV81={render,augmentCards,repairPaymentCardSelects};
})();
