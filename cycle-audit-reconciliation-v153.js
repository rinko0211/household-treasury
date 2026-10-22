(() => {
'use strict';
if(window.householdCycleAuditV153)return;
const VERSION=155,FORMAT='household-treasury-cycle-reconciliation-v153';
const START='2026-09-18',END='2026-10-16',CYCLE='cycle:2026-09-18:2026-10-16';
const arrays=['cashTransactions','purchaseEvents','cashExpenses','cardSettlements','cardCashflowOverrides'];
const $=id=>document.getElementById(id);
const norm=v=>String(v??'').normalize('NFKC').replace(/[\s　（）()\[\]・\-_/\.]/g,'').toUpperCase();
const clone=v=>JSON.parse(JSON.stringify(v));
const equals=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const money=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(v||0);
const n=v=>Number(v)||0;
const inCycle=v=>String(v||'')>=START&&String(v||'')<=END;
const inCycleCash=r=>inCycle(r.date)||r.audit_cycle===CYCLE;
const active=r=>r.count_in_spending!==false&&r.reconciliation_status!=='ABSORBED_DUPLICATE';
const expense=r=>String(r.economic_type||'').toUpperCase()==='EXPENSE';
const cardSignature=r=>[
 norm(r.card),norm(r.pdf_card_identity||''),String(r.purchase_date||''),
 String(r.billing_month||''),norm(r.merchant_raw||r.merchant_normalized),
 n(r.original_amount),n(r.occurrence_index||1),n(r.installment_number||0),
 norm(r.source_original_id||'')
].join('|');
function calculations(state){
 const st=state||{},seen={bank:new Set(),cash:new Set(),card:new Set()},excluded=[];
 const cash=[],cards=[],bankDirect=[],debt=[],investment=[],income=[];
 const review=[];
 for(const r of st.cashExpenses||[]){
  if(!inCycleCash(r)||!expense(r))continue;
  const id=String(r.id||[r.date,r.description,r.amount,r.source_file].join('|'));
  if(seen.cash.has(id)){excluded.push('cash-id-duplicate:'+id);continue}
  seen.cash.add(id);
  if(!active(r)){excluded.push('absorbed:'+id);continue}
  if(!Number.isFinite(Number(r.purchase_total??r.amount)))continue;
  cash.push({r,amount:Math.abs(n(r.purchase_total??r.amount))});
 }
 for(const r of st.purchaseEvents||[]){
  if(!inCycle(r.purchase_date)||!expense(r)||!active(r))continue;
  if(/チャージ|入金|PREPAID TOP.UP/i.test(String(r.merchant_raw||''))&&!r.count_in_spending){
   excluded.push('topup:'+String(r.purchase_id));continue;
  }
  const key=cardSignature(r);if(seen.card.has(key)){excluded.push('card-duplicate:'+key);continue}
  seen.card.add(key);
  cards.push({r,amount:Math.abs(n(r.original_amount))});
 }
 const cardIds=new Set(cards.map(x=>String(x.r.purchase_id||'')));
 for(const {r} of cash){
  if(r.absorbed_into_purchase_id&&cardIds.has(String(r.absorbed_into_purchase_id)))
   throw Error('吸収済み現金が集計に残っています（'+r.id+'）。');
 }
 const bankKey=r=>[r.account,r.source,r.date,r.amount,norm(r.description_raw),r.balance_after??''].join('|');
 for(const r of st.cashTransactions||[]){
  if(!inCycle(r.date)||!n(r.amount))continue;
  const bk=bankKey(r);if(seen.bank.has(bk)){excluded.push('bank-duplicate:'+bk);continue}
  seen.bank.add(bk);
  const cf=String(r.cashflow_type||'').toUpperCase(),eco=String(r.economic_type||'').toUpperCase();
  const desc=norm(r.description_raw);
  const atm=cf.includes('CASH_WITHDRAWAL')||/カード出金|カ－ド出金|ATM出金|ＡＴＭ出金/.test(String(r.description_raw||''));
  const linkedCard=(st.cardSettlements||[]).some(z=>
    (String(z.bank_transaction_id||'')===String(r.id||'')||
     (String(z.settlement_id||'')===String(r.linked_event_id||'')&&!!r.linked_event_id))&&
    n(z.amount)===Math.abs(n(r.amount))&&z.due_date===r.date&&z.confirmed_bank_debit===true);
  const isCard=cf==='CARD_SETTLEMENT'||linkedCard;
  const isInvestment=cf.includes('INVESTMENT')||eco==='INVESTMENT';
  const isDebt=cf==='DEBT_PRINCIPAL'||cf==='DEBT_PAYMENT'||eco==='DEBT_PRINCIPAL';
  if(/ニコス/.test(desc)&&isDebt&&!linkedCard)review.push('JAL/DCの引落かリボ返済か要照合：'+String(r.id||''));
  const isTransfer=atm||r.is_transfer===true||eco==='TRANSFER'||cf.includes('TRANSFER')||isCard;
  if(n(r.amount)>0){
   if(eco==='INCOME'&&!isTransfer&&!(r.date===END&&cf==='INCOME_SALARY'))income.push({r,amount:n(r.amount)});
   continue;
  }
  if(isTransfer){excluded.push('transfer:'+r.id);continue}
  if(isInvestment){investment.push({r,amount:-n(r.amount)});continue}
  if(isDebt){debt.push({r,amount:-n(r.amount)});continue}
  if(expense(r))bankDirect.push({r,amount:-n(r.amount)});
 }
 const sum=rows=>rows.reduce((a,x)=>a+x.amount,0);
 const unknown=cash.filter(x=>x.r.cash_balance_residual_id);
 const ordinaryCash=cash.filter(x=>!x.r.cash_balance_residual_id);
 const dCards=cards.filter(x=>/^(Dカード|dカード)$/i.test(String(x.r.card||'')));
 const normalCards=cards.filter(x=>!dCards.includes(x));
 const disputed=bankDirect.filter(x=>{const fee=Number(x.r.reconciliation_disputed_difference);return Number.isSafeInteger(fee)&&fee>0&&fee<=x.amount})
   .reduce((a,x)=>a+Number(x.r.reconciliation_disputed_difference),0);
 const cashTotal=sum(ordinaryCash),unknownTotal=sum(unknown),cardTotal=sum(normalCards),dcardTotal=sum(dCards),
       bankTotal=sum(bankDirect),loanTotal=sum(debt),investmentTotal=sum(investment),incomeTotal=sum(income);
 const consumeAll=cashTotal+unknownTotal+cardTotal+dcardTotal+bankTotal;
 const consumeAccepted=consumeAll-disputed;
 const fundsAll=consumeAll+loanTotal+investmentTotal,fundsAccepted=consumeAccepted+loanTotal+investmentTotal;
 const consumptionItems=[
  ...ordinaryCash.map(x=>({date:x.r.date,month:x.r.month_attribution||'',amount:x.amount,from:'cash'})),
  ...cards.map(x=>({date:x.r.purchase_date,month:'',amount:x.amount,from:'card'})),
  ...bankDirect.map(x=>({date:x.r.date,month:'',amount:x.amount-(n(x.r.reconciliation_disputed_difference)||0),from:'bank'}))
 ];
 const datedSep=consumptionItems.filter(x=>inCycle(x.date)&&x.date<='2026-09-30').reduce((a,x)=>a+x.amount,0);
 const datedOct=consumptionItems.filter(x=>inCycle(x.date)&&x.date>='2026-10-01'||x.month==='2026-10').reduce((a,x)=>a+x.amount,0);
 const undated=consumptionItems.filter(x=>!inCycle(x.date)&&!x.month).reduce((a,x)=>a+x.amount,0);
 return {
  period:{start:START,end:END},source:'verified-record-based-v153',hasMigration:(st.auditMigrations||[]).some(x=>x.migration==='v153-sep-oct-audit'),
  cash:cashTotal,unknownCash:unknownTotal,card:cardTotal,dcard:dcardTotal,bankDirect:bankTotal,
  bankDirectAccepted:bankTotal-disputed,loan:loanTotal,investment:investmentTotal,income:incomeTotal,
  consumptionAll:consumeAll,consumption:consumeAccepted,fundsAll,funds:fundsAccepted,
  netAll:incomeTotal-fundsAll,net:incomeTotal-fundsAccepted,disputed,
  datedSep,datedOct,undated,sourceCount:{cash:cash.length,card:cards.length,bankDirect:bankDirect.length,loan:debt.length,investment:investment.length},
  excluded,review,
  reconciliationBalanced:datedSep+datedOct+undated+unknownTotal===consumeAccepted
 };
}
// No debit, status, balance or source is overwritten if ANY part of a private delta conflicts.
// Original purchase IDs and heterogeneous row structures are preserved.
// Settlement imports may already have the same source ID with additional
// original statement fields. Strict JSON equality falsely rejects those rows.
// Reconcile ONLY the immutable transaction identity; never overwrite the user's
// original settlement or accept mismatched money/date/card/bank references.
function settlementFamily(v){
 const x=norm(v);
 if(/JAL/.test(x)&&(/DC|MUFG/.test(x)||x==='JAL'))return 'JAL_DC';
 return x;
}
function verifySameBankSettlement(existing,planned,state){
 const id=String(planned.settlement_id||'');
 const invalid=reason=>{throw Error('既存カード精算の照合不一致（'+reason+'）：'+id+
   '。データは変更していません。現状バックアップと差分を照合してください。')};
 if(String(existing.settlement_id||'')!==id)invalid('ID');
 if(!Number.isSafeInteger(Number(existing.amount))||Number(existing.amount)<=0||
    Number(existing.amount)!==Number(planned.amount))invalid('引落金額');
 if(String(existing.due_date||'')!==String(planned.due_date||''))invalid('引落日');
 if(settlementFamily(existing.card)!==settlementFamily(planned.card))invalid('カード');
 if(existing.bank_transaction_id&&String(existing.bank_transaction_id)!==String(planned.bank_transaction_id))invalid('銀行取引ID');
 if(existing.confirmed_bank_debit===false)invalid('確認状況');
 if(existing.economic_type&&String(existing.economic_type)!=='TRANSFER')invalid('経済区分');
 if(existing.record_kind&&String(existing.record_kind)!=='CARD_SETTLEMENT')invalid('記録種別');
 // A matching card/billing label is not enough: require one real bank debit
 // with matching ID, booked date, and exact magnitude.
 const bank=(state.cashTransactions||[]).filter(x=>String(x.id||'')===String(planned.bank_transaction_id||''));
 if(bank.length!==1||String(bank[0].date||'')!==String(planned.due_date||'')||
    Number(bank[0].amount)!==-Number(planned.amount)||
    String(bank[0].cashflow_type||'')!=='CARD_SETTLEMENT')
  invalid('銀行引落原本');
 const conflicts=(state.cardSettlements||[]).filter(x=>x!==existing&&
   String(x.bank_transaction_id||'')===String(planned.bank_transaction_id||''));
 if(conflicts.length)invalid('他のカード精算と銀行取引IDが重複');
 return true;
}
function planPatch(state,patch){
 if(!patch||patch.format!==FORMAT||!Array.isArray(patch.updates)||!Array.isArray(patch.inserts)||!Array.isArray(patch.meta_additions))
   throw Error('監査差分ファイルの形式が違います。通常のバックアップJSONは使用できません。');
 if(patch.updates.length>300||patch.inserts.length>300)throw Error('監査差分の件数が上限を超えています。');
 const next=clone(state),changed=[],matched=[],seen=new Set();
 const idMap={cashTransactions:'id',purchaseEvents:'purchase_id',cashExpenses:'id',cardSettlements:'settlement_id',cardCashflowOverrides:'id'};
 for(const o of [...patch.updates,...patch.inserts]){
  const array=o.array,field=idMap[array],id=String(o.id||'');
  if(!field||!id||o.id_key!==field||seen.has(array+'|'+id))throw Error('修正対象の配列またはIDが不正です。');
  seen.add(array+'|'+id);
  if(!Array.isArray(next[array]))throw Error(array+' が端末に存在しません。');
  const rr=next[array].filter(x=>String(x?.[field]||'')===id);
  if(rr.length>1)throw Error('対象IDが複数あります。'+id);
  if('record'in o){
   if(!o.record||String(o.record[field])!==id)throw Error('追加IDが一致しません。'+id);
   if(rr.length){
    if(!equals(rr[0],o.record)){
     if(array==='cardSettlements')verifySameBankSettlement(rr[0],o.record,next);
     else throw Error('同じIDに別の取引があります。'+id);
    }
    matched.push(id);continue
   }
   if(array==='cardSettlements'){
    verifySameBankSettlement(o.record,o.record,next);
    const duplicates=next.cardSettlements.filter(x=>String(x.bank_transaction_id||'')===String(o.record.bank_transaction_id||'')&&!!o.record.bank_transaction_id);
    if(duplicates.length)throw Error('同一銀行引落に別IDのカード精算が存在します。端末バックアップを確認してください：'+id);
   }
   if(array==='purchaseEvents'){
    const sig=cardSignature(o.record);
    if(next.purchaseEvents.some(x=>cardSignature(x)===sig))throw Error('別IDの同一カード利用候補。'+id);
   }
   if(array==='cashExpenses'&&next.cashExpenses.some(x=>x.date===o.record.date&&x.description===o.record.description&&n(x.amount)===n(o.record.amount)))
     throw Error('同じ現金取引候補が既に存在します。'+id);
   next[array].push(clone(o.record));changed.push(id);continue;
  }
  if(!rr.length)throw Error('更新元の明細IDが見つかりません。'+id);
  const r=rr[0],set=o.set||{},before=o.before||{},guard=o.guard||{};
  if(!Object.keys(set).length||!Object.keys(before).length)throw Error('更新項目がありません。'+id);
  // A previous local correction can have already moved 980 -> 1980 while
  // leaving the payment breakdown unfinished. Accept ONLY those field values
  // explicitly permitted by this signed-off patch: the exact old value OR the
  // exact target value. Never weaken date, merchant, source, or card identity.
  for(const [k,spec] of Object.entries(before)){
    if(!Object.hasOwn(set,k))throw Error('差分構成の不一致。'+id+' '+k);
    const isOld=Object.hasOwn(r,k)===spec.present&&(!spec.present||equals(r[k],spec.value));
    const isTarget=Object.hasOwn(r,k)&&equals(r[k],set[k]);
    if(!isOld&&!isTarget)throw Error('元明細の項目が第三の値に変更されています。'+id+' '+k);
  }
  for(const [k,v] of Object.entries(guard)){
    const exactlyOriginal=Object.hasOwn(r,k)&&equals(r[k],v);
    // This exception is narrowly limited to a guard field that the very
    // same patch changes, and only if the before-value also matches guard.
    const spec=before[k],target=Object.hasOwn(set,k)&&Object.hasOwn(r,k)&&equals(r[k],set[k]);
    const guardIsOld=spec&&spec.present&&equals(spec.value,v);
    if(!exactlyOriginal&&!(target&&guardIsOld))
      throw Error('元明細照合不一致。'+id+' '+k+'（元の値にも修正後の値にも一致しません）');
  }
  const already=Object.keys(set).every(k=>Object.hasOwn(r,k)&&equals(r[k],set[k]));
  if(already){matched.push(id);continue}
  Object.assign(r,clone(set));changed.push(id);
 }
 for(const o of patch.meta_additions){
  if(o.array!=='auditMigrations'||o.id_key!=='migration'||!o.value?.migration)throw Error('監査メタデータ不正');
  const a=next.auditMigrations||(next.auditMigrations=[]);
  const found=a.find(x=>x.migration===o.value.migration);
  if(found){if(!equals(found,o.value))throw Error('同じ監査IDに異なる結果があります。');continue}
  a.push(clone(o.value));changed.push(o.value.migration);
 }
 // Cross-array absorption provenance must resolve before touching actual state.
 const byId=new Set((next.purchaseEvents||[]).map(x=>String(x.purchase_id||'')));
 for(const r of next.cashExpenses||[])if(r.reconciliation_status==='ABSORBED_DUPLICATE'&&!byId.has(String(r.absorbed_into_purchase_id||'')))
   throw Error('カード側の吸収先IDが見つかりません。'+r.id);
 const results=calculations(next);
 return {next,changed,already:matched,summary:results};
}
function reallocateResidual(state,{residualId,record}={}){
 if(!state||!record||!record.id||!Number.isSafeInteger(Number(record.amount))||Number(record.amount)<=0)
  throw Error('振替する取引の金額・IDが不正です。');
 const next=clone(state);
 const c=next.cashExpenses||[];
 const src=c.find(x=>x.cash_balance_residual_id===residualId);
 if(!src||!src.reallocates_not_adds)throw Error('用途不明残高の元明細が見つかりません。');
 if(c.some(x=>x.id===record.id))throw Error('同じ配分IDは再登録できません。');
 if(Number(record.amount)>Number(src.amount))throw Error('用途不明残高を超える再配分はできません。');
 src.amount-=Number(record.amount);
 src.purchase_total=src.amount;
 src.cash_balance_residual_allocated=n(src.cash_balance_residual_allocated)+Number(record.amount);
 c.push({...clone(record),funded_by_residual_id:residualId,audit_cycle:src.audit_cycle,
   economic_type:'EXPENSE',record_kind:'CASH_EXPENSE'});
 return next;
}
function currentState(){try{return(window.getTreasuryStateRaw||window.getTreasuryState)?.()||{}}catch{return{}}}
function applyPatch(patch){
 const before=currentState();
 if(typeof window.replaceTreasuryState!=='function'||typeof window.treasuryRecoverySnapshot!=='function')
   throw Error('安全なバックアップ・保存処理が利用できません。');
 const result=planPatch(before,patch);
 if(!result.changed.length)return {...result,saved:false};
 window.treasuryRecoverySnapshot('2026年9–10月 原本照合・分類修正直前 v153');
 if(window.replaceTreasuryState(result.next)===false)throw Error('保存が拒否されました。');
 const after=planPatch(currentState(),patch);
 if(after.changed.length)throw Error('保存後の照合に失敗しました。復旧履歴を確認してください。');
 try{window.cloudSyncOnLocalSave?.()}catch{}
 try{window.dispatchEvent?.(new CustomEvent('treasury:expenses-imported',{detail:{source:'CYCLE_AUDIT_V153'}}))}catch{}
 return {...result,saved:true};
}
function mount(){
 // The historic one-off audit summary is no longer displayed below Expenses.
 // Its audit and strict patch APIs remain available to the unified import desk.
 const imports=document.querySelector('#imports .grid');
 const retired=$('cycleAuditSummaryV153');if(retired)retired.remove();
 if(imports&&!$('cycleAuditImportV153')){
  const box=document.createElement('div');box.id='cycleAuditImportV153';box.className='card full';
  box.innerHTML='<div class="title">原本照合済み9〜10月差分修正（v155）</div>'+
    '<div class="tiny">この機能は専用差分JSONのみを受け付け、端末の取引IDと元項目を照合してから一括修正します。既存の家計バックアップを上書きしません。</div>'+
    '<button type="button" class="btn secondary" id="cycleAuditChooseV153">専用差分JSONを選ぶ</button>'+
    '<input type="file" id="cycleAuditInputV153" accept=".json,application/json" style="display:none">'+
    '<div id="cycleAuditStatusV153" class="tiny" role="status" style="margin-top:8px"></div>';
  imports.prepend(box);
  $('cycleAuditChooseV153').onclick=()=>$('cycleAuditInputV153').click();
  $('cycleAuditInputV153').onchange=async()=>{
   const status=$('cycleAuditStatusV153');
   try{
    const f=$('cycleAuditInputV153').files?.[0];if(!f)return;
    if(f.size>400000)throw Error('差分ファイルが大きすぎます。');
    const patch=JSON.parse(await f.text()),preview=planPatch(currentState(),patch);
    if(!preview.changed.length){status.textContent='この差分は適用済みです。追加変更はありません。';return}
    if(!window.confirm(preview.changed.length+'項目の差分を厳密照合済みです。銀行残高・原本IDを保ち、復旧履歴を保存して反映します。続けますか？'))return;
    const result=applyPatch(patch);status.textContent=result.changed.length+'項目の修正を保存しました。Settingsでクラウド同期状況を確認してください。';
    show();
   }catch(e){status.textContent='未適用：'+String(e.message||e)}finally{$('cycleAuditInputV153').value=''}
  };
 }
 return !!imports;
}
function show(){
 mount();const el=$('cycleAuditSummaryV153');if(!el)return;
 try{
  const r=calculations(currentState());
  if(!r.hasMigration){
   el.innerHTML='<div class="hub-title">2026年9–10月 監査済み収支</div>'+
     '<p class="hub-muted">未適用：この端末にv153監査データがありません。Importから専用差分JSONを照合・適用してください。</p>';return;
  }
  el.innerHTML='<div class="hub-title">9/18〜10/16 原本・残高監査（v155）</div>'+
   '<p class="hub-muted">給与サイクル特別監査。10/16入金の給与は次期扱い。実取引から再計算し、見込額は含めません。</p>'+
   '<div class="hub-totals"><span>収入（9月給与等）</span><b>'+money(r.income)+'</b></div>'+
   '<div class="hub-totals"><span>実質消費（監査認定）</span><b>'+money(r.consumption)+'</b></div>'+
   '<div class="hub-totals"><span>車ローン・iDeCo含む資金用途</span><b>'+money(r.funds)+'</b></div>'+
   '<div class="hub-totals"><span>収支</span><b>'+money(r.net)+'</b></div>'+
   '<details><summary style="cursor:pointer">内訳・未確定事項を表示</summary>'+
   [['現金・商品券等',r.cash],['カード利用（dカード以外）',r.card],['dカード利用',r.dcard],
    ['口座直接支出（認定）',r.bankDirectAccepted],['用途不明現金',r.unknownCash],['車ローン',r.loan],['iDeCo等',r.investment]]
    .map(p=>'<div class="hub-totals"><span>'+p[0]+'</span><b>'+money(p[1])+'</b></div>').join('')+
   (r.disputed?'<p class="hub-muted" style="color:#ffbe6b">未解決：10/15の銀行振込手数料'+money(r.disputed)+
    'は実取引として残し、監査認定値と分離しています。この分も含めた実質消費は'+money(r.consumptionAll)+'、資金用途は'+
    money(r.fundsAll)+'、収支は'+money(r.netAll)+'です。</p>':'')+
   '<p class="hub-muted">期間別：9/18〜9/30 '+money(r.datedSep)+'／10月帰属 '+money(r.datedOct)+
   '／日付未確定 '+money(r.undated)+'／用途不明 '+money(r.unknownCash)+'。</p>'+
   (r.reconciliationBalanced?'':'<p class="hub-muted">検算不一致。明細を確認してください。</p>')+'</details>';
 }catch(e){el.innerHTML='<div class="hub-title">9〜10月監査</div><p class="hub-muted">集計できません：'+String(e.message||e)+'</p>'}
}
window.householdCycleAuditV153={VERSION,FORMAT,calculate:calculations,planPatch,reallocateResidual,applyPatch,mount,show};
const boot=()=>{mount();show()};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
window.addEventListener?.('treasury:pagechange',()=>setTimeout(show,0));
window.addEventListener?.('treasury:expenses-imported',()=>setTimeout(show,0));
window.addEventListener?.('pageshow',()=>setTimeout(show,0));
})();