(() => {
  const $ = id => document.getElementById(id);
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・]/g,'').toUpperCase();
  const rawState = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function daysBetween(a,b){
    const x=Date.parse(a),y=Date.parse(b);
    return Number.isFinite(x)&&Number.isFinite(y)?Math.round(Math.abs(x-y)/86400000):9999;
  }
  function cardHint(t){
    const n=norm(t?.description_raw||t?.description||'');
    if(n.includes(norm('ラクテンカ－ト゛サ－ヒ゛ス'))||n.includes(norm('楽天カード'))) return 'RAKUTEN';
    if(n.includes(norm('ＤＣカ－ト゛'))||n.includes(norm('DCカード'))) return 'DC';
    if(n.includes(norm('ミツヒ゛シＵＦＪニコス'))||n.includes(norm('三菱UFJニコス'))) return 'MUFG';
    if(n.includes(norm('シ゛エ－シ－ヒ゛－'))||n.includes('JCB')) return 'JCB';
    return '';
  }
  function cardCompatible(s,t){
    const h=cardHint(t),c=norm(s?.card||'');
    if(!h) return false;
    if(h==='RAKUTEN') return c.includes('RAKUTEN')||c.includes('楽天');
    if(h==='DC') return c.includes('DC')||c.includes('MUFG')||c.includes('三菱');
    if(h==='MUFG') return c.includes('MUFG')||c.includes('三菱')||c.includes('DC');
    if(h==='JCB') return c.includes('JCB');
    return false;
  }
  function txId(t){
    if(t.id) return t.id;
    const base=[t.source||'',t.account||'',t.date||'',Number(t.amount)||0,norm(t.description_raw||'')].join('|');
    let h=2166136261;for(let i=0;i<base.length;i++){h^=base.charCodeAt(i);h=Math.imul(h,16777619)}
    t.id=`linked:${(h>>>0).toString(16)}`;
    return t.id;
  }

  function reconcile(s){
    s.cashTransactions=Array.isArray(s.cashTransactions)?s.cashTransactions:[];
    s.cardSettlements=Array.isArray(s.cardSettlements)?s.cardSettlements:[];
    s.investmentEvents=Array.isArray(s.investmentEvents)?s.investmentEvents:[];
    let card=0,transfer=0,investment=0;

    for(const settlement of s.cardSettlements){
      if(settlement.bank_transaction_id) continue;
      const candidates=s.cashTransactions.filter(t=>
        Number(t.amount)<0 &&
        !t.linked_event_id &&
        Math.abs(Number(t.amount))===Math.abs(Number(settlement.amount)) &&
        daysBetween(t.date,settlement.due_date)<=7 &&
        cardCompatible(settlement,t)
      );
      if(!candidates.length) continue;
      candidates.sort((a,b)=>daysBetween(a.date,settlement.due_date)-daysBetween(b.date,settlement.due_date));
      const nearest=daysBetween(candidates[0].date,settlement.due_date);
      if(candidates.filter(x=>daysBetween(x.date,settlement.due_date)===nearest).length!==1) continue;
      const t=candidates[0];
      settlement.bank_transaction_id=txId(t);
      t.linked_event_id=settlement.settlement_id;
      t.cashflow_type='CARD_SETTLEMENT';
      t.category='CARD_SETTLEMENT';
      card++;
    }

    const bankTransfers=s.cashTransactions.filter(t=>
      t.source!=='Rakuten Securities' &&
      (t.is_transfer||t.cashflow_type==='INTERNAL_TRANSFER') &&
      (norm(t.description_raw).includes(norm('ラクテンショウケン'))||norm(t.description_raw).includes(norm('楽天証券'))||t.subcategory==='broker')
    );
    const brokerTransfers=s.cashTransactions.filter(t=>t.source==='Rakuten Securities'&&(t.is_transfer||t.cashflow_type==='INTERNAL_TRANSFER'));
    for(const b of bankTransfers){
      if(b.transfer_group_id) continue;
      const cands=brokerTransfers.filter(x=>!x.transfer_group_id&&Number(x.amount)===-Number(b.amount)&&daysBetween(x.date,b.date)<=3);
      if(!cands.length) continue;
      cands.sort((a,z)=>daysBetween(a.date,b.date)-daysBetween(z.date,b.date));
      const nearest=daysBetween(cands[0].date,b.date);
      if(cands.filter(x=>daysBetween(x.date,b.date)===nearest).length!==1) continue;
      const x=cands[0],gid=`transfer:${txId(b)}:${txId(x)}`;
      b.transfer_group_id=gid;x.transfer_group_id=gid;b.linked_event_id=txId(x);x.linked_event_id=txId(b);transfer++;
    }

    const brokerCash=s.cashTransactions.filter(t=>t.source==='Rakuten Securities'&&(t.is_transfer||t.cashflow_type==='INTERNAL_TRANSFER')&&!t.linked_investment_id);
    const buys=s.investmentEvents.filter(x=>!/売|SELL/i.test(String(x.side||''))&&!x.funding_cash_transaction_id&&Math.abs(Number(x.amount)||0)>0);
    for(const c of brokerCash){
      const cands=buys.filter(x=>Math.abs(Number(x.amount))===Math.abs(Number(c.amount))&&daysBetween(x.date,c.date)<=3);
      if(!cands.length) continue;
      cands.sort((a,b)=>daysBetween(a.date,c.date)-daysBetween(b.date,c.date));
      const nearest=daysBetween(cands[0].date,c.date);
      if(cands.filter(x=>daysBetween(x.date,c.date)===nearest).length!==1) continue;
      const x=cands[0];c.linked_investment_id=x.investment_id;x.funding_cash_transaction_id=txId(c);investment++;
    }
    return {card,transfer,investment,total:card+transfer+investment};
  }

  function stats(s){
    const settlements=s.cardSettlements||[];
    const bankCard=(s.cashTransactions||[]).filter(t=>t.cashflow_type==='CARD_SETTLEMENT'||cardHint(t));
    const linkedCard=settlements.filter(x=>x.bank_transaction_id).length;
    const transferGroups=new Set((s.cashTransactions||[]).map(x=>x.transfer_group_id).filter(Boolean));
    const linkedInvest=(s.investmentEvents||[]).filter(x=>x.funding_cash_transaction_id).length;
    return {
      cardTotal:settlements.length,
      linkedCard,
      bankCardOnly:Math.max(0,bankCard.filter(x=>!x.linked_event_id).length),
      transferPairs:transferGroups.size,
      linkedInvest,
      investmentTotal:(s.investmentEvents||[]).filter(x=>!/売|SELL/i.test(String(x.side||''))).length
    };
  }

  function persistReconcile(reason='既存データ再照合'){
    const s=rawState();
    const before=JSON.stringify({cashTransactions:s.cashTransactions||[],cardSettlements:s.cardSettlements||[],investmentEvents:s.investmentEvents||[]});
    const delta=reconcile(s);
    const after=JSON.stringify({cashTransactions:s.cashTransactions||[],cardSettlements:s.cardSettlements||[],investmentEvents:s.investmentEvents||[]});
    if(before!==after){
      window.treasuryRecoverySnapshot?.(`${reason}直前`);
      window.replaceTreasuryState?.(s);
      window.setTreasurySaveStatus?.('リンク再照合済み・同期中');
      window.cloudSyncOnLocalSave?.();
    }
    renderAudit(delta);
    return delta;
  }

  function ensureAudit(){
    if($('phase2LinkAuditV29')) return;
    const summary=$('importSummary');if(!summary)return;
    const box=document.createElement('div');box.id='phase2LinkAuditV29';box.className='note';box.style.marginTop='10px';
    summary.parentElement.appendChild(box);
  }
  function renderAudit(delta=null){
    ensureAudit();const box=$('phase2LinkAuditV29');if(!box)return;
    const s=rawState(),st=stats(s);
    box.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><b>データ間リンク状況</b><div class="tiny" style="margin-top:4px">既存データも再照合します。金額・日付・相手先が一意に一致した場合だけリンクします。</div></div><button class="btn secondary" id="phase2RelinkBtnV29">既存データを再照合</button></div>
      <div class="row"><span>カード請求 ↔ 銀行引落</span><b>${st.linkedCard} / ${st.cardTotal}</b></div>
      <div class="row"><span>銀行側だけのカード引落</span><b>${st.bankCardOnly}件</b></div>
      <div class="row"><span>銀行 ↔ 楽天証券 資金移動</span><b>${st.transferPairs}ペア</b></div>
      <div class="row"><span>証券入出金 ↔ 投資取引</span><b>${st.linkedInvest} / ${st.investmentTotal}</b></div>
      ${delta?.total?`<div class="good tiny" style="margin-top:7px">今回 ${delta.total}件のリンクを追加しました。</div>`:''}`;
    $('phase2RelinkBtnV29').onclick=()=>persistReconcile('手動リンク再照合');
  }

  function installTooltipBandCss(){
    if($('chartTooltipBandStyleV29'))return;
    const style=document.createElement('style');style.id='chartTooltipBandStyleV29';
    style.textContent=`
      #bankChartTipV20,#cashflowTipV21{position:static!important;left:auto!important;top:auto!important;right:auto!important;max-width:none!important;width:100%!important;margin-top:8px!important;box-shadow:none!important;min-height:76px}
      #bankChartTipV20.hidden,#cashflowTipV21.hidden{display:block!important;visibility:hidden!important;pointer-events:none!important}
      #bankChartTipV20:not(.hidden),#cashflowTipV21:not(.hidden){visibility:visible!important}
      #bankChartPlotV20,#cashflowChartPlotV21{overflow:visible}
    `;
    document.head.appendChild(style);
  }

  const prevImport=typeof importOne==='function'?importOne:null;
  if(prevImport){
    importOne=async function importOneV29(file){
      const r=await prevImport(file);
      const d=persistReconcile('Import後リンク再照合');
      return {...r,linkedCount:Number(r?.linkedCount||0)+d.total,linkDetail:{...(r?.linkDetail||{}),postReconcile:d}};
    };
  }

  const prevRender=typeof render==='function'?render:null;
  if(prevRender){render=function renderV29(){prevRender();renderAudit();installTooltipBandCss();}}
  window.reconcileHouseholdLinksV29=()=>persistReconcile('手動リンク再照合');
  installTooltipBandCss();
  setTimeout(()=>{try{persistReconcile('Phase 2起動時リンク再照合');renderAudit();}catch(e){console.warn('phase2 reconcile v29',e)}},0);
})();