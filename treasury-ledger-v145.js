(() => {
  'use strict';
  if (window.__treasuryLedgerV145) return;
  window.__treasuryLedgerV145=true;
  const n=x=>Number.isFinite(Number(x))?Number(x):0;
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const iso=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))?String(s):'';
  const monthOk=s=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(s||''));
  const isoDate=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const addDay=(day,n)=>{const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+n);return isoDate(d)};
  const addMonth=(m,n)=>{const a=m.split('-').map(Number);return isoDate(new Date(a[0],a[1]-1+n,1)).slice(0,7)};
  const dateOf=(m,day)=>{const [y,mm]=m.split('-').map(Number),last=new Date(y,mm,0).getDate();return m+'-'+String(Math.max(1,Math.min(last,n(day)||1))).padStart(2,'0')};
  const daysBetween=(a,b)=>Math.abs(Math.round((new Date(a+'T12:00:00')-new Date(b+'T12:00:00'))/86400000));
  // Saturday/Sunday: preceding Friday. National holidays require a
  // bank/official-payroll calendar; do not silently invent holiday shifts.
  function payday(st,month){
    const configured=n(st?.settings?.salaryDay)||18,nominal=dateOf(month,Math.min(31,Math.max(1,configured)));
    const dow=new Date(nominal+'T12:00:00').getDay();
    return dow===0?addDay(nominal,-2):dow===6?addDay(nominal,-1):nominal;
  }
  function period(st,month,basis='payday'){
    if(!monthOk(month))throw Error('Invalid month: '+month);
    if(basis==='calendar')return {month,basis,start:month+'-01',end:dateOf(month,31)};
    return {month,basis:'payday',start:payday(st,month),end:addDay(payday(st,addMonth(month,1)),-1)};
  }
  const cf=t=>String(t?.cashflow_type||t?.category||'').toUpperCase();
  const econ=t=>String(t?.economic_type||'').toUpperCase();
  const textOf=t=>String(t?.description_raw||t?.description||t?.name||'');
  const isSalary=t=>cf(t)==='INCOME_SALARY'||cf(t)==='SALARY'||/給与|俸給|SALARY/i.test(textOf(t));
  const isBonus=t=>cf(t)==='INCOME_BONUS'||/賞与|ボーナス|期末勤勉|勤勉手当|BONUS/i.test(textOf(t));
  const isBroker=t=>/楽天証券|証券|BROKER|NISA|IDECO|イデコ|積立投資/i.test(
    [textOf(t),t?.subcategory||'',t?.counterparty||''].join(' '));
  const isCashMovement=t=>{
    const k=cf(t);
    return k==='CASH_WITHDRAWAL_UNCLASSIFIED'||k==='CASH_WITHDRAWAL'||k==='ATM_WITHDRAWAL'||
      /^(ATM|CASHWITHDRAWAL)/.test(k)||/ATM出金|現金引出|カード出金|ENET/.test(textOf(t));
  };
  const isTransfer=t=>t?.is_transfer===true||econ(t)==='TRANSFER'||
    ['INTERNAL_TRANSFER','TRANSFER','BROKER_TRANSFER','ACCOUNT_TRANSFER'].includes(cf(t));
  const isCardBank=t=>{
    const k=cf(t),name=norm(textOf(t));
    return k==='CARD_SETTLEMENT'||k==='CARD_PAYMENT'||
      (/カード|CARD|JAL|MUFG|NICOS|ニコス|ラクテンカ|DCカ|JCB|シ゛エシ/.test(name)&&n(t.amount)<0);
  };
  const isDebtBank=t=>{
    const k=cf(t),name=textOf(t);
    return ['DEBT_PRINCIPAL','DEBT_INTEREST','DEBT_PAYMENT','CAR_LOAN'].includes(k)||
      /ローン|借入|返済|リボ払い|自動車割賦/.test(name);
  };
  const isInvestmentBank=t=>cf(t)==='INVESTMENT_CONTRIBUTION'||
    String(t?.ordinary_or_special||'').toUpperCase()==='INVESTMENT'||
    /IDECO|ＩＤＥＣＯ|イデコ|拠出金|投信積立|積立NISA|つみたてNISA/.test(textOf(t));
  const isFixed=t=>/^(UTILITY|INSURANCE|COMMUNICATION|HOUSING|CHILDCARE|FIXED|HOUSEHOLD_STANDARD)/.test(cf(t))||
    /電気|水道|ガス|携帯|通信|保険料|家賃|住宅費|授業料/.test(textOf(t));
  const hasExpense=t=>!isTransfer(t)&&!isCashMovement(t)&&!isInvestmentBank(t)&&
    !isCardBank(t)&&!isDebtBank(t)&&n(t.amount)<0&&econ(t)!=='INVESTMENT'&&econ(t)!=='TRANSFER';
  function bankKind(t){
    if(isInvestmentBank(t)||(isTransfer(t)&&isBroker(t)&&n(t.amount)<0))return 'investment';
    if(isCashMovement(t))return 'transfer';
    if(isCardBank(t))return 'card';
    if(isDebtBank(t))return 'debt';
    if(isTransfer(t))return 'transfer';
    if(String(t?.ordinary_or_special||'').toUpperCase()==='SPECIAL')return 'special';
    if(isFixed(t))return 'fixed';
    return 'living';
  }
  const sameCard=(a,b)=>{
    if(!a||!b)return false;
    const api=window.householdCardCycleV81;
    try{if(api?.sameCard)return api.sameCard(a,b)}catch{}
    return norm(a)===norm(b);
  };
  function cardKind(st,card){
    const m=(st.masters?.cards||[]).find(x=>sameCard(x.name,card));
    return String(m?.paymentMode||m?.payment_mode||'FULL').toUpperCase()==='REVOLVING'?'debt':'card';
  }
  function masterRoute(x){return String(x?.paymentRoute||x?.payment_route||'DIRECT').toUpperCase()}
  function masterDate(x,m){return dateOf(m,x?.dueDay||x?.paymentDay||x?.day||1)}
  function masterOccurs(x,m){
    const mode=String(x?.cadence||'MONTHLY').toUpperCase(),month=Number(m.slice(5,7));
    if(mode==='MONTHLY')return true;
    if(mode==='SEMI_FIXED')return (x.activeMonths||x.months||[]).map(Number).includes(month);
    if(mode==='ANNUAL')return n(x.dueMonth||x.paymentMonth||x.annualMonth||x.month)===month;
    return false;
  }
  const isOneShot=x=>/洗濯機|電動自転車|タイヤ購入|タイヤ代|冷蔵庫|引越|引っ越し/.test(String(x?.name||''));
  function fixedKind(x){
    const name=String(x?.name||''),k=String(x?.category||x?.type||'');
    return /ローン|返済|借入|リボ/.test(name)||/DEBT|LOAN/.test(k)?'debt':
      /IDECO|イデコ|NISA|積立|投資/.test(name)||/INVESTMENT/.test(k)?'investment':
      String(x?.ordinary_or_special||'').toUpperCase()==='SPECIAL'?'special':'fixed';
  }
  const eventIncome=x=>n(x?.amount)>0&&(
    /^(INCOME|SALARY|BONUS)/.test(String(x?.type||'').toUpperCase())||
    /給与|賞与|ボーナス|保険金|給付金|還付/.test(String(x?.name||'')));
  const eventKind=x=>n(x?.amount)>0?(isSalary(x)?'salary':isBonus(x)?'bonus':'income'):
    fixedKind(x)==='fixed'?'special':fixedKind(x);
  function calculate(st,month,basis='payday',referenceDate='',options={}){
    const p=period(st,month,basis),ref=iso(referenceDate)||isoDate(new Date());
    const inside=date=>!!iso(date)&&date>=p.start&&date<=p.end;
    const actual=[],pending=[],economic=[],quality=new Set(),usedActual=new Set();
    let excludedTransfers=0,bankCount=0,cardUsageCount=0;
    const add=(list,item)=>{if(!inside(item.date)||!n(item.amount))return;list.push(item)};
    const seenBank=new Set(),bankOut=[];
    for(const [i,t] of (st.cashTransactions||[]).entries()){
      const date=iso(t.date),amount=n(t.amount);
      if(!inside(date)||!amount)continue;
      // Imported bank transactions are identified by source/account/amount/date
      // and post-transaction balance; two truly identical swipes with separate
      // running balances remain distinct.
      const sig=[t.source,t.account,date,amount,norm(textOf(t)),t.balance_after??''].join('|');
      if(seenBank.has(sig)){quality.add('重複した銀行取引候補を集計から除外しました');continue}
      seenBank.add(sig);bankCount++;
      const kind=bankKind(t),name=textOf(t)||'銀行明細';
      if(isCashMovement(t)||kind==='transfer'){excludedTransfers+=Math.abs(amount);continue}
      const row={date,label:name,amount,kind:amount>0?(isSalary(t)?'salary':isBonus(t)?'bonus':'income'):kind,
        source:String(t.source||'銀行'),status:'confirmed',identity:'bank:'+i};
      if(amount>0){add(actual,row);continue}
      bankOut.push({t,row});
      add(actual,row);
      if(hasExpense(t))add(economic,{...row,kind:row.kind==='special'?'special':row.kind==='fixed'?'fixed':'living',amount:Math.abs(amount),source:'銀行消費'});
    }
    // Hand-recorded cash purchases are real expenditures, but an exact bank
    // expense match must not be counted again. A same-day repeated cash
    // purchase with a distinct id is preserved.
    const seenCash=new Set();
    for(const [i,c] of (st.cashExpenses||[]).entries()){
      const date=iso(c.date),amount=Math.abs(n(c.amount)),name=textOf(c)||'現金支出';
      if(!inside(date)||!amount||econ(c)==='TRANSFER')continue;
      const sig=String(c.id||[date,norm(name),amount,c.category,c.spending_class].join('|'));
      if(seenCash.has(sig)){quality.add('同一IDの現金支出重複を除外しました');continue}
      seenCash.add(sig);
      const exactBank=bankOut.some(({t})=>t.date===date&&Math.abs(n(t.amount))===amount&&norm(textOf(t))===norm(name));
      if(exactBank){quality.add('銀行明細と一致する現金支出を重複除外しました');continue}
      const special=String(c.spending_class||c.expense_scope||c.ordinary_or_special||'').toUpperCase()==='SPECIAL';
      const row={date,label:name,amount:-amount,kind:special?'special':'cash',source:'現金',status:'confirmed',identity:'cash:'+i};
      add(actual,row);add(economic,{...row,amount,source:'現金消費'});
    }
    // Card spending is an economic purchase on the use date, NOT an outgoing
    // payment until a settlement is actually debited. It must never be added
    // to the salary cashflow once more.
    const seenPurchase=new Set();
    for(const [i,b] of (st.purchaseEvents||[]).entries()){
      const date=iso(b.purchase_date),amount=Math.abs(n(b.original_amount));
      if(!inside(date)||!amount||econ(b)==='TRANSFER'||b.is_refinance_adjustment||b.is_refinanced)continue;
      const sig=[b.card,b.pdf_card_identity,b.billing_month,date,norm(b.merchant_raw||b.merchant_normalized),
        amount,b.occurrence_index||1,b.installment_number||0].join('|');
      if(seenPurchase.has(sig)){quality.add('PDF等からの同一カード利用明細が複数登録されています。元データの重複点検が必要です');continue}
      seenPurchase.add(sig);cardUsageCount++;
      add(economic,{date,label:String(b.merchant_raw||b.merchant_normalized||'カード購入'),amount,
        kind:String(b.spending_class||b.expense_scope||b.ordinary_or_special||'').toUpperCase()==='SPECIAL'?'special':'cardPurchase',
        source:String(b.card||'カード')+'利用',status:'confirmed',identity:'purchase:'+i});
    }
    // One bank debit can reconcile at most one card settlement. Require card
    // issuer evidence, not just an equal amount at a similar date.
    const settlements=new Set(),accountedCardDates=new Set();
    function matchBank(date,amount,kind,card='',name='',tolerance=4){
      const rows=bankOut.filter(({t,row})=>!usedActual.has(row.identity)&&Math.abs(Math.abs(n(t.amount))-amount)<=1&&
        daysBetween(String(t.date),date)<=tolerance);
      const query=norm(name),cardName=norm(card);
      return rows.find(({t})=>{
        if(card){
          if(!(isCardBank(t)||isDebtBank(t)))return false;
          const descr=norm(textOf(t));
          if(!cardName)return true;
          const ct=window.householdCardCycleV81?.canonicalCard?.(card);
          return descr.includes(cardName)||cardName.includes(descr)|| 
            (ct==='RAKUTEN'&&/ラクテン|楽天/.test(descr))||
            (ct==='JAL'&&/JAL|MUFG|NICOS|ニコス|三菱UFJ/.test(descr))||
            (ct==='D_CARD'&&/DCカ|DOCOMO|Dカード|DCARD/.test(descr))||
            (ct==='DC'&&/DCカ|MUFG|NICOS|ニコス/.test(descr))||
            cf(t)==='CARD_SETTLEMENT';
        }
        if(query){
          const descr=norm(textOf(t));
          if(descr&&query&&(descr.includes(query)||query.includes(descr)))return true;
        }
        return kind==='debt'&&isDebtBank(t)||kind==='investment'&&isInvestmentBank(t);
      })||null;
    }
    for(const [i,s] of (st.cardSettlements||[]).entries()){
      const date=iso(s.due_date),amount=Math.abs(n(s.amount));
      if(!inside(date)||!amount)continue;
      const key=[norm(s.card||''),date,amount].join('|');
      if(settlements.has(key))continue;settlements.add(key);
      const kind=cardKind(st,s.card);
      const matched=matchBank(date,amount,kind,s.card,'',4)||bankOut.find(({t,row})=>!usedActual.has(row.identity)&&daysBetween(t.date,date)<=3&&isCardBank(t)&&(norm(textOf(t)).includes(norm(s.card))||(norm(s.card).includes('RAKUTEN')&&/楽天|ラクテン/.test(textOf(t)))||(norm(s.card).includes('JAL')&&/MUFG|ニコス|NICOS|JAL/.test(textOf(t)))));
      if(matched){
        usedActual.add(matched.row.identity);
        matched.row.kind=kind;
        accountedCardDates.add([String(s.card||''),date.slice(0,7)].join('|'));
      } else add(pending,{date,label:String(s.card||'カード')+' 引落（未照合）',amount:-amount,kind,
        source:'カード請求',status:date<ref?'unverified':'forecast',identity:'settlement:'+i});
    }
    const cardEstimates=Array.isArray(options.cardEstimates)?options.cardEstimates:[];
    const seenEstimates=new Set();
    for(const [i,c] of cardEstimates.entries()){
      const date=iso(c.date),amount=Math.abs(n(c.amount)),card=String(c.card||'');
      if(!inside(date)||!amount)continue;
      const key=[card,date.slice(0,7)].join('|');
      if(seenEstimates.has(key)||accountedCardDates.has(key))continue;seenEstimates.add(key);
      const hasActual=bankOut.some(({t})=>Math.abs(n(t.amount)+amount)<=1&&daysBetween(String(t.date),date)<=4&&
        (isCardBank(t)||isDebtBank(t)));
      const hasStatement=(st.cardSettlements||[]).some(s=>inside(s.due_date)&&sameCard(s.card,card)&&
        String(s.due_date).slice(0,7)===date.slice(0,7));
      if(hasActual||hasStatement)continue;
      add(pending,{date,label:card+' 見込請求（未確定）',amount:-amount,kind:cardKind(st,card),
        source:'カード見込',status:date<ref?'unverified':'forecast',identity:'estimate:'+i});
    }
    // Existing revolving-card engine owns repayment caps and payoff dates.
    // Use only its repayment forecast rows, never its salary or purchase events.
    const revolvingEstimates=Array.isArray(options.revolvingEstimates)?options.revolvingEstimates:[];
    const revolvingSeen=new Set();
    for(const [i,r] of revolvingEstimates.entries()){
      const date=iso(r.date),amount=Math.abs(n(r.amount)),card=String(r.card||'');
      if(!inside(date)||!amount)continue;
      const key=[norm(card),date].join('|');
      if(revolvingSeen.has(key))continue;revolvingSeen.add(key);
      if((st.cardSettlements||[]).some(x=>sameCard(x.card,card)&&
        String(x.due_date||'').slice(0,7)===date.slice(0,7)))continue;
      const already=bankOut.some(({t})=>Math.abs(Math.abs(n(t.amount))-amount)<=1&&
        daysBetween(t.date,date)<=4&&(isCardBank(t)||isDebtBank(t)));
      if(already)continue;
      add(pending,{date,label:card+' リボ返済予定（未照合）',amount:-amount,kind:'debt',
        source:'カード返済計画',status:date<ref?'unverified':'forecast',identity:'revolving:'+i});
    }
    const candidateMonths=[...new Set([p.start.slice(0,7),p.end.slice(0,7)])],seenPlan=new Set();
    for(const [i,m] of (st.masters?.fixedExpenses||[]).entries()){
      if(m?.active===false||m?.forecastEnabled===false||masterRoute(m)!=='DIRECT')continue;
      // Old one-off washing machines/e-bikes/tires are not annual recurring.
      if(String(m.cadence||'MONTHLY').toUpperCase()==='ANNUAL'&&isOneShot(m)){quality.add('家電・自転車・タイヤ等の旧年次繰返し予定は除外しました');continue}
      for(const month of candidateMonths){
        if(!masterOccurs(m,month))continue;
        const date=masterDate(m,month),amount=Math.abs(n(m.amount)),kind=fixedKind(m);
        if(!inside(date)||!amount)continue;
        const key='master:'+String(m.id||norm(m.name))+'|'+date;
        if(seenPlan.has(key))continue;seenPlan.add(key);
        const same=matchBank(date,amount,kind,'',m.name,5);
        if(same){usedActual.add(same.row.identity);if(kind==='debt'||kind==='investment')same.row.kind=kind;continue}
        const cashMatched=actual.some(r=>r.source==='現金'&&r.amount===-amount&&
          daysBetween(r.date,date)<=5&&norm(r.label)===norm(m.name));
        if(cashMatched)continue;
        add(pending,{date,label:String(m.name||'固定費')+'（支払未照合）',amount:-amount,kind,
          source:'固定費マスター',status:date<ref?'unverified':'forecast',identity:key});
      }
    }
    const masters=(st.masters?.fixedExpenses||[]).filter(m=>m?.active!==false);
    for(const [i,r] of (st.rules||[]).entries()){
      if(r?.enabled===false||n(r.amount)>=0||fixedKind(r)!=='debt')continue;
      if(masters.some(m=>(r.source_master_id&&String(m.id)===String(r.source_master_id))||
        (norm(m.name)===norm(r.name)&&Math.abs(n(m.amount))===Math.abs(n(r.amount)))))continue;
      for(const month of candidateMonths){
        const date=dateOf(month,r.day||1),amount=Math.abs(n(r.amount));
        if(!inside(date)||!amount)continue;
        const key='rule:'+String(r.id||i)+'|'+date;if(seenPlan.has(key))continue;seenPlan.add(key);
        const matched=matchBank(date,amount,'debt','',r.name,5);
        if(matched){usedActual.add(matched.row.identity);matched.row.kind='debt';continue}
        if(pending.some(x=>x.kind==='debt'&&x.amount===-amount&&daysBetween(x.date,date)<=5))continue;
        add(pending,{date,label:String(r.name||'ローン')+'（未照合）',amount:-amount,kind:'debt',
          source:'旧ローンルール',status:date<ref?'unverified':'forecast',identity:key});
      }
    }
    // Only user-authored, explicitly dated one-off events are eligible.
    // Generated/stored stale events and derived repeats are not authority.
    const seenEvents=new Set();
    for(const [i,e] of (st.events||[]).entries()){
      const date=iso(e.date),amount=n(e.amount),name=String(e.name||'臨時収支');
      if(!inside(date)||!amount||e.generated===true||String(e.recurring||'NONE').toUpperCase()!=='NONE')continue;
      if(e.is_transfer===true||econ(e)==='TRANSFER'||/TRANSFER|INTERNAL_TRANSFER/.test(String(e.type||'').toUpperCase()))continue;
      // A cash transfer or manual schedule already represented by an active
      // master must not become a second monthly outflow.
      if(amount<0&&(st.masters?.fixedExpenses||[]).some(m=>m.active!==false&&
        Math.abs(n(m.amount)-Math.abs(amount))<=1&&
        norm(m.name)===norm(name)&&
        masterRoute(m)==='DIRECT'&&
        masterOccurs(m,date.slice(0,7))&&daysBetween(masterDate(m,date.slice(0,7)),date)<=4))continue;
      if(/妻.*通常生活費/.test(name)&&Math.abs(amount)===230000){quality.add('旧妻生活費23万円の単発イベントは要確認のため除外');continue}
      const key=[e.id||'',date,amount,norm(name)].join('|');if(seenEvents.has(key))continue;seenEvents.add(key);
      const kind=eventKind(e);
      // Verified bank payments/credits override expected manual events.
      const confirmed=actual.some(x=>Math.sign(x.amount)===Math.sign(amount)&&
        Math.abs(x.amount-amount)<=1&&daysBetween(x.date,date)<=5&&
        (norm(x.label).includes(norm(name))||norm(name).includes(norm(x.label))||
         (kind==='salary'&&x.kind==='salary')||(kind==='bonus'&&x.kind==='bonus')));
      if(confirmed)continue;
      if(eventIncome(e)&&kind==='salary'&&date<=ref)continue;
      add(pending,{date,label:name+'（手入力予定）',amount,kind,source:'臨時イベント',
        status:date<ref?'unverified':'forecast',identity:'event:'+i});
    }
    // A salary occurring in the past is never created from settings. If the
    // salary is missing from the bank statement, that is an evidence gap.
    const salary=Math.max(0,n(st.settings?.salary));
    if(salary){
      for(const mm of candidateMonths){
        const pay=payday(st,mm);
        if(!inside(pay))continue;
        const confirmed=actual.some(x=>x.kind==='salary'&&Math.abs(x.amount)>0&&
          daysBetween(x.date,pay)<=7);
        if(!confirmed&&!pending.some(x=>x.kind==='salary')){
          if(pay>ref)add(pending,{date:pay,label:'給与（予定・未入金）',amount:salary,kind:'salary',
            source:'給与設定',status:'forecast',identity:'salary:'+mm});
          else quality.add(pay+'の給与日を経過していますが、銀行入金が未照合です。給与は予測加算していません');
        }
      }
    }
    const countPositive=arr=>arr.filter(x=>x.amount>0).reduce((s,x)=>s+x.amount,0);
    const countNegative=arr=>arr.filter(x=>x.amount<0).reduce((s,x)=>s-x.amount,0);
    const incomeActual=countPositive(actual),incomePending=countPositive(pending);
    const incomeBreakdown={
      salaryActual:actual.filter(x=>x.kind==='salary'&&x.amount>0).reduce((s,x)=>s+x.amount,0),
      bonusActual:actual.filter(x=>x.kind==='bonus'&&x.amount>0).reduce((s,x)=>s+x.amount,0),
      salaryPending:pending.filter(x=>x.kind==='salary'&&x.amount>0).reduce((s,x)=>s+x.amount,0),
      bonusPending:pending.filter(x=>x.kind==='bonus'&&x.amount>0).reduce((s,x)=>s+x.amount,0)
    };
    const outActual=countNegative(actual),outPending=countNegative(pending);
    const spentActual=economic.reduce((s,x)=>s+x.amount,0);
    const groups=['living','fixed','cash','card','debt','investment','special'].map(kind=>({
      kind,actual:actual.filter(x=>x.kind===kind&&x.amount<0).reduce((s,x)=>s-x.amount,0),
      pending:pending.filter(x=>x.kind===kind&&x.amount<0).reduce((s,x)=>s-x.amount,0)
    }));
    const economicGroups=['living','fixed','cash','cardPurchase','special'].map(kind=>({
      kind,amount:economic.filter(x=>x.kind===kind).reduce((s,x)=>s+x.amount,0)
    }));
    if(!bankCount)quality.add('銀行明細がこの期間に存在しません。月次収支は未完成の可能性があります');
    if(p.end>ref)quality.add('現在進行中または将来の期間です。予定支払は実績ではありません');
    if(pending.some(x=>x.status==='unverified'))quality.add('過去に支払予定日を過ぎた未照合項目があります。実績金額には含めていません');
    if(actual.some(x=>x.source==='現金')&&bankOut.some(x=>/妻|家計費|生活費送金|生活費渡し/.test(textOf(x.t))))
      quality.add('家族への生活費送金と現金明細は同じ支出を含む可能性があります。用途を確認してください');
    if((st.purchaseEvents||[]).some(x=>x.pdf_card_identity)&&
      ((st.purchaseEvents||[]).length!==new Set((st.purchaseEvents||[]).map(x=>[
        x.pdf_card_identity,x.card,x.billing_month,x.purchase_date,norm(x.merchant_raw||x.merchant_normalized),
        n(x.original_amount),x.occurrence_index||1
      ].join('|'))).size))quality.add('カード取込に重複候補があるため、消費支出に注意してください');
    const asOf=String(st.settings?.cashAsOf||'').slice(0,10);
    const balance=st.settings?.cash===null||st.settings?.cash===''?null:
      Number.isFinite(Number(st.settings?.cash))?Number(st.settings.cash):null;
    const rows=[...actual,...pending].sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(a.label).localeCompare(String(b.label),'ja'));
    return {...p,referenceDate:ref,rows,economicRows:economic,
      incomeActual,incomePending,incomeBreakdown,incomeTotal:incomeActual+incomePending,
      outActual,outPending,outTotal:outActual+outPending,
      remainderActual:incomeActual-outActual,
      remainder:incomeActual+incomePending-outActual-outPending,
      spentActual,cardPurchase:economic.filter(x=>x.kind==='cardPurchase').reduce((s,x)=>s+x.amount,0),
      groups,economicGroups,quality:[...quality],warnings:[...quality],
      currentBankBalance:balance,currentBankBalanceAsOf:asOf,
      excludedTransfers,bankCount,cardUsageCount,
      pendingPast:pending.filter(x=>x.status==='unverified').length,
      status:{confirmed:actual.length,pending:pending.length}
    };
  }
  function annual(st,year,basis='calendar',referenceDate='',options={}){
    const yyyy=String(year),months=Array.from({length:12},(_,i)=>yyyy+'-'+String(i+1).padStart(2,'0'));
    const periods=months.map(m=>calculate(st,m,basis,referenceDate,options));
    const sum=k=>periods.reduce((s,p)=>s+n(p[k]),0);
    const allKinds=['living','fixed','cash','card','debt','investment','special'];
    return {year:yyyy,basis,periods,
      incomeActual:sum('incomeActual'),incomePending:sum('incomePending'),
      salaryActual:periods.reduce((s,p)=>s+n(p.incomeBreakdown.salaryActual),0),
      bonusActual:periods.reduce((s,p)=>s+n(p.incomeBreakdown.bonusActual),0),
      salaryPending:periods.reduce((s,p)=>s+n(p.incomeBreakdown.salaryPending),0),
      bonusPending:periods.reduce((s,p)=>s+n(p.incomeBreakdown.bonusPending),0),
      outActual:sum('outActual'),outPending:sum('outPending'),
      remainderActual:sum('remainderActual'),remainder:sum('remainder'),
      spentActual:sum('spentActual'),cardPurchase:sum('cardPurchase'),
      groups:allKinds.map(kind=>({kind,
        actual:periods.reduce((s,p)=>s+n(p.groups.find(g=>g.kind===kind)?.actual),0),
        pending:periods.reduce((s,p)=>s+n(p.groups.find(g=>g.kind===kind)?.pending),0)})),
      missingBankPeriods:periods.filter(p=>!p.bankCount).length,
      unverifiedCount:periods.reduce((s,p)=>s+p.pendingPast,0)
    };
  }
  const api={calculate,annual,period,payday,addMonth,bankKind};
  window.treasuryLedgerV145=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();