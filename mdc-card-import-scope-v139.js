(() => {
  if(window.__mdcScopedCardImportV139)return;
  window.__mdcScopedCardImportV139=true;

  const headerName='MDCカード識別子';
  const legacyName='MDC旧版CSVファイル';
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
  const stateNow=()=>typeof state!=='undefined'?state:(window.getTreasuryStateRaw||window.getTreasuryState)?.();
  const recordSignature=(date,merchant,amount)=>
    [date,norm(merchant),Math.abs(Number(amount)||0)].join('|');
  const cardIdentity=s=>String(s||'').normalize('NFKC').trim().slice(0,70);

  // Scope identity affects de-duplication only. Existing cashflow card grouping
  // (MUFG/DC/JAL) stays intact to avoid changing card billing/settlement rules.
  function parseScopedMdc(src,file) {
    const rows=parseCsv(src.text),hi=findHeader(rows,['確定情報','ご利用日','ご利用金額（円）']);
    if(hi<0)throw Error('MDCカード明細のCSV形式を認識できません。');
    const h=rows[hi].map(x=>String(x).replace(/^\uFEFF/,''));
    if(!h.includes(headerName))return null;
    const st=stateNow();
    if(!st||!Array.isArray(st.purchaseEvents))throw Error('保存先の支出データを取得できません。');
    const seen=new Map();
    let read=0,added=0,duplicates=0,upgraded=0,review=0;
    let total=0;
    const all=[];
    for(const row of rows.slice(hi+1)){
      const o=rowObj(h,row);
      if(o['確定情報']!=='確定')continue;
      const date=parseDate(o['ご利用日']),merchant=String(o['ご利用店名（海外ご利用店名／海外都市名）']||'').trim();
      const amount=number(o['ご利用金額（円）']);
      if(!validDate(date)||!merchant||amount===null||amount<=0)continue;
      const identity=cardIdentity(o[headerName]);
      if(!identity)throw Error('カード識別名が空です。');
      const oldFilename=String(o[legacyName]||'').trim();
      const billing_month=parseDate(o['お支払日']).slice(0,7);
      if(!/^\d{4}-\d{2}$/.test(billing_month))throw Error('MDCの請求月が不正です。');
      const signature=recordSignature(date,merchant,amount);
      const key=identity+'|'+signature+'|'+billing_month+'|'+String(o['何回目']||'1');
      const occurrence=(seen.get(key)||0)+1;seen.set(key,occurrence);
      all.push({date,merchant,amount,identity,oldFilename,billing_month,occurrence,
        count:number(o['支払回数'])||1, installment:number(o['何回目'])||null,signature});
      read++;total+=amount;
    }
    if(!all.length)throw Error('有効なMDCカード明細がありません。');
    for(const r of all){
      const existing=st.purchaseEvents.filter(x=>
        recordSignature(x.purchase_date,x.merchant_raw||x.merchant_normalized,x.original_amount)===r.signature);
      // A PDF imported by the old converter can be safely upgraded in place
      // only when its exact old synthetic file name is known.
      const upgradedLegacy=existing.find(x=>
        r.oldFilename&&x.source_file===r.oldFilename&&
        Number(x.occurrence_index||1)===r.occurrence);
      if(upgradedLegacy){
        if(!upgradedLegacy.pdf_card_identity){
          upgradedLegacy.pdf_card_identity=r.identity;
          upgradedLegacy.pdf_statement_migrated_v139=true;upgraded++;
        }
        duplicates++;continue;
      }
      const sameIdentity=existing.find(x=>
        x.pdf_card_identity===r.identity &&
        Number(x.occurrence_index||1)===r.occurrence);
      if(sameIdentity){duplicates++;continue;}
      // For old non-PDF card CSV data with no identity, never infer
      // whether an identical transaction belongs to a second physical card.
      // Leave it intact and add the explicitly identified PDF purchase.
      const category=classifyMerchant(r.merchant);
      const scope=String(category.ordinary_or_special||'ORDINARY').toUpperCase()==='SPECIAL'?'SPECIAL':'NORMAL';
      const purchaseId=hash32(['MDC-PDF-SCOPED',r.identity,r.date,
        normalizeText(r.merchant),r.amount,r.occurrence].join('|'));
      const x={purchase_id:purchaseId,occurrence_index:r.occurrence,
        card:'MUFG/DC/JAL',pdf_card_identity:r.identity,source_file:file.name,
        purchase_date:r.date,merchant_raw:r.merchant,merchant_normalized:normalizeText(r.merchant),
        original_amount:r.amount,billing_month:r.billing_month,
        installment_count:r.count,installment_number:r.installment,
        payment_method:String(r.count)+(r.installment?(' '+r.installment):''),
        record_kind:'CARD_PURCHASE',economic_type:'EXPENSE',
        ordinary_or_special:scope,expense_scope:scope,spending_class:scope,
        category:category.category||'UNKNOWN',subcategory:null,confidence:category.confidence||0.4};
      st.purchaseEvents.push(x);added++;
      if(x.confidence<0.7){addReview({source:x.card,date:x.purchase_date,merchant:x.merchant_raw,confidence:x.confidence});review++;}
    }
    return {source:'MDC/JAL PDF',read,added,duplicates,upgraded,review,
      autoClassified:added-review,latest:all.map(x=>x.date).sort().at(-1),
      billing_month:all[0].billing_month,statementTotal:total,
      importedMonths:[...new Set(all.map(x=>x.date.slice(0,7)))].sort(),scopedDedup:true};
  }

  if(typeof parseMufg==='function'){
    const previous=parseMufg;
    parseMufg=function parseMufgScopedV139(src,file){
      const result=parseScopedMdc(src,file);
      return result||previous(src,file);
    };
  }
  window.householdMdcScopedCardV139={parseScopedMdc,recordSignature};
})();