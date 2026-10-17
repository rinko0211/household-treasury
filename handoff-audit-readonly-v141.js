(() => {
  if(window.__householdHandoffReadOnlyAuditV141)return;
  window.__householdHandoffReadOnlyAuditV141=true;
  const targetParam=()=>new URLSearchParams(location.search).get('handoff_audit')==='1';
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const num=x=>Number.isFinite(Number(x))?Number(x):0;
  const datePattern=/^\d{4}-\d{2}-\d{2}$/;
  const fmt=n=>new Intl.NumberFormat('ja-JP').format(num(n))+'円';
  const norm=s=>String(s||'').normalize('NFKC').replace(/[\s　_\-/（）()]/g,'').toUpperCase();
  function audit(st=stateNow()) {
    const fixed=st.masters?.fixedExpenses||[];
    const purchases=st.purchaseEvents||[];
    const cash=st.cashExpenses||[];
    const bank=st.cashTransactions||[];
    const snapshot=bank.filter(x=>
      datePattern.test(String(x.date||'')) &&
      x.balance_after!==null && x.balance_after!=='' &&
      Number.isFinite(Number(x.balance_after)) &&
      (String(x.account).toLowerCase()==='main'||/Rakuten Bank|楽天銀行/i.test(String(x.source||'')))
    ).sort((a,b)=>String(a.date).localeCompare(String(b.date))).at(-1);
    const manual=String(st.settings?.cashAsOf||'').slice(0,10);
    const asOf=snapshot?.date || (datePattern.test(manual)?manual:'');
    const days=asOf?Math.round((new Date(new Date().toISOString().slice(0,10)+'T12:00:00')-
      new Date(asOf+'T12:00:00'))/86400000):null;
    const oldActive=fixed.filter(x=>x.active!==false&&Math.abs(num(x.amount))===230000 &&
      /妻.*(生活費|通常生活費)/.test(String(x.name||'')));
    const oldRule=(st.rules||[]).filter(x=>x.enabled!==false&&Math.abs(num(x.amount))===230000 &&
      /妻.*(生活費|通常生活費)/.test(String(x.name||'')));
    const stale=(st.cashflowReconciliationV102?.pending||[]).filter(x=>
      String(x.date||'')>=new Date().toISOString().slice(0,10) &&
      num(x.amount)===-230000 && /妻.*(生活費|通常生活費)/.test(String(x.name||'')));
    const atm=bank.filter(x=>num(x.amount)<0 &&
      (String(x.cashflow_type)==='CASH_WITHDRAWAL_UNCLASSIFIED'||/ATM|カード出金/.test(String(x.description_raw||'')))&&
      String(x.economic_type||'').toUpperCase()==='EXPENSE');
    const annual=fixed.filter(x=>x.active!==false&&String(x.cadence||'').toUpperCase()==='ANNUAL');
    const oneShot=annual.filter(x=>/洗濯機|電動自転車|タイヤ代|タイヤ購入/.test(String(x.name||'')));
    const dcard=purchases.filter(x=>norm(x.card)==='D'||norm(x.card)==='DCARD'||norm(x.card)==='Dカード'||norm(x.card)==='DOCOMO');
    const dcardConsumption=dcard.filter(x=>String(x.economic_type||'EXPENSE').toUpperCase()==='EXPENSE');
    const dcardTransfer=dcard.filter(x=>String(x.economic_type||'').toUpperCase()==='TRANSFER');
    return {
      readOnly:true,snapshotDate:asOf,daysSinceSnapshot:days,
      snapshotBalance:snapshot?num(snapshot.balance_after):num(st.settings?.cash),
      counts:{cashExpenses:cash.length,purchaseEvents:purchases.length,cardSettlements:(st.cardSettlements||[]).length},
      oldWifeActive:oldActive.length+oldRule.length,oldWifeStalePending:stale.length,
      atmWrongClassCount:atm.length,atmWrongClassAmount:atm.reduce((n,x)=>n+Math.abs(num(x.amount)),0),
      recurringOneShotCount:oneShot.length,recurringOneShotAmount:oneShot.reduce((n,x)=>n+Math.abs(num(x.amount)),0),
      dcardCount:dcard.length,dcardConsumptionAmount:dcardConsumption.reduce((n,x)=>n+Math.abs(num(x.original_amount)),0),
      dcardTransferAmount:dcardTransfer.reduce((n,x)=>n+Math.abs(num(x.original_amount)),0),
      expenseCutoffComplete:false
    };
  }
  function render() {
    if(!targetParam())return;
    const grid=document.querySelector('#imports .grid');
    if(!grid)return;
    const x=audit();
    let el=document.getElementById('handoffAuditV141');
    if(!el){el=document.createElement('div');el.id='handoffAuditV141';el.className='card full';grid.prepend(el)}
    const flag=(n,label)=>'<div class="row"><span>'+label+'</span><b>'+n+'</b></div>';
    el.innerHTML=
      '<div class="title">家計引継ぎ：読取り専用監査</div>'+
      '<div class="tiny" style="margin:6px 0 12px">表示のために家計データを書き換えません。CSVの再取込、残高更新、マスター停止、カード請求確定は実行しません。</div>'+
      flag(x.snapshotDate||'日付不明','銀行残高の基準日')+
      flag(fmt(x.snapshotBalance),'銀行明細上の残高')+
      flag(x.oldWifeActive+'件','妻生活費230,000円の稼働マスター／ルール')+
      flag(x.oldWifeStalePending+'件','妻生活費230,000円の保存済み予定（派生）')+
      flag(x.atmWrongClassCount+'件・'+fmt(x.atmWrongClassAmount),'ATM出金が誤って支出扱い')+
      flag(x.recurringOneShotCount+'件・'+fmt(x.recurringOneShotAmount),'要見直し：年次反復中の大型単発費')+
      flag(x.dcardCount+'件','dカードの登録済み利用')+
      flag(fmt(x.dcardConsumptionAmount),'dカードの消費分類')+
      flag(fmt(x.dcardTransferAmount),'dカードの資金移動分類')+
      '<div class="tiny" style="margin-top:8px">未確定・未照合データが残るため、サイクル9/18〜10/16の385,891円は監査参考値です。銀行基準日以降の予定は確定残高ではなく予測として表示してください。</div>';
  }
  window.householdHandoffAuditV141={audit,render};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});
  else setTimeout(render,0);
  window.addEventListener('treasury:pagechange',e=>{if(e?.detail?.page==='imports')render()});
})();