(() => {
  const CARD_ID='autoLinkAuditCardV33';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const signed=n=>`${Number(n)>=0?'+':''}${yen(n)}`;
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  let observer=null,renderTimer=null,showAll=false;

  function cashName(t){return [t?.source,t?.description_raw||t?.description].filter(Boolean).join(' · ')||'銀行明細'}
  function invName(x){return [x?.security_name||x?.symbol||x?.asset_type||'投資取引',x?.side].filter(Boolean).join(' · ')}
  function settleName(s){return `${s?.card||'カード'}支払`}
  function detailLine(date,name,amount,file){
    return `<div style="min-width:0;flex:1"><b>${esc(name)}</b><div class="tiny">${esc(date||'日付不明')}${file?` · ${esc(file)}`:''}</div></div><b class="amt ${Number(amount)<0?'bad':'good'}">${signed(amount)}</b>`;
  }

  function collect(state){
    const cash=state.cashTransactions||[],settlements=state.cardSettlements||[],investments=state.investmentEvents||[];
    const cashById=new Map(cash.map(x=>[String(x.id),x]));
    const invById=new Map(investments.map(x=>[String(x.investment_id),x]));
    const linked=[],unresolved=[];

    for(const s of settlements){
      if(s.bank_transaction_id){
        const t=cashById.get(String(s.bank_transaction_id));
        linked.push({kind:'カード支払 ↔ 銀行引落',basis:'同額・支払期日±5日・カード名で一意一致',left:{date:s.due_date,name:settleName(s),amount:-Math.abs(Number(s.amount)||0),file:s.source_file},right:t?{date:t.date,name:cashName(t),amount:Number(t.amount)||0,file:t.source_file}:{date:'',name:`銀行明細ID ${s.bank_transaction_id}`,amount:0,file:''},broken:!t});
      }else{
        unresolved.push({kind:'カード支払',date:s.due_date,name:settleName(s),amount:-Math.abs(Number(s.amount)||0),reason:'対応する銀行引落を一意に特定できていません。'});
      }
    }

    const groups=new Map();
    for(const t of cash){if(t.transfer_group_id){const k=String(t.transfer_group_id);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t)}}
    for(const items of groups.values()){
      const bank=items.find(x=>x.source!=='Rakuten Securities')||items[0];
      const broker=items.find(x=>x.source==='Rakuten Securities')||items.find(x=>x!==bank);
      if(!bank||!broker)continue;
      linked.push({kind:'銀行 ↔ 証券 資金移動',basis:'同額・反対符号・日付近接で一意一致',left:{date:bank.date,name:cashName(bank),amount:Number(bank.amount)||0,file:bank.source_file},right:{date:broker.date,name:cashName(broker),amount:Number(broker.amount)||0,file:broker.source_file}});
    }

    const seenInvestmentLinks=new Set();
    for(const t of cash){
      if(!t.linked_investment_id)continue;
      const inv=invById.get(String(t.linked_investment_id));
      const key=`${t.id}|${t.linked_investment_id}`;seenInvestmentLinks.add(key);
      linked.push({kind:'証券入出金 ↔ 投資取引',basis:'同額・日付±3日で一意一致',left:{date:t.date,name:cashName(t),amount:Number(t.amount)||0,file:t.source_file},right:inv?{date:inv.date,name:invName(inv),amount:Number(inv.amount)||0,file:inv.source_file}:{date:'',name:`投資取引ID ${t.linked_investment_id}`,amount:0,file:''},broken:!inv});
    }
    for(const inv of investments){
      if(!inv.funding_cash_transaction_id)continue;
      const t=cashById.get(String(inv.funding_cash_transaction_id));
      const key=`${inv.funding_cash_transaction_id}|${inv.investment_id}`;
      if(seenInvestmentLinks.has(key))continue;
      linked.push({kind:'証券入出金 ↔ 投資取引',basis:'投資取引側に保存された資金明細リンク',left:t?{date:t.date,name:cashName(t),amount:Number(t.amount)||0,file:t.source_file}:{date:'',name:`資金明細ID ${inv.funding_cash_transaction_id}`,amount:0,file:''},right:{date:inv.date,name:invName(inv),amount:Number(inv.amount)||0,file:inv.source_file},broken:!t});
    }

    for(const t of cash){
      const desc=String(t.description_raw||t.description||'').normalize('NFKC');
      if(t.source!=='Rakuten Securities'&&t.is_transfer&&/ラクテン.*ショウケン|楽天.*証券/i.test(desc)&&!t.transfer_group_id){
        unresolved.push({kind:'銀行→証券',date:t.date,name:cashName(t),amount:Number(t.amount)||0,reason:'対応する証券側入出金が一意に見つかっていません。'});
      }
    }

    linked.sort((a,b)=>String(b.left?.date||b.right?.date||'').localeCompare(String(a.left?.date||a.right?.date||'')));
    unresolved.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    return{linked,unresolved};
  }

  function ensureUi(){
    if($(CARD_ID))return true;
    const grid=document.querySelector('#imports .grid');if(!grid)return false;
    const card=document.createElement('div');card.id=CARD_ID;card.className='card full';
    card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><div class="title" style="margin-bottom:3px">自動リンク詳細 <span class="tag">Phase 2</span></div><div class="tiny">二重計上を防ぐため、どの明細同士が同じ経済イベントとして結び付いているかを表示します。</div></div><div class="controls"><button class="btn secondary" id="refreshAutoLinkAuditV33">再読込</button><button class="btn secondary" id="toggleAutoLinkAuditV33">全件表示</button></div></div><div id="autoLinkSummaryV33" class="form" style="margin-top:12px"></div><div id="autoLinkRowsV33" style="margin-top:10px"></div><div id="autoLinkUnresolvedV33" style="margin-top:12px"></div>`;
    const summary=$('importSummary')?.closest('.card');
    if(summary&&summary.parentElement===grid)summary.after(card);else grid.appendChild(card);
    $('refreshAutoLinkAuditV33').onclick=renderAudit;
    $('toggleAutoLinkAuditV33').onclick=()=>{showAll=!showAll;$('toggleAutoLinkAuditV33').textContent=showAll?'最新20件':'全件表示';renderAudit()};
    return true;
  }

  function renderAudit(){
    if(!ensureUi())return;
    const state=stateNow(),{linked,unresolved}=collect(state);
    const cardLinks=linked.filter(x=>x.kind.startsWith('カード')).length;
    const transferLinks=linked.filter(x=>x.kind.startsWith('銀行')).length;
    const investmentLinks=linked.filter(x=>x.kind.startsWith('証券')).length;
    $('autoLinkSummaryV33').innerHTML=[['リンク済み',linked.length],['カード↔銀行',cardLinks],['銀行↔証券',transferLinks],['証券↔投資',investmentLinks]].map(([k,v])=>`<div><span class="muted">${k}</span><b style="display:block;font-size:20px;margin-top:5px">${v}件</b></div>`).join('');
    const rows=showAll?linked:linked.slice(0,20);
    $('autoLinkRowsV33').innerHTML=rows.length?rows.map((r,i)=>`<div class="card" style="padding:12px;margin-top:${i?8:0}px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(r.kind)}</b><span class="tiny ${r.broken?'bad':''}">${r.broken?'リンク先明細が見つかりません':esc(r.basis)}</span></div><div class="row" style="align-items:flex-start">${detailLine(r.left.date,r.left.name,r.left.amount,r.left.file)}</div><div class="tiny" style="text-align:center;padding:4px 0">↓ 同一イベントとしてリンク</div><div class="row" style="align-items:flex-start">${detailLine(r.right.date,r.right.name,r.right.amount,r.right.file)}</div></div>`).join(''):'<div class="note">現在、保存されている自動リンクは0件です。カード明細・銀行明細など、両側のデータがそろった時点で自動リンクされます。</div>';
    if(!showAll&&linked.length>20)$('autoLinkRowsV33').insertAdjacentHTML('beforeend',`<div class="tiny" style="margin-top:8px">最新20件を表示中 · 全${linked.length}件</div>`);
    $('autoLinkUnresolvedV33').innerHTML=unresolved.length?`<details><summary class="warn">未リンク ${unresolved.length}件</summary><div style="margin-top:8px">${unresolved.slice(0,30).map(x=>`<div class="row"><div><b>${esc(x.kind)} · ${esc(x.name)}</b><div class="tiny">${esc(x.date||'')} · ${esc(x.reason)}</div></div><b class="amt ${Number(x.amount)<0?'bad':'good'}">${signed(x.amount)}</b></div>`).join('')}${unresolved.length>30?`<div class="tiny">先頭30件を表示</div>`:''}</div></details>`:'<div class="tiny good">未リンク候補はありません。</div>';
  }

  function queueRender(){clearTimeout(renderTimer);renderTimer=setTimeout(renderAudit,60)}
  function boot(){
    ensureUi();renderAudit();
    document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="imports"]'))setTimeout(renderAudit,0)});
    const targets=[$('importResults'),$('importSummary')].filter(Boolean);
    if(targets.length){observer=new MutationObserver(queueRender);for(const t of targets)observer.observe(t,{childList:true,subtree:true,characterData:true})}
    window.addEventListener('focus',queueRender);
    window.renderAutoLinkAuditV33=renderAudit;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
