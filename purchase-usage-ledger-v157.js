(() => {
'use strict';
if(window.householdUsageLedgerV157)return;
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const iso=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):'';
const normalized=v=>String(v||'').normalize('NFKC').replace(/[\s　()（）._\-／/・]/g,'').toUpperCase();
const fullAmount=r=>Math.abs(n(r.purchase_total??r.original_amount??r.amount));
const paidOnce=r=>r.count_in_spending!==false&&r.reconciliation_status!=='ABSORBED_DUPLICATE'&&!r.is_refinanced&&!r.is_refinance_adjustment;
const expense=r=>!r.economic_type||String(r.economic_type).toUpperCase()==='EXPENSE';
const cardSig=r=>[
  normalized(r.card),normalized(r.pdf_card_identity||''),r.purchase_date,r.billing_month,
  normalized(r.merchant_raw||r.merchant_normalized),fullAmount(r),r.occurrence_index||1,
  r.installment_number||0,r.source_original_id||''
].join('|');
function period(st,month,basis){
 const ledger=window.treasuryLedgerV145;
 if(!ledger)throw Error('家計台帳を読み込めません');
 const p=ledger.period(st,month,basis);
 if(basis!=='payday')return {...p,auditCycle:null};
 const audits=(st.auditMigrations||[]).filter(m=>
   iso(m.period_start)&&iso(m.period_end)&&m.period_start.slice(0,7)===month);
 if(!audits.length)return {...p,auditCycle:null};
 const audit=audits[audits.length-1];
 return {...p,start:audit.period_start,end:audit.period_end,
   auditCycle:'cycle:'+audit.period_start+':'+audit.period_end};
}
function belongs(r,dateField,p){
 const date=iso(r?.[dateField]);
 if(p.basis==='calendar')return !!date&&date>=p.start&&date<=p.end;
 const tagged=String(r?.audit_cycle||'');
 const pair=iso(r?.cycle_start)&&iso(r?.cycle_end)?
   'cycle:'+r.cycle_start+':'+r.cycle_end:'';
 if(tagged||pair){
   const explicit=tagged||pair;
   if(p.auditCycle)return explicit===p.auditCycle;
   // An expense booked provisionally on a new payday can belong to the
   // previous audited cycle, not both; do not re-add it in the next cycle.
   if(date&&date>=p.start&&date<=p.end)return false;
 }
 if(p.auditCycle&&r?.provisional_attribution&&r?.provisional_date===p.end)return true;
 return !!date&&date>=p.start&&date<=p.end;
}
function bankKind(r){
 const type=String(r.cashflow_type||'').toUpperCase(),eco=String(r.economic_type||'').toUpperCase();
 const label=normalized(r.description_raw||r.description);
 if(type.includes('CASH_WITHDRAWAL')||type.includes('ATM_WITHDRAWAL')||
   /カード出金|ATM出金|ATM引出/.test(String(r.description_raw||'')))return 'transfer';
 if(type==='CARD_SETTLEMENT'||type==='CARD_PAYMENT'||/ニコス|ラクテンカード|JCB/.test(label)&&n(r.amount)<0)return 'cardSettlement';
 if(type==='INVESTMENT_CONTRIBUTION'||eco==='INVESTMENT')return 'investment';
 if(type==='DEBT_PRINCIPAL'||type==='DEBT_PAYMENT'||eco==='DEBT_PRINCIPAL')return 'debt';
 if(r.is_transfer===true||eco==='TRANSFER'||type.includes('TRANSFER'))return 'transfer';
 if(n(r.amount)>0&&eco==='INCOME')return 'income';
 if(n(r.amount)<0&&eco==='EXPENSE')return 'expense';
 return 'unclassified';
}
function isReview(r,classification){
 const status=String(r.review_status||'').toUpperCase();
 return ['NEEDS_REVIEW','PENDING','OPEN','UNREVIEWED','REVIEW_REQUIRED'].includes(status)||
   classification==='REVIEW'||r.potential_prepaid_topup===true;
}
function calculate(st,month,basis='payday'){
 const p=period(st,month,basis);
 const rows=[],seenBank=new Set(),seenCash=new Set(),seenPurchase=new Set(),flags=[],bankExpenses=[];
 const subtotals={cashExpenses:0,purchaseEvents:0,directBank:0,ordinary:0,special:0,
   debt:0,ideco:0,investment:0,income:0,unresolvedBankFee:0};
 const byKind={cash:[],purchase:[],bank:[],debt:[],ideco:[],investment:[],income:[]};
 const add=(kind,row)=>{
   rows.push(row);byKind[kind]?.push(row);
 };
 const classify=(r,kind)=>{
   const sem=window.householdSemanticV47,nat=window.householdExpenseNatureV152;
   const cat=sem?.normalizeCategoryValue?.(r.category)||sem?.inferCategory?.(
     r.description||r.description_raw||r.merchant_raw,r.category)||'OTHER';
   const sub=sem?.inferSubcategory?.(cat,r.description||r.description_raw||r.merchant_raw,r.subcategory)||'OTHER';
   return nat?.classify?.({source:r,kind,label:r.description||r.description_raw||r.merchant_raw,
     category:cat,subcategory:sub,semantic:sem})?.nature||'REVIEW';
 };
 const addExpense=(source,kind,i,date,label,amount,payment)=>{
   const nature=classify(source,kind);
   const special=String(source.spending_class||source.expense_scope||source.ordinary_or_special||'').toUpperCase()==='SPECIAL'||
      (!source.spending_class&&!source.expense_scope&&nature==='SPECIAL');
   const row={kind,identity:kind+':'+i,date:date||'',label,amount,source:payment,
      costNature:nature,spendingClass:special?'SPECIAL':'NORMAL',
      needsReview:isReview(source,nature),status:'confirmed',
      provisional:!date||source.provisional_attribution===true||source.no_source_date===true};
   add(kind,row);
   subtotals[special?'special':'ordinary']+=amount;
   if(row.needsReview)flags.push(row);
 };
 for(const [i,r] of (st.cashExpenses||[]).entries()){
   if(!belongs(r,'date',p)||!paidOnce(r)||!expense(r))continue;
   const amount=fullAmount(r);if(!amount)continue;
   const key=String(r.id||[r.date,r.description,amount,r.source_file].join('|'));
   if(seenCash.has(key))continue;seenCash.add(key);
   const date=iso(r.date);
   const label=String(r.description||r.name||'現金・商品券等');
   addExpense(r,'cash',i,date,label,amount,String(r.payment_method||'現金・商品券等'));
   subtotals.cashExpenses+=amount;
 }
 for(const [i,r] of (st.purchaseEvents||[]).entries()){
   if(!belongs(r,'purchase_date',p)||!paidOnce(r)||!expense(r))continue;
   const amount=fullAmount(r);if(!amount)continue;
   const key=cardSig(r);
   if(seenPurchase.has(key))continue;seenPurchase.add(key);
   addExpense(r,'purchase',i,iso(r.purchase_date),
      String(r.merchant_raw||r.merchant_normalized||'カード購入'),amount,String(r.card||'カード')+'利用');
   subtotals.purchaseEvents+=amount;
 }
 for(const [i,r] of (st.cashTransactions||[]).entries()){
   if(!belongs(r,'date',p)||!n(r.amount))continue;
   const amount=n(r.amount),date=iso(r.date),label=String(r.description_raw||r.description||'銀行明細');
   const key=[r.source,r.account,date,amount,normalized(label),r.balance_after??''].join('|');
   if(seenBank.has(key))continue;seenBank.add(key);
   const kind=bankKind(r);
   if(amount>0){
     if(kind==='income'){
       // The payroll deposit on the audited period's closing payday belongs
       // to the NEXT cycle. A same-day non-salary refund may still belong here.
       const isSalary=String(r.cashflow_type||'').toUpperCase()==='INCOME_SALARY';
       if(p.auditCycle&&date===p.end&&isSalary)continue;
       subtotals.income+=amount;
       add('income',{kind:'income',identity:'bank:'+i,date,label,amount,source:'銀行入金',status:'confirmed'});
     }
     continue;
   }
   if(kind==='cardSettlement'||kind==='transfer'||kind==='unclassified')continue;
   if(kind==='debt'){
     subtotals.debt+=-amount;
     add('debt',{kind:'debt',identity:'bank:'+i,date,label,amount:-amount,source:'銀行・ローン',status:'confirmed'});
     continue;
   }
   if(kind==='investment'){
     const idc=/IDECO|イデコ|コクミンネンキンキキン|国民年金基金/.test(normalized(label));
     const key=idc?'ideco':'investment';
     subtotals[key]+=-amount;
     add(key,{kind:key,identity:'bank:'+i,date,label,amount:-amount,source:'投資拠出',status:'confirmed'});
     continue;
   }
   if(kind!=='expense')continue;
   const duplicate=byKind.cash.some(c=>c.date===date&&c.amount===-amount&&
     normalized(c.label)===normalized(label));
   if(duplicate)continue;
   // Retain a genuine bank fee in records but expose the explicitly disputed
   // amount separately, rather than making a silently adjusted total.
   const disputed=Math.max(0,Math.min(-amount,n(r.reconciliation_disputed_difference)));
   subtotals.unresolvedBankFee+=disputed;
   const accepted=-amount-disputed;
   if(accepted){
     addExpense(r,'bank',i,date,label,accepted,'銀行直接支出');
     subtotals.directBank+=accepted;
   }
   if(disputed)bankExpenses.push({date,label,amount:disputed,identity:'bank:'+i});
 }
 const consumption=subtotals.ordinary+subtotals.special;
 const funds=consumption+subtotals.debt+subtotals.ideco+subtotals.investment;
 return {
   ...p,month,basis,rows,byKind,flags,bankExpenses,subtotals,
   ordinary:subtotals.ordinary,special:subtotals.special,consumption,
   debt:subtotals.debt,ideco:subtotals.ideco,investment:subtotals.investment,
   income:subtotals.income,funds,net:subtotals.income-funds,
   reviewCount:flags.length,unresolvedBankFee:subtotals.unresolvedBankFee,
   // Current cashflow is deliberately a separate accounting lens.
   usageRows:rows.filter(r=>!['income'].includes(r.kind))
 };
}
function bankFlow(st,month,basis='payday'){
 const p=period(st,month,basis),seen=new Set(),buckets=new Map();
 const labels={
  cardSettlement:'カード精算（銀行残高管理のみ）',
  transfer:'ATM出金・口座間振替',
  debt:'ローン返済',
  investment:'投資・iDeCo等',
  expense:'口座直接支出',
  unclassified:'銀行引落（要点検）'
 };
 for(const [i,r] of (st.cashTransactions||[]).entries()){
  // Bank-account flow always uses the POSTED BANK DATE, never provisional
  // spending dates or purchase events. The audited previous-cycle closing
  // payroll is an income of the following period only.
  const date=iso(r.date),amount=n(r.amount);
  if(!date||date<p.start||date>p.end||!amount)continue;
  if(amount>=0)continue;
  const sig=[r.source,r.account,date,amount,
    normalized(r.description_raw),r.balance_after??''].join('|');
  if(seen.has(sig))continue;seen.add(sig);
  const kind=bankKind(r);
  if(!buckets.has(kind))buckets.set(kind,{id:kind,label:labels[kind],items:[],amount:0});
  const x=buckets.get(kind);
  x.items.push({identity:'bank:'+i,kind,date,label:r.description_raw||'銀行引落',
     amount:Math.abs(amount),source:'銀行口座',status:'confirmed'});
  x.amount+=Math.abs(amount);
 }
 const list=Object.values(labels).length;
 const groups=Object.keys(labels).map(k=>buckets.get(k)).filter(Boolean);
 return {...p,buckets:groups,total:groups.reduce((a,x)=>a+x.amount,0)};
}
window.householdUsageLedgerV157={period,belongs,bankKind,calculate,bankFlow};
})();