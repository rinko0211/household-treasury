(() => {
  if (window.__cashflowReconciliationV102) return;
  window.__cashflowReconciliationV102 = true;

  const VERSION = 102;
  const LOAD_REBUILD_VERSION = 103;
  const HORIZON_DAYS = 400;
  const $ = id => document.getElementById(id);
  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const iso = d => {
    const x = new Date(d);
    return Number.isNaN(x.getTime()) ? '' : `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  };
  const today = () => iso(new Date());
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const yen = n => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let internalWrite = false;
  let timer = null;
  let rebuildPending = false;

  function ensureModel(st) {
    const legacy = st.cashflowRolloverV101 && typeof st.cashflowRolloverV101 === 'object' ? st.cashflowRolloverV101 : null;
    const cur = st.cashflowReconciliationV102 && typeof st.cashflowReconciliationV102 === 'object'
      ? st.cashflowReconciliationV102
      : (legacy ? structuredClone(legacy) : {});
    cur.version = VERSION;
    cur.pending = Array.isArray(cur.pending) ? cur.pending : [];
    cur.history = Array.isArray(cur.history) ? cur.history : [];
    st.cashflowReconciliationV102 = cur;
    return cur;
  }

  function mainBankRows(st) {
    return (st.cashTransactions || []).map((t,index)=>({t,index})).filter(({t})=>{
      if (!t?.date || t.balance_after === null || t.balance_after === '' || !Number.isFinite(Number(t.balance_after))) return false;
      const source = norm(t.source);
      const account = norm(t.account);
      return account === 'MAIN' || source.includes('RAKUTENBANK') || source.includes('楽天銀行');
    }).sort((a,b)=>String(a.t.date).localeCompare(String(b.t.date)) || a.index-b.index);
  }
  function latestImportedAnchor(st) {
    const rows = mainBankRows(st);
    if (!rows.length) return null;
    const x = rows.at(-1).t;
    return {date:String(x.date), balance:Number(x.balance_after), source:'BANK_IMPORT', label:String(x.source||'銀行取込')};
  }
  function earliestImportedDate(st) {
    const rows = mainBankRows(st);
    return rows.length ? String(rows[0].t.date||'') : '';
  }

  function anchorFor(st, now=today()) {
    const model = ensureModel(st);
    const imported = latestImportedAnchor(st);
    if (imported) return imported;

    const cash = Number(st.settings?.cash) || 0;
    if (!model.manualAnchorDate || Number(model.manualAnchorBalance) !== cash) {
      model.manualAnchorDate = now;
      model.manualAnchorBalance = cash;
    }
    return {date:String(model.manualAnchorDate||now), balance:cash, source:'MANUAL_BASELINE', label:'手動開始残高'};
  }

  function addMonthsDate(date,n) {
    const d = new Date(`${date}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth()+n);
    const last = new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
    d.setDate(Math.min(day,last));
    return iso(d);
  }
  function addYearsDate(date,n) {
    const d = new Date(`${date}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    const m=d.getMonth(),day=d.getDate();
    d.setFullYear(d.getFullYear()+n,0,1);
    d.setMonth(m,1);
    const last=new Date(d.getFullYear(),m+1,0).getDate();
    d.setDate(Math.min(day,last));
    return iso(d);
  }
  function dateForYm(ym,day) {
    const [y,m]=String(ym).split('-').map(Number);
    if(!y||!m)return'';
    const last=new Date(y,m,0).getDate();
    return `${ym}-${String(Math.min(Math.max(1,Number(day)||1),last)).padStart(2,'0')}`;
  }
  function monthsBetween(fromExclusive,toExclusive) {
    const out=[];
    const a=new Date(`${fromExclusive}T12:00:00`),z=new Date(`${toExclusive}T12:00:00`);
    if(Number.isNaN(a.getTime())||Number.isNaN(z.getTime()))return out;
    for(let d=new Date(a.getFullYear(),a.getMonth(),1);d<z;d.setMonth(d.getMonth()+1)){
      out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
    return out;
  }
  const inElapsedRange=(date,fromExclusive,toExclusive)=>!!date && date>fromExclusive && date<toExclusive;

  function semanticKey(row) {
    const date=String(row?.date||''),amount=Number(row?.amount)||0;
    const type=String(row?.type||'').toUpperCase(),source=String(row?.source||'').toLowerCase();
    if(type==='SALARY'||source.includes('salary')||/給与|SALARY/i.test(String(row?.name||''))) return `SALARY|${date}|${Math.round(amount)}`;
    if(row?.master_id) return `MASTER|${row.master_id}|${date}|${Math.round(amount)}`;
    if(row?.parent_event_id) return `EVENT|${row.parent_event_id}|${date}|${Math.round(amount)}`;
    if(row?.card && (type.includes('CARD')||source.includes('card_'))) return `CARD|${norm(row.card)}|${date}|${Math.round(amount)}`;
    if(row?.transfer_id) return `TRANSFER|${row.transfer_id}|${date}|${Math.round(amount)}`;
    return `${date}|${norm(row?.name)}|${Math.round(amount)}|${type}`;
  }

  function compact(row, origin='SNAPSHOT') {
    const amount = row?.amount===null || row?.amount==='' || !Number.isFinite(Number(row?.amount)) ? null : Number(row.amount);
    return {
      key: semanticKey(row),
      date:String(row?.date||''),
      name:String(row?.name||'予定'),
      amount,
      type:String(row?.type||''),
      source:String(row?.source||''),
      card:String(row?.card||''),
      billing_month:String(row?.billing_month||''),
      master_id:String(row?.master_id||row?.source_master_id||''),
      parent_event_id:String(row?.parent_event_id||''),
      transfer_id:String(row?.transfer_id||''),
      certainty:String(row?.certainty||''),
      origin,
      capturedAt:new Date().toISOString()
    };
  }

  function eventOccurrences(st,fromExclusive,toExclusive) {
    const out=[];
    for(const e of st.events||[]) {
      const base=String(e.date||'');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(base))continue;
      if(e.amount===null||e.amount===''||!Number.isFinite(Number(e.amount)))continue;
      const rec=String(e.recurring||'NONE').toUpperCase();
      if(rec==='NONE') {
        if(inElapsedRange(base,fromExclusive,toExclusive)) out.push(compact({...e,parent_event_id:e.parent_event_id||e.id,source:e.source||'future_event'},'BACKFILL_EVENT'));
        continue;
      }
      let d=base,guard=0;
      while(d<=fromExclusive&&guard++<1200)d=rec==='MONTHLY'?addMonthsDate(d,1):addYearsDate(d,1);
      while(d&&d<toExclusive&&guard++<2400) {
        out.push(compact({...e,date:d,parent_event_id:e.id,source:'future_recurring'},'BACKFILL_EVENT'));
        d=rec==='MONTHLY'?addMonthsDate(d,1):addYearsDate(d,1);
      }
    }
    return out;
  }

  function salaryOccurrences(st,fromExclusive,toExclusive) {
    const salary=Math.max(0,Number(st.settings?.salary)||0);
    if(!salary)return[];
    const day=Math.min(31,Math.max(1,Number(st.settings?.salaryDay)||18));
    return monthsBetween(fromExclusive,toExclusive).map(ym=>({
      id:`salary:${ym}`,date:dateForYm(ym,day),name:'給与',amount:salary,type:'SALARY',source:'settings_salary'
    })).filter(x=>inElapsedRange(x.date,fromExclusive,toExclusive)).map(x=>compact(x,'BACKFILL_SALARY'));
  }

  function routeOf(m){return String(m?.paymentRoute||m?.payment_route||'DIRECT').toUpperCase();}
  function masterDay(m){for(const v of [m?.dueDay,m?.paymentDay,m?.day]){const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=31)return n}return 1;}
  function masterOccurs(m,ym){
    const cad=String(m?.cadence||'MONTHLY').toUpperCase(),month=Number(String(ym).slice(5,7));
    if(cad==='MONTHLY')return true;
    if(cad==='SEMI_FIXED')return (m.activeMonths||m.months||[]).map(Number).includes(month);
    if(cad==='ANNUAL')return Number(m.dueMonth||m.paymentMonth||m.annualMonth||m.month)===month;
    return false;
  }
  function masterOccurrences(st,fromExclusive,toExclusive) {
    const out=[],months=monthsBetween(fromExclusive,toExclusive);
    for(const m of st.masters?.fixedExpenses||[]) {
      if(m.active===false||m.forecastEnabled===false||routeOf(m)!=='DIRECT')continue;
      const amount=Math.abs(Number(m.amount)||0);if(!amount)continue;
      for(const ym of months) {
        if(!masterOccurs(m,ym))continue;
        const date=dateForYm(ym,masterDay(m));
        if(!inElapsedRange(date,fromExclusive,toExclusive))continue;
        out.push(compact({
          id:`master:${m.id}:${ym}`,date,name:m.name||'固定費',amount:-amount,
          type:String(m.cadence||'').toUpperCase()==='ANNUAL'?'MASTER_ANNUAL':'MASTER_FIXED',
          source:String(m.cadence||'').toUpperCase()==='ANNUAL'?'master_annual':'master_fixed',master_id:m.id
        },'BACKFILL_MASTER'));
      }
    }
    return out;
  }

  function legacyRuleOccurrences(st,fromExclusive,toExclusive) {
    const out=[],months=monthsBetween(fromExclusive,toExclusive);
    const masters=(st.masters?.fixedExpenses||[]).filter(x=>x.active!==false);
    const masterIds=new Set(masters.map(x=>String(x.id)));
    const masterNames=new Set(masters.map(x=>norm(x.name)).filter(Boolean));
    for(const r of st.rules||[]) {
      if(r.enabled===false||String(r.id)==='salary'||/給与|SALARY/i.test(String(r.name||r.type||'')))continue;
      const mid=String(r.source_master_id||r.master_id||'');
      if((mid&&masterIds.has(mid))||masterNames.has(norm(r.name)))continue;
      if(!Number.isFinite(Number(r.amount))||!Number(r.amount))continue;
      for(const ym of months) {
        const o=(st.overrides||[]).find(x=>x.name===r.name&&x.month===ym);
        const amount=o?Number(o.amount)||0:Number(r.amount)||0;
        const date=dateForYm(ym,r.day||1);
        if(!amount||!inElapsedRange(date,fromExclusive,toExclusive))continue;
        out.push(compact({id:`rule:${r.id}:${ym}`,date,name:r.name||'固定費',amount,type:r.type||'fixed',source:'rule'},'BACKFILL_RULE'));
      }
    }
    return out;
  }

  function settlementOccurrences(st,fromExclusive,toExclusive) {
    return (st.cardSettlements||[]).filter(s=>inElapsedRange(String(s.due_date||''),fromExclusive,toExclusive)&&Number.isFinite(Number(s.amount))&&Math.abs(Number(s.amount))>0)
      .map(s=>compact({
        id:`settlement:${s.settlement_id||s.id||semanticKey(s)}`,date:s.due_date,name:`${s.card||'カード'}カード支払`,
        amount:-Math.abs(Number(s.amount)||0),type:'CARD_SETTLEMENT',source:'card_settlement',card:s.card||'',billing_month:String(s.due_date||'').slice(0,7)
      },'BACKFILL_SETTLEMENT'));
  }

  function backfillCandidates(st,fromExclusive,toExclusive) {
    const all=[
      ...salaryOccurrences(st,fromExclusive,toExclusive),
      ...eventOccurrences(st,fromExclusive,toExclusive),
      ...masterOccurrences(st,fromExclusive,toExclusive),
      ...legacyRuleOccurrences(st,fromExclusive,toExclusive),
      ...settlementOccurrences(st,fromExclusive,toExclusive)
    ];
    const m=new Map();
    for(const x of all) {
      if(x.amount===null||!Number.isFinite(Number(x.amount)))continue;
      if(!m.has(x.key))m.set(x.key,x);
      else if(String(x.origin).includes('SETTLEMENT'))m.set(x.key,x);
    }
    return [...m.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'ja'));
  }

  function historyMap(model){return new Map((model.history||[]).map(x=>[String(x.key||semanticKey(x)),x]));}

  function addDaysDate(date,n) {
    const d=new Date(`${date}T12:00:00`);
    if(Number.isNaN(d.getTime()))return'';
    d.setDate(d.getDate()+Number(n||0));
    return iso(d);
  }
  function dayDistance(a,b) {
    const x=new Date(`${a}T12:00:00`),y=new Date(`${b}T12:00:00`);
    if(Number.isNaN(x.getTime())||Number.isNaN(y.getTime()))return 9999;
    return Math.abs(Math.round((x-y)/86400000));
  }
  function plannedKind(x) {
    const type=String(x?.type||'').toUpperCase(),source=String(x?.source||'').toLowerCase(),name=String(x?.name||'');
    if(type==='SALARY'||source.includes('salary')||/給与|SALARY/i.test(name))return'SALARY';
    if(type.includes('CARD')||source.includes('card_'))return'CARD';
    if(type.includes('TRANSFER')||source.includes('transfer'))return'TRANSFER';
    return'OTHER';
  }
  function actualKind(t) {
    const type=String(t?.cashflow_type||t?.category||'').toUpperCase();
    if(type==='INCOME_SALARY')return'SALARY';
    if(type==='CARD_SETTLEMENT'||type==='DEBT_PRINCIPAL'||type==='DEBT_INTEREST')return'CARD';
    if(t?.is_transfer||type==='INTERNAL_TRANSFER')return'TRANSFER';
    return'OTHER';
  }
  function reconcileHistoryStatuses(st,model,anchor,now) {
    const actual=(st.cashTransactions||[]).map((t,index)=>({t,index})).filter(({t})=>t?.date&&String(t.date)<=anchor.date&&Number.isFinite(Number(t.amount)));
    const used=new Set();
    const rows=[...(model.history||[])].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
    for(const x of rows) {
      delete x.actual_transaction_id; delete x.actual_date; delete x.actual_description; delete x.actual_amount;
      if(String(x.date)>anchor.date && String(x.date)<now) { x.status='AWAITING_IMPORT'; continue; }
      if(String(x.date)>anchor.date)continue;
      const want=Number(x.amount)||0,pk=plannedKind(x);
      let best=null;
      for(const a of actual) {
        if(used.has(a.index))continue;
        const got=Number(a.t.amount)||0;
        if(Math.sign(want)!==Math.sign(got)||Math.abs(want-got)>1)continue;
        const dist=dayDistance(x.date,a.t.date);
        if(dist>5)continue;
        const ak=actualKind(a.t),kindPenalty=pk==='OTHER'||ak===pk?0:4;
        const score=dist+kindPenalty;
        if(!best||score<best.score)best={...a,score};
      }
      if(best) {
        used.add(best.index);
        x.status='MATCHED_ACTUAL';
        x.actual_transaction_id=String(best.t.id||`cash:${best.index}`);
        x.actual_date=String(best.t.date||'');
        x.actual_description=String(best.t.description_raw||best.t.description||'銀行明細');
        x.actual_amount=Number(best.t.amount)||0;
      } else x.status='ANCHOR_ABSORBED';
    }
    model.history=rows;
    return {matched:rows.filter(x=>x.status==='MATCHED_ACTUAL').length,absorbed:rows.filter(x=>x.status==='ANCHOR_ABSORBED').length,awaiting:rows.filter(x=>x.status==='AWAITING_IMPORT').length};
  }

  function generatedSnapshot() {
    try {
      if(typeof generated!=='function')return[];
      return (generated(HORIZON_DAYS)||[]).filter(r=>{
        const d=String(r?.date||'');
        return d>=today() && r?.amount!==null && r?.amount!=='' && Number.isFinite(Number(r?.amount));
      }).map(r=>compact(r,'FORECAST_SNAPSHOT')).slice(0,800);
    } catch { return []; }
  }

  function serializeComparable(model) {
    return JSON.stringify({
      pending:(model.pending||[]).map(x=>[x.key,x.date,x.amount,x.name,x.type,x.card,x.billing_month]),
      history:(model.history||[]).map(x=>[x.key,x.date,x.amount,x.name,x.type,x.origin,x.status,x.actual_transaction_id||'']),
      manualAnchorDate:model.manualAnchorDate||'',
      manualAnchorBalance:Number(model.manualAnchorBalance)||0,
      loadRebuildVersion:Number(model.loadRebuildVersion)||0
    });
  }

  function reconcile({persist=true,refresh=true,rebuildDerived=false}={}) {
    const st=stateNow(),model=ensureModel(st),now=today(),before=serializeComparable(model);
    const anchor=anchorFor(st,now);
    const importedStart=earliestImportedDate(st);
    const needsLoadMigration=!!importedStart&&Number(model.loadRebuildVersion||0)<LOAD_REBUILD_VERSION;
    const rebuild=!!rebuildDerived||!!window.__treasuryLoadedStateNeedsRebuild||needsLoadMigration;
    if(rebuild){
      // pending/history are derived state. On an external load, never trust stale
      // unverified rows inside the imported JSON. Preserve only history older than
      // the bank-statement coverage; rebuild the auditable period from canonical data.
      model.pending=[];
      if(importedStart)model.history=(model.history||[]).filter(x=>String(x?.date||'')<importedStart);
      model.loadRebuildVersion=LOAD_REBUILD_VERSION;
      model.lastLoadRebuildAt=new Date().toISOString();
      window.__treasuryLoadedStateNeedsRebuild=false;
    }
    const hist=historyMap(model);

    for(const p of model.pending||[]) {
      if(!p?.date||p.date>=now)continue;
      if(p.date<=anchor.date)continue;
      const key=String(p.key||semanticKey(p));
      if(!hist.has(key))hist.set(key,{...p,key,rolledAt:new Date().toISOString(),status:'ELAPSED_PLANNED'});
    }

    const backfillStart=importedStart ? addDaysDate(importedStart,-1) : anchor.date;
    for(const x of backfillCandidates(st,backfillStart,now)) {
      if(!hist.has(x.key))hist.set(x.key,{...x,rolledAt:new Date().toISOString(),status:'ELAPSED_PLANNED'});
    }

    model.history=[...hist.values()]
      .filter(x=>x?.date&&Number.isFinite(Number(x.amount)))
      .sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.name||'').localeCompare(String(b.name||''),'ja'))
      .slice(-1200);
    const reconciliation=reconcileHistoryStatuses(st,model,anchor,now);
    model.pending=generatedSnapshot();
    model.lastReconciledAt=new Date().toISOString();
    model.lastAnchor={...anchor};
    model.lastReconciliation={...reconciliation,actualTransactions:mainBankRows(st).length,at:new Date().toISOString()};

    const after=serializeComparable(model),changed=before!==after;
    if(changed&&persist&&typeof window.replaceTreasuryState==='function') {
      internalWrite=true;
      try {
        window.treasuryRecoverySnapshot?.('銀行実績と過去予定の照合直前');
        window.replaceTreasuryState(st);
        window.setTreasurySaveStatus?.('銀行実績と過去予定を照合済み・同期中');
        window.cloudSyncOnLocalSave?.();
      } finally { internalWrite=false; }
    }
    if(refresh)refreshUi();
    return {changed,anchor,current:currentBalanceFromState(st,now),planningStart:planningStartBalanceFromState(st,now),reconciliation,history:model.history,pending:model.pending};
  }

  function activeElapsed(st,now=today()) {
    const model=ensureModel(st),anchor=anchorFor(st,now);
    const rows=(model.history||[]).filter(x=>x.date>anchor.date&&x.date<now&&Number.isFinite(Number(x.amount)));
    return {anchor,rows};
  }
  function currentBalanceFromState(st,now=today()) { return anchorFor(st,now).balance; }
  function planningStartBalanceFromState(st,now=today()) {
    const {anchor,rows}=activeElapsed(st,now);
    return anchor.balance+rows.reduce((a,x)=>a+Number(x.amount||0),0);
  }
  function currentBalance(){return currentBalanceFromState(stateNow(),today());}
  function planningStartBalance(){return planningStartBalanceFromState(stateNow(),today());}

  const previousForecast = typeof forecast==='function' ? forecast : null;
  if(previousForecast&&!window.__cashflowForecastReconciliationV102) {
    window.__cashflowForecastReconciliationV102=true;
    forecast=function forecastReconciliationV102(days=90) {
      const st=stateNow(),f=previousForecast(days)||{rows:[],low:0,lowDate:today(),endBalance:0};
      const actual=currentBalanceFromState(st,today()),desired=planningStartBalanceFromState(st,today()),base=Number(st.settings?.cash)||0,delta=desired-base;
      const extra={actualBalanceV102:actual,actualBalanceAsOfV102:anchorFor(st,today()).date,planningStartBalanceV102:desired,unverifiedElapsedImpactV102:desired-actual};
      if(!delta)return {...f,...extra,rollforwardStartBalanceV101:desired,rollforwardDeltaV101:0};
      const rows=(f.rows||[]).map(r=>({...r,balance:Number.isFinite(Number(r.balance))?Number(r.balance)+delta:r.balance}));
      const out={...f,...extra,rows,low:Number(f.low||0)+delta,endBalance:Number(f.endBalance||0)+delta,rollforwardStartBalanceV101:desired,rollforwardDeltaV101:delta};
      if(Number.isFinite(Number(f.safeBaseLow)))out.safeBaseLow=Number(f.safeBaseLow)+delta;
      const safety=Number.isFinite(Number(f.safetyFloor))?Number(f.safetyFloor):Math.max(0,Number(st.settings?.reserve)||0);
      const reserved=Number.isFinite(Number(f.reservedSpecial))?Number(f.reservedSpecial):Math.max(0,Number(st.settings?.reservedSpecial)||0);
      const liab=Math.max(0,Number(f.shortTermLiabilities)||0);
      const safeBase=Number.isFinite(Number(out.safeBaseLow))?Number(out.safeBaseLow):Number(out.low)||0;
      out.safeToSpend=Math.max(0,safeBase-safety-reserved-liab);
      return out;
    };
  }

  function ensureUi() {
    const grid=document.querySelector('#cashflow .grid');if(!grid)return null;
    const legacy=$('cashflowRolloverCardV101');if(legacy)legacy.remove();
    let card=$('cashflowReconciliationCardV102');
    if(card)return card;
    card=document.createElement('div');card.id='cashflowReconciliationCardV102';card.className='card full';
    card.innerHTML='<div class="title">実績・予定の照合 <span class="tag">v102</span></div><div id="cashflowReconciliationSummaryV102"></div><details style="margin-top:8px"><summary class="tiny">過去予定の照合結果を表示</summary><div id="cashflowReconciliationRowsV102" style="margin-top:8px"></div></details>';
    const mobile=$('mobileCashflowV60');
    if(mobile&&mobile.parentElement===grid)mobile.after(card);else grid.prepend(card);
    return card;
  }

  function refreshUi() {
    const st=stateNow(),now=today(),model=ensureModel(st),{anchor,rows}=activeElapsed(st,now);
    const actual=anchor.balance,delta=rows.reduce((a,x)=>a+Number(x.amount||0),0),planning=actual+delta;
    const rec=model.lastReconciliation||{matched:0,absorbed:0,awaiting:rows.length,actualTransactions:mainBankRows(st).length};
    const card=ensureUi(),summary=$('cashflowReconciliationSummaryV102'),host=$('cashflowReconciliationRowsV102');
    if(card&&summary)summary.innerHTML=`<div class="row"><div><b>銀行実績残高</b><div class="tiny">${esc(anchor.date)} · ${esc(anchor.label)} · 取引後残高</div></div><b class="amt">${yen(actual)}</b></div><div class="row"><span>CSV以降の未照合予定</span><b class="amt ${delta<0?'bad':delta>0?'good':''}">${delta>0?'+':''}${yen(delta)}</b></div><div class="row"><span>将来予測の開始残高</span><b class="amt">${yen(planning)}</b></div><div class="tiny" style="margin-top:6px">現在高は銀行CSVの最新「取引後残高」をそのまま表示します。CSVより後に期限が過ぎた予定は現在高へ混ぜず、将来予測だけに暫定反映します。次回CSV取込時に実績へ吸収・照合されます。</div><div class="tiny" style="margin-top:6px">照合: 実績一致 ${Number(rec.matched)||0}件 · 残高に包含 ${Number(rec.absorbed)||0}件 · 未照合 ${Number(rec.awaiting)||0}件 · 銀行実績 ${Number(rec.actualTransactions)||0}件</div>`;
    if(host){
      const recent=[...(model.history||[])].filter(x=>x.date<now).slice(-40).reverse();
      host.innerHTML=recent.length?recent.map(x=>{
        const status=x.status==='MATCHED_ACTUAL'?`実績一致 ${esc(x.actual_date||'')} · ${esc(x.actual_description||'銀行明細')}`:x.status==='AWAITING_IMPORT'?'未照合 · 次回CSV待ち（実残高には未反映）':'最新実績残高に包含 · 個別明細は未一致';
        return `<div class="row"><div><b>${esc(x.name||'予定')}</b><div class="tiny">${esc(x.date)} · ${status}</div></div><b class="amt ${Number(x.amount)<0?'bad':'good'}">${Number(x.amount)>0?'+':''}${yen(x.amount)}</b></div>`;
      }).join(''):'<div class="muted">まだ照合対象の過去予定はありません。</div>';
    }
    const kpi=$('kpiCash');if(kpi)kpi.textContent=yen(actual);
  }

  function schedule(ms=120,{rebuildDerived=false}={}){
    if(rebuildDerived)rebuildPending=true;
    clearTimeout(timer);
    timer=setTimeout(()=>{
      const rebuild=rebuildPending||!!window.__treasuryLoadedStateNeedsRebuild;
      rebuildPending=false;
      reconcile({persist:true,refresh:true,rebuildDerived:rebuild});
    },ms);
  }

  const previousReplace=window.replaceTreasuryState;
  if(typeof previousReplace==='function'&&!window.__cashflowReconciliationReplaceV102){
    window.__cashflowReconciliationReplaceV102=true;
    window.replaceTreasuryState=function(next){
      const externalLoad=!!window.__treasuryApplyingRemote||!!window.__treasuryRecoveryRestoring||!!window.__treasuryImportingBackup;
      if(externalLoad)window.__treasuryLoadedStateNeedsRebuild=true;
      const result=previousReplace(next);
      if(!internalWrite){
        try{window.repairTreasuryBankBalances?.()}catch{}
        schedule(externalLoad?0:120,{rebuildDerived:externalLoad});
      }
      return result;
    };
  }

  document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="cashflow"],[data-page="dashboard"]'))schedule(40)},false);
  window.addEventListener('treasury:pagechange',()=>schedule(60));
  window.addEventListener('pageshow',()=>schedule(80));
  window.addEventListener('focus',()=>schedule(100));

  window.householdCashflowReconciliationV102={
    reconcile,
    currentBalance,
    currentBalanceFromState,
    planningStartBalance,
    planningStartBalanceFromState,
    latestImportedAnchor,
    earliestImportedDate,
    anchorFor,
    activeElapsed,
    backfillCandidates,
    reconcileHistoryStatuses,
    generatedSnapshot,
    semanticKey,
    refreshUi,
    reconcileLoadedState:()=>{window.__treasuryLoadedStateNeedsRebuild=true;return reconcile({persist:true,refresh:true,rebuildDerived:true})}
  };

  setTimeout(()=>reconcile({persist:true,refresh:true,rebuildDerived:!!window.__treasuryLoadedStateNeedsRebuild}),0);
})();