(() => {
  const CARD_ID='autoLinkAuditCardV30';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const rawState=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};

  function findCash(state,id){return (state.cashTransactions||[]).find(x=>String(x.id)===String(id))||null}
  function findInvestment(state,id){return (state.investmentEvents||[]).find(x=>String(x.investment_id)===String(id))||null}

  function collectLinks(state){
    const rows=[],seenTransfers=new Set();

    for(const s of state.cardSettlements||[]){
      if(!s.bank_transaction_id)continue;
      const t=findCash(state,s.bank_transaction_id);
      rows.push({
        kind:'カード支払 ↔ 銀行引落',
        left:`${s.card||'カード'}支払`,leftDate:s.due_date||'',leftAmount:-Math.abs(Number(s.amount)||0),
        right:t?`${t.source||'銀行'} · ${t.description_raw||t.description||'引落明細'}`:'銀行明細IDのみ',
        rightDate:t?.date||'',rightAmount:t?Number(t.amount)||0:null,
        note:t?'金額・期日・カード名を照合':'対応する銀行明細が現在stateに見つかりません'
      });
    }

    for(const t of state.cashTransactions||[]){
      if(!t.transfer_group_id||seenTransfers.has(t.transfer_group_id))continue;
      const mate=(state.cashTransactions||[]).find(x=>x!==t&&x.transfer_group_id===t.transfer_group_id);
      if(!mate)continue;
      seenTransfers.add(t.transfer_group_id);
      const a=t.source==='Rakuten Securities'?mate:t;
      const b=t.source==='Rakuten Securities'?t:mate;
      rows.push({
        kind:'銀行 ↔ 証券 資金移動',
        left:`${a.source||'銀行'} · ${a.description_raw||a.description||'資金移動'}`,leftDate:a.date||'',leftAmount:Number(a.amount)||0,
        right:`${b.source||'楽天証券'} · ${b.description_raw||b.description||'入出金'}`,rightDate:b.date||'',rightAmount:Number(b.amount)||0,
        note:'同額反対符号・近接日で照合'
      });
    }

    for(const t of state.cashTransactions||[]){
      if(!t.linked_investment_id)continue;
      const inv=findInvestment(state,t.linked_investment_id);
      rows.push({
        kind:'証券入出金 ↔ 投資取引',
        left:`${t.source||'楽天証券'} · ${t.description_raw||t.description||'入出金'}`,leftDate:t.date||'',leftAmount:Number(t.amount)||0,
        right:inv?`${inv.security_name||inv.asset_type||'投資取引'} · ${inv.side||''}`:'投資取引IDのみ',
        rightDate:inv?.date||'',rightAmount:inv?Number(inv.amount)||0:null,
        note:inv?'金額・近接日を照合':'対応する投資取引が現在stateに見つかりません'
      });
    }
    return rows.sort((a,b)=>String(b.leftDate||b.rightDate).localeCompare(String(a.leftDate||a.rightDate)));
  }

  function ensureUi(){
    if($(CARD_ID))return;
    const grid=document.querySelector('#imports .grid');
    if(!grid)return;
    const card=document.createElement('div');
    card.id=CARD_ID;
    card.className='card full';
    card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><div><div class="title" style="margin-bottom:3px">自動リンク詳細 <span class="tag">Phase 2</span></div><div class="tiny">実際に結び付いた明細ペアを監査できます。</div></div><span class="tag" id="autoLinkCountV30">0件</span></div><div id="autoLinkRowsV30" style="margin-top:10px"></div>`;
    const summary=$('importSummary')?.closest('.card');
    if(summary&&summary.parentElement===grid)summary.after(card);else grid.appendChild(card);
  }

  function renderAudit(){
    ensureUi();
    if(!$(CARD_ID))return;
    const state=rawState(),rows=collectLinks(state);
    $('autoLinkCountV30').textContent=`${rows.length}件`;
    $('autoLinkRowsV30').innerHTML=rows.length?rows.map((r,i)=>`<div class="card" style="margin-top:${i?8:0}px;padding:12px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><b>${esc(r.kind)}</b><span class="tiny">${esc(r.note)}</span></div><div class="row"><div style="min-width:0"><div>${esc(r.left)}</div><div class="tiny">${esc(r.leftDate)}</div></div><b class="amt">${yen(r.leftAmount)}</b></div><div class="tiny" style="text-align:center;padding:3px 0">↓ 自動リンク</div><div class="row"><div style="min-width:0"><div>${esc(r.right)}</div><div class="tiny">${esc(r.rightDate)}</div></div><b class="amt">${r.rightAmount==null?'—':yen(r.rightAmount)}</b></div></div>`).join(''):'<div class="note">現在、保存されている自動リンクは0件です。Import画面の「自動リンク 0件」は、この一覧にも反映されます。</div>';
  }

  const prev=typeof render==='function'?render:null;
  if(prev)render=function renderWithLinkAuditV30(){prev();renderAudit()};
  window.renderAutoLinkAuditV30=renderAudit;
  try{renderAudit()}catch(e){console.error('link audit v30',e)}
})();