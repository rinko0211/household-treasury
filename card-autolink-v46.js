(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const scopeOf=x=>{const s=String(x?.expense_scope||x?.ordinary_or_special||'NORMAL').toUpperCase();return s==='ORDINARY'?'NORMAL':s};
  let busy=false,timer=null,observer=null;

  function cardKey(s){return norm(s).replace(/カード|CARD/g,'')}
  function sameCard(a,b){const x=cardKey(a),y=cardKey(b);return !!x&&!!y&&(x===y||x.includes(y)||y.includes(x))}
  function purchaseId(p,i){return String(p.purchase_id||p.id||`purchase:${i}`)}
  function purchaseAmount(p){const v=p.payment_amount;return v!==null&&v!==''&&Number.isFinite(Number(v))?Math.abs(Number(v)):Math.abs(Number(p.original_amount)||0)}
  function routeOf(m){return String(m?.paymentRoute||m?.payment_route||'DIRECT').toUpperCase()}
  function eligibleMasters(st){return (st.masters?.fixedExpenses||[]).filter(m=>m.active!==false&&routeOf(m)==='CARD')}

  function scoreMaster(p,m){
    const merchant=norm(p.merchant_raw||p.merchant_normalized||''),name=norm(m.name||'');if(!merchant||!name)return 0;
    if(m.paymentCard&&!sameCard(m.paymentCard,p.card))return 0;
    let score=0;
    const aliases=Array.isArray(m.merchantAliases)?m.merchantAliases.map(norm).filter(Boolean):[];
    if(aliases.includes(merchant))score=140;
    else if(name===merchant)score=130;
    else if(aliases.some(a=>a.length>=4&&(merchant.includes(a)||a.includes(merchant))))score=110;
    else if(name.length>=4&&(merchant.includes(name)||name.includes(merchant)))score=90;
    if(Math.abs(Math.abs(Number(m.amount)||0)-purchaseAmount(p))<=1)score+=20;
    if(m.paymentCard&&sameCard(m.paymentCard,p.card))score+=10;
    return score;
  }
  function matchMaster(st,p){
    const ranked=eligibleMasters(st).map(m=>({m,score:scoreMaster(p,m)})).filter(x=>x.score>=100).sort((a,b)=>b.score-a.score);
    if(!ranked.length)return null;if(ranked.length>1&&ranked[0].score===ranked[1].score)return null;return ranked[0].m;
  }

  function linkFixedMasters(st){
    let changed=false,linked=0;
    const masters=st.masters?.fixedExpenses||[];
    (st.purchaseEvents||[]).forEach(p=>{
      if(p.fixed_expense_master_id&&masters.some(m=>String(m.id)===String(p.fixed_expense_master_id)))return;
      const m=matchMaster(st,p);if(!m)return;
      p.fixed_expense_master_id=m.id;p.fixed_expense_name=m.name;p.is_fixed_expense=true;p.payment_route='CARD';
      const scope=scopeOf(m);p.expense_scope=scope;p.ordinary_or_special=scope;p.fixed_link_source='auto-v46';p.fixed_linked_at=new Date().toISOString();
      if(!m.paymentCard&&p.card)m.paymentCard=p.card;
      m.merchantAliases=Array.isArray(m.merchantAliases)?m.merchantAliases:[];
      const raw=String(p.merchant_raw||'').trim();if(raw&&!m.merchantAliases.some(a=>norm(a)===norm(raw)))m.merchantAliases.push(raw);
      changed=true;linked++;
    });
    return{changed,linked};
  }

  function linkSettlements(st){
    let changed=false,linked=0;
    const purchases=st.purchaseEvents||[];
    for(const s of st.cardSettlements||[]){
      if(!s.due_date||!s.card)continue;const month=String(s.due_date).slice(0,7);
      let cands=purchases.map((p,i)=>({p,i})).filter(x=>sameCard(x.p.card,s.card)&&String(x.p.billing_month||'')===month);
      if(s.source_file){const sameFile=cands.filter(x=>x.p.source_file===s.source_file);if(sameFile.length)cands=sameFile}
      const ids=cands.map(x=>purchaseId(x.p,x.i));
      for(const x of cands){
        if(String(x.p.card_settlement_id||'')!==String(s.settlement_id||'')){x.p.card_settlement_id=s.settlement_id;x.p.settlement_due_date=s.due_date;changed=true;linked++}
      }
      const total=cands.reduce((a,x)=>a+purchaseAmount(x.p),0),count=cands.length;
      if(JSON.stringify(s.purchase_ids||[])!==JSON.stringify(ids)){s.purchase_ids=ids;changed=true}
      if(Number(s.detail_count||0)!==count){s.detail_count=count;changed=true}
      if(Number(s.detail_payment_total||0)!==total){s.detail_payment_total=total;changed=true}
      const delta=Math.round((Math.abs(Number(s.amount)||0)-total)*100)/100;
      if(Number(s.detail_difference||0)!==delta){s.detail_difference=delta;changed=true}
      const complete=count>0&&Math.abs(delta)<=1;
      if(Boolean(s.detail_reconciled)!==complete){s.detail_reconciled=complete;changed=true}
    }
    return{changed,linked};
  }

  function reconcile(st){
    st.masters=st.masters||{};st.masters.fixedExpenses=Array.isArray(st.masters.fixedExpenses)?st.masters.fixedExpenses:[];
    st.purchaseEvents=Array.isArray(st.purchaseEvents)?st.purchaseEvents:[];st.cardSettlements=Array.isArray(st.cardSettlements)?st.cardSettlements:[];
    const a=linkSettlements(st),b=linkFixedMasters(st);if(a.changed||b.changed){st.cardAutoLinkVersion=1;if(st.masters)st.masters.updatedAt=new Date().toISOString()}
    return{changed:a.changed||b.changed,settlementLinks:a.linked,fixedLinks:b.linked};
  }
  function persistReconcile(reason='カード明細自動整理'){
    if(busy)return{changed:false};const st=stateNow(),r=reconcile(st);if(!r.changed){renderCenter();return r}
    busy=true;try{window.replaceTreasuryState?.(st);window.setTreasurySaveStatus?.('カード明細自動整理済み・同期中');window.cloudSyncOnLocalSave?.()}finally{setTimeout(()=>busy=false,0)}
    setTimeout(()=>{renderCenter();window.renderUnifiedFixedMasterV43?.();window.renderAutoLinkAuditV33?.()},0);return r;
  }

  const previousImportOne=typeof importOne==='function'?importOne:null;
  if(previousImportOne){
    importOne=async function importOneV46(file){const result=await previousImportOne(file),r=persistReconcile('カードCSV取込後自動整理');result.autoLinkedDetails=(result.autoLinkedDetails||0)+r.settlementLinks;result.autoLinkedFixed=(result.autoLinkedFixed||0)+r.fixedLinks;return result};
  }

  function detailsFor(st,s){return (st.purchaseEvents||[]).filter(p=>String(p.card_settlement_id||'')===String(s.settlement_id||''))}
  function ensureUi(){
    if($('cardClaimsV46'))return true;const grid=document.querySelector('#cashflow .grid');if(!grid)return false;
    const card=document.createElement('div');card.id='cardClaimsV46';card.className='card full';card.innerHTML=`<div class="title">カード請求・内訳 <span class="tag">自動 v46</span></div><div class="tiny" style="margin-bottom:10px">カードCSV取込時に、請求と利用明細を自動で紐付けます。固定費マスタ（カード払い）とも名称・金額から一意に一致したものを自動リンクします。</div><div id="cardClaimsRowsV46"></div>`;
    const first=grid.firstElementChild;if(first)grid.insertBefore(card,first);else grid.appendChild(card);return true;
  }
  function renderCenter(){
    if(!ensureUi())return;const st=stateNow(),all=[...(st.cardSettlements||[])].filter(s=>s.due_date).sort((a,b)=>String(b.due_date).localeCompare(String(a.due_date))).slice(0,24);
    $('cardClaimsRowsV46').innerHTML=all.length?all.map(s=>{
      const ds=detailsFor(st,s),total=ds.reduce((a,p)=>a+purchaseAmount(p),0),diff=Math.round((Math.abs(Number(s.amount)||0)-total)*100)/100,ok=ds.length&&Math.abs(diff)<=1;
      const rows=ds.map(p=>`<div class="row"><div style="min-width:0"><b>${esc(p.merchant_raw||'カード利用')}</b><div class="tiny">${esc(p.purchase_date||'')}${p.is_fixed_expense?` · 固定費: ${esc(p.fixed_expense_name||'リンク済み')}`:''}${p.category?` · ${esc(p.category)}`:''}</div></div><b class="amt">${yen(purchaseAmount(p))}</b></div>`).join('');
      return `<details class="card" style="padding:12px;margin-top:8px"><summary style="cursor:pointer"><b>${esc(s.card||'カード')} · ${esc(s.due_date)}</b>　<span class="amt">${yen(s.amount)}</span>　<span class="tiny ${ok?'good':ds.length?'warn':''}">${ds.length?`内訳 ${ds.length}件 / ${yen(total)}${ok?' ✓':` / 差 ${yen(diff)}`}`:'内訳未取得'}</span></summary><div style="margin-top:8px">${rows||'<div class="muted">この請求に紐づく利用明細はまだありません。</div>'}</div></details>`;
    }).join(''):'<div class="muted">カード請求はまだありません。</div>';
  }
  function queue(){clearTimeout(timer);timer=setTimeout(()=>{persistReconcile();renderCenter()},80)}
  function boot(){persistReconcile('既存カードデータ自動整理');renderCenter();document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="cashflow"],[data-page="imports"]'))setTimeout(()=>{persistReconcile();renderCenter()},0)});const host=$('importResults');if(host){observer=new MutationObserver(queue);observer.observe(host,{childList:true,subtree:true,characterData:true})}window.addEventListener('focus',queue);window.renderCardClaimsV46=renderCenter;window.reconcileCardDetailsV46=()=>persistReconcile('手動再整理')}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();