(() => {
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const routeOf=m=>String(m?.paymentRoute||m?.payment_route||'DIRECT').toUpperCase();
  function canonicalCard(s){
    const n=norm(s).replace(/カード|CARD/g,'');if(!n)return'';
    if(/RAKUTEN|楽天/.test(n))return'Rakuten';
    if(/KABU&|KABUAND|カブアンド|ＫＡＢＵ＆/.test(n))return'KABU&';
    if(/MUFG|三菱UFJ|ミツビシUFJ|DC|JAL/.test(n))return'MUFG/DC/JAL';
    if(/JCB|ジェーシービー|シ゛エーシーヒ゛ー/.test(n))return'JCB';
    return String(s||'').trim();
  }
  function sameCard(a,b){const x=canonicalCard(a),y=canonicalCard(b);return !!x&&!!y&&norm(x)===norm(y)}
  function migrate(st){
    st.masters=st.masters||{};st.masters.cards=Array.isArray(st.masters.cards)?st.masters.cards:[];st.masters.fixedExpenses=Array.isArray(st.masters.fixedExpenses)?st.masters.fixedExpenses:[];let changed=false;
    for(const c of st.masters.cards){const label=canonicalCard(c.name);if(label&&c.importLabel!==label){c.importLabel=label;changed=true}}
    for(const m of st.masters.fixedExpenses){if(routeOf(m)!=='CARD'||!m.paymentCard)continue;const next=canonicalCard(m.paymentCard);if(next&&next!==m.paymentCard){m.paymentCard=next;changed=true}}
    if(st.cardIdentityVersion!==1){st.cardIdentityVersion=1;changed=true}
    return changed;
  }
  function patchSelects(){
    const st=stateNow();for(const box of document.querySelectorAll('[data-v48-fixed]')){const id=box.dataset.v48Fixed,m=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(id)),sel=box.querySelector('[data-f-card]');if(!m||!sel||routeOf(m)!=='CARD')continue;const current=canonicalCard(m.paymentCard);if(!current)continue;let opt=[...sel.options].find(o=>sameCard(o.value,current)||sameCard(o.textContent,current));if(!opt){opt=document.createElement('option');opt.value=current;opt.textContent=`${current}（CSV取込名）`;sel.appendChild(opt)}opt.value=current;sel.value=current}
  }
  function persistMigration(){const st=stateNow();if(!migrate(st))return;window.treasuryRecoverySnapshot?.('カード名正規化v51直前');window.replaceTreasuryState?.(st);window.setTreasurySaveStatus?.('カード名正規化済み・同期中');window.cloudSyncOnLocalSave?.()}
  function boot(){persistMigration();setTimeout(patchSelects,0);document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="settings"]'))setTimeout(patchSelects,20)});const prev=window.renderSemanticUiV48;if(typeof prev==='function')window.renderSemanticUiV48=function renderSemanticUiV48WithCardIdentity(){const r=prev();setTimeout(patchSelects,0);return r};window.householdCardIdentityV51={canonicalCard,sameCard,patchSelects}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
