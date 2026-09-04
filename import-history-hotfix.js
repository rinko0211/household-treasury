(() => {
  const BANK_SOURCES = new Set(['Rakuten Bank', 'Yucho']);
  const SOURCE_LABELS = {'Rakuten Bank':'楽天銀行','Yucho':'ゆうちょ'};

  function isFiniteBalance(v){return v!==null&&v!==''&&Number.isFinite(Number(v))}
  // 現段階では「金融機関」単位。口座番号・支店・複数口座は明示データが来るまで分割しない。
  function institutionKey(t){return String(t.source||'')}
  function institutionLabel(source){return SOURCE_LABELS[source]||source||'銀行'}

  function latestTransactionForInstitution(items){
    if(!items.length)return null;
    const latestDate=items.reduce((m,t)=>String(t.date||'')>m?String(t.date||''):m,'');
    const day=items.filter(t=>String(t.date||'')===latestDate&&isFiniteBalance(t.balance_after));
    if(!day.length)return null;if(day.length===1)return day[0];
    const startingBalances=new Set(day.map(t=>Number(t.balance_after)-Number(t.amount||0)));
    const terminal=day.filter(t=>!startingBalances.has(Number(t.balance_after)));
    return terminal.length===1?terminal[0]:day[day.length-1];
  }

  function legacyRakutenFallback(){
    const r=state?.sources?.rakutenBank;
    if(!r||!isFiniteBalance(r.latestBalance)||!r.sourceAsOf)return null;
    return {key:'Rakuten Bank',source:'Rakuten Bank',label:'楽天銀行',balance:Number(r.latestBalance),asOf:String(r.sourceAsOf),legacy:true,latest:null};
  }

  function computeLatestBankState(){
    if(typeof state==='undefined')return null;
    const groups=new Map();
    if(Array.isArray(state.cashTransactions)){
      state.cashTransactions.forEach((t,index)=>{
        if(!BANK_SOURCES.has(t.source)||!isFiniteBalance(t.balance_after)||!t.date)return;
        const k=institutionKey(t);if(!groups.has(k))groups.set(k,[]);groups.get(k).push({...t,__index:index});
      });
    }
    const institutions=[];
    for(const [key,items] of groups.entries()){
      const latest=latestTransactionForInstitution(items);if(!latest)continue;
      institutions.push({key,source:latest.source,label:institutionLabel(latest.source),balance:Number(latest.balance_after),asOf:latest.date,legacy:false,latest});
    }
    if(!institutions.some(x=>x.source==='Rakuten Bank')){const fallback=legacyRakutenFallback();if(fallback)institutions.push(fallback)}
    if(!institutions.length)return null;
    institutions.sort((a,b)=>a.label.localeCompare(b.label,'ja'));
    const cash=institutions.reduce((sum,x)=>sum+x.balance,0);
    const asOf=institutions.reduce((m,x)=>String(x.asOf)>m?String(x.asOf):m,'');
    return {cash,asOf,institutions};
  }

  function ensureBankBreakdownUi(){
    if(document.getElementById('bankBalanceBreakdown'))return;
    const assets=document.getElementById('assets');const host=assets?.closest('.card');if(!host)return;
    const card=document.createElement('div');card.className='card full';card.id='bankBalanceBreakdownCard';
    card.innerHTML='<div class="title">銀行残高</div><div id="bankBalanceBreakdown"><div class="muted">銀行CSVを取り込むと金融機関別残高を表示します。</div></div>';
    host.parentElement.insertBefore(card,host);
  }
  function formatYen(n){try{if(typeof yen==='function')return yen(n)}catch{}return new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0)}
  function renderBankBreakdown(latest=computeLatestBankState()){
    ensureBankBreakdownUi();const box=document.getElementById('bankBalanceBreakdown');if(!box)return;
    const cashLabel=document.getElementById('kpiCash')?.parentElement?.querySelector('.muted');if(cashLabel)cashLabel.textContent='銀行残高 合計';
    if(!latest){box.innerHTML='<div class="muted">銀行CSVを取り込むと金融機関別残高を表示します。既存の合計額から銀行別残高は推測しません。</div>';return}
    const rows=latest.institutions.map(x=>`<div class="row"><div><b>${x.label}</b><div class="tiny">${x.asOf} 時点${x.legacy?' · 旧楽天取込から救済':''}</div></div><span class="amt">${formatYen(x.balance)}</span></div>`).join('');
    box.innerHTML=`${rows}<div class="row"><div><b>合計</b><div class="tiny">CSVで識別済みの金融機関だけを合算</div></div><span class="amt good">${formatYen(latest.cash)}</span></div>`;
  }

  function repairCurrentCash({persist=true}={}){
    const latest=computeLatestBankState();if(!latest){renderBankBreakdown(null);return null}
    const changed=Number(state.settings?.cash)!==latest.cash||Number(state.assets?.bank)!==latest.cash;
    state.settings=state.settings||{};state.assets=state.assets||{};state.settings.cash=latest.cash;state.assets.bank=latest.cash;state.bankBalanceAsOf=latest.asOf;
    state.bankInstitutionBalances=Object.fromEntries(latest.institutions.map(x=>[x.key,{source:x.source,label:x.label,balance:x.balance,asOf:x.asOf,legacy:!!x.legacy}]));
    // 旧 account-based キャッシュは今後の誤用を防ぐため削除。既存残高からの口座推測はしない。
    delete state.bankAccountBalances;
    renderBankBreakdown(latest);
    if(persist&&changed){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}try{originalRender?.()}catch{}renderBankBreakdown(latest)}
    return latest;
  }

  if(typeof parseBankMain==='function'){
    const original=parseBankMain;parseBankMain=function(src,file){const result=original(src,file);const latest=repairCurrentCash({persist:false});if(latest){result.balance=latest.cash;result.current_as_of=latest.asOf;result.history_only=!!result.latest&&result.latest<latest.asOf;result.institution_balances=latest.institutions.map(x=>({label:x.label,balance:x.balance,asOf:x.asOf}))}return result};
  }
  if(typeof parseYucho==='function'){
    const original=parseYucho;parseYucho=function(src,file){const result=original(src,file);const latest=repairCurrentCash({persist:false});if(latest){result.balance=latest.cash;result.current_as_of=latest.asOf;result.history_only=!!result.latest&&result.latest<latest.asOf;result.institution_balances=latest.institutions.map(x=>({label:x.label,balance:x.balance,asOf:x.asOf}))}return result};
  }
  if(typeof save==='function'){
    const originalSave=save;save=function(){repairCurrentCash({persist:false});state.updatedAt=new Date().toISOString();return originalSave()};
  }
  const originalRender=typeof render==='function'?render:null;
  if(originalRender){render=function(){originalRender();renderBankBreakdown()}}
  if(typeof window.replaceTreasuryState==='function'){
    const originalReplace=window.replaceTreasuryState;window.replaceTreasuryState=function(next){originalReplace(next);const latest=repairCurrentCash({persist:true});if(latest&&window.setTreasurySaveStatus)window.setTreasurySaveStatus(`銀行合計を更新 (${latest.asOf})`)};
  }
  window.repairTreasuryBankBalances=()=>repairCurrentCash({persist:true});
  const repaired=repairCurrentCash({persist:true});renderBankBreakdown(repaired);if(repaired&&window.setTreasurySaveStatus)window.setTreasurySaveStatus(`銀行合計を更新 (${repaired.asOf})`);
})();